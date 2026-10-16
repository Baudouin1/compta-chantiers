// Frais généraux : les mouvements qui ne sont liés à aucune intervention
import { db, q } from '../db.js';
import { euros, titre, totaux } from '../utils.js';
import { ligneMouvement } from './chantiers.js';

export async function liste(main) {
  titre('Frais généraux', '/');
  const mvts = await q(db.from('mouvements').select('*').is('chantier_id', null)
    .order('date', { ascending: false }).order('created_at', { ascending: false }));

  const annee = new Date().getFullYear();
  const t = totaux(mvts.filter(m => m.date.startsWith(String(annee))));

  main.innerHTML = `
    <p class="aide">Dépenses qui ne sont liées à aucune intervention (assurance, outillage, essence du véhicule…).</p>
    <h2 class="mois">Année ${annee}</h2>
    <div class="totaux">
      <div><span>Dépenses ${annee}</span><strong class="neg">${euros(t.depenses)}</strong></div>
    </div>

    <a class="btn depense" href="#/mouvement/nouveau?sens=depense">− Dépense</a>

    <h2>Toutes les dépenses</h2>
    <div class="liste">
      ${mvts.map(ligneMouvement).join('') || '<p class="vide">Aucun frais général pour l\'instant.</p>'}
    </div>`;
}
