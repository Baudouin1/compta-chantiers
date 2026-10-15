// Écrans Clients : liste, fiche, formulaire
import { db, q } from '../db.js';
import {
  esc, euros, titre, toast, aller, surEnvoi, tenter, lireMontant, classeMarge, menuChoix, ouvrirAppli,
  nombreFr, heuresFr, MODES_FACTURATION, CHAMPS_TARIFS,
} from '../utils.js';
import { tarifsGeneraux, tarifsClient, listeBateaux, calculer, moyennes } from '../calculs.js';
import { LIBELLES_TARIFS, lireNombre } from './reglages.js';
import { ligneChantier } from './chantiers.js';

export async function liste(main) {
  titre('Clients');
  const clients = await q(db.from('clients').select('id, nom, bateau, port').order('nom'));

  main.innerHTML = `
    <a class="btn principal" href="#/client/nouveau">+ Nouveau client</a>
    ${clients.length > 4 ? `<input type="search" id="recherche" placeholder="🔍 Rechercher un client, un bateau…">` : ''}
    <div class="liste" id="liste-clients">
      ${clients.map(c => `
        <a class="ligne" href="#/client/${c.id}" data-texte="${esc(`${c.nom} ${c.bateau || ''} ${c.port || ''}`.toLowerCase())}">
          <span class="pastille" style="font-size:17px;font-weight:700;color:var(--marine-2)">${esc(initiales(c.nom))}</span>
          <div>
            <strong>${esc(c.nom)}</strong>
            <small>${esc([c.bateau, c.port].filter(Boolean).join(' · '))}</small>
          </div>
          <span class="fleche">›</span>
        </a>`).join('') || '<p class="vide">Aucun client pour l\'instant.</p>'}
    </div>`;

  const recherche = main.querySelector('#recherche');
  if (recherche) recherche.oninput = () => {
    const t = recherche.value.toLowerCase();
    main.querySelectorAll('#liste-clients .ligne').forEach(l => {
      l.hidden = !l.dataset.texte.includes(t);
    });
  };
}

function initiales(nom) {
  return nom.split(/\s+/).filter(m => m && !/^(m\.?|mme\.?|mr\.?)$/i.test(m)).slice(0, 2).map(m => m[0].toUpperCase()).join('') || '?';
}

export async function fiche(main, { id }) {
  const [c, generaux] = await Promise.all([
    q(db.from('clients').select('*, chantiers(*, mouvements(sens, montant, refacturable))').eq('id', id).single()),
    tarifsGeneraux(),
  ]);
  titre(c.nom, '/clients', { texte: '✏️ Modifier', lien: `/client/${c.id}/modifier` });
  const tarifs = tarifsClient(c, generaux);
  const mode = c.mode_facturation || 'heure';

  const trajet = c.trajet_destination
    ? `${esc(c.trajet_destination)}${c.trajet_km != null ? ` — ${String(c.trajet_km).replace('.', ',')} km aller-retour` : ''}`
    : '';

  const infos = [
    ['Téléphone', c.telephone && `<a href="tel:${esc(c.telephone)}">${esc(c.telephone)}</a>`],
    ['Email', c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`],
    ['Adresse', esc(c.adresse)],
    [listeBateaux(c).length > 1 ? 'Bateaux' : 'Bateau', esc(c.bateau)],
    ['Port / emplacement', esc(c.port)],
    ['Trajet par défaut', trajet],
    ['Notes', esc(c.notes)],
  ].filter(([, v]) => v);

  // Boutons d'action en un toucher
  const tel = (c.telephone || '').replace(/[^\d+]/g, '');
  const lieu = c.adresse || c.port; // l'itinéraire va à l'adresse, sinon au port
  const actions = [
    tel && ['📞', 'Appeler', `tel:${tel}`],
    tel && ['💬', 'Message', `sms:${tel}`],
    c.email && ['✉️', 'Email', `mailto:${c.email}`],
    lieu && ['📍', 'Itinéraire', '#itineraire'],
    ['📅', 'Rendez-vous', `#/calendrier?client=${c.id}`],
  ].filter(Boolean);

  const chantiers = (c.chantiers || []).sort((a, b) =>
    (b.date_debut || b.created_at).localeCompare(a.date_debut || a.created_at));
  const moy = moyennes(chantiers);
  const aEncaisser = chantiers.reduce((s, ch) => s + (['facture', 'a_facturer'].includes(ch.statut) ? calculer(ch).resteAEncaisser : 0), 0);
  const pct = v => (v == null ? '–' : `${Math.round(v * 100)} %`);
  const ligneTarifs = mode === 'forfait'
    ? `Forfait : ${euros(tarifs.forfait_bateau)} par bateau`
    : mode === 'devis' ? 'Sur devis'
    : `${euros(tarifs.taux_nettoyage)}/h nettoyage · ${euros(tarifs.taux_entretien)}/h entretien · conso ${nombreFr(tarifs.conso_pct)} % (min ${euros(tarifs.conso_min)})`;

  main.innerHTML = `
    <div class="actions" style="grid-template-columns:repeat(${Math.min(actions.length, 3)},1fr);margin:0 0 12px">
      ${actions.map(([icone, nom, lien]) => `<a class="btn" href="${esc(lien)}"><span>${icone}</span>${nom}</a>`).join('')}
    </div>

    <div class="carte">
      ${infos.map(([k, v]) => `<div class="info"><span>${k}</span><div>${v}</div></div>`).join('')
        || '<p class="vide">Pas d\'informations.</p>'}
    </div>

    <div class="carte tarifs-client">
      <span>${esc(MODES_FACTURATION[mode])}</span>
      <strong>${ligneTarifs}</strong>
    </div>

    ${moy.nombre ? `
    <div class="resume">
      <div class="etiquette">Facturé · ${moy.nombre} intervention(s)</div>
      <div class="grand">${euros(moy.facture)}</div>
      <div class="details">
        <div><span>Bénéfice net</span><strong>${euros(moy.benefice)}</strong></div>
        <div><span>Frais réels</span><strong>${euros(moy.fraisReels)}</strong></div>
        <div><span>Taux horaire net</span><strong>${moy.tauxHoraireNet != null ? euros(moy.tauxHoraireNet) + '/h' : '–'}</strong></div>
        <div><span>Heures</span><strong>${heuresFr(moy.heures)}</strong></div>
      </div>
    </div>
    <div class="carte">
      <div class="info"><span>Bénéfice net moyen par intervention</span><div><strong>${euros(moy.beneficeMoyen)}</strong></div></div>
      <div class="info"><span>Marge nette</span><div><strong>${pct(moy.margePct)}</strong></div></div>
      ${mode === 'forfait' ? `<div class="info"><span>Passages faits / non faits</span><div><strong class="pos">${moy.passagesOui} OUI</strong> · <strong class="neg">${moy.passagesNon} NON</strong></div></div>`
        : `<div class="info"><span>Gain / perte sur les consommables</span><div><strong class="${classeMarge(moy.gainConso)}">${euros(moy.gainConso)}</strong></div></div>`}
      ${aEncaisser ? `<div class="info"><span>Reste à encaisser</span><div><strong class="neg">${euros(aEncaisser)}</strong></div></div>` : ''}
    </div>` : ''}

    <h2>Interventions</h2>
    <a class="btn principal" href="#/chantier/nouveau?client=${c.id}">+ Nouvelle intervention</a>
    <div class="liste" id="liste-interventions">
      ${chantiers.slice(0, 10).map(ch => ligneChantier(ch, { sansClient: true })).join('') || '<p class="vide">Aucune intervention.</p>'}
    </div>
    ${chantiers.length > 10 ? `<button class="btn" id="voir-tout">Voir les ${chantiers.length} interventions</button>` : ''}`;

  const voirTout = main.querySelector('#voir-tout');
  if (voirTout) voirTout.onclick = () => {
    main.querySelector('#liste-interventions').innerHTML = chantiers.map(ch => ligneChantier(ch, { sansClient: true })).join('');
    voirTout.remove();
  };

  const iti = main.querySelector('[href="#itineraire"]');
  if (iti) iti.onclick = e => {
    e.preventDefault();
    const a = encodeURIComponent(lieu);
    menuChoix(`Itinéraire vers ${lieu}`, [
      { texte: '🚙 Waze', action: () => ouvrirAppli(`waze://?q=${a}&navigate=yes`, `https://waze.com/ul?q=${a}&navigate=yes`) },
      { texte: '🗺️ Google Maps', action: () => ouvrirAppli(`comgooglemaps://?daddr=${a}&directionsmode=driving`, `https://www.google.com/maps/dir/?api=1&destination=${a}`) },
      { texte: '🍎 Plans (Apple)', action: () => { location.href = `maps://?daddr=${a}`; } },
    ]);
  };
}

export async function formulaire(main, { id }) {
  const [c, generaux] = await Promise.all([
    id ? q(db.from('clients').select('*').eq('id', id).single()) : { mode_facturation: 'heure' },
    tarifsGeneraux(),
  ]);
  const tarifs = tarifsClient(c, generaux);
  titre(id ? 'Modifier le client' : 'Nouveau client', id ? `/client/${id}` : '/clients');

  const champ = (nom, label, type = 'text', extra = '') => `
    <label>${label}
      <input name="${nom}" type="${type}" value="${esc(c[nom] ?? '')}" ${extra}>
    </label>`;

  main.innerHTML = `
    <form class="carte" id="form-client">
      ${champ('nom', 'Nom *', 'text', 'required')}
      ${champ('telephone', 'Téléphone', 'tel')}
      ${champ('email', 'Email', 'email')}
      ${champ('adresse', 'Adresse')}
      ${champ('bateau', 'Bateau(x) — sépare par une virgule s\'il y en a plusieurs')}
      ${champ('port', 'Port / emplacement')}
      <label>Notes
        <textarea name="notes" rows="3">${esc(c.notes ?? '')}</textarea>
      </label>

      <h3>Facturation</h3>
      <label>Mode de facturation
        <select name="mode_facturation" id="mode-facturation">
          ${Object.entries(MODES_FACTURATION).map(([k, v]) =>
            `<option value="${k}" ${k === (c.mode_facturation || 'heure') ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label id="champ-forfait">Forfait par bateau et par passage (€)
        <input name="forfait_bateau" inputmode="decimal" value="${nombreFr(c.forfait_bateau)}" placeholder="ex. 107">
      </label>
      <details class="tarifs-detail" ${CHAMPS_TARIFS.some(k => c[k] != null) ? 'open' : ''}>
        <summary>Tarifs de ce client ${CHAMPS_TARIFS.some(k => c[k] != null) ? '(personnalisés)' : '(tarifs généraux)'}</summary>
        <p class="aide">Préremplis avec tes tarifs généraux. Change-les seulement si ce client a un prix différent.</p>
        ${LIBELLES_TARIFS.map(([k, label, unite]) => `
          <label>${label} (${unite})
            <input name="${k}" inputmode="decimal" value="${nombreFr(tarifs[k])}">
            <small class="aide">Tarif général : ${nombreFr(generaux[k])} ${unite}</small>
          </label>`).join('')}
      </details>

      <h3>Trajet par défaut</h3>
      <p class="aide">Utilisé par le bouton « Aller-retour ». Le coût au km se règle dans Réglages.</p>
      ${champ('trajet_destination', 'Destination (ex. Port de Lorient)')}
      ${champ('trajet_km', 'Distance aller-retour (km)', 'text', 'inputmode="decimal"')}

      <button class="btn principal" type="submit">Enregistrer</button>
    </form>
    ${id ? '<button class="btn danger" id="supprimer">Supprimer ce client</button>' : ''}`;

  const selMode = main.querySelector('#mode-facturation');
  const majMode = () => { main.querySelector('#champ-forfait').hidden = selMode.value !== 'forfait'; };
  selMode.onchange = majMode;
  majMode();

  surEnvoi(main.querySelector('#form-client'), async data => {
    if (!data.nom) throw new Error('Le nom est obligatoire.');
    if (data.telephone && !/^\+?[\d\s.\-()]{6,20}$/.test(data.telephone)) {
      throw new Error('Numéro de téléphone invalide.');
    }
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) throw new Error('Adresse email invalide.');
    if (data.trajet_km) {
      data.trajet_km = lireMontant(data.trajet_km);
      if (!data.trajet_km || data.trajet_km > 5000) throw new Error('Distance invalide (en km, ex. 42 ou 42,5).');
    }
    if (data.trajet_km && !data.trajet_destination) data.trajet_destination = data.port || 'Aller-retour';

    // Forfait
    data.forfait_bateau = data.forfait_bateau ? lireNombre(data.forfait_bateau) : null;
    if (data.mode_facturation === 'forfait' && !data.forfait_bateau) throw new Error('Indique le montant du forfait par bateau.');
    // Tarifs : on ne garde que ceux qui diffèrent des tarifs généraux
    for (const k of CHAMPS_TARIFS) {
      if (!data[k]) { data[k] = null; continue; }
      const v = lireNombre(data[k]);
      if (v == null) throw new Error('Un des tarifs n\'est pas un nombre valide (ex. 37 ou 17,16).');
      data[k] = v === Number(generaux[k]) ? null : v;
    }

    const res = id
      ? await q(db.from('clients').update(data).eq('id', id).select().single())
      : await q(db.from('clients').insert(data).select().single());
    toast('Client enregistré');
    aller(`/client/${res.id}`);
  });

  const suppr = main.querySelector('#supprimer');
  if (suppr) suppr.onclick = () => tenter(async () => {
    if (!confirm('Supprimer ce client ?')) return;
    const { count } = await db.from('chantiers').select('id', { count: 'exact', head: true }).eq('client_id', id);
    if (count) throw new Error(`Impossible : ce client a encore ${count} intervention(s). Supprime-les d'abord.`);
    await q(db.from('clients').delete().eq('id', id));
    toast('Client supprimé');
    aller('/clients');
  });
}
