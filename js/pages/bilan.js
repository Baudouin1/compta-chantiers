// Bilan de l'année : rentabilité des interventions, clients, déclaration URSSAF, dépenses
import { db, q } from '../db.js';
import { esc, euros, titre, totaux, classeMarge, nomCategorie, iconeCategorie, heuresFr } from '../utils.js';
import { moyennes } from '../calculs.js';

export async function afficher(main, { query }) {
  const annee = Number(query.annee) || new Date().getFullYear();
  titre(`Bilan ${annee}`, '/');
  const debut = `${annee}-01-01`, fin = `${annee}-12-31`;

  const [mvts, chantiers] = await Promise.all([
    // Mouvements de l'année (argent réellement encaissé / dépensé)
    q(db.from('mouvements').select('date, sens, categorie, montant').gte('date', debut).lte('date', fin)),
    // Interventions de l'année (facturé, heures, bénéfice)
    q(db.from('chantiers').select('*, clients(id, nom), mouvements(sens, montant, refacturable)')
      .gte('date_debut', debut).lte('date_debut', fin)),
  ]);
  const caisse = totaux(mvts);
  const an = moyennes(chantiers);
  const pct = v => (v == null ? '–' : `${Math.round(v * 100)} %`);
  const anneeCourante = new Date().getFullYear();

  // Mois par mois (interventions)
  const mois = Array.from({ length: 12 }, (_, i) => {
    const prefixe = `${annee}-${String(i + 1).padStart(2, '0')}`;
    return {
      nom: new Date(annee, i, 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      ...moyennes(chantiers.filter(c => (c.date_debut || '').startsWith(prefixe))),
      encaisse: totaux(mvts.filter(m => m.date.startsWith(prefixe))).gains,
    };
  });
  const maxMois = Math.max(1, ...mois.map(m => Math.max(m.facture, m.fraisReels)));
  const moisAffiches = mois.filter((m, i) => m.nombre || m.encaisse || annee < anneeCourante || i <= new Date().getMonth());

  // Classement des clients
  const parClient = {};
  for (const c of chantiers) (parClient[c.client_id] ||= { client: c.clients, chantiers: [] }).chantiers.push(c);
  const clients = Object.values(parClient)
    .map(x => ({ client: x.client, ...moyennes(x.chantiers) }))
    .sort((a, b) => b.benefice - a.benefice);

  // Dépenses par catégorie
  const parCategorie = {};
  for (const m of mvts) if (m.sens === 'depense') parCategorie[m.categorie] = (parCategorie[m.categorie] || 0) + Number(m.montant);
  const categories = Object.entries(parCategorie).sort((a, b) => b[1] - a[1]);

  main.innerHTML = `
    <div class="filtres" style="justify-content:center">
      <a class="btn" style="width:auto;margin:0" href="#/bilan?annee=${annee - 1}">‹ ${annee - 1}</a>
      ${annee < anneeCourante ? `<a class="btn" style="width:auto;margin:0" href="#/bilan?annee=${annee + 1}">${annee + 1} ›</a>` : ''}
    </div>

    <div class="resume">
      <div class="etiquette">Bénéfice net ${annee} · ${an.nombre} intervention(s)</div>
      <div class="grand">${euros(an.benefice)}</div>
      <div class="details">
        <div><span>Facturé</span><strong>${euros(an.facture)}</strong></div>
        <div><span>Frais réels</span><strong>${euros(an.fraisReels)}</strong></div>
        <div><span>Heures</span><strong>${heuresFr(an.heures)}</strong></div>
        <div><span>Taux horaire net</span><strong>${an.tauxHoraireNet != null ? euros(an.tauxHoraireNet) + '/h' : '–'}</strong></div>
      </div>
    </div>
    <div class="carte">
      <div class="info"><span>Bénéfice net moyen par intervention</span><div><strong>${euros(an.beneficeMoyen)}</strong></div></div>
      <div class="info"><span>Marge nette</span><div><strong>${pct(an.margePct)}</strong></div></div>
      <div class="info"><span>Gain / perte sur les consommables</span><div><strong class="${classeMarge(an.gainConso)}">${euros(an.gainConso)}</strong></div></div>
    </div>

    ${!mvts.length && !chantiers.length ? '<p class="vide">Rien en ' + annee + '.</p>' : `
    <h2>Chiffre d'affaires à déclarer (URSSAF)</h2>
    <div class="carte">
      <p class="aide" style="margin-top:0">Micro-entreprise : on déclare le total des sommes
        <strong>encaissées</strong> (paiements reçus), sans retirer les dépenses.</p>
      ${[0, 1, 2, 3].map(tr => {
        const m3 = mois.slice(tr * 3, tr * 3 + 3);
        const total = m3.reduce((s, m) => s + m.encaisse, 0);
        return `
        <div class="info">
          <span>${tr + 1}${tr ? 'e' : 'er'} trimestre · ${m3.map(m => `${m.nom} ${euros(m.encaisse)}`).join(' · ')}</span>
          <div><strong>${euros(total)}</strong></div>
        </div>`;
      }).join('')}
      <div class="info"><span>Total encaissé ${annee}</span><div><strong class="pos">${euros(caisse.gains)}</strong></div></div>
    </div>

    <h2>Mois par mois</h2>
    <div class="carte">
      <div class="legende"><span><i style="background:var(--vert)"></i>Facturé</span><span><i style="background:var(--rouge)"></i>Frais réels</span><span>→ bénéfice</span></div>
      <div class="barres">
        ${moisAffiches.map(m => `
          <div class="barre-mois">
            <span class="nom">${m.nom}</span>
            <div class="pistes">
              <div class="piste g" style="width:${(m.facture / maxMois) * 100}%"></div>
              <div class="piste d" style="width:${(m.fraisReels / maxMois) * 100}%"></div>
            </div>
            <span class="montant ${classeMarge(m.benefice)}">${m.nombre ? euros(m.benefice) : '–'}</span>
          </div>`).join('')}
      </div>
    </div>

    ${clients.length ? `
    <h2>Clients les plus rentables</h2>
    <div class="liste">
      ${clients.map(x => `
        <a class="ligne" href="#/client/${x.client.id}">
          <div>
            <strong>${esc(x.client.nom)}</strong>
            <small>${x.nombre} intervention(s) · ${heuresFr(x.heures)}${x.tauxHoraireNet != null ? ' · ' + euros(x.tauxHoraireNet) + '/h net' : ''}</small>
          </div>
          <div class="montant-double">
            <span class="montant ${classeMarge(x.benefice)}">${euros(x.benefice)}</span>
            <small>facturé ${euros(x.facture)}</small>
          </div>
        </a>`).join('')}
    </div>` : ''}

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
    `}`;
}
