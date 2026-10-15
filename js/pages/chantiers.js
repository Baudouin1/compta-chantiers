// Écrans Chantiers / interventions : liste, page de l'intervention, formulaire
import { db, q } from '../db.js';
import {
  esc, euros, dateFr, titre, toast, aller, surEnvoi, tenter, dateValide, classeMarge, nomCategorie, iconeCategorie,
  nombreFr, heuresFr, lireHeures, aujourdhui, champDuree, brancherDurees, menuChoix, STATUTS, PASTILLES_STATUT, MODES_PAIEMENT, MODES_FACTURATION,
} from '../utils.js';
import { calculer, tarifsGeneraux, tarifsClient, listeBateaux, numeroSemaine } from '../calculs.js';
import { lireNombre } from './reglages.js';
import { partagerCSV } from './export.js';
import * as justif from '../justificatifs.js';

// Champs demandés à la base pour pouvoir tout calculer dans une liste
export const CHAMPS_LISTE = '*, clients(nom, bateau), mouvements(sens, montant, refacturable)';

let filtreStatut = 'tous';

// Libellé de la dépense créée par le champ "Frais réels" du formulaire
export const LIBELLE_FRAIS = "Frais réels de l'intervention";

export async function liste(main, { query }) {
  titre('Interventions');
  if (STATUTS[query.statut]) filtreStatut = query.statut;
  const chantiers = await q(db.from('chantiers').select(CHAMPS_LISTE)
    .order('date_debut', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }));

  let recherche = '';
  const filtres = { tous: 'Tous', a_facturer: '🔴 À facturer', facture: '🟠 En attente', en_cours: 'En cours', devis: 'Devis', paye: '🟢 Payés', ne_pas_facturer: '⚪ Non facturés' };
  const compte = k => chantiers.filter(c => k === 'tous' || c.statut === k).length;

  function dessiner() {
    main.innerHTML = `
      <a class="btn principal" href="#/chantier/nouveau">+ Nouvelle intervention</a>
      ${chantiers.length > 5 ? '<input type="search" id="recherche" placeholder="🔍 Rechercher un client, un commentaire…">' : ''}
      <div class="filtres">
        ${Object.entries(filtres).filter(([k]) => k === 'tous' || compte(k)).map(([k, v]) =>
          `<button data-statut="${k}" class="${k === filtreStatut ? 'actif' : ''}">${v} (${compte(k)})</button>`).join('')}
      </div>
      <div class="liste" id="liste-chantiers"></div>`;
    main.querySelectorAll('.filtres button').forEach(b => b.onclick = () => {
      filtreStatut = b.dataset.statut;
      dessiner();
    });
    const champ = main.querySelector('#recherche');
    if (champ) {
      champ.value = recherche;
      champ.oninput = () => { recherche = champ.value; remplir(); };
    }
    remplir();
  }

  // La recherche porte sur tous les statuts ; sinon on applique le filtre
  function remplir() {
    const t = recherche.trim().toLowerCase();
    const visibles = t
      ? chantiers.filter(c => `${c.nom} ${c.description} ${c.clients?.nom} ${c.clients?.bateau}`.toLowerCase().includes(t))
      : chantiers.filter(c => filtreStatut === 'tous' || c.statut === filtreStatut);
    main.querySelector('#liste-chantiers').innerHTML =
      visibles.map(c => ligneChantier(c)).join('') || '<p class="vide">Aucune intervention ici.</p>';
  }
  dessiner();
}

// Une ligne de chantier dans une liste (accueil, liste, fiche client)
export function ligneChantier(c, { sansClient = false } = {}) {
  const r = calculer(c);
  const sousTitre = [
    sansClient ? null : c.clients?.nom,
    c.date_debut ? dateFr(c.date_debut) : null,
    r.heures ? heuresFr(r.heures) : null,
  ].filter(Boolean).join(' · ');
  return `
    <a class="ligne" href="#/chantier/${c.id}">
      <span class="pastille statut-pastille ${c.statut}">${PASTILLES_STATUT[c.statut] || '⛵'}</span>
      <div>
        <strong>${esc(c.nom)}</strong>
        <small>${esc(sousTitre)}</small>
        <span class="statut ${c.statut}">${STATUTS[c.statut] || c.statut}</span>
      </div>
      <div class="montant-double">
        <span class="montant ${classeMarge(r.benefice)}">${euros(r.benefice)}</span>
        <small>${r.facture ? 'facturé ' + euros(r.facture) : ''}</small>
      </div>
    </a>`;
}

// ---------- Page d'une intervention ----------

export async function fiche(main, { id }) {
  const [c, boutons] = await Promise.all([
    q(db.from('chantiers').select('*, clients(*), mouvements(*)').eq('id', id).single()),
    q(db.from('boutons_rapides').select('*').order('libelle')),
  ]);
  titre(c.nom, '/chantiers', { texte: '✏️ Modifier', lien: `/chantier/${c.id}/modifier` });
  const r = calculer(c);
  const mvts = c.mouvements.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  const avecJustif = mvts.filter(m => m.photo_path);
  const pct = v => (v == null ? '–' : `${Math.round(v * 100)} %`);

  // Détail du calcul de la facture, ligne par ligne
  const lignes = [];
  if (r.mode === 'heure' || r.mode === 'devis') {
    if (r.heuresNettoyage) lignes.push([`Nettoyage ${heuresFr(r.heuresNettoyage)} × ${euros(c.taux_nettoyage)}`, r.mode === 'heure' ? r.moNettoyage : null]);
    if (r.heuresEntretien) lignes.push([`Entretien ${heuresFr(r.heuresEntretien)} × ${euros(c.taux_entretien)}`, r.mode === 'heure' ? r.moEntretien : null]);
  }
  if (r.mode === 'forfait') {
    for (const b of c.bateaux_faits || []) {
      lignes.push([`${b.fait ? '✅' : '❌'} ${esc(b.nom)}${b.fait && b.heures ? ' · ' + heuresFr(b.heures) : ''}`, b.fait ? Number(c.forfait_bateau) : 0]);
    }
  }
  if (r.mode === 'devis') lignes.push([`Devis ${esc(c.numero_devis || '')}`, Number(c.montant_devis) || 0]);
  if (r.consommables) lignes.push([`Consommables ${r.consoManuel ? '(saisis)' : `(${nombreFr(c.conso_pct)} %, min ${euros(c.conso_min)})`}`, r.consommables]);
  if (r.produitsAchat) lignes.push([`Produits revendus : ${euros(r.produitsAchat)} + ${nombreFr(c.marge_produits)} %`, r.produitsFactures]);
  if (r.kmFactures) lignes.push([`Déplacement ${nombreFr(c.km_factures)} km × ${euros(c.prix_km)}`, r.kmFactures]);

  // Bouton d'action selon le statut
  const action = {
    en_cours: ['🧾 Marquer « à facturer »', 'a_facturer'],
    a_facturer: ['🧾 Marquer comme facturé', 'facture'],
    facture: ['💶 Enregistrer le paiement', 'paye'],
  }[c.statut];

  main.innerHTML = `
    <div class="carte">
      <a class="client-lien" href="#/client/${c.clients.id}">
        ${esc(c.clients.nom)}${c.clients.bateau ? ` · ${esc(c.clients.bateau)}` : ''} ›
      </a>
      <select id="statut" class="statut-select ${c.statut}">
        ${Object.entries(STATUTS).map(([k, v]) => `<option value="${k}" ${k === c.statut ? 'selected' : ''}>${PASTILLES_STATUT[k]} ${v}</option>`).join('')}
      </select>
      ${c.date_debut ? `<p class="aide" style="margin:10px 0 0">📅 ${dateFr(c.date_debut)}${c.date_fin && c.date_fin !== c.date_debut ? ' → ' + dateFr(c.date_fin) : ''}${r.mode === 'forfait' ? ' · semaine ' + numeroSemaine(c.date_debut) : ''}
        · ${MODES_FACTURATION[r.mode]}${c.numero_facture ? ' · Facture ' + esc(c.numero_facture) : ''}</p>` : ''}
      ${c.description ? `<p class="description">${esc(c.description)}</p>` : ''}
    </div>

    <div class="resume">
      <div class="etiquette">Facturé</div>
      <div class="grand">${euros(r.facture)}</div>
      <div class="details">
        <div><span>Bénéfice net</span><strong>${euros(r.benefice)}</strong></div>
        <div><span>Frais réels</span><strong>${euros(r.fraisReels)}</strong></div>
        <div><span>Taux horaire net</span><strong>${r.tauxHoraireNet != null ? euros(r.tauxHoraireNet) + '/h' : '–'}</strong></div>
        <div><span>Heures</span><strong>${r.heures ? heuresFr(r.heures) : '–'}</strong></div>
      </div>
    </div>

    <div class="carte facture-detail">
      <h3 style="margin-top:0">🧾 Facture</h3>
      ${lignes.map(([t, v]) => `<div class="ligne-calcul"><span>${t}</span><span>${v == null ? '' : euros(v)}</span></div>`).join('')
        || '<p class="aide">Rien à calculer : ajoute les heures (ou le devis) avec « Modifier ».</p>'}
      ${r.factureManuel ? `<div class="ligne-calcul gris"><span>Calcul automatique</span><span>${euros(r.calcule)}</span></div>` : ''}
      <div class="ligne-calcul total"><span>${c.statut === 'ne_pas_facturer' ? 'À ne pas facturer' : r.factureManuel ? 'Montant facturé (modifié)' : 'Montant à facturer'}</span><span>${euros(r.facture)}</span></div>
      ${r.encaisse ? `<div class="ligne-calcul"><span>Déjà encaissé</span><span class="pos">${euros(r.encaisse)}</span></div>` : ''}
      ${r.resteAEncaisser && ['facture', 'a_facturer', 'en_cours'].includes(c.statut) && r.encaisse ? `<div class="ligne-calcul"><span>Reste à encaisser</span><span class="neg">${euros(r.resteAEncaisser)}</span></div>` : ''}
      <div class="infos-rentabilite">
        <span>Marge ${pct(r.margePct)}</span>
        ${r.mode === 'heure' && r.consommables ? `<span>Consommables : <b class="${classeMarge(r.gainConso)}">${euros(r.gainConso)}</b></span>` : ''}
        ${r.gainProduits ? `<span>Gain produits : <b class="pos">${euros(r.gainProduits)}</b></span>` : ''}
      </div>
      ${action ? `<button class="btn principal" id="action-statut" data-statut="${action[1]}">${action[0]}</button>` : ''}
      <div class="deux-boutons">
        <a class="btn" href="#/chantier/${c.id}/modifier?frais=1">➕ Ajouter des frais</a>
        <a class="btn" href="#/chantier/${c.id}/modifier">✏️ Heures, facture</a>
      </div>
    </div>

    <h2>Frais et paiements</h2>
    <div class="deux-boutons">
      <a class="btn depense" href="#/mouvement/nouveau?chantier=${c.id}&sens=depense">− Dépense</a>
      <a class="btn gain" href="#/mouvement/nouveau?chantier=${c.id}&sens=gain">+ Paiement</a>
    </div>

    <div class="rapides">
      <a class="btn" href="#/deplacement?chantier=${c.id}">🚗 Aller-retour</a>
      ${boutons.map(b => `<a class="btn" href="#/chantier/${c.id}/modifier?frais=1&bouton=${b.id}">${esc(b.libelle)}</a>`).join('')}
      <a class="btn ajout" href="#/reglages/bouton/nouveau" aria-label="Ajouter un bouton rapide">＋</a>
    </div>

    <div class="liste" style="margin-top:12px">
      ${mvts.map(ligneMouvement).join('') || '<p class="vide">Aucun frais ni paiement pour l\'instant.<br>Ajoute tes frais réels (produits, déplacement…) avec les boutons ci-dessus.</p>'}
    </div>

    ${avecJustif.length ? `
    <h2>📎 Factures et tickets (${avecJustif.length})</h2>
    <div class="carte">
      ${avecJustif.map(m => `
        <div class="info justif-ligne">
          <span>${dateFr(m.date)} · ${esc(nomCategorie(m.sens, m.categorie))} · ${euros(m.montant)}</span>
          <button class="btn lien" data-justif="${esc(m.photo_path)}">
            ${justif.estPdf(m.photo_path) ? '📄' : '🖼️'} ${esc(m.description || 'Voir')}
          </button>
        </div>`).join('')}
    </div>` : ''}

    <div class="actions">
      <a class="btn" href="#/calendrier?chantier=${c.id}"><span>📅</span>Ajouter au calendrier</a>
      <button class="btn" id="export" ${mvts.length ? '' : 'disabled'}><span>📄</span>Exporter (CSV)</button>
    </div>`;

  main.querySelectorAll('[data-justif]').forEach(b => b.onclick = () => tenter(() => justif.ouvrir(b.dataset.justif)));

  const exp = main.querySelector('#export');
  if (mvts.length) exp.onclick = () => tenter(() => {
    const avecChantier = mvts.map(m => ({ ...m, chantiers: { nom: c.nom, statut: c.statut, clients: c.clients } }));
    const nom = c.nom.normalize('NFD').replace(/[^\w-]+/g, '_');
    return partagerCSV(avecChantier, `intervention_${nom}.csv`);
  });

  // Changement de statut (liste déroulante ou bouton d'action)
  async function changerStatut(statut, select) {
    // Passage à "Payé" : on enregistre le paiement (date, mode) pour le livre des recettes
    if (statut === 'paye' && r.resteAEncaisser > 0) {
      if (select) select.value = c.statut;
      return aller(`/paiement?chantier=${c.id}`);
    }
    const maj = { statut };
    if (statut === 'facture' && !c.numero_facture) {
      const numero = prompt('Numéro de la facture (facultatif) :', '');
      if (numero === null) { if (select) select.value = c.statut; return; }
      if (numero.trim()) maj.numero_facture = numero.trim();
    }
    try {
      await q(db.from('chantiers').update(maj).eq('id', id));
    } catch (err) {
      if (select) select.value = c.statut; // on remet l'ancien statut si l'enregistrement a échoué
      throw err;
    }
    toast(`${PASTILLES_STATUT[statut]} ${STATUTS[statut]}`);
    fiche(main, { id }); // on réaffiche avec le nouveau statut
  }
  const selectStatut = main.querySelector('#statut');
  selectStatut.onchange = () => tenter(() => changerStatut(selectStatut.value, selectStatut));
  const bouton = main.querySelector('#action-statut');
  if (bouton) bouton.onclick = () => tenter(() => changerStatut(bouton.dataset.statut));
}

// Une ligne de mouvement (dépense ou gain)
export function ligneMouvement(m) {
  const signe = m.sens === 'gain' ? '+' : '−';
  return `
    <a class="ligne" href="#/mouvement/${m.id}">
      <span class="pastille ${m.sens}">${iconeCategorie(m.sens, m.categorie)}</span>
      <div>
        <strong>${esc(m.description || nomCategorie(m.sens, m.categorie))}</strong>
        <small>${dateFr(m.date)} · ${esc(nomCategorie(m.sens, m.categorie))}${m.sous_traitant ? ' · ' + esc(m.sous_traitant) : ''}${m.mode_paiement ? ' · ' + MODES_PAIEMENT[m.mode_paiement] : ''}</small>
        ${m.refacturable ? '<span class="badge">Refacturé au client</span>' : ''}
        ${m.photo_path ? '<span class="badge justif-badge">📎 Justificatif</span>' : ''}
      </div>
      <div class="montant ${m.sens === 'gain' ? 'pos' : 'neg'}">${signe} ${euros(m.montant)}</div>
    </a>`;
}

// Km écrits dans le libellé d'un aller-retour : "Aller-retour Lorient (40 km)" -> 40
function kmDepuis(description) {
  const m = String(description || '').match(/\(\s*([\d.,]+)\s*km\s*\)/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

// Quantité écrite dans le libellé d'un bouton rapide : "Huile moteur (3 × 12,50 €)" -> { qte: 3, pu: 12.5 }
const RE_QTE = /\s*\(\s*([\d.,]+)\s*×\s*([\d.,]+)\s*€\s*\)\s*$/;
function quantiteDepuis(description) {
  const m = String(description || '').match(RE_QTE);
  return m ? { qte: Number(m[1].replace(',', '.')), pu: Number(m[2].replace(',', '.')) } : null;
}
const prix = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
// Libellé enregistré : on remet la quantité à la fin si la ligne en a une
function descriptionComplete(f) {
  return f.qte != null ? `${f.description} (${nombreFr(f.qte)} × ${prix(f.pu)} €)` : f.description;
}

// ---------- Enregistrer le paiement d'une intervention ----------

export async function paiement(main, { query }) {
  const c = await q(db.from('chantiers').select('*, clients(nom), mouvements(sens, montant, refacturable)').eq('id', query.chantier).single());
  const r = calculer(c);
  titre('Paiement reçu', `/chantier/${c.id}`);
  main.innerHTML = `
    <form class="carte" id="form-paiement">
      <p class="aide" style="margin-top:0">${esc(c.nom)} · ${esc(c.clients.nom)}<br>
        Facturé ${euros(r.facture)}${r.encaisse ? ` · déjà encaissé ${euros(r.encaisse)}` : ''}</p>
      <label>Montant reçu (€) *
        <input name="montant" inputmode="decimal" required class="gros-montant" value="${r.resteAEncaisser.toFixed(2).replace('.', ',')}">
      </label>
      <label>Date du paiement *
        <input name="date" type="date" required value="${aujourdhui()}">
      </label>
      <label>Mode de paiement *
        <select name="mode_paiement" required>
          <option value="">— Choisir —</option>
          ${Object.entries(MODES_PAIEMENT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </label>
      <label>Numéro de facture
        <input name="numero_facture" value="${esc(c.numero_facture ?? '')}" placeholder="ex. F-2026-012">
      </label>
      <button class="btn gain" type="submit">✅ Enregistrer le paiement</button>
    </form>
    <p class="aide">Le paiement est ajouté aux recettes (livre des recettes, déclaration URSSAF)
      et l'intervention passe en 🟢 Payé si tout est réglé.</p>`;

  surEnvoi(main.querySelector('#form-paiement'), async data => {
    const montant = lireNombre(data.montant);
    if (!montant) throw new Error('Montant invalide (ex. 246,75).');
    if (!dateValide(data.date)) throw new Error('Date invalide.');
    if (!data.mode_paiement) throw new Error('Indique le mode de paiement.');
    await q(db.from('mouvements').insert({
      chantier_id: c.id, date: data.date, sens: 'gain', categorie: 'facture', montant,
      mode_paiement: data.mode_paiement,
      description: data.numero_facture ? `Facture ${data.numero_facture}` : `Règlement ${c.nom}`,
    }));
    const solde = montant >= r.resteAEncaisser - 0.005;
    await q(db.from('chantiers').update({
      statut: solde ? 'paye' : 'facture',
      ...(data.numero_facture ? { numero_facture: data.numero_facture } : {}),
    }).eq('id', c.id));
    toast(solde ? '🟢 Payé' : 'Acompte enregistré');
    aller(`/chantier/${c.id}`);
  });
}

// ---------- Formulaire d'une intervention ----------

export async function formulaire(main, { id, query }) {
  const [c, clients, generaux, trajets, boutons] = await Promise.all([
    id ? q(db.from('chantiers').select('*, mouvements(id, sens, montant, refacturable, description, categorie, photo_path, date)').eq('id', id).single())
       : { client_id: query.client, statut: 'a_facturer', date_debut: aujourdhui(), mouvements: [] },
    q(db.from('clients').select('*').order('nom')),
    tarifsGeneraux(),
    q(db.from('trajets').select('*').order('destination')),
    q(db.from('boutons_rapides').select('*').order('libelle')),
  ]);
  titre(id ? "Modifier l'intervention" : 'Nouvelle intervention', id ? `/chantier/${id}` : '/chantiers');

  if (!clients.length) {
    main.innerHTML = `
      <div class="carte">Il faut d'abord créer un client.</div>
      <a class="btn principal" href="#/client/nouveau">+ Nouveau client</a>`;
    return;
  }

  // Valeurs de départ pour une nouvelle intervention : celles du client choisi
  const clientPar = Object.fromEntries(clients.map(cl => [cl.id, cl]));
  function valeursClient(cl) {
    const t = tarifsClient(cl, generaux);
    return {
      mode_facturation: cl?.mode_facturation || 'heure',
      taux_nettoyage: t.taux_nettoyage, taux_entretien: t.taux_entretien,
      conso_pct: t.conso_pct, conso_min: t.conso_min, prix_km: t.prix_km_facture,
      marge_produits: t.marge_produits, forfait_bateau: t.forfait_bateau,
      bateaux_faits: listeBateaux(cl).map(nom => ({ nom, fait: true, heures: null })),
    };
  }
  // Intervention existante : ses valeurs ; ce qui manque (anciennes fiches) est repris du client
  const sansVides = o => Object.fromEntries(Object.entries(o).filter(([, x]) => x != null));
  let v = id
    ? { ...valeursClient(clientPar[c.client_id]), ...sansVides(c) }
    : { ...c, ...valeursClient(clientPar[c.client_id]) };
  // Frais de l'intervention : chaque ligne = une dépense (aller-retour, consommables, produit revendu…)
  // On les modifie ici directement ; à l'enregistrement on crée / modifie / supprime les dépenses.
  const paiements = (c.mouvements || []).filter(m => m.sens === 'gain');
  let frais = (c.mouvements || []).filter(m => m.sens === 'depense').map(m => {
    const q = quantiteDepuis(m.description);
    return {
      id: m.id, categorie: m.categorie, description: q ? m.description.replace(RE_QTE, '') : (m.description || ''),
      montant: Number(m.montant), refacturable: !!m.refacturable, photo_path: m.photo_path,
      km: kmDepuis(m.description), qte: q?.qte ?? null, pu: q?.pu ?? null,
    };
  });
  const fraisInitiaux = JSON.stringify(frais);

  const fraisActifs = () => frais.filter(f => !f.supprime);
  let boutonAjoute = false;

  const champNombre = (nom, label, valeur, extra = '') => `
    <label>${label}
      <input name="${nom}" inputmode="decimal" value="${nombreFr(valeur)}" ${extra}>
    </label>`;

  // Options rarement utilisées : ouvertes seulement si l'une d'elles est déjà remplie
  const optionsUtilisees = () => !!(v.date_fin || (id && v.nom && v.nom !== `Intervention du ${dateFr(v.date_debut)}`)
    || v.km_factures || v.consommables != null || v.montant_facture != null || v.numero_facture
    || v.mode_facturation !== (clientPar[v.client_id]?.mode_facturation || 'heure'));

  function dessiner() {
    main.innerHTML = `
      <form class="carte" id="form-chantier">
        <label>Client *
          <select name="client_id" required>
            <option value="">— Choisir —</option>
            ${clients.map(cl => `<option value="${cl.id}" ${cl.id === v.client_id ? 'selected' : ''}>
              ${esc(cl.nom)}${cl.bateau ? ' · ' + esc(cl.bateau) : ''}</option>`).join('')}
          </select>
        </label>
        <label>Date *
          <input name="date_debut" type="date" required value="${v.date_debut ?? ''}">
        </label>

        <div id="bloc-heures">
          <h3>⏱️ Temps passé</h3>
          <div class="cote-a-cote">
            <label>Nettoyage ${champDuree('name="heures_nettoyage"', v.heures_nettoyage)}</label>
            <label>Entretien ${champDuree('name="heures_entretien"', v.heures_entretien)}</label>
          </div>
        </div>

        <div id="bloc-forfait">
          <h3>⛵ Bateaux faits</h3>
          ${(v.bateaux_faits || []).length ? (v.bateaux_faits || []).map((b, i) => `
            <div class="bateau-fait">
              <label class="case"><input type="checkbox" data-bateau="${i}" ${b.fait ? 'checked' : ''}> ${esc(b.nom)}</label>
              ${champDuree(`data-heures-bateau="${i}"`, b.heures)}
            </div>`).join('')
            : '<p class="aide">Ajoute les bateaux dans la fiche du client (séparés par une virgule).</p>'}
          ${champNombre('forfait_bateau', 'Forfait par bateau (€)', v.forfait_bateau)}
        </div>

        <div id="bloc-devis">
          <h3>📝 Devis</h3>
          <div class="cote-a-cote">
            <label>N° de devis <input name="numero_devis" value="${esc(v.numero_devis ?? '')}" placeholder="ex. D-26-011"></label>
            ${champNombre('montant_devis', 'Montant du devis (€)', v.montant_devis)}
          </div>
        </div>

        <div class="bloc-frais" id="bloc-frais">
          <h3>🧾 Frais de l'intervention</h3>
          <div id="liste-frais"></div>
          <div class="ajout-frais">
            <button type="button" class="puce" data-ajout="ar">🚗 Aller-retour</button>
            <button type="button" class="puce" data-ajout="conso">🧴 Consommables</button>
            <button type="button" class="puce" data-ajout="produit">⚙️ Produit revendu</button>
            <button type="button" class="puce" data-ajout="autre">＋ Autre</button>
          </div>
          ${boutons.length ? `
          <p class="aide sous-titre-frais">⚡ Mes boutons rapides (touche plusieurs fois pour en ajouter)</p>
          <div class="ajout-frais">
            ${boutons.map((b, k) => `<button type="button" class="puce rapide" data-ajout="bouton" data-k="${k}">${esc(b.libelle)} <small>${prix(Number(b.montant))} €</small></button>`).join('')}
          </div>` : `<p class="aide sous-titre-frais"><a href="#/reglages/boutons">⚡ Crée tes boutons rapides</a> (produits que tu utilises souvent, avec leur prix)</p>`}
        </div>
        <label>Commentaire
          <textarea name="description" rows="2" placeholder="ex. nettoyage + vidange eaux grises">${esc(v.description ?? '')}</textarea>
        </label>

        <div class="apercu" id="apercu"></div>

        <label>Statut
          <select name="statut">
            ${Object.entries(STATUTS).map(([k, l]) => `<option value="${k}" ${k === v.statut ? 'selected' : ''}>${PASTILLES_STATUT[k]} ${l}</option>`).join('')}
          </select>
        </label>

        <details class="plus-options" ${optionsUtilisees() ? 'open' : ''}>
          <summary>Plus d'options</summary>
          <p class="aide">Mode de facturation, déplacement facturé, montant modifié, n° de facture, tarifs…</p>
          <div class="segments trois" id="modes">
            ${Object.entries(MODES_FACTURATION).map(([k, l]) => `
              <label class="neutre"><input type="radio" name="mode_facturation" value="${k}" ${k === v.mode_facturation ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
          <div class="cote-a-cote">
            ${champNombre('km_factures', 'Km facturés au client', v.km_factures, 'placeholder="0"')}
            <label id="champ-conso">Consommables (€)
              <input name="consommables" inputmode="decimal" value="${nombreFr(v.consommables)}" placeholder="auto">
            </label>
          </div>
          <label>Montant facturé (€) — vide = calcul automatique
            <input name="montant_facture" inputmode="decimal" value="${nombreFr(v.montant_facture)}" placeholder="calcul automatique">
          </label>
          <div class="cote-a-cote">
            <label>N° de facture
              <input name="numero_facture" value="${esc(v.numero_facture ?? '')}" placeholder="ex. F-2026-012">
            </label>
            <label>Fin (si plusieurs jours) <input name="date_fin" type="date" value="${v.date_fin ?? ''}"></label>
          </div>
          <label>Nom de l'intervention
            <input name="nom" value="${esc(v.nom ?? '')}" placeholder="Intervention du ${dateFr(v.date_debut || aujourdhui())}">
          </label>
          <details class="tarifs-detail">
            <summary>Tarifs appliqués à cette intervention</summary>
            <div class="cote-a-cote">
              ${champNombre('taux_nettoyage', 'Nettoyage (€/h)', v.taux_nettoyage)}
              ${champNombre('taux_entretien', 'Entretien (€/h)', v.taux_entretien)}
              ${champNombre('conso_pct', 'Consommables (%)', v.conso_pct)}
              ${champNombre('conso_min', 'Conso. minimum (€)', v.conso_min)}
              ${champNombre('prix_km', 'Prix du km (€)', v.prix_km)}
              ${champNombre('marge_produits', 'Marge produits (%)', v.marge_produits)}
            </div>
          </details>
        </details>

        <button class="btn principal" type="submit">Enregistrer</button>
      </form>
      ${id ? '<button class="btn danger" id="supprimer">Supprimer cette intervention</button>' : ''}`;
    brancher();
  }

  // Lit le formulaire (pour l'aperçu et l'enregistrement)
  function lire(form, strict) {
    const nb = (nom, lecteur = lireNombre) => {
      const brut = form[nom]?.value?.trim();
      if (!brut) return null;
      const x = lecteur(brut);
      if (x == null && strict) throw new Error(`Valeur invalide : « ${brut} ».`);
      return x;
    };
    const mode = form.mode_facturation.value;
    const d = {
      client_id: form.client_id.value || null,
      date_debut: form.date_debut.value || null,
      date_fin: form.date_fin.value || null,
      nom: form.nom.value.trim() || null,
      mode_facturation: mode,
      heures_nettoyage: nb('heures_nettoyage', lireHeures),
      heures_entretien: nb('heures_entretien', lireHeures),
      forfait_bateau: nb('forfait_bateau'),
      bateaux_faits: (v.bateaux_faits || []).map((b, i) => ({
        nom: b.nom,
        fait: form.querySelector(`[data-bateau="${i}"]`)?.checked ?? false,
        heures: (() => {
          const brut = form.querySelector(`[data-heures-bateau="${i}"]`)?.value?.trim();
          const h = brut ? lireHeures(brut) : null;
          if (brut && h == null && strict) throw new Error(`Heures invalides pour ${b.nom} : « ${brut} ».`);
          return h;
        })(),
      })),
      numero_devis: form.numero_devis.value.trim() || null,
      montant_devis: nb('montant_devis'),
      km_factures: nb('km_factures'),
      consommables: nb('consommables'),
      montant_facture: nb('montant_facture'),
      statut: form.statut.value,
      numero_facture: form.numero_facture.value.trim() || null,
      description: form.description.value.trim() || null,
    };
    for (const k of ['taux_nettoyage', 'taux_entretien', 'conso_pct', 'conso_min', 'prix_km', 'marge_produits']) d[k] = nb(k);
    return d;
  }

  function brancher() {
    const form = main.querySelector('#form-chantier');
    brancherDurees(form);

    // Afficher les blocs selon le mode de facturation
    const majMode = () => {
      const mode = form.mode_facturation.value;
      main.querySelector('#bloc-forfait').hidden = mode !== 'forfait';
      main.querySelector('#bloc-devis').hidden = mode !== 'devis';
      main.querySelector('#champ-conso').hidden = mode !== 'heure';
      main.querySelector('#bloc-heures h3').textContent = mode === 'heure' ? '⏱️ Temps passé' : '⏱️ Temps passé (pour ton taux horaire net)';
    };

    // Aperçu du calcul en direct
    const majApercu = () => {
      let d;
      try { d = lire(form, false); } catch { return; }
      const r = calculer({ ...d, mouvements: [...paiements, ...fraisActifs().map(f => ({ sens: 'depense', montant: f.montant || 0, refacturable: f.refacturable }))] });
      main.querySelector('#apercu').innerHTML = `
        <div><span>Montant calculé</span><strong>${euros(r.calcule)}</strong></div>
        ${r.mode === 'heure' && r.mainOeuvre ? `<small>Main-d'œuvre ${euros(r.mainOeuvre)} + consommables ${euros(r.consommables)}${r.kmFactures ? ' + déplacement ' + euros(r.kmFactures) : ''}${r.produitsFactures ? ' + produits ' + euros(r.produitsFactures) : ''}</small>` : ''}
        ${r.mode === 'forfait' ? `<small>${r.bateauxFaits.length} bateau(x) × ${euros(d.forfait_bateau)}${r.kmFactures ? ' + déplacement ' + euros(r.kmFactures) : ''}</small>` : ''}
        ${r.heures ? `<small>${heuresFr(r.heures)} de travail</small>` : ''}
        ${r.fraisReels ? `<small>Frais réels ${euros(r.fraisReels)}</small>` : ''}
        ${r.facture ? `<small><strong>Bénéfice net ${euros(r.benefice)}</strong>${r.tauxHoraireNet != null ? ` · ${euros(r.tauxHoraireNet)}/h net` : ''}</small>` : ''}`;
      const conso = form.consommables;
      if (conso) conso.placeholder = r.consoAuto ? `auto : ${nombreFr(r.consoAuto)}` : 'auto';
    };

    // ----- Lignes de frais -----
    const zoneFrais = main.querySelector('#liste-frais');
    const cl = () => clientPar[form.client_id.value];
    const choixTrajets = () => [
      ...(cl()?.trajet_km ? [{ destination: cl().trajet_destination || cl().port || 'Trajet du client', km: Number(cl().trajet_km) }] : []),
      ...trajets.map(t => ({ destination: t.destination, km: Number(t.km) })),
    ];
    function dessinerFrais() {
      const actifs = fraisActifs();
      zoneFrais.innerHTML = actifs.length ? actifs.map(f => {
        const k = frais.indexOf(f);
        const estAR = f.categorie === 'deplacement' && f.km != null;
        return `
          <div class="ligne-frais" data-i="${k}">
            <span class="pastille depense">${iconeCategorie('depense', f.categorie)}</span>
            <div class="corps">
              <input class="f-desc" value="${esc(f.description)}" placeholder="${esc(nomCategorie('depense', f.categorie))}">
              <div class="sous-ligne">
                ${estAR
                  ? `<span class="f-km"><input class="f-km-val" inputmode="decimal" value="${nombreFr(f.km)}"> km × ${euros(generaux.cout_km)}</span>`
                  : f.qte != null
                  ? `<span class="f-km f-qte"><button type="button" class="f-moins" aria-label="Un de moins">−</button><input class="f-qte-val" inputmode="decimal" value="${nombreFr(f.qte)}"><button type="button" class="f-plus" aria-label="Un de plus">+</button></span>`
                  : `<label class="case petite"><input type="checkbox" class="f-refac" ${f.refacturable ? 'checked' : ''}> Refacturé au client</label>`}
                <span class="f-euros"><input class="f-montant" inputmode="decimal" value="${f.montant != null ? (estAR || f.qte != null ? prix(f.montant) : nombreFr(f.montant)) : ''}" placeholder="0,00" ${estAR || f.qte != null ? 'readonly' : ''}> €</span>
              </div>
              ${f.qte != null ? `<small class="f-pu">Quantité × ${prix(f.pu)} € l'unité</small>` : ''}
              ${f.photo_path ? '<small class="aide">📎 justificatif joint</small>' : ''}
            </div>
            <button type="button" class="f-suppr" aria-label="Supprimer">✕</button>
          </div>`;
      }).join('') : '<p class="aide">Aucun frais pour l\'instant. Ajoute ce que tu as utilisé :</p>';
      const total = actifs.reduce((x, f) => x + (f.montant || 0), 0);
      if (actifs.length) zoneFrais.insertAdjacentHTML('beforeend', `<div class="total-frais">Total des frais <strong>${euros(total)}</strong></div>`);
    }
    zoneFrais.addEventListener('input', e => {
      const ligne = e.target.closest('.ligne-frais'); if (!ligne) return;
      const f = frais[ligne.dataset.i];
      if (e.target.classList.contains('f-desc')) f.description = e.target.value;
      if (e.target.classList.contains('f-montant')) f.montant = lireNombre(e.target.value);
      if (e.target.classList.contains('f-km-val')) {
        f.km = lireNombre(e.target.value);
        f.montant = f.km ? Math.round(f.km * generaux.cout_km * 100) / 100 : 0;
        f.description = f.description.replace(/\(\s*[\d.,]+\s*km\s*\)/, `(${nombreFr(f.km || 0)} km)`);
        ligne.querySelector('.f-montant').value = f.montant.toFixed(2).replace('.', ',');
        ligne.querySelector('.f-desc').value = f.description;
      }
      if (e.target.classList.contains('f-qte-val')) {
        f.qte = lireNombre(e.target.value) || 0;
        majQuantite(ligne, f, false);
      }
      majApercu(); majTotal();
    });
    const majTotal = () => {
      const total = fraisActifs().reduce((x, g) => x + (g.montant || 0), 0);
      const t = zoneFrais.querySelector('.total-frais strong'); if (t) t.textContent = euros(total);
    };
    function majQuantite(ligne, f, ecrire = true) {
      f.montant = Math.round(f.qte * f.pu * 100) / 100;
      ligne.querySelector('.f-montant').value = prix(f.montant);
      if (ecrire) ligne.querySelector('.f-qte-val').value = nombreFr(f.qte);
    }
    zoneFrais.addEventListener('change', e => {
      if (!e.target.classList.contains('f-refac')) return;
      frais[e.target.closest('.ligne-frais').dataset.i].refacturable = e.target.checked;
      majApercu();
    });
    zoneFrais.addEventListener('click', e => {
      const pas = e.target.classList.contains('f-plus') ? 1 : e.target.classList.contains('f-moins') ? -1 : 0;
      if (pas) {
        const ligne = e.target.closest('.ligne-frais'), f = frais[ligne.dataset.i];
        f.qte = Math.max(0, (f.qte || 0) + pas);
        majQuantite(ligne, f); majApercu(); majTotal();
        return;
      }
      if (!e.target.classList.contains('f-suppr')) return;
      const f = frais[e.target.closest('.ligne-frais').dataset.i];
      if (f.photo_path && !confirm('Ce frais a un justificatif (photo / PDF). Le supprimer aussi ?')) return;
      f.supprime = true;
      dessinerFrais(); majApercu();
    });
    main.querySelectorAll('[data-ajout]').forEach(b => b.onclick = () => {
      const type = b.dataset.ajout;
      if (type === 'ar') {
        const options = choixTrajets();
        const ajouterAR = t => {
          const km = t?.km ?? null;
          frais.push({ categorie: 'deplacement', km, montant: km ? Math.round(km * generaux.cout_km * 100) / 100 : 0,
            description: `Aller-retour ${t?.destination || ''} (${nombreFr(km || 0)} km)`.replace('  ', ' '), refacturable: false });
          dessinerFrais(); majApercu();
          if (!km) zoneFrais.querySelector('.ligne-frais:last-of-type .f-km-val')?.focus();
        };
        if (options.length > 1) {
          menuChoix('Quel trajet ?', [...options.map(t => ({ texte: `🚗 ${esc(t.destination)} · ${nombreFr(t.km)} km`, action: () => ajouterAR(t) })),
            { texte: '✏️ Autre trajet (je tape les km)', action: () => ajouterAR(null) }]);
        } else ajouterAR(options[0] || null);
        return;
      }
      if (type === 'bouton') { ajouterBouton(boutons[b.dataset.k]); return; }
      const modele = {
        conso: { categorie: 'produits', description: 'Consommables', refacturable: false },
        produit: { categorie: 'pieces', description: '', refacturable: true },
        autre: { categorie: 'autre', description: '', refacturable: false },
      }[type];
      frais.push({ montant: null, ...modele });
      dessinerFrais(); majApercu();
      const lignes = zoneFrais.querySelectorAll('.ligne-frais');
      const derniere = lignes[lignes.length - 1];
      (modele.description ? derniere?.querySelector('.f-montant') : derniere?.querySelector('.f-desc'))?.focus();
    });
    function ajouterBouton(x) {
      const pu = Number(x.montant);
      let f = fraisActifs().find(g => g.qte != null && g.description === x.libelle && g.pu === pu);
      if (f) f.qte += 1;
      else frais.push(f = { categorie: x.categorie, description: x.libelle, qte: 1, pu, montant: 0, refacturable: false });
      f.montant = Math.round(f.qte * pu * 100) / 100;
      dessinerFrais(); majApercu();
      const ligne = zoneFrais.querySelector(`.ligne-frais[data-i="${frais.indexOf(f)}"]`);
      ligne?.classList.add('flash');
      ligne?.scrollIntoView({ block: 'nearest' });
    }
    dessinerFrais();
    // Arrivé depuis un bouton rapide de la fiche : on l'ajoute une seule fois
    const venuDuBouton = !boutonAjoute && boutons.find(b => b.id === query.bouton);
    if (venuDuBouton) { boutonAjoute = true; ajouterBouton(venuDuBouton); }
    if (query.frais) setTimeout(() => main.querySelector('#bloc-frais')?.scrollIntoView({ block: 'start' }), 50);

    form.querySelectorAll('[name=mode_facturation]').forEach(x => x.addEventListener('change', () => { majMode(); majApercu(); }));
    form.addEventListener('input', majApercu);
    form.addEventListener('change', majApercu);

    // Changement de client (nouvelle intervention) : on reprend ses tarifs et ses bateaux
    form.client_id.onchange = () => {
      const garder = lire(form, false);
      v = { ...garder, ...(id ? {} : valeursClient(clientPar[form.client_id.value])), client_id: form.client_id.value };
      if (id) v.bateaux_faits = listeBateaux(clientPar[form.client_id.value]).map(nom => ({ nom, fait: true, heures: null }));
      dessiner();
    };

    const majMin = () => { form.date_fin.min = form.date_debut.value || ''; };
    form.date_debut.addEventListener('change', majMin);
    majMin();
    majMode();
    majApercu();

    surEnvoi(form, async () => {
      const d = lire(form, true);
      if (!d.client_id) throw new Error('Choisis un client.');
      if (!dateValide(d.date_debut)) throw new Error('Indique la date de l\'intervention.');
      if (d.date_fin && !dateValide(d.date_fin)) throw new Error('Date de fin invalide.');
      if (d.date_fin && d.date_fin < d.date_debut) throw new Error('La date de fin ne peut pas être avant la date de début.');
      if (d.mode_facturation === 'forfait' && !d.forfait_bateau) throw new Error('Indique le forfait par bateau.');
      for (const h of [d.heures_nettoyage, d.heures_entretien]) if (h != null && h > 24) throw new Error('Plus de 24 h sur une journée ? Vérifie les heures.');
      if (!d.nom) d.nom = `Intervention du ${dateFr(d.date_debut)}`;
      if (d.mode_facturation !== 'forfait') d.bateaux_faits = null;
      if (d.mode_facturation !== 'heure') d.consommables = null;

      for (const f of fraisActifs()) {
        if (f.montant == null || f.montant < 0) throw new Error(`Montant manquant ou invalide pour « ${f.description || nomCategorie('depense', f.categorie)} ».`);
      }

      const res = id
        ? await q(db.from('chantiers').update(d).eq('id', id).select().single())
        : await q(db.from('chantiers').insert(d).select().single());

      // Frais : on crée / modifie / supprime les dépenses
      if (JSON.stringify(frais) !== fraisInitiaux) {
        const avant = Object.fromEntries(JSON.parse(fraisInitiaux).map(f => [f.id, f]));
        for (const f of frais) {
          if (f.qte === 0) f.supprime = true; // quantité 0 = on ne l'a pas utilisé
          const ligne = { categorie: f.categorie, montant: f.montant, description: descriptionComplete(f) || nomCategorie('depense', f.categorie), refacturable: !!f.refacturable };
          if (f.id && f.supprime) {
            await q(db.from('mouvements').delete().eq('id', f.id));
            if (f.photo_path) await db.storage.from('justificatifs').remove([f.photo_path]);
          } else if (f.id) {
            const a = avant[f.id];
            if (a.montant !== f.montant || descriptionComplete(a) !== descriptionComplete(f) || a.refacturable !== f.refacturable) {
              await q(db.from('mouvements').update(ligne).eq('id', f.id));
            }
          } else if (!f.supprime && f.montant > 0) {
            await q(db.from('mouvements').insert({ ...ligne, chantier_id: res.id, date: d.date_debut, sens: 'depense' }));
          }
        }
      }
      toast('Intervention enregistrée');
      aller(`/chantier/${res.id}`);
    });

    const suppr = main.querySelector('#supprimer');
    if (suppr) suppr.onclick = () => tenter(async () => {
      if (!confirm('Supprimer cette intervention ET tous ses frais et paiements (et leurs justificatifs) ?')) return;
      const fichiers = (await q(db.from('mouvements').select('photo_path').eq('chantier_id', id)))
        .map(m => m.photo_path).filter(Boolean);
      await q(db.from('chantiers').delete().eq('id', id));
      if (fichiers.length) await db.storage.from('justificatifs').remove(fichiers);
      toast('Intervention supprimée');
      aller('/chantiers');
    });
  }

  dessiner();
}
