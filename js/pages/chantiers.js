// Écrans Chantiers : liste, page du chantier, formulaire
import { db, q } from '../db.js';
import {
  esc, euros, dateFr, titre, toast, aller, surEnvoi, totaux, classeMarge, nomCategorie, STATUTS,
} from '../utils.js';

let filtreStatut = 'en_cours';

export async function liste(main) {
  titre('Chantiers');
  const chantiers = await q(db.from('chantiers')
    .select('id, nom, statut, date_debut, clients(nom, bateau), mouvements(sens, montant)')
    .order('created_at', { ascending: false }));

  function dessiner() {
    const visibles = chantiers.filter(c => filtreStatut === 'tous' || c.statut === filtreStatut);
    main.innerHTML = `
      <a class="btn principal" href="#/chantier/nouveau">+ Nouveau chantier</a>
      <div class="filtres">
        ${Object.entries({ en_cours: 'En cours', devis: 'Devis', termine: 'Terminés', paye: 'Payés', tous: 'Tous' })
          .map(([k, v]) => `<button data-statut="${k}" class="${k === filtreStatut ? 'actif' : ''}">${v}</button>`).join('')}
      </div>
      <div class="liste">
        ${visibles.map(ligneChantier).join('') || '<p class="vide">Aucun chantier ici.</p>'}
      </div>`;
    main.querySelectorAll('.filtres button').forEach(b => b.onclick = () => {
      filtreStatut = b.dataset.statut;
      dessiner();
    });
  }
  dessiner();
}

// Une ligne de chantier dans une liste (utilisée aussi par l'accueil)
export function ligneChantier(c) {
  const t = totaux(c.mouvements);
  return `
    <a class="ligne" href="#/chantier/${c.id}">
      <div>
        <strong>${esc(c.nom)}</strong>
        <small>${esc([c.clients?.nom, c.clients?.bateau].filter(Boolean).join(' · '))}</small>
        <span class="statut ${c.statut}">${STATUTS[c.statut]}</span>
      </div>
      <div class="montant ${classeMarge(t.marge)}">${euros(t.marge)}</div>
    </a>`;
}

export async function fiche(main, { id }) {
  const c = await q(db.from('chantiers').select('*, clients(*), mouvements(*)').eq('id', id).single());
  titre(c.nom, '/chantiers');
  const t = totaux(c.mouvements);
  const mvts = c.mouvements.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

  main.innerHTML = `
    <div class="carte">
      <a class="client-lien" href="#/client/${c.clients.id}">
        ${esc(c.clients.nom)}${c.clients.bateau ? ` · ${esc(c.clients.bateau)}` : ''} ›
      </a>
      <select id="statut" class="statut-select ${c.statut}">
        ${Object.entries(STATUTS).map(([k, v]) => `<option value="${k}" ${k === c.statut ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      ${c.description ? `<p class="description">${esc(c.description)}</p>` : ''}
      ${c.date_debut || c.date_fin ? `<small>${c.date_debut ? 'Du ' + dateFr(c.date_debut) : ''} ${c.date_fin ? 'au ' + dateFr(c.date_fin) : ''}</small>` : ''}
    </div>

    <div class="totaux">
      <div><span>Dépenses</span><strong class="neg">${euros(t.depenses)}</strong></div>
      <div><span>Gains</span><strong class="pos">${euros(t.gains)}</strong></div>
      <div><span>Marge</span><strong class="${classeMarge(t.marge)}">${euros(t.marge)}</strong></div>
    </div>
    ${t.refacturable ? `<p class="a-refacturer">À refacturer au client : <strong>${euros(t.refacturable)}</strong></p>` : ''}

    <div class="deux-boutons">
      <a class="btn depense" href="#/mouvement/nouveau?chantier=${c.id}&sens=depense">− Dépense</a>
      <a class="btn gain" href="#/mouvement/nouveau?chantier=${c.id}&sens=gain">+ Gain</a>
    </div>

    <h2>Mouvements</h2>
    <div class="liste">
      ${mvts.map(ligneMouvement).join('') || '<p class="vide">Aucun mouvement pour l\'instant.</p>'}
    </div>

    <a class="btn" href="#/chantier/${c.id}/modifier">Modifier le chantier</a>`;

  main.querySelector('#statut').onchange = async e => {
    await q(db.from('chantiers').update({ statut: e.target.value }).eq('id', id));
    e.target.className = 'statut-select ' + e.target.value;
    toast('Statut mis à jour');
  };
}

// Une ligne de mouvement (dépense ou gain)
export function ligneMouvement(m) {
  const signe = m.sens === 'gain' ? '+' : '−';
  return `
    <a class="ligne" href="#/mouvement/${m.id}">
      <div>
        <strong>${esc(m.description || nomCategorie(m.sens, m.categorie))}</strong>
        <small>${dateFr(m.date)} · ${esc(nomCategorie(m.sens, m.categorie))}${m.sous_traitant ? ' · ' + esc(m.sous_traitant) : ''}</small>
        ${m.refacturable ? '<span class="badge">À refacturer</span>' : ''}
      </div>
      <div class="montant ${m.sens === 'gain' ? 'pos' : 'neg'}">${signe} ${euros(m.montant)}</div>
    </a>`;
}

export async function formulaire(main, { id, query }) {
  const [c, clients] = await Promise.all([
    id ? q(db.from('chantiers').select('*').eq('id', id).single()) : { client_id: query.client, statut: 'en_cours' },
    q(db.from('clients').select('id, nom, bateau').order('nom')),
  ]);
  titre(id ? 'Modifier le chantier' : 'Nouveau chantier', id ? `/chantier/${id}` : '/chantiers');

  if (!clients.length) {
    main.innerHTML = `
      <div class="carte">Il faut d'abord créer un client.</div>
      <a class="btn principal" href="#/client/nouveau">+ Nouveau client</a>`;
    return;
  }

  main.innerHTML = `
    <form class="carte" id="form-chantier">
      <label>Client *
        <select name="client_id" required>
          <option value="">— Choisir —</option>
          ${clients.map(cl => `<option value="${cl.id}" ${cl.id === c.client_id ? 'selected' : ''}>
            ${esc(cl.nom)}${cl.bateau ? ' · ' + esc(cl.bateau) : ''}</option>`).join('')}
        </select>
      </label>
      <label>Nom du chantier *
        <input name="nom" required value="${esc(c.nom ?? '')}" placeholder="ex. Chantier 1">
      </label>
      <label>Travaux à faire
        <textarea name="description" rows="4">${esc(c.description ?? '')}</textarea>
      </label>
      <div class="cote-a-cote">
        <label>Début <input name="date_debut" type="date" value="${c.date_debut ?? ''}"></label>
        <label>Fin <input name="date_fin" type="date" value="${c.date_fin ?? ''}"></label>
      </div>
      <label>Statut
        <select name="statut">
          ${Object.entries(STATUTS).map(([k, v]) => `<option value="${k}" ${k === c.statut ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <button class="btn principal" type="submit">Enregistrer</button>
    </form>
    ${id ? '<button class="btn danger" id="supprimer">Supprimer ce chantier</button>' : ''}`;

  surEnvoi(main.querySelector('#form-chantier'), async data => {
    const res = id
      ? await q(db.from('chantiers').update(data).eq('id', id).select().single())
      : await q(db.from('chantiers').insert(data).select().single());
    toast('Chantier enregistré');
    aller(`/chantier/${res.id}`);
  });

  const suppr = main.querySelector('#supprimer');
  if (suppr) suppr.onclick = async () => {
    if (!confirm('Supprimer ce chantier ET tous ses mouvements ?')) return;
    await q(db.from('chantiers').delete().eq('id', id));
    toast('Chantier supprimé');
    aller('/chantiers');
  };
}
