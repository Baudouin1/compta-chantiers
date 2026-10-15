// Écrans Clients : liste, fiche, formulaire
import { db, q } from '../db.js';
import { esc, titre, toast, aller, surEnvoi, tenter, lireMontant, STATUTS } from '../utils.js';

export async function liste(main) {
  titre('Clients');
  const clients = await q(db.from('clients').select('id, nom, bateau, port').order('nom'));

  main.innerHTML = `
    <a class="btn principal" href="#/client/nouveau">+ Nouveau client</a>
    ${clients.length > 4 ? `<input type="search" id="recherche" placeholder="Rechercher…">` : ''}
    <div class="liste" id="liste-clients">
      ${clients.map(c => `
        <a class="ligne" href="#/client/${c.id}" data-texte="${esc(`${c.nom} ${c.bateau || ''} ${c.port || ''}`.toLowerCase())}">
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

export async function fiche(main, { id }) {
  const c = await q(db.from('clients').select('*, chantiers(id, nom, statut)').eq('id', id).single());
  titre(c.nom, '/clients');

  const trajet = c.trajet_destination
    ? `${esc(c.trajet_destination)}${c.trajet_km != null ? ` — ${String(c.trajet_km).replace('.', ',')} km aller-retour` : ''}`
    : '';

  const infos = [
    ['Téléphone', c.telephone && `<a href="tel:${esc(c.telephone)}">${esc(c.telephone)}</a>`],
    ['Email', c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`],
    ['Adresse', esc(c.adresse)],
    ['Bateau', esc(c.bateau)],
    ['Port / emplacement', esc(c.port)],
    ['Trajet par défaut', trajet],
    ['Notes', esc(c.notes)],
  ].filter(([, v]) => v);

  main.innerHTML = `
    <div class="carte">
      ${infos.map(([k, v]) => `<div class="info"><span>${k}</span><div>${v}</div></div>`).join('')
        || '<p class="vide">Pas d\'informations.</p>'}
    </div>
    <a class="btn" href="#/client/${c.id}/modifier">Modifier la fiche</a>

    <h2>Chantiers</h2>
    <a class="btn principal" href="#/chantier/nouveau?client=${c.id}">+ Nouveau chantier</a>
    <div class="liste">
      ${c.chantiers.map(ch => `
        <a class="ligne" href="#/chantier/${ch.id}">
          <strong>${esc(ch.nom)}</strong>
          <span class="statut ${ch.statut}">${STATUTS[ch.statut]}</span>
        </a>`).join('') || '<p class="vide">Aucun chantier.</p>'}
    </div>`;
}

export async function formulaire(main, { id }) {
  const c = id ? await q(db.from('clients').select('*').eq('id', id).single()) : {};
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
      ${champ('bateau', 'Nom du bateau')}
      ${champ('port', 'Port / emplacement')}
      <label>Notes
        <textarea name="notes" rows="3">${esc(c.notes ?? '')}</textarea>
      </label>

      <h3>Trajet par défaut</h3>
      <p class="aide">Utilisé par le bouton « Aller-retour ». Le coût au km se règle dans Réglages.</p>
      ${champ('trajet_destination', 'Destination (ex. Port de Lorient)')}
      ${champ('trajet_km', 'Distance aller-retour (km)', 'text', 'inputmode="decimal"')}

      <button class="btn principal" type="submit">Enregistrer</button>
    </form>
    ${id ? '<button class="btn danger" id="supprimer">Supprimer ce client</button>' : ''}`;

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
    if (count) throw new Error(`Impossible : ce client a encore ${count} chantier(s). Supprime-les d'abord.`);
    await q(db.from('clients').delete().eq('id', id));
    toast('Client supprimé');
    aller('/clients');
  });
}
