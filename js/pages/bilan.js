// Bilan de l'année : mois par mois, dépenses par catégorie, meilleurs chantiers
import { db, q } from '../db.js';
import { esc, euros, titre, totaux, classeMarge, nomCategorie, iconeCategorie } from '../utils.js';

export async function afficher(main, { query }) {
  const annee = Number(query.annee) || new Date().getFullYear();
  titre(`Bilan ${annee}`, '/');

  const mvts = await q(db.from('mouvements')
    .select('date, sens, categorie, montant, chantier_id, chantiers(id, nom, clients(nom))')
    .gte('date', `${annee}-01-01`).lte('date', `${annee}-12-31`));
  const t = totaux(mvts);

  // Mois par mois
  const mois = Array.from({ length: 12 }, (_, i) => {
    const prefixe = `${annee}-${String(i + 1).padStart(2, '0')}`;
    return {
      nom: new Date(annee, i, 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      ...totaux(mvts.filter(m => m.date.startsWith(prefixe))),
    };
  });
  const maxMois = Math.max(1, ...mois.map(m => Math.max(m.gains, m.depenses)));
  const moisAffiches = mois.filter((m, i) => m.gains || m.depenses || i <= new Date().getMonth() || annee < new Date().getFullYear());

  // Dépenses par catégorie
  const parCategorie = {};
  for (const m of mvts) if (m.sens === 'depense') parCategorie[m.categorie] = (parCategorie[m.categorie] || 0) + Number(m.montant);
  const categories = Object.entries(parCategorie).sort((a, b) => b[1] - a[1]);

  // Chantiers de l'année classés par marge
  const parChantier = {};
  for (const m of mvts) {
    const cle = m.chantier_id || 'frais';
    (parChantier[cle] ||= { chantier: m.chantiers, mouvements: [] }).mouvements.push(m);
  }
  const chantiers = Object.entries(parChantier)
    .filter(([cle, v]) => cle !== 'frais' && v.chantier)
    .map(([, v]) => ({ ...v, ...totaux(v.mouvements) }))
    .sort((a, b) => b.marge - a.marge);
  const frais = parChantier.frais ? totaux(parChantier.frais.mouvements) : null;

  main.innerHTML = `
    <div class="filtres" style="justify-content:center">
      <a class="btn" style="width:auto;margin:0" href="#/bilan?annee=${annee - 1}">‹ ${annee - 1}</a>
      ${annee < new Date().getFullYear() ? `<a class="btn" style="width:auto;margin:0" href="#/bilan?annee=${annee + 1}">${annee + 1} ›</a>` : ''}
    </div>

    <div class="resume">
      <div class="etiquette">Marge ${annee}</div>
      <div class="grand">${euros(t.marge)}</div>
      <div class="details">
        <div><span>Dépenses</span><strong>${euros(t.depenses)}</strong></div>
        <div><span>Gains</span><strong>${euros(t.gains)}</strong></div>
      </div>
    </div>

    ${!mvts.length ? '<p class="vide">Aucun mouvement en ' + annee + '.</p>' : `
    <h2>Chiffre d'affaires à déclarer</h2>
    <div class="carte">
      <p class="aide" style="margin-top:0">Micro-entreprise : on déclare à l'URSSAF le total des sommes
        encaissées (factures, acomptes…), sans retirer les dépenses.</p>
      ${[0, 1, 2, 3].map(tr => {
        const m3 = mois.slice(tr * 3, tr * 3 + 3);
        const total = m3.reduce((s, m) => s + m.gains, 0);
        return `
        <div class="info">
          <span>${tr + 1}${tr ? 'e' : 'er'} trimestre · ${m3.map(m => `${m.nom} ${euros(m.gains)}`).join(' · ')}</span>
          <div><strong>${euros(total)}</strong></div>
        </div>`;
      }).join('')}
      <div class="info"><span>Total ${annee}</span><div><strong class="pos">${euros(t.gains)}</strong></div></div>
    </div>

    <h2>Mois par mois</h2>
    <div class="carte">
      <div class="legende"><span><i style="background:var(--vert)"></i>Gains</span><span><i style="background:var(--rouge)"></i>Dépenses</span></div>
      <div class="barres">
        ${moisAffiches.map(m => `
          <div class="barre-mois">
            <span class="nom">${m.nom}</span>
            <div class="pistes">
              <div class="piste g" style="width:${(m.gains / maxMois) * 100}%"></div>
              <div class="piste d" style="width:${(m.depenses / maxMois) * 100}%"></div>
            </div>
            <span class="montant ${classeMarge(m.marge)}">${m.gains || m.depenses ? euros(m.marge) : '–'}</span>
          </div>`).join('')}
      </div>
    </div>

    ${categories.length ? `
    <h2>Où part l'argent</h2>
    <div class="carte repartition">
      ${categories.map(([cat, montant]) => `
        <div class="rang">
          <span>${iconeCategorie('depense', cat)} ${esc(nomCategorie('depense', cat))}</span>
          <strong class="montant">${euros(montant)}</strong>
          <div class="jauge"><div style="width:${(montant / categories[0][1]) * 100}%"></div></div>
        </div>`).join('')}
    </div>` : ''}

    ${chantiers.length ? `
    <h2>Chantiers de l'année</h2>
    <div class="liste">
      ${chantiers.map(c => `
        <a class="ligne" href="#/chantier/${c.chantier.id}">
          <div>
            <strong>${esc(c.chantier.nom)}</strong>
            <small>${esc(c.chantier.clients?.nom ?? '')} · gains ${euros(c.gains)}</small>
          </div>
          <div class="montant ${classeMarge(c.marge)}">${euros(c.marge)}</div>
        </a>`).join('')}
      ${frais ? `
        <a class="ligne" href="#/frais">
          <div><strong>Frais généraux</strong><small>hors chantier</small></div>
          <div class="montant ${classeMarge(frais.marge)}">${euros(frais.marge)}</div>
        </a>` : ''}
    </div>` : ''}
    `}`;
}
