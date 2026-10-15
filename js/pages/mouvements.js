// Formulaire d'ajout / modification d'un mouvement (dépense ou gain)
import { db, q } from '../db.js';
import { esc, titre, toast, aller, surEnvoi, tenter, dateValide, lireMontant, aujourdhui, iconeCategorie, CATEGORIES, MODES_PAIEMENT } from '../utils.js';
import * as justif from '../justificatifs.js';

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

      <label id="champ-paiement">Mode de paiement *
        <select name="mode_paiement">
          <option value="">— Choisir —</option>
          ${Object.entries(MODES_PAIEMENT).map(([k, v]) =>
            `<option value="${k}" ${k === m.mode_paiement ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
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

      <label>Intervention
        <select name="chantier_id">
          <option value="">— Aucun (frais généraux) —</option>
          ${chantiers.map(c => `<option value="${c.id}" ${c.id === m.chantier_id ? 'selected' : ''}>
            ${esc(c.nom)} · ${esc(c.clients?.nom ?? '')}</option>`).join('')}
        </select>
      </label>

      <label class="case" id="champ-refacturable">
        <input type="checkbox" name="refacturable" ${m.refacturable ? 'checked' : ''}>
        Refacturé au client (produit revendu, ajouté à la facture avec ta marge)
      </label>

      <label>Note
        <textarea name="note" rows="2">${esc(m.note ?? '')}</textarea>
      </label>

      <div class="justif">
        <span class="titre-champ">📎 Facture ou ticket</span>
        <div id="justif-etat"></div>
      </div>

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
      .map(([k, v]) => `<option value="${k}" ${k === actuelle ? 'selected' : ''}>${iconeCategorie(sens, k)} ${v}</option>`).join('');
    main.querySelector('#champ-refacturable').hidden = sens !== 'depense';
    main.querySelector('#champ-paiement').hidden = sens !== 'gain';
    main.querySelector('#champ-sous-traitant').hidden = select.value !== 'sous_traitance';
    form.classList.toggle('mode-gain', sens === 'gain');
  }
  form.querySelectorAll('[name=sens]').forEach(r => r.onchange = majChamps);
  form.categorie.onchange = majChamps;
  majChamps();
  if (!id) form.montant.focus();

  // ---------- Justificatif (photo ou PDF) ----------
  let nouveauFichier = null;   // fichier choisi, prêt à être envoyé
  let retirer = false;         // l'utilisateur veut enlever le justificatif actuel
  const zoneJustif = main.querySelector('#justif-etat');

  function dessinerJustif() {
    const actuel = !retirer && m.photo_path;
    let html = '';
    if (nouveauFichier) {
      html = `<div class="justif-pret">
          ${nouveauFichier.type === 'application/pdf' ? '<span class="vignette">📄</span>' : `<img class="vignette" src="${nouveauFichier.apercu}" alt="">`}
          <div><strong>Prêt à être enregistré</strong><small>${(nouveauFichier.blob.size / 1024).toFixed(0)} Ko</small></div>
          <button type="button" class="btn lien" id="annuler-justif">Annuler</button>
        </div>`;
    } else if (actuel) {
      html = `<div class="justif-pret">
          <span class="vignette">${justif.estPdf(actuel) ? '📄' : '🖼️'}</span>
          <button type="button" class="btn lien" id="voir-justif">Voir le justificatif</button>
          <button type="button" class="btn lien danger" id="retirer-justif">Retirer</button>
        </div>`;
    }
    html += `<label class="btn">
        ${actuel || nouveauFichier ? '🔄 Remplacer' : '📷 Ajouter une photo ou un PDF'}
        <input type="file" accept="image/*,application/pdf" hidden id="choix-justif">
      </label>`;
    zoneJustif.innerHTML = html;

    zoneJustif.querySelector('#choix-justif').onchange = e => tenter(async () => {
      const fichier = e.target.files[0];
      if (!fichier) return;
      zoneJustif.insertAdjacentHTML('afterbegin', '<p class="aide">Préparation du fichier…</p>');
      try {
        nouveauFichier = await justif.preparerFichier(fichier);
        nouveauFichier.apercu = URL.createObjectURL(nouveauFichier.blob);
      } finally {
        dessinerJustif();
      }
    });
    zoneJustif.querySelector('#annuler-justif')?.addEventListener('click', () => { nouveauFichier = null; dessinerJustif(); });
    zoneJustif.querySelector('#voir-justif')?.addEventListener('click', () => tenter(() => justif.ouvrir(m.photo_path)));
    zoneJustif.querySelector('#retirer-justif')?.addEventListener('click', () => { retirer = true; dessinerJustif(); });
  }
  dessinerJustif();

  surEnvoi(form, async data => {
    data.montant = lireMontant(data.montant);
    if (!data.montant) throw new Error('Montant invalide (ex. 45 ou 45,90).');
    if (data.montant > 1000000) throw new Error('Montant trop élevé, vérifie la saisie.');
    if (!dateValide(data.date)) throw new Error('Date invalide.');
    if (data.categorie === 'sous_traitance' && !data.sous_traitant) {
      throw new Error('Indique le nom du sous-traitant.');
    }
    if (data.sens === 'gain' && !data.mode_paiement) {
      throw new Error('Indique le mode de paiement (virement, chèque…) : il est obligatoire dans le livre des recettes.');
    }
    if (data.sens === 'gain') data.refacturable = false;
    // Le mode de paiement ne concerne que les recettes
    if (data.sens === 'depense') { if (!m.mode_paiement) delete data.mode_paiement; else data.mode_paiement = null; }
    if (data.categorie !== 'sous_traitance') data.sous_traitant = null;

    const enregistre = id
      ? await q(db.from('mouvements').update(data).eq('id', id).select().single())
      : await q(db.from('mouvements').insert(data).select().single());

    // Le justificatif est envoyé après le mouvement (il a besoin de son numéro)
    try {
      if (nouveauFichier) {
        const chemin = await justif.envoyer(nouveauFichier, enregistre.id);
        await q(db.from('mouvements').update({ photo_path: chemin }).eq('id', enregistre.id));
        await justif.supprimer(m.photo_path); // l'ancien fichier, s'il y en avait un
      } else if (retirer && m.photo_path) {
        await q(db.from('mouvements').update({ photo_path: null }).eq('id', enregistre.id));
        await justif.supprimer(m.photo_path);
      }
    } catch (err) {
      alert(`Le mouvement est enregistré, mais pas le justificatif : ${err.message}`);
    }
    toast('Enregistré');
    aller(data.chantier_id ? `/chantier/${data.chantier_id}` : '/frais');
  });

  const suppr = main.querySelector('#supprimer');
  if (suppr) suppr.onclick = () => tenter(async () => {
    if (!confirm('Supprimer ce mouvement ?')) return;
    await q(db.from('mouvements').delete().eq('id', id));
    await justif.supprimer(m.photo_path).catch(() => {});
    toast('Supprimé');
    aller(retour);
  });
}
