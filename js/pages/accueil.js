// Écran d'accueil : totaux du mois et chantiers en cours
import { db, q } from '../db.js';
import { euros, titre, totaux, classeMarge } from '../utils.js';
import { ligneChantier } from './chantiers.js';

export async function afficher(main) {
  titre('Accueil');

  const maintenant = new Date();
  const a = maintenant.getFullYear(), m = maintenant.getMonth() + 1;
  const debutMois = `${a}-${String(m).padStart(2, '0')}-01`;
  const debutSuivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  const nomMois = maintenant.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const [mvtsMois, enCours] = await Promise.all([
    q(db.from('mouvements').select('sens, montant').gte('date', debutMois).lt('date', debutSuivant)),
    q(db.from('chantiers')
      .select('id, nom, statut, clients(nom, bateau), mouvements(sens, montant)')
      .eq('statut', 'en_cours')
      .order('created_at', { ascending: false })),
  ]);
  const t = totaux(mvtsMois);

  main.innerHTML = `
    <h2 class="mois">${nomMois}</h2>
    <div class="totaux">
      <div><span>Dépenses</span><strong class="neg">${euros(t.depenses)}</strong></div>
      <div><span>Gains</span><strong class="pos">${euros(t.gains)}</strong></div>
      <div><span>Marge</span><strong class="${classeMarge(t.marge)}">${euros(t.marge)}</strong></div>
    </div>

    <div class="deux-boutons">
      <a class="btn depense" href="#/mouvement/nouveau?sens=depense">− Dépense</a>
      <a class="btn gain" href="#/mouvement/nouveau?sens=gain">+ Gain</a>
    </div>

    <h2>Chantiers en cours</h2>
    <div class="liste">
      ${enCours.map(ligneChantier).join('') || '<p class="vide">Aucun chantier en cours.</p>'}
    </div>
    <a class="btn principal" href="#/chantier/nouveau">+ Nouveau chantier</a>

    <div class="liste">
      <a class="ligne" href="#/frais">
        <div><strong>Frais généraux</strong><small>Dépenses et gains hors chantier</small></div>
        <span class="fleche">›</span>
      </a>
    </div>`;
}
