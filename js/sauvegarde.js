// Sauvegarde complète en fichier Excel mis en forme :
// Tableau de bord, un onglet par client (comme l'ancien Excel), livre des recettes, mouvements, etc.
// Les colonnes "id" (masquées) servent seulement à pouvoir tout remettre en cas de problème.
import { db, q } from './db.js';
import { nomCategorie, STATUTS, MODES_PAIEMENT, MODES_FACTURATION, totaux } from './utils.js';
import { calculer, moyennes, tarifsGeneraux, tarifsClient, listeBateaux, numeroSemaine } from './calculs.js';

// ---------- Couleurs et formats ----------
const MARINE = '0B234D', BLEU = '1A3F7A', CIEL = 'E3F0FA', ZEBRE = 'F7F9FC', BLANC = 'FFFFFF';
const ROUGE = 'C62828', VERT = '1F7A4F', GRIS = '6B7890', BORD = 'D5DCE6';
const EUROS = '#,##0.00 "€"', HEURES = '0.00 "h"', POURCENT = '0%', DATE = 'dd/mm/yyyy', EUROS_H = '#,##0.00 "€/h"';

// Couleurs des statuts (comme dans l'ancien Excel : vert payé, orange en attente, rouge à facturer, gris)
const COULEUR_STATUT = {
  paye: { fond: 'D7F5DF', fort: '1E9E4A' },
  facture: { fond: 'FFE9C7', fort: 'F08C00' },
  a_facturer: { fond: 'FAD4D4', fort: 'D93025' },
  ne_pas_facturer: { fond: 'E6E8EC', fort: '8A94A6' },
  en_cours: { fond: 'E3F0FA', fort: '1A6FB5' },
  devis: { fond: 'EEECFB', fort: '5B4FC4' },
};

const bordure = { bottom: { style: 'thin', color: { rgb: BORD } } };
const S = {
  titre: { font: { bold: true, sz: 20, color: { rgb: MARINE } } },
  sousTitre: { font: { italic: true, color: { rgb: GRIS } } },
  section: { font: { bold: true, sz: 13, color: { rgb: BLEU } } },
  // Titres en haut à gauche : la flèche de tri d'Excel (en bas à droite) ne les cache pas
  entete: {
    font: { bold: true, color: { rgb: BLANC } }, fill: { fgColor: { rgb: MARINE } },
    alignment: { vertical: 'top', horizontal: 'left', wrapText: true, indent: 0 }, border: bordure,
  },
  total: { font: { bold: true }, fill: { fgColor: { rgb: CIEL } }, border: { top: { style: 'medium', color: { rgb: MARINE } } } },
  carteLabel: { font: { sz: 10, color: { rgb: BLANC } }, fill: { fgColor: { rgb: BLEU } }, alignment: { horizontal: 'center' } },
  carteValeur: { font: { bold: true, sz: 16, color: { rgb: BLANC } }, fill: { fgColor: { rgb: MARINE } }, alignment: { horizontal: 'center', vertical: 'center' } },
};

// La bibliothèque Excel n'est chargée que quand on en a besoin (elle est un peu lourde)
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

// "2026-10-15" -> date Excel
function dateExcel(iso) {
  if (!iso) return null;
  const [a, m, j] = iso.split('-').map(Number);
  return (Date.UTC(a, m - 1, j) - Date.UTC(1899, 11, 30)) / 86400000;
}

// ---------- Petit outil pour remplir un onglet case par case ----------
class Feuille {
  constructor() { this.f = {}; this.maxR = 0; this.maxC = 0; this.merges = []; this.largeurs = []; this.hauteurs = []; }
  case(r, c, v, style = {}, format) {
    const cel = v == null || v === '' ? { v: '', t: 's' }
      : typeof v === 'number' ? { v, t: 'n' } : { v: String(v), t: 's' };
    if (format && typeof v === 'number') { cel.z = format; style = { ...style, numFmt: format }; }
    cel.s = style;
    this.f[XLSX.utils.encode_cell({ r, c })] = cel;
    this.maxR = Math.max(this.maxR, r); this.maxC = Math.max(this.maxC, c);
    return cel;
  }
  formule(r, c, f, v, style, format) {
    const cel = this.case(r, c, v, style, format);
    cel.f = f;
  }
  fusion(r, c1, c2, r2 = r) { this.merges.push({ s: { r, c: c1 }, e: { r: r2, c: c2 } }); }
  // Tableau : en-tête coloré, lignes (alternées ou colorées), ligne TOTAL optionnelle
  tableau(r0, colonnes, lignes, { styleLigne, total, filtre } = {}) {
    colonnes.forEach((col, c) => this.case(r0, c, col.titre, S.entete));
    lignes.forEach((ligne, i) => {
      const r = r0 + 1 + i;
      const fondLigne = styleLigne?.(ligne) || (i % 2 ? { fill: { fgColor: { rgb: ZEBRE } } } : {});
      colonnes.forEach((col, c) => {
        let v = col.val(ligne);
        if (col.format === DATE) v = dateExcel(v);
        const perso = col.style?.(ligne, v) || {};
        this.case(r, c, v, {
          border: bordure, alignment: { vertical: 'top', wrapText: !!col.retour }, ...fondLigne, ...perso,
        }, col.format);
      });
    });
    let fin = r0 + lignes.length;
    if (total && lignes.length) {
      fin += 1;
      colonnes.forEach((col, c) => {
        const lettre = XLSX.utils.encode_col(c);
        if (c === 0) this.case(fin, c, 'TOTAL', S.total);
        else if (col.total === 'somme') {
          const somme = lignes.reduce((s, l) => s + (Number(col.val(l)) || 0), 0);
          this.formule(fin, c, `SUBTOTAL(9,${lettre}${r0 + 2}:${lettre}${r0 + 1 + lignes.length})`, somme, S.total, col.format);
        } else this.case(fin, c, '', S.total);
      });
    }
    if (filtre && lignes.length) {
      this.filtre = { ref: `${XLSX.utils.encode_cell({ r: r0, c: 0 })}:${XLSX.utils.encode_cell({ r: r0 + lignes.length, c: colonnes.length - 1 })}` };
    }
    // Largeur : assez pour le titre (sur 2 lignes max) + la flèche de tri, et pour les valeurs
    colonnes.forEach((col, c) => {
      const titre = String(col.titre);
      // Le titre tient sur une ligne, plus la place de la flèche de tri
      const pourTitre = Math.min(28, titre.length + (filtre ? 6 : 3));
      const pourValeurs = col.retour ? 0 : Math.min(40, Math.max(0, ...lignes.map(l => {
        const v = col.val(l);
        if (v == null || v === '') return 0;
        return typeof v === 'number' ? (col.format === DATE ? 10 : col.format === POURCENT ? 5 : 13) : String(v).length;
      })) + 2);
      const largeur = Math.max(col.largeur || 10, pourTitre, pourValeurs);
      this.largeurs[c] = { wch: Math.max(this.largeurs[c]?.wch || 0, largeur), hidden: !!col.cache };
    });
    this.hauteurs[r0] = filtre ? 36 : 22; // assez haut pour que la flèche soit sous le titre
    return fin;
  }
  // Une "carte" chiffre clé : libellé au-dessus, gros chiffre en dessous
  carte(r, c, libelle, valeur, format) {
    this.case(r, c, libelle, S.carteLabel);
    this.case(r + 1, c, valeur, S.carteValeur, format);
    this.hauteurs[r + 1] = 34;
  }
  versExcel() {
    this.f['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(this.maxR, 1), c: Math.max(this.maxC, 1) } });
    if (this.merges.length) this.f['!merges'] = this.merges;
    if (this.filtre) this.f['!autofilter'] = this.filtre;
    this.f['!cols'] = Array.from({ length: this.maxC + 1 }, (_, c) => this.largeurs[c] || { wch: 12 });
    this.f['!rows'] = Array.from({ length: this.maxR + 1 }, (_, r) => (this.hauteurs[r] ? { hpt: this.hauteurs[r] } : {}));
    return this.f;
  }
}

const styleStatut = (ligne) => {
  const k = COULEUR_STATUT[ligne.statut];
  return k ? { font: { bold: true, color: { rgb: BLANC } }, fill: { fgColor: { rgb: k.fort } }, alignment: { horizontal: 'center' } } : {};
};
const fondStatut = (ligne) => {
  const k = COULEUR_STATUT[ligne.statut];
  return k ? { fill: { fgColor: { rgb: k.fond } } } : null;
};
const couleurSigne = (l, v) => (typeof v === 'number' ? { font: { bold: true, color: { rgb: v < 0 ? ROUGE : VERT } } } : {});
const nomOnglet = nom => String(nom).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Client';

// ---------- Onglets ----------

function ongletTableauDeBord(F, { email, chantiers, mouvements, clients }) {
  const annee = new Date().getFullYear();
  const deLAnnee = chantiers.filter(c => (c.date_debut || '').startsWith(String(annee)));
  const an = moyennes(deLAnnee);
  const caisse = totaux(mouvements.filter(m => m.date.startsWith(String(annee))));
  const reste = chantiers.filter(c => ['facture', 'a_facturer'].includes(c.statut)).reduce((s, c) => s + c.r.resteAEncaisser, 0);

  F.case(0, 0, 'BluePrestige — Tableau de bord', S.titre); F.hauteurs[0] = 30;
  F.case(1, 0, `Sauvegarde du ${new Date().toLocaleString('fr-FR')}${email ? ' · ' + email : ''}`, S.sousTitre);
  F.case(3, 0, `Année ${annee}`, S.section);
  F.carte(4, 0, 'Encaissé (URSSAF)', caisse.gains, EUROS);
  F.carte(4, 1, 'Facturé', an.facture, EUROS);
  F.carte(4, 2, 'Bénéfice net', an.benefice, EUROS);
  F.carte(4, 3, 'Taux horaire net', an.tauxHoraireNet ?? 0, EUROS_H);
  F.carte(4, 4, 'Heures travaillées', an.heures, HEURES);
  F.carte(4, 5, 'Reste à encaisser', reste, EUROS);
  for (let c = 0; c <= 7; c++) F.largeurs[c] = { wch: 19 };

  // Mois par mois
  let r = 8;
  F.case(r, 0, 'Mois par mois', S.section); r++;
  const mois = Array.from({ length: 12 }, (_, i) => {
    const p = `${annee}-${String(i + 1).padStart(2, '0')}`;
    const cs = deLAnnee.filter(c => c.date_debut.startsWith(p));
    return { mois: new Date(annee, i, 1).toLocaleDateString('fr-FR', { month: 'long' }), ...moyennes(cs),
      encaisse: totaux(mouvements.filter(m => m.date.startsWith(p))).gains };
  }).filter(m => m.nombre || m.encaisse);
  r = F.tableau(r, [
    { titre: 'Mois', val: m => m.mois.charAt(0).toUpperCase() + m.mois.slice(1) },
    { titre: 'Interventions', val: m => m.nombre, total: 'somme' },
    { titre: 'Heures', val: m => m.heures, format: HEURES, total: 'somme' },
    { titre: 'Facturé', val: m => m.facture, format: EUROS, total: 'somme' },
    { titre: 'Frais réels', val: m => m.fraisReels, format: EUROS, total: 'somme' },
    { titre: 'Bénéfice net', val: m => m.benefice, format: EUROS, total: 'somme', style: couleurSigne },
    { titre: 'Taux horaire net', val: m => m.tauxHoraireNet, format: EUROS_H },
    { titre: 'Encaissé', val: m => m.encaisse, format: EUROS, total: 'somme' },
  ], mois, { total: true }) + 2;

  // Par client
  F.case(r, 0, 'Par client (toutes les années)', S.section); r++;
  const parClient = clients.map(cl => {
    const cs = chantiers.filter(c => c.client_id === cl.id);
    return { nom: cl.nom, ...moyennes(cs), reste: cs.filter(c => ['facture', 'a_facturer'].includes(c.statut)).reduce((s, c) => s + c.r.resteAEncaisser, 0) };
  }).filter(x => x.nombre).sort((a, b) => b.benefice - a.benefice);
  r = F.tableau(r, [
    { titre: 'Client', val: x => x.nom },
    { titre: 'Interventions', val: x => x.nombre, total: 'somme' },
    { titre: 'Heures', val: x => x.heures, format: HEURES, total: 'somme' },
    { titre: 'Facturé', val: x => x.facture, format: EUROS, total: 'somme' },
    { titre: 'Bénéfice net', val: x => x.benefice, format: EUROS, total: 'somme', style: couleurSigne },
    { titre: 'Taux horaire net', val: x => x.tauxHoraireNet, format: EUROS_H },
    { titre: 'Marge', val: x => x.margePct, format: POURCENT },
    { titre: 'Reste à encaisser', val: x => x.reste, format: EUROS, total: 'somme' },
  ], parClient, { total: true }) + 2;

  // À facturer / en attente
  const attente = chantiers.filter(c => ['a_facturer', 'facture'].includes(c.statut))
    .sort((a, b) => (a.date_debut || '').localeCompare(b.date_debut || ''));
  if (attente.length) {
    F.case(r, 0, 'À facturer et en attente de règlement', S.section); r++;
    F.tableau(r, [
      { titre: 'Date', val: c => c.date_debut, format: DATE },
      { titre: 'Client', val: c => c.clients?.nom },
      { titre: 'Intervention', val: c => c.nom },
      { titre: 'Statut', val: c => STATUTS[c.statut], style: styleStatut },
      { titre: 'Montant', val: c => c.r.resteAEncaisser, format: EUROS, total: 'somme' },
    ], attente, { total: true });
  }
}

function ongletClient(F, cl, cs, generaux) {
  const mode = cl.mode_facturation || 'heure';
  const t = tarifsClient(cl, generaux);
  F.case(0, 0, cl.nom, S.titre); F.hauteurs[0] = 30;
  F.case(1, 0, [MODES_FACTURATION[mode], cl.bateau, cl.port,
    mode === 'heure' ? `${t.taux_nettoyage} €/h nettoyage · ${t.taux_entretien} €/h entretien · conso ${t.conso_pct} % (min ${t.conso_min} €)` : null,
    mode === 'forfait' ? `forfait ${t.forfait_bateau ?? '?'} € par bateau` : null,
  ].filter(Boolean).join(' · '), S.sousTitre);

  const avecForfait = cs.some(c => c.mode_facturation === 'forfait');
  // Tous les bateaux rencontrés (fiche client + interventions)
  const bateauxDuClient = [...new Set([...listeBateaux(cl), ...cs.flatMap(c => (c.bateaux_faits || []).map(b => b.nom))])];
  const avecDevis = cs.some(c => c.mode_facturation === 'devis');
  const colonnes = [
    { titre: 'Date', val: c => c.date_debut, format: DATE, largeur: 11 },
    ...(avecDevis ? [
      { titre: 'N° de devis', val: c => c.numero_devis, largeur: 12 },
      { titre: 'Montant du devis', val: c => (c.montant_devis != null ? Number(c.montant_devis) : null), format: EUROS, largeur: 13 },
    ] : []),
    // Forfait : n° de semaine, puis pour chaque bateau OUI/NON et ses heures (comme l'onglet RIVIERA SEINE)
    ...(avecForfait ? [{ titre: 'N° de semaine', val: c => numeroSemaine(c.date_debut), largeur: 9 }] : []),
    ...(avecForfait ? bateauxDuClient.flatMap(nom => [
      { titre: nom, val: c => { const b = (c.bateaux_faits || []).find(x => x.nom === nom); return b ? (b.fait ? 'OUI' : 'NON') : ''; },
        largeur: 10, style: (l, v) => (v === 'OUI' ? { font: { bold: true, color: { rgb: VERT } } } : v === 'NON' ? { font: { bold: true, color: { rgb: ROUGE } } } : {}) },
      { titre: `Heures ${nom}`, val: c => { const b = (c.bateaux_faits || []).find(x => x.nom === nom); return b?.fait && b.heures ? Math.round(b.heures * 60) / 60 : null; },
        format: HEURES, total: 'somme', largeur: 10 },
    ]) : []),
    { titre: 'Heures nettoyage', val: c => c.r.heuresNettoyage || null, format: HEURES, total: 'somme', largeur: 11 },
    { titre: 'Heures entretien', val: c => c.r.heuresEntretien || null, format: HEURES, total: 'somme', largeur: 11 },
    { titre: 'Heures totales', val: c => c.r.heures || null, format: HEURES, total: 'somme', largeur: 11 },
    { titre: "Main-d'œuvre", val: c => c.r.mainOeuvre || null, format: EUROS, total: 'somme', largeur: 13 },
    { titre: 'Consommables', val: c => c.r.consommables || null, format: EUROS, total: 'somme', largeur: 13 },
    { titre: 'Produits revendus', val: c => c.r.produitsFactures || null, format: EUROS, total: 'somme', largeur: 13 },
    { titre: 'Gain sur produits', val: c => c.r.gainProduits || null, format: EUROS, total: 'somme', largeur: 12 },
    { titre: 'Déplacement facturé', val: c => c.r.kmFactures || null, format: EUROS, total: 'somme', largeur: 12 },
    { titre: 'Montant facturé', val: c => c.r.facture, format: EUROS, total: 'somme', largeur: 13, style: () => ({ font: { bold: true } }) },
    { titre: 'Frais réels', val: c => c.r.fraisReels, format: EUROS, total: 'somme', largeur: 12 },
    { titre: 'Bénéfice net', val: c => c.r.benefice, format: EUROS, total: 'somme', largeur: 13, style: couleurSigne },
    { titre: 'Taux horaire net', val: c => c.r.tauxHoraireNet, format: EUROS_H, largeur: 12 },
    { titre: 'Marge', val: c => c.r.margePct, format: POURCENT, largeur: 8 },
    { titre: 'Gain / perte conso', val: c => (c.r.consommables ? c.r.gainConso : null), format: EUROS, total: 'somme', largeur: 12, style: couleurSigne },
    { titre: 'Règlement', val: c => STATUTS[c.statut], largeur: 18, style: styleStatut },
    { titre: 'Encaissé', val: c => c.r.encaisse || null, format: EUROS, total: 'somme', largeur: 12 },
    { titre: 'N° facture', val: c => c.numero_facture, largeur: 12 },
    { titre: 'Commentaire', val: c => c.description, largeur: 45, retour: true },
    { titre: 'id', val: c => c.id, cache: true },
  ];
  const fin = F.tableau(3, colonnes, cs, { styleLigne: fondStatut, total: true, filtre: true });

  // Légende des couleurs
  let r = fin + 2;
  F.case(r, 0, 'Légende', S.section);
  ['paye', 'facture', 'a_facturer', 'ne_pas_facturer'].forEach((k, i) => {
    F.case(r + 1, i * 2, STATUTS[k], styleStatut({ statut: k }));
    F.fusion(r + 1, i * 2, i * 2 + 1);
  });

  // Bloc "Moyennes" (comme l'ancien Excel)
  const m = moyennes(cs);
  r += 3;
  F.case(r, 0, 'Moyennes', S.section);
  const lignes = [
    ['Bénéfice net par intervention', m.beneficeMoyen, EUROS],
    ['Taux horaire net', m.tauxHoraireNet, EUROS_H],
    ['Marge nette', m.margePct, POURCENT],
    ['Total perte / gain sur consommables', m.gainConso, EUROS],
    ['Heures totales', m.heures, HEURES],
    ['Bénéfice net total', m.benefice, EUROS],
    ...(avecForfait ? [['Nombre de OUI (passages faits)', m.passagesOui], ['Nombre de NON (non faits)', m.passagesNon]] : []),
  ];
  lignes.forEach(([libelle, v, format], i) => {
    F.case(r + 1 + i, 0, libelle, { font: { color: { rgb: GRIS } } });
    F.fusion(r + 1 + i, 0, 2);
    F.case(r + 1 + i, 3, v ?? '', { font: { bold: true, color: { rgb: typeof v === 'number' && v < 0 ? ROUGE : MARINE } } }, format);
  });
}

export async function fabriquerSauvegarde(email) {
  await chargerExcel();
  const [clients, chantiersBruts, mouvements, trajets, boutons, generaux] = await Promise.all([
    q(db.from('clients').select('*').order('nom')),
    q(db.from('chantiers').select('*, clients(nom), mouvements(sens, montant, refacturable)').order('date_debut').order('created_at')),
    q(db.from('mouvements').select('*').order('date').order('created_at')),
    q(db.from('trajets').select('*').order('destination')),
    q(db.from('boutons_rapides').select('*').order('libelle')),
    tarifsGeneraux(),
  ]);
  const chantiers = chantiersBruts.map(c => ({ ...c, r: calculer(c) }));
  const nomClient = Object.fromEntries(clients.map(c => [c.id, c.nom]));
  const chantierPar = Object.fromEntries(chantiers.map(c => [c.id, c]));

  const classeur = XLSX.utils.book_new();
  const ajouter = (nom, F) => XLSX.utils.book_append_sheet(classeur, F.versExcel(), nom);
  const noms = new Set();
  const nomUnique = nom => { let n = nomOnglet(nom), i = 2; while (noms.has(n)) n = nomOnglet(`${nom} ${i++}`); noms.add(n); return n; };

  // 1. Tableau de bord
  let F = new Feuille();
  ongletTableauDeBord(F, { email, chantiers, mouvements, clients });
  ajouter(nomUnique('Tableau de bord'), F);

  // 2. Un onglet par client
  for (const cl of clients) {
    const cs = chantiers.filter(c => c.client_id === cl.id);
    if (!cs.length) continue;
    F = new Feuille();
    ongletClient(F, cl, cs, generaux);
    ajouter(nomUnique(cl.nom), F);
  }

  // 3. Livre des recettes (micro-entreprise)
  const recettes = mouvements.filter(m => m.sens === 'gain');
  F = new Feuille();
  F.case(0, 0, 'Livre des recettes', S.titre); F.hauteurs[0] = 30;
  F.case(1, 0, 'Sommes encaissées, dans l\'ordre chronologique', S.sousTitre);
  F.tableau(3, [
    { titre: 'Date', val: m => m.date, format: DATE, largeur: 11 },
    { titre: 'Client', val: m => nomClient[chantierPar[m.chantier_id]?.client_id] ?? '', largeur: 22 },
    { titre: 'Nature de la prestation', val: m => [chantierPar[m.chantier_id]?.nom, m.description].filter(Boolean).join(' — ') || nomCategorie(m.sens, m.categorie), largeur: 40, retour: true },
    { titre: 'Montant', val: m => Number(m.montant), format: EUROS, total: 'somme', largeur: 13, style: () => ({ font: { bold: true, color: { rgb: VERT } } }) },
    { titre: 'Mode de paiement', val: m => MODES_PAIEMENT[m.mode_paiement] ?? '', largeur: 16 },
    { titre: 'N° de facture', val: m => chantierPar[m.chantier_id]?.numero_facture ?? '', largeur: 14 },
    { titre: 'Justificatif', val: m => (m.photo_path ? 'Oui' : ''), largeur: 11 },
  ], recettes, { total: true, filtre: true });
  ajouter(nomUnique('Livre des recettes'), F);

  // 4. Tous les mouvements
  F = new Feuille();
  F.tableau(0, [
    { titre: 'Date', val: m => m.date, format: DATE, largeur: 11 },
    { titre: 'Intervention', val: m => chantierPar[m.chantier_id]?.nom ?? 'Frais généraux', largeur: 24 },
    { titre: 'Client', val: m => nomClient[chantierPar[m.chantier_id]?.client_id] ?? '', largeur: 18 },
    { titre: 'Type', val: m => (m.sens === 'gain' ? 'Recette' : 'Dépense'), largeur: 10, style: l => ({ font: { color: { rgb: l.sens === 'gain' ? VERT : ROUGE } } }) },
    { titre: 'Catégorie', val: m => nomCategorie(m.sens, m.categorie), largeur: 20 },
    { titre: 'Description', val: m => m.description, largeur: 30, retour: true },
    { titre: 'Sous-traitant', val: m => m.sous_traitant, largeur: 16 },
    { titre: 'Dépense', val: m => (m.sens === 'depense' ? Number(m.montant) : null), format: EUROS, total: 'somme', largeur: 13, style: () => ({ font: { bold: true, color: { rgb: ROUGE } } }) },
    { titre: 'Recette', val: m => (m.sens === 'gain' ? Number(m.montant) : null), format: EUROS, total: 'somme', largeur: 13, style: () => ({ font: { bold: true, color: { rgb: VERT } } }) },
    { titre: 'Paiement', val: m => MODES_PAIEMENT[m.mode_paiement] ?? '', largeur: 14 },
    { titre: 'Refacturé', val: m => (m.sens === 'depense' && m.refacturable ? 'Oui' : ''), largeur: 10 },
    { titre: 'Justificatif', val: m => (m.photo_path ? 'Oui' : ''), largeur: 11 },
    { titre: 'Note', val: m => m.note, largeur: 30, retour: true },
    { titre: 'id', val: m => m.id, cache: true },
    { titre: 'id intervention', val: m => m.chantier_id, cache: true },
    { titre: 'code catégorie', val: m => m.categorie, cache: true },
    { titre: 'code paiement', val: m => m.mode_paiement, cache: true },
  ], mouvements, { total: true, filtre: true });
  ajouter(nomUnique('Mouvements'), F);

  // 5. Clients
  F = new Feuille();
  F.tableau(0, [
    { titre: 'Nom', val: c => c.nom, largeur: 22 },
    { titre: 'Téléphone', val: c => c.telephone, largeur: 15 },
    { titre: 'Email', val: c => c.email, largeur: 24 },
    { titre: 'Adresse', val: c => c.adresse, largeur: 30, retour: true },
    { titre: 'Bateau(x)', val: c => c.bateau, largeur: 18 },
    { titre: 'Port', val: c => c.port, largeur: 18 },
    { titre: 'Facturation', val: c => MODES_FACTURATION[c.mode_facturation || 'heure'], largeur: 16 },
    { titre: 'Taux nettoyage', val: c => tarifsClient(c, generaux).taux_nettoyage, format: EUROS_H, largeur: 12 },
    { titre: 'Taux entretien', val: c => tarifsClient(c, generaux).taux_entretien, format: EUROS_H, largeur: 12 },
    { titre: 'Forfait / bateau', val: c => (c.forfait_bateau != null ? Number(c.forfait_bateau) : null), format: EUROS, largeur: 12 },
    { titre: 'Trajet', val: c => c.trajet_destination, largeur: 18 },
    { titre: 'Km A/R', val: c => (c.trajet_km != null ? Number(c.trajet_km) : null), largeur: 8 },
    { titre: 'Notes', val: c => c.notes, largeur: 30, retour: true },
    { titre: 'id', val: c => c.id, cache: true },
  ], clients, { filtre: true });
  ajouter(nomUnique('Clients'), F);

  // 6. Réglages (tarifs, trajets, boutons rapides)
  F = new Feuille();
  F.case(0, 0, 'Mes tarifs', S.section);
  [
    ['Taux horaire nettoyage', generaux.taux_nettoyage, EUROS_H],
    ['Taux horaire entretien', generaux.taux_entretien, EUROS_H],
    ['Consommables (% de la main-d\'œuvre)', generaux.conso_pct / 100, POURCENT],
    ['Consommables minimum', generaux.conso_min, EUROS],
    ['Prix du km facturé', generaux.prix_km_facture, EUROS],
    ['Marge sur produits revendus', generaux.marge_produits / 100, POURCENT],
    ['Mon coût au km', generaux.cout_km, EUROS],
  ].forEach(([l, v, f], i) => { F.case(1 + i, 0, l); F.case(1 + i, 1, v, { font: { bold: true } }, f); });
  F.largeurs[0] = { wch: 36 }; F.largeurs[1] = { wch: 14 };
  let r = 10;
  F.case(r, 0, 'Trajets enregistrés', S.section);
  r = F.tableau(r + 1, [
    { titre: 'Destination', val: t => t.destination, largeur: 36 },
    { titre: 'Km aller-retour', val: t => Number(t.km), largeur: 14 },
    { titre: 'id', val: t => t.id, cache: true },
  ], trajets) + 2;
  F.case(r, 0, 'Boutons rapides', S.section);
  F.tableau(r + 1, [
    { titre: 'Smiley', val: b => b.emoji || '', largeur: 10 },
    { titre: 'Bouton', val: b => b.libelle, largeur: 36 },
    { titre: 'Prix à l\'unité', val: b => Number(b.montant), format: EUROS, largeur: 16 },
    { titre: 'Catégorie', val: b => nomCategorie('depense', b.categorie), largeur: 22 },
    { titre: 'id', val: b => b.id, cache: true },
  ], boutons);
  ajouter(nomUnique('Réglages'), F);

  return {
    contenu: XLSX.write(classeur, { type: 'array', bookType: 'xlsx', cellStyles: true }),
    nb: clients.length + chantiers.length + mouvements.length,
  };
}
