// Écran d'accueil : le mois en cours, ce qu'il reste à facturer / encaisser, dernières interventions
import { db, q } from '../db.js';
import { esc, euros, dateFr, titre, classeMarge } from '../utils.js';
import { calculer, moyennes } from '../calculs.js';
import { ligneChantier, CHAMPS_LISTE } from './chantiers.js';

export async function afficher(main) {
  titre('BluePrestige');

  const maintenant = new Date();
  const a = maintenant.getFullYear(), m = maintenant.getMonth() + 1;
  const debutMois = `${a}-${String(m).padStart(2, '0')}-01`;
  const debutSuivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  const nomMois = maintenant.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const [chantiers, clients] = await Promise.all([
    q(db.from('chantiers').select(CHAMPS_LISTE)
      .order('date_debut', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })),
    q(db.from('clients').select('id').limit(1)),
  ]);

  // Interventions du mois (comme une page de l'ancien Excel)
  const duMois = chantiers.filter(c => (c.date_debut || '') >= debutMois && (c.date_debut || '') < debutSuivant);
  const mois = moyennes(duMois);

  // Travail fait mais pas encore facturé dans Odoo (les paiements et relances, c'est Odoo)
  const somme = (liste, k) => liste.reduce((s, c) => s + calculer(c)[k], 0);
  const aFacturer = chantiers.filter(c => c.statut === 'a_facturer');

  // Interventions regroupées par client (le client le plus récent en premier)
  const parClient = {};
  for (const c of chantiers) {
    if (!c.clients) continue;
    (parClient[c.client_id] ||= { client: { id: c.client_id, ...c.clients }, chantiers: [] }).chantiers.push(c);
  }
  const groupes = Object.values(parClient).map(g => ({
    ...g,
    moy: moyennes(g.chantiers),
    derniere: g.chantiers.map(c => c.date_debut || '').sort().pop(),
    aFacturer: g.chantiers.filter(c => c.statut === 'a_facturer').length,
  })).sort((a, b) => (b.derniere || '').localeCompare(a.derniere || ''));

  // Première utilisation : petit guide de démarrage
  const bienvenue = !clients.length ? `
    <div class="carte">
      <h2 style="margin-top:0">👋 Bienvenue !</h2>
      <ol class="etapes">
        <li><strong>Réglages › Mes tarifs</strong> : vérifie tes taux horaires et les consommables.</li>
        <li><strong>Crée un client</strong> avec son bateau et son mode de facturation (à l'heure, forfait, devis).</li>
        <li>Après chaque passage, ajoute une <strong>intervention</strong> : les heures, et l'appli calcule la facture,
          ton bénéfice et ton taux horaire net.</li>
      </ol>
      <a class="btn principal" href="#/client/nouveau">+ Créer mon premier client</a>
      <a class="btn lien" href="#/aide">📖 Voir le guide complet</a>
    </div>` : '';

  main.innerHTML = `
    ${bienvenue}
    <div class="resume">
      <div class="etiquette">Facturé · ${nomMois}</div>
      <div class="grand">${euros(mois.facture)}</div>
      <div class="details">
        <div><span>Bénéfice net</span><strong>${euros(mois.benefice)}</strong></div>
        <div><span>Frais réels</span><strong>${euros(mois.fraisReels)}</strong></div>
      </div>
      <a class="lien-bilan" href="#/bilan">📊 Voir le bilan de l'année ›</a>
    </div>

    <a class="btn principal grand-bouton" href="#/chantier/nouveau">+ Nouvelle intervention</a>

    ${aFacturer.length ? `<a class="alerte rouge" href="#/chantiers?statut=a_facturer">
      🔴 <span><strong>${aFacturer.length} à facturer dans Odoo</strong> · ${euros(somme(aFacturer, 'facture'))}</span> ›</a>` : ''}

    ${graphiqueMois(chantiers, maintenant)}

    <h2>Frais généraux</h2>
    <a class="btn depense" href="#/mouvement/nouveau?sens=depense">− Dépense</a>
    <div class="liste">
      <a class="ligne" href="#/frais">
        <span class="pastille">🧾</span>
        <div><strong>Frais généraux</strong><small>Dépenses hors intervention (assurance, outillage…)</small></div>
        <span class="fleche">›</span>
      </a>
    </div>

    <h2>Interventions par client</h2>
    ${groupes.map(g => `
      <details class="groupe-client">
        <summary>
          <div>
            <strong>${esc(g.client.nom)}</strong>
            <small>${g.chantiers.length} intervention(s) · dernière le ${dateFr(g.derniere)}
              ${g.aFacturer ? ` · 🔴 ${g.aFacturer}` : ''}</small>
          </div>
          <div class="montant-double">
            <span class="montant">${euros(g.moy.facture)}</span>
            <small class="${classeMarge(g.moy.benefice)}">net ${euros(g.moy.benefice)}</small>
          </div>
        </summary>
        <div class="liste">
          ${g.chantiers.slice(0, 5).map(c => ligneChantier(c, { sansClient: true })).join('')}
        </div>
        <a class="btn lien" href="#/client/${g.client.id}">Voir la fiche${g.chantiers.length > 5 ? ` et les ${g.chantiers.length} interventions` : ''} ›</a>
      </details>`).join('') || '<p class="vide">Aucune intervention pour l\'instant.</p>'}
`;
  brancherGraphique(main);
}

// ---------- Graphique : chiffre d'affaires (facturé) des 12 derniers mois ----------
function graphiqueMois(chantiers, maintenant) {
  const mois = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - 11 + i, 1);
    const prefixe = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { d, ...moyennes(chantiers.filter(c => (c.date_debut || '').startsWith(prefixe))) };
  });
  const max = Math.max(1, ...mois.map(m => m.facture));
  const nom = d => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const detail = m => `${nom(m.d)} · <strong>${euros(m.facture)}</strong> facturé · net ${euros(m.benefice)}`;
  return `
    <div class="carte graphique">
      <h3>📈 Chiffre d'affaires par mois</h3>
      <p class="graphique-detail" aria-live="polite">${detail(mois[11])}</p>
      <div class="graphique-barres" role="list">
        ${mois.map((m, i) => `
          <button type="button" class="g-col ${i === 11 ? 'choisi' : ''}" role="listitem"
            data-detail="${esc(detail(m))}" aria-label="${nom(m.d)} : ${euros(m.facture)} facturé">
            <span class="g-piste"><span class="g-barre" style="height:${(m.facture / max) * 100}%"></span></span>
            <span class="g-mois">${m.d.toLocaleDateString('fr-FR', { month: 'narrow' })}</span>
          </button>`).join('')}
      </div>
      <p class="aide g-aide">Touche une barre pour voir le mois.</p>
    </div>`;
}

function brancherGraphique(main) {
  const detail = main.querySelector('.graphique-detail');
  main.querySelectorAll('.g-col').forEach(b => b.onclick = () => {
    main.querySelector('.g-col.choisi')?.classList.remove('choisi');
    b.classList.add('choisi');
    detail.innerHTML = b.dataset.detail;
  });
}
