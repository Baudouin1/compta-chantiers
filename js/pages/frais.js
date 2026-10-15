// Frais généraux : les mouvements qui ne sont liés à aucun chantier
import { db, q } from '../db.js';
import { euros, titre, totaux, classeMarge } from '../utils.js';
import { ligneMouvement } from './chantiers.js';

export async function liste(main) {
  titre('Frais généraux', '/');
  const mvts = await q(db.from('mouvements').select('*').is('chantier_id', null)
    .order('date', { ascending: false }).order('created_at', { ascending: false }));

  const annee = new Date().getFullYear();
  const t = totaux(mvts.filter(m => m.date.startsWith(String(annee))));

  main.innerHTML = `
    <p class="aide">Dépenses et gains qui ne sont liés à aucun chantier (assurance, outillage, carburant du véhicule…).</p>
    <h2 class="mois">Année ${annee}</h2>
    <div class="totaux">
      <div><span>Dépenses</span><strong class="neg">${euros(t.depenses)}</strong></div>
      <div><span>Gains</span><strong class="pos">${euros(t.gains)}</strong></div>
      <div><span>Solde</span><strong class="${classeMarge(t.marge)}">${euros(t.marge)}</strong></div>
    </div>

    <div class="deux-boutons">
      <a class="btn depense" href="#/mouvement/nouveau?sens=depense">− Dépense</a>
      <a class="btn gain" href="#/mouvement/nouveau?sens=gain">+ Gain</a>
    </div>

    <h2>Tous les mouvements</h2>
    <div class="liste">
      ${mvts.map(ligneMouvement).join('') || '<p class="vide">Aucun frais général pour l\'instant.</p>'}
    </div>`;
}
