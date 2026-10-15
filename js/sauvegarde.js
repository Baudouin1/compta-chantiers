// Sauvegarde complète en fichier Excel : un onglet par type de données, lisible directement.
// Les colonnes "id" à la fin servent seulement à pouvoir tout remettre en cas de problème.
import { db, q } from './db.js';
import { dateFr, nomCategorie, STATUTS } from './utils.js';

// La bibliothèque Excel n'est chargée que quand on en a besoin (elle est un peu lourde)
function chargerExcel() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, echec) => {
    const s = document.createElement('script');
    s.src = 'lib/xlsx.mini.min.js';
    s.onload = ok;
    s.onerror = () => echec(new Error('Pas de connexion internet. Réessaie quand tu as du réseau.'));
    document.head.appendChild(s);
  });
}

const nombre = v => (v == null || v === '' ? '' : Number(v));

export async function fabriquerSauvegarde() {
  await chargerExcel();
  const [clients, chantiers, mouvements, trajets, boutons, reglages] = await Promise.all([
    q(db.from('clients').select('*').order('nom')),
    q(db.from('chantiers').select('*').order('created_at')),
    q(db.from('mouvements').select('*').order('date')),
    q(db.from('trajets').select('*').order('destination')),
    q(db.from('boutons_rapides').select('*').order('libelle')),
    q(db.from('reglages').select('*')),
  ]);
  const nomClient = Object.fromEntries(clients.map(c => [c.id, c.nom]));
  const chantierPar = Object.fromEntries(chantiers.map(c => [c.id, c]));

  const onglets = {
    Mouvements: mouvements.map(m => ({
      'Date': dateFr(m.date),
      'Chantier': chantierPar[m.chantier_id]?.nom ?? 'Frais généraux',
      'Client': nomClient[chantierPar[m.chantier_id]?.client_id] ?? '',
      'Type': m.sens === 'gain' ? 'Recette' : 'Dépense',
      'Catégorie': nomCategorie(m.sens, m.categorie),
      'Description': m.description ?? '',
      'Sous-traitant': m.sous_traitant ?? '',
      'Dépense (€)': m.sens === 'depense' ? nombre(m.montant) : '',
      'Recette (€)': m.sens === 'gain' ? nombre(m.montant) : '',
      'Refacturable': m.sens === 'depense' ? (m.refacturable ? 'Oui' : 'Non') : '',
      'Justificatif': m.photo_path ? 'Oui' : 'Non',
      'Note': m.note ?? '',
      'id': m.id, 'id chantier': m.chantier_id ?? '', 'code catégorie': m.categorie,
    })),
    Chantiers: chantiers.map(c => ({
      'Chantier': c.nom,
      'Client': nomClient[c.client_id] ?? '',
      'Statut': STATUTS[c.statut],
      'Début': dateFr(c.date_debut),
      'Fin': dateFr(c.date_fin),
      'Travaux': c.description ?? '',
      'id': c.id, 'id client': c.client_id, 'code statut': c.statut,
    })),
    Clients: clients.map(c => ({
      'Nom': c.nom, 'Téléphone': c.telephone ?? '', 'Email': c.email ?? '', 'Adresse': c.adresse ?? '',
      'Bateau': c.bateau ?? '', 'Port': c.port ?? '',
      'Trajet (destination)': c.trajet_destination ?? '', 'Trajet (km A/R)': nombre(c.trajet_km),
      'Notes': c.notes ?? '', 'id': c.id,
    })),
    Trajets: trajets.map(t => ({ 'Destination': t.destination, 'Km aller-retour': nombre(t.km), 'id': t.id })),
    'Boutons rapides': boutons.map(b => ({
      'Bouton': b.libelle, 'Catégorie': nomCategorie('depense', b.categorie),
      'Montant (€)': nombre(b.montant), 'code catégorie': b.categorie, 'id': b.id,
    })),
    'Réglages': [{ 'Coût au km (€)': nombre(reglages[0]?.cout_km ?? 0.6), 'Sauvegarde du': new Date().toLocaleString('fr-FR') }],
  };

  const classeur = XLSX.utils.book_new();
  for (const [nom, lignes] of Object.entries(onglets)) {
    const feuille = lignes.length ? XLSX.utils.json_to_sheet(lignes) : XLSX.utils.aoa_to_sheet([['(vide)']]);
    // Largeur des colonnes selon le contenu
    if (lignes.length) {
      feuille['!cols'] = Object.keys(lignes[0]).map(k => ({
        wch: Math.min(40, Math.max(k.length, ...lignes.map(l => String(l[k] ?? '').length)) + 2),
      }));
    }
    XLSX.utils.book_append_sheet(classeur, feuille, nom);
  }
  return {
    contenu: XLSX.write(classeur, { type: 'array', bookType: 'xlsx' }),
    nb: clients.length + chantiers.length + mouvements.length,
  };
}
