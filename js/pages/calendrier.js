// "Ajouter au calendrier" : prépare un événement pour le calendrier de l'iPhone
import { db, q } from '../db.js';
import { esc, titre, surEnvoi, aujourdhui, dateValide } from '../utils.js';

export async function formulaire(main, { query }) {
  // Deux cas : depuis un chantier (?chantier=…) ou depuis une fiche client (?client=…)
  const champsClient = 'nom, bateau, port, adresse, telephone';
  let c, cl, retour, nomParDefaut, notes, rdvParDefaut;
  if (query.chantier) {
    c = await q(db.from('chantiers').select(`*, clients(${champsClient})`).eq('id', query.chantier).single());
    cl = c.clients;
    retour = `/chantier/${c.id}`;
    nomParDefaut = `${c.nom} – ${cl.nom}${cl.bateau ? ' (' + cl.bateau + ')' : ''}`;
    notes = [c.description, cl.telephone ? 'Tél. ' + cl.telephone : ''].filter(Boolean).join('\n');
    rdvParDefaut = !c.date_debut; // pas de dates de chantier : on propose plutôt un rendez-vous
  } else {
    cl = await q(db.from('clients').select(`id, ${champsClient}`).eq('id', query.client).single());
    c = {};
    retour = `/client/${cl.id}`;
    nomParDefaut = `RDV ${cl.nom}${cl.bateau ? ' (' + cl.bateau + ')' : ''}`;
    notes = cl.telephone ? 'Tél. ' + cl.telephone : '';
    rdvParDefaut = true;
  }
  titre('Ajouter au calendrier', retour);

  main.innerHTML = `
    <form class="carte" id="form-cal">
      <label>Titre
        <input name="titre" required value="${esc(nomParDefaut)}">
      </label>
      <label>Lieu
        <input name="lieu" value="${esc(cl.port || cl.adresse || '')}">
      </label>

      <div class="segments" id="type">
        <label class="neutre"><input type="radio" name="type" value="journee" ${rdvParDefaut ? '' : 'checked'}><span>Journée(s)</span></label>
        <label class="neutre"><input type="radio" name="type" value="heure" ${rdvParDefaut ? 'checked' : ''}><span>Rendez-vous</span></label>
      </div>

      <div class="cote-a-cote">
        <label>Date <input name="date" type="date" required value="${c.date_debut || aujourdhui()}"></label>
        <label id="champ-date-fin">Jusqu'au <input name="date_fin" type="date" value="${c.date_fin || ''}"></label>
      </div>
      <div class="cote-a-cote" id="champs-heure" hidden>
        <label>De <input name="heure" type="time" value="09:00"></label>
        <label>À <input name="heure_fin" type="time" value="12:00"></label>
      </div>

      <label>Notes
        <textarea name="notes" rows="3">${esc(notes)}</textarea>
      </label>

      <button class="btn principal" type="submit">📅 Ajouter au calendrier</button>
    </form>
    <p class="aide">L'iPhone va afficher l'événement : touche « Ajouter » pour le mettre dans ton calendrier.
      Attention, si la date change ensuite, il faudra modifier l'événement dans le calendrier.</p>`;

  const form = main.querySelector('#form-cal');
  const majType = () => {
    const rdv = form.type.value === 'heure';
    main.querySelector('#champ-date-fin').hidden = rdv;
    main.querySelector('#champs-heure').hidden = !rdv;
  };
  form.querySelectorAll('[name=type]').forEach(r => r.onchange = majType);
  const majMin = () => { form.date_fin.min = form.date.value || ''; };
  form.date.onchange = majMin;
  majMin();
  majType();

  surEnvoi(form, async data => {
    if (!dateValide(data.date)) throw new Error('Date invalide.');
    const params = { titre: data.titre || nomParDefaut, date: data.date, lieu: data.lieu, notes: data.notes };
    if (data.type === 'heure') {
      if (!data.heure) throw new Error("Indique l'heure de début.");
      if (data.heure_fin && data.heure_fin <= data.heure) throw new Error("L'heure de fin doit être après l'heure de début.");
      Object.assign(params, { heure: data.heure, heure_fin: data.heure_fin });
    } else if (data.date_fin) {
      if (data.date_fin < data.date) throw new Error('La date de fin ne peut pas être avant la date de début.');
      params.date_fin = data.date_fin;
    }
    const url = '/api/ics?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    // Ouvre l'événement dans une fenêtre Safari ; si c'est bloqué, on l'ouvre ici
    if (!window.open(url, '_blank')) location.href = url;
  });
}
