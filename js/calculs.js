// Tous les calculs d'une intervention / d'un chantier (les formules de l'ancien Excel).
// Une seule fonction, utilisée partout (pages, accueil, bilan, fichier Excel).
import { db } from './db.js';
import { TARIFS_DEFAUT, CHAMPS_TARIFS } from './utils.js';

const n = v => Number(v) || 0;
const arrondi = v => Math.round(v * 100) / 100;

// Tarifs généraux (Réglages > Mes tarifs)
export async function tarifsGeneraux() {
  const { data } = await db.from('reglages').select('*').maybeSingle();
  const t = { ...TARIFS_DEFAUT, cout_km: 0.6 };
  for (const k of [...CHAMPS_TARIFS, 'cout_km']) if (data?.[k] != null) t[k] = Number(data[k]);
  return t;
}

// Tarifs d'un client : les siens s'il en a, sinon les tarifs généraux
export function tarifsClient(client, generaux) {
  const t = {};
  for (const k of CHAMPS_TARIFS) t[k] = client?.[k] != null ? Number(client[k]) : generaux[k];
  t.forfait_bateau = client?.forfait_bateau != null ? Number(client.forfait_bateau) : null;
  return t;
}

// Liste des bateaux d'un client ("Marinella, Vernaza" -> ['Marinella', 'Vernaza'])
export function listeBateaux(client) {
  return String(client?.bateau || '').split(/[,;/]+/).map(b => b.trim()).filter(Boolean);
}

// Calcul complet d'un chantier. c doit contenir ses mouvements (c.mouvements).
export function calculer(c) {
  const mvts = c.mouvements || [];
  const depenses = mvts.filter(m => m.sens === 'depense');
  const gains = mvts.filter(m => m.sens === 'gain');
  const mode = c.mode_facturation || 'heure';

  // Temps passé
  const bateaux = Array.isArray(c.bateaux_faits) ? c.bateaux_faits : [];
  const bateauxFaits = bateaux.filter(b => b.fait);
  const heuresNettoyage = n(c.heures_nettoyage);
  const heuresEntretien = n(c.heures_entretien);
  const heures = mode === 'forfait'
    ? bateauxFaits.reduce((s, b) => s + n(b.heures), 0) + heuresNettoyage + heuresEntretien
    : heuresNettoyage + heuresEntretien;

  // Main-d'œuvre
  const moNettoyage = heuresNettoyage * n(c.taux_nettoyage);
  const moEntretien = heuresEntretien * n(c.taux_entretien);
  const forfait = bateauxFaits.length * n(c.forfait_bateau);
  const mainOeuvre = mode === 'forfait' ? forfait : mode === 'devis' ? 0 : moNettoyage + moEntretien;

  // Consommables : % de la main-d'œuvre avec un minimum (à l'heure seulement), ou montant saisi
  const consoAuto = mode === 'heure' && mainOeuvre > 0
    ? Math.max(mainOeuvre * n(c.conso_pct) / 100, n(c.conso_min)) : 0;
  const consommables = c.consommables != null ? n(c.consommables) : consoAuto;

  // Produits / pièces achetés pour le client (dépenses "refacturables") + marge
  const produitsAchat = depenses.filter(m => m.refacturable).reduce((s, m) => s + n(m.montant), 0);
  const gainProduits = produitsAchat * n(c.marge_produits) / 100;
  const produitsFactures = produitsAchat + gainProduits;

  // Kilomètres facturés au client
  const kmFactures = n(c.km_factures) * n(c.prix_km);

  // Montant à facturer
  const calcule = mode === 'devis'
    ? n(c.montant_devis) + produitsFactures + kmFactures
    : mainOeuvre + consommables + produitsFactures + kmFactures;
  const encaisse = gains.reduce((s, m) => s + n(m.montant), 0);
  const nePasFacturer = c.statut === 'ne_pas_facturer';
  // Rien à calculer (pas d'heures, pas de devis) : on se base sur ce qui a été encaissé
  const facture = nePasFacturer ? 0
    : c.montant_facture != null ? n(c.montant_facture)
    : calcule > 0 ? calcule : encaisse;

  // Frais réels, bénéfice, rentabilité
  const fraisReels = depenses.reduce((s, m) => s + n(m.montant), 0);
  const benefice = facture - fraisReels;
  const fraisHorsProduits = fraisReels - produitsAchat;

  return {
    mode, heures, heuresNettoyage, heuresEntretien, bateauxFaits,
    moNettoyage: arrondi(moNettoyage), moEntretien: arrondi(moEntretien), forfait: arrondi(forfait),
    mainOeuvre: arrondi(mainOeuvre),
    consoAuto: arrondi(consoAuto), consommables: arrondi(consommables), consoManuel: c.consommables != null,
    produitsAchat: arrondi(produitsAchat), gainProduits: arrondi(gainProduits), produitsFactures: arrondi(produitsFactures),
    kmFactures: arrondi(kmFactures),
    calcule: arrondi(calcule), facture: arrondi(facture), factureManuel: c.montant_facture != null && !nePasFacturer,
    fraisReels: arrondi(fraisReels), benefice: arrondi(benefice),
    tauxHoraireNet: heures > 0 ? arrondi(benefice / heures) : null,
    margePct: facture > 0 ? benefice / facture : null,
    // "perte/gain sur consommable" : seulement pour les interventions à l'heure (où on facture des consommables)
    gainConso: mode === 'heure' && consommables ? arrondi(consommables - fraisHorsProduits) : 0,
    encaisse: arrondi(encaisse),
    resteAEncaisser: arrondi(Math.max(0, facture - encaisse)),
  };
}

// Moyennes d'un ensemble de chantiers (le bloc "Moyenne" de l'ancien Excel)
export function moyennes(chantiers) {
  const calc = chantiers.map(calculer).filter((r, i) => chantiers[i].statut !== 'ne_pas_facturer');
  const avecHeures = calc.filter(r => r.heures > 0);
  const total = k => calc.reduce((s, r) => s + (r[k] || 0), 0);
  const heures = total('heures');
  const benefice = total('benefice');
  const facture = total('facture');
  return {
    nombre: calc.length,
    heures,
    facture: arrondi(facture),
    fraisReels: arrondi(total('fraisReels')),
    benefice: arrondi(benefice),
    encaisse: arrondi(total('encaisse')),
    beneficeMoyen: calc.length ? arrondi(benefice / calc.length) : 0,
    // Taux horaire net global : bénéfice des interventions avec des heures / total de ces heures
    tauxHoraireNet: avecHeures.length
      ? arrondi(avecHeures.reduce((s, r) => s + r.benefice, 0) / avecHeures.reduce((s, r) => s + r.heures, 0)) : null,
    margePct: facture > 0 ? benefice / facture : null,
    gainConso: arrondi(total('gainConso')),
  };
}
