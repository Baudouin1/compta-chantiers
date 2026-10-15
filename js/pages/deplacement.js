// Bouton "Aller-retour" : crée une dépense de déplacement à partir d'un trajet
import { db, q, coutKm } from '../db.js';
import { esc, euros, titre, toast, aller, surEnvoi, lireMontant, aujourdhui, dateValide } from '../utils.js';

export async function formulaire(main, { query }) {
  const chantierId = query.chantier;
  const [chantier, trajets, cout] = await Promise.all([
    q(db.from('chantiers').select('id, nom, clients(nom, trajet_destination, trajet_km)').eq('id', chantierId).single()),
    q(db.from('trajets').select('*').order('destination')),
    coutKm(),
  ]);
  titre('Aller-retour', `/chantier/${chantierId}`);

  // Liste des trajets proposés : d'abord celui du client, puis les trajets enregistrés
  const choix = [];
  const cl = chantier.clients;
  if (cl.trajet_km) choix.push({ destination: cl.trajet_destination || 'Trajet du client', km: cl.trajet_km, client: true });
  for (const t of trajets) choix.push({ destination: t.destination, km: t.km });

  main.innerHTML = `
    <form class="carte" id="form-ar">
      <p class="aide">${esc(chantier.nom)} · ${esc(cl.nom)}</p>

      ${choix.length ? `
      <label>Trajet
        <select id="choix">
          ${choix.map((t, i) => `<option value="${i}">${t.client ? '⭐ ' : ''}${esc(t.destination)} (${String(t.km).replace('.', ',')} km)</option>`).join('')}
          <option value="autre">Autre trajet…</option>
        </select>
      </label>` : '<p class="aide">Aucun trajet enregistré : saisis la destination et la distance.</p>'}

      <label>Destination *
        <input name="destination" required>
      </label>
      <label>Distance aller-retour (km) *
        <input name="km" inputmode="decimal" required>
      </label>

      <div class="calcul">
        <span id="detail-calcul"></span>
        <strong id="cout-total">0,00 €</strong>
      </div>

      <label>Date
        <input name="date" type="date" required value="${aujourdhui()}">
      </label>

      <label class="case" id="champ-memoriser" hidden>
        <input type="checkbox" name="memoriser">
        Enregistrer ce trajet pour la prochaine fois
      </label>
      <label class="case">
        <input type="checkbox" name="refacturable">
        Refacturable au client
      </label>

      <button class="btn principal" type="submit">Valider le déplacement</button>
    </form>
    <p class="aide">Coût au km : ${euros(cout)} (modifiable dans Réglages).</p>`;

  const form = main.querySelector('#form-ar');
  const select = main.querySelector('#choix');

  function calculer() {
    const km = lireMontant(form.km.value);
    main.querySelector('#detail-calcul').textContent = km ? `${String(km).replace('.', ',')} km × ${euros(cout)}` : '';
    main.querySelector('#cout-total').textContent = euros(km ? km * cout : 0);
  }

  function appliquerChoix() {
    const t = select && select.value !== 'autre' ? choix[select.value] : null;
    form.destination.value = t ? t.destination : '';
    form.km.value = t ? String(t.km).replace('.', ',') : '';
    main.querySelector('#champ-memoriser').hidden = !!t;
    calculer();
    if (!t) form.destination.focus();
  }

  // Si on modifie à la main un trajet proposé, on propose de l'enregistrer comme nouveau trajet
  form.destination.oninput = form.km.oninput = () => {
    const t = select && select.value !== 'autre' ? choix[select.value] : null;
    const modifie = !t || form.destination.value !== t.destination || lireMontant(form.km.value) !== Number(t.km);
    main.querySelector('#champ-memoriser').hidden = !modifie;
    calculer();
  };
  if (select) select.onchange = appliquerChoix;
  appliquerChoix();

  surEnvoi(form, async data => {
    if (!data.destination) throw new Error('La destination est obligatoire.');
    const km = lireMontant(data.km);
    if (!km || km > 5000) throw new Error('Distance invalide (en km, ex. 42 ou 42,5).');
    if (!dateValide(data.date)) throw new Error('Date invalide.');

    await q(db.from('mouvements').insert({
      chantier_id: chantierId,
      date: data.date,
      sens: 'depense',
      categorie: 'deplacement',
      montant: Math.round(km * cout * 100) / 100,
      description: `Aller-retour ${data.destination} (${String(km).replace('.', ',')} km)`,
      refacturable: data.refacturable,
    }));
    if (data.memoriser && !main.querySelector('#champ-memoriser').hidden) {
      await q(db.from('trajets').insert({ destination: data.destination, km }));
    }
    toast('Déplacement enregistré');
    aller(`/chantier/${chantierId}`);
  });
}
