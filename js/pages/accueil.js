// Écran d'accueil : le mois en cours, ce qu'il reste à facturer / encaisser, dernières interventions
import { db, q } from '../db.js';
import { esc, euros, dateFr, titre, classeMarge } from '../utils.js';
import { calculer, moyennes } from '../calculs.js';
import { ligneChantier, CHAMPS_LISTE, blocAFacturer, brancherAFacturer } from './chantiers.js';

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

    ${aFacturer.length ? `
    <h2>À facturer dans Odoo · ${euros(somme(aFacturer, 'facture'))}</h2>
    ${blocAFacturer(chantiers)}` : ''}

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

    <h2>CA / client</h2>
    ${groupes.map(g => `
      <details class="groupe-client">
        <summary>
          <div>
            <strong>${esc(g.client.nom)}</strong>
            <small>${g.chantiers.length} intervention(s) · moyenne ${euros(g.moy.facture / g.chantiers.length)} / intervention · dernière le ${dateFr(g.derniere)}
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
  brancherAFacturer(main, () => afficher(main));
}

// ---------- Graphique : chiffre d'affaires (facturé) des 12 derniers mois, en courbe ----------
// La courbe est un SVG étiré ; les points, le repère et la bulle sont en HTML (positions en %)
function graphiqueMois(chantiers, maintenant) {
  const mois = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - 11 + i, 1);
    const prefixe = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { d, ...moyennes(chantiers.filter(c => (c.date_debut || '').startsWith(prefixe))) };
  });
  const max = Math.max(1, ...mois.map(m => m.facture)) * 1.1; // un peu de marge en haut
  const x = i => (i + 0.5) * (100 / 12);          // milieu de chaque mois, en %
  const y = v => 100 - (v / max) * 100;            // 0 en bas, en %
  const ligne = mois.map((m, i) => `${x(i)},${y(m.facture)}`).join(' ');
  const nom = d => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return `
    <div class="carte graphique">
      <h3>📈 Chiffre d'affaires par mois</h3>
      <p class="aide g-aide">Passe le doigt (ou la souris) sur la courbe pour voir le montant.</p>
      <div class="g-zone">
        <div class="g-grille" style="top:${y(max / 1.1 / 2)}%"><span>${euros(max / 1.1 / 2)}</span></div>
        <div class="g-grille" style="top:${y(max / 1.1)}%"><span>${euros(max / 1.1)}</span></div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon class="g-aire" points="${x(0)},100 ${ligne} ${x(11)},100"></polygon>
          <polyline class="g-ligne" points="${ligne}" vector-effect="non-scaling-stroke"></polyline>
        </svg>
        <div class="g-repere" hidden></div>
        ${mois.map((m, i) => `<span class="g-point ${i === 11 ? 'dernier' : ''}" style="left:${x(i)}%;top:${y(m.facture)}%"></span>`).join('')}
        <div class="g-bulle" hidden></div>
        <div class="g-cibles">
          ${mois.map((m, i) => `<button type="button" data-i="${i}" data-x="${x(i)}" data-y="${y(m.facture)}"
            data-titre="${esc(nom(m.d))}" data-facture="${esc(euros(m.facture))}" data-net="${esc(euros(m.benefice))}"
            aria-label="${esc(nom(m.d))} : ${esc(euros(m.facture))} facturé"></button>`).join('')}
        </div>
      </div>
      <div class="g-mois">${mois.map(m => `<span>${m.d.toLocaleDateString('fr-FR', { month: 'narrow' })}</span>`).join('')}</div>
    </div>`;
}

function brancherGraphique(main) {
  const zone = main.querySelector('.g-zone');
  if (!zone) return;
  const bulle = zone.querySelector('.g-bulle'), repere = zone.querySelector('.g-repere');
  const points = zone.querySelectorAll('.g-point');
  const montrer = b => {
    const x = Number(b.dataset.x);
    repere.hidden = false; repere.style.left = `${x}%`;
    bulle.hidden = false;
    bulle.innerHTML = `<small>${b.dataset.titre}</small><strong>${b.dataset.facture}</strong><small>net ${b.dataset.net}</small>`;
    // la bulle reste dans le cadre : à droite du point, ou à gauche pour les derniers mois
    bulle.style.left = x > 60 ? '' : `calc(${x}% + 10px)`;
    bulle.style.right = x > 60 ? `calc(${100 - x}% + 10px)` : '';
    points.forEach((p, i) => p.classList.toggle('actif', String(i) === b.dataset.i));
  };
  const cacher = () => { bulle.hidden = true; repere.hidden = true; points.forEach(p => p.classList.remove('actif')); };
  zone.querySelectorAll('.g-cibles button').forEach(b => {
    b.onpointerenter = () => montrer(b);
    b.onclick = () => montrer(b);
    b.onfocus = () => montrer(b);
  });
  zone.onpointerleave = e => { if (e.pointerType === 'mouse') cacher(); };
  // Glisser le doigt sur la courbe
  zone.addEventListener('touchmove', e => {
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (el?.dataset?.x) { e.preventDefault(); montrer(el); }
  }, { passive: false });
}
