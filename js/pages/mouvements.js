// Formulaire d'ajout / modification d'un mouvement (dépense ou gain)
import { db, q } from '../db.js';
import { esc, titre, toast, aller, surEnvoi, tenter, dateValide, lireMontant, aujourdhui, CATEGORIES } from '../utils.js';

export async function formulaire(main, { id, query }) {
  const [m, chantiers] = await Promise.all([
    id ? q(db.from('mouvements').select('*').eq('id', id).single())
       : { // nouveau mouvement : valeurs reçues dans l'adresse (ex. depuis un bouton rapide)
           sens: query.sens === 'gain' ? 'gain' : 'depense',
           chantier_id: query.chantier || null,
           date: aujourdhui(),
           categorie: query.categorie,
           montant: query.montant ? Number(query.montant) : null,
           description: query.description,
         },
    q(db.from('chantiers').select('id, nom, statut, clients(nom)').order('created_at', { ascending: false })),
  ]);
  const retour = m.chantier_id ? `/chantier/${m.chantier_id}` : '/frais';
  titre(id ? 'Modifier le mouvement' : 'Nouveau mouvement', retour);

  main.innerHTML = `
    <form class="carte" id="form-mvt">
      <div class="segments">
        <label class="depense"><input type="radio" name="sens" value="depense" ${m.sens === 'depense' ? 'checked' : ''}><span>− Dépense</span></label>
        <label class="gain"><input type="radio" name="sens" value="gain" ${m.sens === 'gain' ? 'checked' : ''}><span>+ Gain</span></label>
      </div>

      <label>Montant (€) *
        <input name="montant" inputmode="decimal" required class="gros-montant"
          value="${m.montant != null ? Number(m.montant).toFixed(2).replace('.', ',') : ''}" placeholder="0,00">
      </label>

      <label>Catégorie *
        <select name="categorie" required></select>
      </label>

      <label id="champ-sous-traitant">Nom du sous-traitant
        <input name="sous_traitant" placeholder="ex. Voilerie Martin" value="${esc(m.sous_traitant ?? '')}">
      </label>

      <label>Description
        <input name="description" value="${esc(m.description ?? '')}" placeholder="ex. Antifouling 2,5 L">
      </label>

      <label>Date
        <input name="date" type="date" required value="${m.date}">
      </label>

      <label>Chantier
        <select name="chantier_id">
          <option value="">— Aucun (frais généraux) —</option>
          ${chantiers.map(c => `<option value="${c.id}" ${c.id === m.chantier_id ? 'selected' : ''}>
            ${esc(c.nom)} · ${esc(c.clients?.nom ?? '')}</option>`).join('')}
        </select>
      </label>

      <label class="case" id="champ-refacturable">
        <input type="checkbox" name="refacturable" ${m.refacturable ? 'checked' : ''}>
        Refacturable au client
      </label>

      <label>Note
        <textarea name="note" rows="2">${esc(m.note ?? '')}</textarea>
      </label>

      <button class="btn principal" type="submit">Enregistrer</button>
    </form>
    ${id ? '<button class="btn danger" id="supprimer">Supprimer ce mouvement</button>' : ''}`;

  const form = main.querySelector('#form-mvt');

  // Met à jour les catégories et les champs visibles selon dépense / gain
  function majChamps() {
    const sens = form.sens.value;
    const select = form.categorie;
    const actuelle = select.value || m.categorie;
    select.innerHTML = Object.entries(CATEGORIES[sens])
      .map(([k, v]) => `<option value="${k}" ${k === actuelle ? 'selected' : ''}>${v}</option>`).join('');
    main.querySelector('#champ-refacturable').hidden = sens !== 'depense';
    main.querySelector('#champ-sous-traitant').hidden = select.value !== 'sous_traitance';
    form.classList.toggle('mode-gain', sens === 'gain');
  }
  form.querySelectorAll('[name=sens]').forEach(r => r.onchange = majChamps);
  form.categorie.onchange = majChamps;
  majChamps();
  if (!id) form.montant.focus();

  surEnvoi(form, async data => {
    data.montant = lireMontant(data.montant);
    if (!data.montant) throw new Error('Montant invalide (ex. 45 ou 45,90).');
    if (data.montant > 1000000) throw new Error('Montant trop élevé, vérifie la saisie.');
    if (!dateValide(data.date)) throw new Error('Date invalide.');
    if (data.categorie === 'sous_traitance' && !data.sous_traitant) {
      throw new Error('Indique le nom du sous-traitant.');
    }
    if (data.sens === 'gain') data.refacturable = false;
    if (data.categorie !== 'sous_traitance') data.sous_traitant = null;

    if (id) await q(db.from('mouvements').update(data).eq('id', id));
    else await q(db.from('mouvements').insert(data));
    toast('Enregistré');
    aller(data.chantier_id ? `/chantier/${data.chantier_id}` : '/frais');
  });

  const suppr = main.querySelector('#supprimer');
  if (suppr) suppr.onclick = () => tenter(async () => {
    if (!confirm('Supprimer ce mouvement ?')) return;
    await q(db.from('mouvements').delete().eq('id', id));
    toast('Supprimé');
    aller(retour);
  });
}
