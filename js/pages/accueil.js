// Écran d'accueil : résumé du mois, chantiers en cours, raccourcis
import { db, q } from '../db.js';
import { euros, titre, totaux } from '../utils.js';
import { ligneChantier } from './chantiers.js';

export async function afficher(main) {
  titre('BluePrestige');

  const maintenant = new Date();
  const a = maintenant.getFullYear(), m = maintenant.getMonth() + 1;
  const debutMois = `${a}-${String(m).padStart(2, '0')}-01`;
  const debutSuivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  const nomMois = maintenant.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const [mvtsMois, chantiers, clients] = await Promise.all([
    q(db.from('mouvements').select('sens, montant').gte('date', debutMois).lt('date', debutSuivant)),
    q(db.from('chantiers')
      .select('id, nom, statut, clients(nom, bateau), mouvements(sens, montant, refacturable)')
      .in('statut', ['en_cours', 'termine'])
      .order('created_at', { ascending: false })),
    q(db.from('clients').select('id').limit(1)),
  ]);
  const t = totaux(mvtsMois);
  const enCours = chantiers.filter(c => c.statut === 'en_cours');

  // Achats refacturables sur les chantiers pas encore payés
  const aRefacturer = chantiers
    .map(c => ({ c, montant: totaux(c.mouvements).refacturable }))
    .filter(x => x.montant > 0);
  const totalRefacturer = aRefacturer.reduce((s, x) => s + x.montant, 0);
  const aEncaisser = chantiers.filter(c => c.statut === 'termine').length;

  // Première utilisation : petit guide de démarrage
  const bienvenue = !clients.length ? `
    <div class="carte">
      <h2 style="margin-top:0">👋 Bienvenue !</h2>
      <ol class="etapes">
        <li><strong>Crée un client</strong> avec son bateau et son port (onglet Clients).</li>
        <li><strong>Crée un chantier</strong> pour ce client.</li>
        <li>Sur le chantier, ajoute tes <strong>dépenses</strong> et tes <strong>gains</strong> : la marge se calcule toute seule.</li>
      </ol>
      <a class="btn principal" href="#/client/nouveau">+ Créer mon premier client</a>
      <a class="btn lien" href="#/aide">📖 Voir le guide complet</a>
    </div>` : '';

  main.innerHTML = `
    ${bienvenue}
    <div class="resume">
      <div class="etiquette">Marge du mois · ${nomMois}</div>
      <div class="grand">${euros(t.marge)}</div>
      <div class="details">
        <div><span>Dépenses</span><strong>${euros(t.depenses)}</strong></div>
        <div><span>Gains</span><strong>${euros(t.gains)}</strong></div>
      </div>
      <a class="lien-bilan" href="#/bilan">📊 Voir le bilan de l'année ›</a>
    </div>

    <div class="deux-boutons">
      <a class="btn depense" href="#/mouvement/nouveau?sens=depense">− Dépense</a>
      <a class="btn gain" href="#/mouvement/nouveau?sens=gain">+ Gain</a>
    </div>

    ${totalRefacturer ? `<p class="a-refacturer">💰 À refacturer : <strong>${euros(totalRefacturer)}</strong>
      sur ${aRefacturer.length} chantier(s) non payé(s)</p>` : ''}
    ${aEncaisser ? `<a class="a-refacturer" style="display:block;text-decoration:none" href="#/chantiers?statut=termine">
      ⏳ ${aEncaisser} chantier(s) terminé(s) en attente de paiement ›</a>` : ''}

    <h2>Chantiers en cours</h2>
    <div class="liste">
      ${enCours.map(ligneChantier).join('') || '<p class="vide">Aucun chantier en cours.</p>'}
    </div>
    <a class="btn principal" href="#/chantier/nouveau">+ Nouveau chantier</a>

    <div class="liste">
      <a class="ligne" href="#/frais">
        <span class="pastille">🧾</span>
        <div><strong>Frais généraux</strong><small>Dépenses et gains hors chantier</small></div>
        <span class="fleche">›</span>
      </a>
    </div>`;
}
