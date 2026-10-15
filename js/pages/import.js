// Import d'un ancien fichier Excel (« Suivi d'intervention ») : à faire une seule fois au début.
// L'appli sait LIRE ce format (un onglet par client) ; aucune donnée n'est écrite dans le code.
// Formats reconnus pour un onglet :
//  - à l'heure : Date | Heure nettoyage | Heure entretien | xx€/h nettoyage | … | consommables | MO+conso | Commentaire | reglement | Frais réels
//  - sur devis : Date | N° de devis | Montant du devis | Montant à facturer | … | Commentaire | reglement | Frais réels
//  - forfait   : N° de semaine | Date | <bateau 1> OUI/NON | <bateau 2> OUI/NON | Heures bateau… | Total heures | Total facturé (… x 107€) | Frais réel | … | Commentaire
// Le statut vient de la couleur des cases (vert payé, orange en attente, rouge à facturer, gris à ne pas facturer).
import { db, q } from '../db.js';
import { esc, euros, titre, tenter, heuresFr, dateFr, STATUTS, PASTILLES_STATUT, MODES_FACTURATION } from '../utils.js';
import { calculer, tarifsGeneraux } from '../calculs.js';
import { LIBELLE_FRAIS } from './chantiers.js';

const COULEURS_STATUT = {
  '00FF00': 'paye', '6AA84F': 'paye', '93C47D': 'paye', 'B6D7A8': 'paye',
  'FF9900': 'facture', 'E69138': 'facture', 'F6B26B': 'facture', 'FFE599': 'facture',
  'FF0000': 'a_facturer', 'CC0000': 'a_facturer', 'E06666': 'a_facturer', 'EA9999': 'a_facturer',
  '999999': 'ne_pas_facturer', 'B7B7B7': 'ne_pas_facturer', 'CCCCCC': 'ne_pas_facturer',
};
const LIBELLE_PAIEMENT = 'Paiement (import Excel)';

// ---------- Lecture du fichier ----------

function chargerExcel() {
  if (window.XLSX?.style_version) return Promise.resolve();
  return new Promise((ok, echec) => {
    const s = document.createElement('script');
    s.src = 'lib/xlsx-style.min.js';
    s.onload = ok;
    s.onerror = () => echec(new Error('Pas de connexion internet. Réessaie quand tu as du réseau.'));
    document.head.appendChild(s);
  });
}

const norm = t => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const arrondi = v => Math.round(v * 100) / 100;

// Lit un onglet : renvoie une fonction cel(r, c)
function lecteur(ws) {
  return (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
}
function nombre(cel) {
  if (!cel) return null;
  if (cel.t === 'n') return Number.isFinite(cel.v) ? cel.v : null;
  if (cel.t === 's') {
    const t = cel.v.trim().replace(/\s/g, '').replace(',', '.').replace('€', '');
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  }
  return null;
}
function texte(cel) {
  if (!cel || cel.v == null) return '';
  return String(cel.w ?? cel.v).trim();
}
// Date Excel (nombre de jours) ou texte "12/04/2026" -> "2026-04-12"
function dateIso(cel) {
  if (!cel) return null;
  if (cel.t === 'n' && cel.v > 30000 && cel.v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(cel.v) * 86400000).toISOString().slice(0, 10);
  }
  if (cel.t === 'd') return String(cel.v).slice(0, 10);
  const m = texte(cel).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function couleur(cel) {
  const s = cel?.s;
  if (!s || s.patternType === 'none') return null;
  return (s.fgColor?.rgb || '').slice(-6).toUpperCase() || null;
}
// Taux horaire écrit dans une formule (=B4*25 ou =IF(B35="","",B35*37)) ou déduit de la valeur
function tauxDepuis(cel, heures) {
  const m = String(cel?.f || '').match(/\*\s*(\d+(?:\.\d+)?)\s*(?:,\s*""\s*)?\)?\s*$/) || String(cel?.f || '').match(/[A-Z]+\d+\s*\*\s*(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]);
  const v = nombre(cel);
  return v != null && heures ? arrondi(v / heures) : null;
}

// Trouve la ligne d'en-tête (celle qui contient "Date") et le numéro de chaque colonne utile
function analyserEntete(cel, plage) {
  for (let r = plage.s.r; r <= Math.min(plage.s.r + 8, plage.e.r); r++) {
    const titres = [];
    for (let c = plage.s.c; c <= plage.e.c; c++) titres[c] = norm(texte(cel(r, c)));
    if (!titres.includes('date')) continue;
    const col = (test) => titres.findIndex(t => t && test(t));
    return {
      ligne: r, titres,
      date: titres.indexOf('date'),
      hn: col(t => /^heures? nettoyage/.test(t)),
      he: col(t => /^heures? entretien/.test(t)),
      moN: col(t => /\/h nettoyage/.test(t)),
      moE: col(t => /\/h entretien/.test(t)),
      conso: col(t => t.startsWith('consommable')),
      total: col(t => t.replace(/\s/g, '') === 'mo+conso'),
      gainProduit: col(t => t.startsWith('gain sur produit')),
      commentaire: col(t => t.startsWith('commentaire')),
      reglement: col(t => t.startsWith('reglement') || t.startsWith('règlement')),
      frais: col(t => t.startsWith('frais reel')),
      numDevis: col(t => t.includes('de devis') && t.startsWith('n')),
      montantDevis: col(t => t.startsWith('montant du devis')),
      aFacturer: col(t => t.startsWith('montant a facturer')),
      totalHeures: col(t => t.startsWith('total heure')),
      totalFacture: col(t => t.startsWith('total facture')),
      heuresBateaux: titres.map((t, c) => (t && t.startsWith('heures bateau') ? c : -1)).filter(c => c >= 0),
    };
  }
  return null;
}

// Analyse un onglet : renvoie { client, mode, interventions[], ignorees[] }
function analyserOnglet(nom, ws, generaux) {
  if (!ws['!ref']) return null;
  const plage = XLSX.utils.decode_range(ws['!ref']);
  const cel = lecteur(ws);
  const e = analyserEntete(cel, plage);
  if (!e) return { nom, erreur: "pas de colonne « Date » trouvée" };

  // Colonnes OUI/NON (bateaux) : on regarde les valeurs sous l'en-tête
  const colonnesOuiNon = [];
  for (let c = plage.s.c; c <= plage.e.c; c++) {
    let n = 0;
    for (let r = e.ligne + 1; r <= Math.min(e.ligne + 40, plage.e.r); r++) if (/^(oui|non)$/i.test(texte(cel(r, c)))) n++;
    if (n >= 2) colonnesOuiNon.push(c);
  }
  const mode = e.numDevis >= 0 || e.montantDevis >= 0 ? 'devis'
    : colonnesOuiNon.length && e.totalFacture >= 0 ? 'forfait'
    : e.hn >= 0 || e.he >= 0 ? 'heure' : null;
  if (!mode) return { nom, erreur: 'format de tableau non reconnu' };

  const bateaux = colonnesOuiNon.map(c => {
    const t = texte(cel(e.ligne, c));
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
  const forfait = mode === 'forfait'
    ? Number((texte(cel(e.ligne, e.totalFacture)).match(/x\s*(\d+(?:[.,]\d+)?)\s*€/i) || [])[1]?.replace(',', '.')) || null
    : null;

  const interventions = [], ignorees = [];
  for (let r = e.ligne + 1; r <= plage.e.r; r++) {
    const premier = norm(texte(cel(r, plage.s.c)));
    if (/^(moyenne|nombre de oui|total)/.test(premier)) break;
    const date = dateIso(cel(r, e.date));
    const commentaire = e.commentaire >= 0 ? texte(cel(r, e.commentaire)) : '';
    const fraisReels = e.frais >= 0 ? nombre(cel(r, e.frais)) : null;
    if (!date) {
      if (commentaire || fraisReels) ignorees.push(`ligne ${r + 1} : pas de date`);
      continue;
    }

    const i = {
      date_debut: date, nom: `Intervention du ${dateFr(date)}`, mode_facturation: mode,
      description: commentaire || null,
      taux_nettoyage: generaux.taux_nettoyage, taux_entretien: generaux.taux_entretien,
      conso_pct: generaux.conso_pct, conso_min: generaux.conso_min,
      prix_km: generaux.prix_km_facture, marge_produits: 0,
      statut: 'a_facturer',
      _frais: fraisReels && fraisReels > 0 ? arrondi(fraisReels) : null,
      _ligne: r + 1,
    };

    if (mode === 'heure' || mode === 'devis') {
      const hn = e.hn >= 0 ? nombre(cel(r, e.hn)) : null;
      const he = e.he >= 0 ? nombre(cel(r, e.he)) : null;
      // La base garde les heures avec 2 décimales
      i.heures_nettoyage = hn ? arrondi(hn) : null;
      i.heures_entretien = he ? arrondi(he) : null;
      if (e.moN >= 0) i.taux_nettoyage = tauxDepuis(cel(r, e.moN), hn) ?? i.taux_nettoyage;
      if (e.moE >= 0) i.taux_entretien = tauxDepuis(cel(r, e.moE), he) ?? i.taux_entretien;
      const statutCouleur = COULEURS_STATUT[couleur(cel(r, e.reglement))];
      i.statut = statutCouleur || (/pay/i.test(texte(cel(r, e.reglement))) ? 'paye' : 'a_facturer');
    }

    if (mode === 'heure') {
      const conso = e.conso >= 0 ? nombre(cel(r, e.conso)) : null;
      const total = e.total >= 0 ? nombre(cel(r, e.total)) : null;
      i.consommables = conso != null ? arrondi(conso) : null;
      // Si le calcul de l'appli ne retombe pas pile sur le montant de l'Excel, on garde celui de l'Excel
      const calcule = calculer({ ...i, mouvements: [] }).calcule;
      if (total != null && Math.abs(total - calcule) >= 0.005) i.montant_facture = arrondi(total);
      const gain = e.gainProduit >= 0 ? nombre(cel(r, e.gainProduit)) : null;
      if (gain) i.description = [i.description, `gain sur produit : ${euros(gain)}`].filter(Boolean).join(' · ');
      if (!i.heures_nettoyage && !i.heures_entretien && !total && !conso && !fraisReels && !commentaire) continue; // ligne vide
    }

    if (mode === 'devis') {
      i.numero_devis = texte(cel(r, e.numDevis)) || null;
      i.montant_devis = e.montantDevis >= 0 ? nombre(cel(r, e.montantDevis)) : null;
      const aFacturer = e.aFacturer >= 0 ? nombre(cel(r, e.aFacturer)) : null;
      if (aFacturer != null && Math.abs(aFacturer - (i.montant_devis || 0)) >= 0.005) i.montant_facture = arrondi(aFacturer);
      if (!i.montant_devis && aFacturer == null && !fraisReels && !commentaire) continue;
    }

    if (mode === 'forfait') {
      const faits = colonnesOuiNon.map((c, k) => {
        const v = texte(cel(r, c)).toUpperCase();
        const hCol = e.heuresBateaux[k];
        const h = v === 'OUI' && hCol != null ? nombre(cel(r, hCol)) : null;
        return { nom: bateaux[k], fait: v === 'OUI', heures: h || null, _coul: couleur(cel(r, c)), _vide: !v };
      });
      if (faits.every(b => b._vide)) continue; // semaine pas encore remplie
      i.forfait_bateau = forfait;
      i.bateaux_faits = faits.map(({ nom: n, fait, heures }) => ({ nom: n, fait, heures }));
      // Heures totales différentes de la somme par bateau : on garde la différence (attente, bâches…)
      const somme = faits.reduce((s, b) => s + (b.heures || 0), 0);
      const totalH = e.totalHeures >= 0 ? nombre(cel(r, e.totalHeures)) : null;
      if (totalH != null && totalH - somme > 0.005) i.heures_nettoyage = arrondi(totalH - somme);
      const facture = nombre(cel(r, e.totalFacture));
      const calcule = faits.filter(b => b.fait).length * (forfait || 0);
      if (facture != null && Math.abs(facture - calcule) >= 0.005) i.montant_facture = arrondi(facture);
      const coul = faits.filter(b => b.fait).map(b => COULEURS_STATUT[b._coul]).find(Boolean);
      i.statut = !faits.some(b => b.fait) ? 'ne_pas_facturer' : coul || 'a_facturer';
    }

    interventions.push(i);
  }

  return {
    nom: nom.trim(), mode, interventions, ignorees,
    client: {
      nom: nom.trim(), mode_facturation: mode,
      bateau: bateaux.length ? bateaux.join(', ') : null,
      forfait_bateau: forfait,
    },
  };
}

// Calcul d'une intervention importée (avec ses frais et son paiement), pour l'aperçu
function calculImport(i, avecPaiements) {
  const mouvements = [];
  if (i._frais) mouvements.push({ sens: 'depense', montant: i._frais });
  const sansPaiement = calculer({ ...i, mouvements });
  if (avecPaiements && i.statut === 'paye' && sansPaiement.facture > 0) mouvements.push({ sens: 'gain', montant: sansPaiement.facture });
  return calculer({ ...i, mouvements });
}

// ---------- Écran ----------

export async function afficher(main) {
  titre('Importer un ancien Excel', '/reglages');
  main.innerHTML = `
    <div class="carte">
      <p style="margin-top:0">Pour reprendre ton ancien tableau de suivi (un onglet par client).
        L'appli te montre d'abord ce qu'elle a compris : <strong>rien n'est enregistré avant que tu valides</strong>.</p>
      <ul class="aide">
        <li>Chaque onglet devient un client (il est réutilisé s'il existe déjà).</li>
        <li>Chaque ligne devient une intervention, avec ses heures, ses montants et ses frais réels.</li>
        <li>Le statut vient de la couleur : 🟢 payé, 🟠 en attente, 🔴 à facturer, ⚪ à ne pas facturer.</li>
        <li>Si tu importes deux fois le même fichier, les lignes déjà présentes sont ignorées.</li>
      </ul>
      <label class="btn principal">📂 Choisir le fichier Excel
        <input type="file" id="fichier-import" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
      </label>
    </div>
    <div id="apercu-import"></div>`;

  main.querySelector('#fichier-import').onchange = e => tenter(async () => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    const zone = main.querySelector('#apercu-import');
    zone.innerHTML = '<p class="aide">Lecture du fichier…</p>';
    await chargerExcel();
    const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array', cellFormula: true, cellStyles: true });
    const [generaux, clientsExistants, chantiersExistants] = await Promise.all([
      tarifsGeneraux(),
      q(db.from('clients').select('id, nom')),
      q(db.from('chantiers').select('client_id, date_debut, description')),
    ]);
    const onglets = wb.SheetNames.map(n => analyserOnglet(n, wb.Sheets[n], generaux)).filter(Boolean);

    // Doublons : même client, même date, même commentaire
    const clientPar = Object.fromEntries(clientsExistants.map(c => [norm(c.nom), c]));
    const dejaLa = new Set(chantiersExistants.map(c => `${c.client_id}|${c.date_debut}|${norm(c.description)}`));
    for (const o of onglets) {
      if (o.erreur) continue;
      o.existant = clientPar[norm(o.nom)] || null;
      o.doublons = 0;
      if (o.existant) {
        o.interventions = o.interventions.filter(i => {
          const doublon = dejaLa.has(`${o.existant.id}|${i.date_debut}|${norm(i.description)}`);
          if (doublon) o.doublons++;
          return !doublon;
        });
      }
    }
    dessinerApercu(zone, onglets, true);
  });

  function dessinerApercu(zone, onglets, avecPaiements) {
    const valides = onglets.filter(o => !o.erreur && o.interventions.length);
    const total = { n: 0, facture: 0, frais: 0, benefice: 0, heures: 0 };
    const blocs = onglets.map(o => {
      if (o.erreur) return `<div class="carte"><strong>${esc(o.nom)}</strong><p class="aide">Ignoré : ${esc(o.erreur)}.</p></div>`;
      const calc = o.interventions.map(i => calculImport(i, avecPaiements));
      const s = k => calc.reduce((x, r) => x + (r[k] || 0), 0);
      const parStatut = {};
      for (const i of o.interventions) parStatut[i.statut] = (parStatut[i.statut] || 0) + 1;
      const dates = o.interventions.map(i => i.date_debut).sort();
      total.n += o.interventions.length; total.facture += s('facture'); total.frais += s('fraisReels');
      total.benefice += s('benefice'); total.heures += s('heures');
      return `
        <div class="carte">
          <div class="info"><span>${o.existant ? 'Client existant' : 'Nouveau client'} · ${esc(MODES_FACTURATION[o.mode])}</span>
            <div><strong>${esc(o.nom)}</strong>${o.client.bateau ? ` · ${esc(o.client.bateau)}` : ''}${o.client.forfait_bateau ? ` · ${euros(o.client.forfait_bateau)} / bateau` : ''}</div></div>
          <div class="info"><span>${o.interventions.length} intervention(s)${dates.length ? ` du ${dateFr(dates[0])} au ${dateFr(dates[dates.length - 1])}` : ''}</span>
            <div>${Object.entries(parStatut).map(([k, n]) => `${PASTILLES_STATUT[k]} ${n} ${STATUTS[k].toLowerCase()}`).join(' · ') || '—'}</div></div>
          <div class="info"><span>Facturé · frais réels · bénéfice net</span>
            <div><strong>${euros(s('facture'))}</strong> · ${euros(s('fraisReels'))} · <strong class="pos">${euros(s('benefice'))}</strong> · ${heuresFr(s('heures'))}</div></div>
          ${o.doublons ? `<p class="aide">${o.doublons} ligne(s) déjà importée(s), ignorée(s).</p>` : ''}
          ${o.ignorees.length ? `<p class="aide">Ignoré : ${o.ignorees.map(esc).join(' ; ')}.</p>` : ''}
          <details class="tarifs-detail"><summary>Voir les lignes</summary>
            ${o.interventions.map((i, k) => `<div class="ligne-calcul"><span>${PASTILLES_STATUT[i.statut]} ${dateFr(i.date_debut)} ${esc((i.description || '').slice(0, 40))}</span><span>${euros(calc[k].facture)}</span></div>`).join('')}
          </details>
        </div>`;
    }).join('');

    zone.innerHTML = `
      <h2>Ce que l'appli a compris</h2>
      <div class="resume">
        <div class="etiquette">Bénéfice net · ${valides.length} client(s) · ${total.n} intervention(s)</div>
        <div class="grand">${euros(total.benefice)}</div>
        <div class="details">
          <div><span>Facturé</span><strong>${euros(total.facture)}</strong></div>
          <div><span>Frais réels</span><strong>${euros(total.frais)}</strong></div>
        </div>
      </div>
      ${blocs}
      ${total.n ? `
      <div class="carte">
        <label class="case"><input type="checkbox" id="avec-paiements" ${avecPaiements ? 'checked' : ''}>
          Enregistrer aussi les paiements des lignes 🟢 payées (à la date de l'intervention)</label>
        <p class="aide">Utile pour le Bilan et la déclaration URSSAF. Le mode de paiement (virement, chèque…) sera à compléter si besoin.</p>
        <button class="btn gain" id="lancer-import">✅ Importer ${total.n} intervention(s)</button>
      </div>` : '<p class="vide">Rien de nouveau à importer.</p>'}`;

    const caseP = zone.querySelector('#avec-paiements');
    if (caseP) caseP.onchange = () => dessinerApercu(zone, onglets, caseP.checked);
    const bouton = zone.querySelector('#lancer-import');
    if (bouton) bouton.onclick = () => tenter(async () => {
      bouton.disabled = true;
      bouton.textContent = 'Import en cours…';
      try {
        const n = await importer(valides, avecPaiements);
        zone.innerHTML = `
          <div class="carte">
            <h2 style="margin-top:0">✅ Import terminé</h2>
            <p>${n} intervention(s) ajoutée(s). Tu peux maintenant les retrouver dans l'onglet Interventions
              et sur la fiche de chaque client.</p>
            <a class="btn principal" href="#/chantiers">Voir les interventions</a>
          </div>`;
      } catch (err) {
        bouton.disabled = false;
        bouton.textContent = '✅ Réessayer l\'import';
        throw err;
      }
    });
  }
}

// ---------- Enregistrement ----------

async function importer(onglets, avecPaiements) {
  let total = 0;
  for (const o of onglets) {
    // Client : réutilisé ou créé
    let clientId = o.existant?.id;
    if (!clientId) {
      const cree = await q(db.from('clients').insert(o.client).select('id').single());
      clientId = cree.id;
    }
    // Interventions (en une fois)
    const lignes = o.interventions.map(i => {
      const { _frais, _ligne, ...reste } = i;
      return { ...reste, client_id: clientId };
    });
    const crees = await q(db.from('chantiers').insert(lignes).select('id'));
    // Frais réels et paiements
    const mouvements = [];
    o.interventions.forEach((i, k) => {
      const id = crees[k]?.id;
      if (!id) return;
      if (i._frais) {
        mouvements.push({ chantier_id: id, date: i.date_debut, sens: 'depense', categorie: 'produits', montant: i._frais, description: LIBELLE_FRAIS });
      }
      if (avecPaiements && i.statut === 'paye') {
        const facture = calculer({ ...i, mouvements: i._frais ? [{ sens: 'depense', montant: i._frais }] : [] }).facture;
        if (facture > 0) {
          mouvements.push({ chantier_id: id, date: i.date_debut, sens: 'gain', categorie: 'facture', montant: facture, description: LIBELLE_PAIEMENT });
        }
      }
    });
    if (mouvements.length) await q(db.from('mouvements').insert(mouvements));
    total += crees.length;
  }
  return total;
}
