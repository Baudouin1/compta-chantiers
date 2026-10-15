// Sauvegarde complète en fichier Excel mis en forme :
// un onglet Résumé, puis un onglet par type de données (mouvements, chantiers, clients…).
// Les colonnes "id" (masquées) servent seulement à pouvoir tout remettre en cas de problème.
import { db, q } from './db.js';
import { nomCategorie, totaux, STATUTS, MODES_PAIEMENT } from './utils.js';

// ---------- Couleurs et formats ----------
const MARINE = '0B234D', BLEU = '1A3F7A', CIEL = 'E3F0FA', ZEBRE = 'F5F8FC';
const ROUGE = 'C62828', VERT = '1F7A4F', GRIS = '6B7890', BORD = 'D5DCE6';
const EUROS = '#,##0.00 "€"';
const DATE = 'dd/mm/yyyy';

const bordure = { bottom: { style: 'thin', color: { rgb: BORD } } };
const S = {
  titre: { font: { bold: true, sz: 18, color: { rgb: MARINE } } },
  sousTitre: { font: { italic: true, color: { rgb: GRIS } } },
  section: { font: { bold: true, sz: 13, color: { rgb: BLEU } } },
  entete: {
    font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MARINE } },
    alignment: { vertical: 'center', wrapText: true }, border: bordure,
  },
  total: { font: { bold: true }, fill: { fgColor: { rgb: CIEL } }, border: { top: { style: 'medium', color: { rgb: MARINE } } } },
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

// "2026-10-15" -> date Excel (nombre de jours depuis 1899)
function dateExcel(iso) {
  if (!iso) return null;
  const [a, m, j] = iso.split('-').map(Number);
  return (Date.UTC(a, m - 1, j) - Date.UTC(1899, 11, 30)) / 86400000;
}

const lettre = i => XLSX.utils.encode_col(i);

// Fabrique un onglet "tableau" : en-tête coloré, lignes alternées, filtres, totaux.
// colonnes : [{ titre, val: ligne => valeur, type: 'texte'|'euros'|'date'|'nombre', largeur, couleur: ligne => rgb, cache, total }]
function tableau(colonnes, lignes) {
  const feuille = {};
  const derniereLigne = lignes.length; // ligne 0 = en-tête
  colonnes.forEach((col, c) => {
    feuille[XLSX.utils.encode_cell({ r: 0, c })] = { v: col.titre, t: 's', s: S.entete };
    lignes.forEach((ligne, i) => {
      const r = i + 1;
      let v = col.val(ligne);
      if (col.type === 'date') v = dateExcel(v);
      const vide = v == null || v === '';
      const style = {
        border: bordure,
        alignment: { vertical: 'top', wrapText: col.type === 'texte' && (col.largeur || 0) >= 30 },
        ...(r % 2 === 0 ? { fill: { fgColor: { rgb: ZEBRE } } } : {}),
        ...(col.couleur && !vide ? { font: { color: { rgb: col.couleur(ligne) }, bold: col.type === 'euros' } } : {}),
      };
      const cellule = vide
        ? { v: '', t: 's', s: style }
        : typeof v === 'number' ? { v, t: 'n', s: style } : { v: String(v), t: 's', s: style };
      if (!vide && col.type === 'euros') cellule.z = EUROS;
      if (!vide && col.type === 'date') cellule.z = DATE;
      if (cellule.z) cellule.s = { ...style, numFmt: cellule.z };
      feuille[XLSX.utils.encode_cell({ r, c })] = cellule;
    });
  });

  // Ligne de total (SOUS.TOTAL : le total suit les filtres)
  const aDesTotaux = lignes.length && colonnes.some(c => c.total);
  if (aDesTotaux) {
    const r = derniereLigne + 1;
    colonnes.forEach((col, c) => {
      const adresse = XLSX.utils.encode_cell({ r, c });
      if (c === 0) feuille[adresse] = { v: 'TOTAL', t: 's', s: S.total };
      else if (col.total) {
        const plage = `${lettre(c)}2:${lettre(c)}${derniereLigne + 1}`;
        const somme = lignes.reduce((s, l) => s + (Number(col.val(l)) || 0), 0);
        feuille[adresse] = { f: `SUBTOTAL(9,${plage})`, v: somme, t: 'n', z: EUROS, s: { ...S.total, numFmt: EUROS } };
      } else feuille[adresse] = { v: '', t: 's', s: S.total };
    });
  }

  const fin = derniereLigne + (aDesTotaux ? 1 : 0);
  feuille['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(fin, 1), c: colonnes.length - 1 } });
  if (lignes.length) feuille['!autofilter'] = { ref: `A1:${lettre(colonnes.length - 1)}${derniereLigne + 1}` };
  feuille['!cols'] = colonnes.map(col => ({ wch: col.largeur || 14, hidden: !!col.cache }));
  feuille['!rows'] = [{ hpt: 26 }];
  return feuille;
}

// Onglet Résumé : texte libre + petits tableaux
function resume({ email, clients, chantiers, mouvements, nomClient }) {
  const t = totaux(mouvements);
  const L = []; // lignes : [[cellule, cellule…]]
  const txt = (v, s) => ({ v, t: 's', s });
  const eur = (v, s = {}) => ({ v: Number(v) || 0, t: 'n', z: EUROS, s: { ...s, numFmt: EUROS } });
  const couleurMarge = v => ({ font: { bold: true, color: { rgb: v < 0 ? ROUGE : VERT } } });

  L.push([txt('BluePrestige — Sauvegarde', S.titre)]);
  L.push([txt(`Faite le ${new Date().toLocaleString('fr-FR')}${email ? ' · ' + email : ''}`, S.sousTitre)]);
  L.push([]);
  L.push([txt('Chiffres clés', S.section)]);
  L.push([txt('Clients'), { v: clients.length, t: 'n' }]);
  L.push([txt('Chantiers'), { v: chantiers.length, t: 'n' }]);
  L.push([txt('Mouvements'), { v: mouvements.length, t: 'n' }]);
  L.push([txt('Total recettes'), eur(t.gains, { font: { bold: true, color: { rgb: VERT } } })]);
  L.push([txt('Total dépenses'), eur(t.depenses, { font: { bold: true, color: { rgb: ROUGE } } })]);
  L.push([txt('Marge totale'), eur(t.marge, couleurMarge(t.marge))]);
  L.push([]);

  // Par année
  L.push([txt('Par année', S.section)]);
  L.push(['Année', 'Recettes', 'Dépenses', 'Marge'].map(x => txt(x, S.entete)));
  const annees = [...new Set(mouvements.map(m => m.date.slice(0, 4)))].sort().reverse();
  for (const a of annees) {
    const ta = totaux(mouvements.filter(m => m.date.startsWith(a)));
    L.push([txt(a), eur(ta.gains), eur(ta.depenses), eur(ta.marge, couleurMarge(ta.marge))]);
  }
  L.push([]);

  // Par chantier
  L.push([txt('Par chantier', S.section)]);
  L.push(['Chantier', 'Client', 'Statut', 'Recettes', 'Dépenses', 'Marge', 'À refacturer'].map(x => txt(x, S.entete)));
  const parChantier = [...chantiers].sort((a, b) => (b.date_debut || b.created_at).localeCompare(a.date_debut || a.created_at));
  for (const c of parChantier) {
    const tc = totaux(mouvements.filter(m => m.chantier_id === c.id));
    L.push([txt(c.nom), txt(nomClient[c.client_id] ?? ''), txt(STATUTS[c.statut]),
      eur(tc.gains), eur(tc.depenses), eur(tc.marge, couleurMarge(tc.marge)), eur(tc.refacturable)]);
  }
  const frais = mouvements.filter(m => !m.chantier_id);
  if (frais.length) {
    const tf = totaux(frais);
    L.push([txt('Frais généraux'), txt('—'), txt(''), eur(tf.gains), eur(tf.depenses), eur(tf.marge, couleurMarge(tf.marge)), txt('')]);
  }

  const feuille = XLSX.utils.aoa_to_sheet(L.map(l => l.map(c => (typeof c === 'string' ? txt(c) : c))));
  // aoa_to_sheet ne garde pas les styles fournis sous forme d'objet : on les remet
  L.forEach((ligne, r) => ligne.forEach((cel, c) => {
    const a = XLSX.utils.encode_cell({ r, c });
    if (feuille[a] && cel && typeof cel === 'object') Object.assign(feuille[a], cel);
  }));
  feuille['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  feuille['!rows'] = [{ hpt: 30 }];
  return feuille;
}

export async function fabriquerSauvegarde(email) {
  await chargerExcel();
  const [clients, chantiers, mouvements, trajets, boutons, reglages] = await Promise.all([
    q(db.from('clients').select('*').order('nom')),
    q(db.from('chantiers').select('*').order('created_at')),
    q(db.from('mouvements').select('*').order('date').order('created_at')),
    q(db.from('trajets').select('*').order('destination')),
    q(db.from('boutons_rapides').select('*').order('libelle')),
    q(db.from('reglages').select('*')),
  ]);
  const nomClient = Object.fromEntries(clients.map(c => [c.id, c.nom]));
  const chantierPar = Object.fromEntries(chantiers.map(c => [c.id, c]));
  const couleurSens = m => (m.sens === 'gain' ? VERT : ROUGE);

  const classeur = XLSX.utils.book_new();
  const ajouter = (nom, feuille) => XLSX.utils.book_append_sheet(classeur, feuille, nom);

  ajouter('Résumé', resume({ email, clients, chantiers, mouvements, nomClient }));

  ajouter('Mouvements', tableau([
    { titre: 'Date', val: m => m.date, type: 'date', largeur: 11 },
    { titre: 'Chantier', val: m => chantierPar[m.chantier_id]?.nom ?? 'Frais généraux', largeur: 22 },
    { titre: 'Client', val: m => nomClient[chantierPar[m.chantier_id]?.client_id] ?? '', largeur: 18 },
    { titre: 'Type', val: m => (m.sens === 'gain' ? 'Recette' : 'Dépense'), largeur: 10, couleur: couleurSens },
    { titre: 'Catégorie', val: m => nomCategorie(m.sens, m.categorie), largeur: 20 },
    { titre: 'Description', val: m => m.description, largeur: 30, type: 'texte' },
    { titre: 'Sous-traitant', val: m => m.sous_traitant, largeur: 16 },
    { titre: 'Dépense', val: m => (m.sens === 'depense' ? Number(m.montant) : null), type: 'euros', largeur: 13, couleur: () => ROUGE, total: true },
    { titre: 'Recette', val: m => (m.sens === 'gain' ? Number(m.montant) : null), type: 'euros', largeur: 13, couleur: () => VERT, total: true },
    { titre: 'Paiement', val: m => MODES_PAIEMENT[m.mode_paiement] ?? '', largeur: 14 },
    { titre: 'Refacturable', val: m => (m.sens === 'depense' ? (m.refacturable ? 'Oui' : 'Non') : ''), largeur: 12 },
    { titre: 'Justificatif', val: m => (m.photo_path ? '📎 Oui' : ''), largeur: 11 },
    { titre: 'Note', val: m => m.note, largeur: 30, type: 'texte' },
    { titre: 'id', val: m => m.id, cache: true },
    { titre: 'id chantier', val: m => m.chantier_id, cache: true },
    { titre: 'code catégorie', val: m => m.categorie, cache: true },
    { titre: 'code paiement', val: m => m.mode_paiement, cache: true },
  ], mouvements));

  ajouter('Chantiers', tableau([
    { titre: 'Chantier', val: c => c.nom, largeur: 24 },
    { titre: 'Client', val: c => nomClient[c.client_id] ?? '', largeur: 20 },
    { titre: 'Statut', val: c => STATUTS[c.statut], largeur: 11 },
    { titre: 'Début', val: c => c.date_debut, type: 'date', largeur: 11 },
    { titre: 'Fin', val: c => c.date_fin, type: 'date', largeur: 11 },
    { titre: 'Travaux', val: c => c.description, largeur: 40, type: 'texte' },
    { titre: 'id', val: c => c.id, cache: true },
    { titre: 'id client', val: c => c.client_id, cache: true },
    { titre: 'code statut', val: c => c.statut, cache: true },
  ], chantiers));

  ajouter('Clients', tableau([
    { titre: 'Nom', val: c => c.nom, largeur: 22 },
    { titre: 'Téléphone', val: c => c.telephone, largeur: 15 },
    { titre: 'Email', val: c => c.email, largeur: 24 },
    { titre: 'Adresse', val: c => c.adresse, largeur: 30, type: 'texte' },
    { titre: 'Bateau', val: c => c.bateau, largeur: 16 },
    { titre: 'Port', val: c => c.port, largeur: 18 },
    { titre: 'Trajet', val: c => c.trajet_destination, largeur: 18 },
    { titre: 'Km A/R', val: c => (c.trajet_km != null ? Number(c.trajet_km) : null), type: 'nombre', largeur: 8 },
    { titre: 'Notes', val: c => c.notes, largeur: 30, type: 'texte' },
    { titre: 'id', val: c => c.id, cache: true },
  ], clients));

  ajouter('Trajets', tableau([
    { titre: 'Destination', val: t => t.destination, largeur: 30 },
    { titre: 'Km aller-retour', val: t => Number(t.km), type: 'nombre', largeur: 15 },
    { titre: 'id', val: t => t.id, cache: true },
  ], trajets));

  ajouter('Boutons rapides', tableau([
    { titre: 'Bouton', val: b => b.libelle, largeur: 22 },
    { titre: 'Catégorie', val: b => nomCategorie('depense', b.categorie), largeur: 22 },
    { titre: 'Montant', val: b => Number(b.montant), type: 'euros', largeur: 12 },
    { titre: 'code catégorie', val: b => b.categorie, cache: true },
    { titre: 'id', val: b => b.id, cache: true },
  ], boutons));

  ajouter('Réglages', tableau([
    { titre: 'Coût au km', val: r => Number(r.cout_km), type: 'euros', largeur: 14 },
  ], reglages.length ? reglages : [{ cout_km: 0.6 }]));

  return {
    contenu: XLSX.write(classeur, { type: 'array', bookType: 'xlsx', cellStyles: true }),
    nb: clients.length + chantiers.length + mouvements.length,
  };
}
