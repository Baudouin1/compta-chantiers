// Écran Réglages + gestion des trajets enregistrés et des boutons rapides
import { db, q } from '../db.js';
import { tarifsGeneraux } from '../calculs.js';
import {
  esc, euros, titre, toast, aller, surEnvoi, tenter, lireMontant, nomCategorie, aujourdhui, nombreFr, CATEGORIES,
} from '../utils.js';
import { partagerFichier } from './export.js';
import { fabriquerSauvegarde } from '../sauvegarde.js';
import { espaceUtilise } from '../justificatifs.js';

export async function afficher(main) {
  titre('Réglages');
  const [{ data }, tarifs, nbTrajets, nbBoutons] = await Promise.all([
    db.auth.getUser(),
    tarifsGeneraux(),
    q(db.from('trajets').select('id')),
    q(db.from('boutons_rapides').select('id')),
  ]);

  main.innerHTML = `
    <div class="liste">
      <a class="ligne" href="#/reglages/tarifs">
        <div><strong>💶 Mes tarifs</strong><small>${euros(tarifs.taux_nettoyage)}/h nettoyage · ${euros(tarifs.taux_entretien)}/h entretien · conso ${nombreFr(tarifs.conso_pct)} %</small></div>
        <span class="fleche">›</span>
      </a>
      <a class="ligne" href="#/reglages/trajets">
        <div><strong>🚗 Trajets enregistrés</strong><small>${nbTrajets.length} trajet(s)</small></div>
        <span class="fleche">›</span>
      </a>
      <a class="ligne" href="#/reglages/boutons">
        <div><strong>⚡ Boutons rapides</strong><small>${nbBoutons.length} bouton(s)</small></div>
        <span class="fleche">›</span>
      </a>
      <a class="ligne" href="#/aide">
        <div><strong>📖 Guide d'utilisation</strong><small>Comment se servir de l'appli</small></div>
        <span class="fleche">›</span>
      </a>
      <a class="ligne" href="#/export">
        <div><strong>📄 Export CSV</strong><small>Pour le comptable</small></div>
        <span class="fleche">›</span>
      </a>
    </div>

    <div class="carte">
      <h3 style="margin-top:0">💾 Sauvegarde complète</h3>
      <p class="aide">Un fichier Excel complet : tableau de bord, un onglet par client (comme ton ancien
        tableau), mouvements, livre des recettes… À faire une fois par mois et à garder (mail, Fichiers, iCloud).</p>
      <div id="sauvegarde"></div>
    </div>

    <div class="carte">
      <div class="info"><span>Factures et tickets stockés</span><div id="espace">…</div></div>
      <div class="info"><span>Connecté avec</span><div>${esc(data.user?.email)}</div></div>
    </div>
    <button class="btn danger" id="deconnexion">Se déconnecter</button>`;

  // Sauvegarde : 1er toucher = on prépare le fichier Excel, 2e toucher = on l'envoie
  // (l'iPhone n'autorise le partage que juste après un toucher)
  const zone = main.querySelector('#sauvegarde');
  const boutonPreparer = () => {
    zone.innerHTML = '<button class="btn" id="preparer-sauvegarde">Préparer la sauvegarde</button>';
    zone.querySelector('#preparer-sauvegarde').onclick = () => tenter(async () => {
      zone.innerHTML = '<p class="aide">Préparation…</p>';
      let fichier;
      try {
        fichier = await fabriquerSauvegarde(data.user?.email);
      } catch (err) {
        boutonPreparer();

  // Place prise par les justificatifs (offre gratuite : 1 Go)
  espaceUtilise().then(octets => {
    main.querySelector('#espace').textContent = octets == null
      ? 'Pas encore activé'
      : `${(octets / 1048576).toFixed(1).replace('.', ',')} Mo utilisés sur 1 Go (${(octets / 1073741824 * 100).toFixed(1).replace('.', ',')} %)`;
  });
        throw err;
      }
      zone.innerHTML = `<button class="btn gain" id="envoyer-sauvegarde">📤 Envoyer la sauvegarde (${fichier.nb} éléments)</button>`;
      zone.querySelector('#envoyer-sauvegarde').onclick = () => tenter(() => partagerFichier(
        fichier.contenu, `Sauvegarde BluePrestige ${aujourdhui()}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    });
  };
  boutonPreparer();

  // Place prise par les justificatifs (offre gratuite : 1 Go)
  espaceUtilise().then(octets => {
    main.querySelector('#espace').textContent = octets == null
      ? 'Pas encore activé'
      : `${(octets / 1048576).toFixed(1).replace('.', ',')} Mo utilisés sur 1 Go (${(octets / 1073741824 * 100).toFixed(1).replace('.', ',')} %)`;
  });

  main.querySelector('#deconnexion').onclick = async () => {
    if (!confirm('Se déconnecter ?')) return;
    await db.auth.signOut();
    aller('/');
  };
}

// ---------- Mes tarifs (tarifs généraux) ----------

// Champs de tarifs, utilisés ici et dans la fiche client
export const LIBELLES_TARIFS = [
  ['taux_nettoyage', 'Taux horaire nettoyage', '€/h'],
  ['taux_entretien', 'Taux horaire entretien', '€/h'],
  ['conso_pct', 'Consommables (% de la main-d\'œuvre)', '%'],
  ['conso_min', 'Consommables minimum', '€'],
  ['prix_km_facture', 'Prix du km facturé au client', '€/km'],
  ['marge_produits', 'Marge sur les produits revendus', '%'],
];

export async function tarifs(main) {
  titre('Mes tarifs', '/reglages');
  const t = await tarifsGeneraux();
  main.innerHTML = `
    <form class="carte" id="form-tarifs">
      <p class="aide" style="margin-top:0">Ces tarifs s'appliquent à <strong>tous les clients</strong>,
        sauf ceux pour qui tu as mis un tarif particulier (dans leur fiche).
        Une intervention garde les tarifs du jour où elle a été créée.</p>
      ${LIBELLES_TARIFS.map(([k, label, unite]) => `
        <label>${label} (${unite})
          <input name="${k}" inputmode="decimal" required value="${nombreFr(t[k])}">
        </label>`).join('')}
      <h3>Mes frais</h3>
      <label>Mon coût réel au km (€/km)
        <input name="cout_km" inputmode="decimal" required value="${nombreFr(t.cout_km)}">
      </label>
      <p class="aide">Utilisé par le bouton « Aller-retour » pour calculer tes frais de déplacement.</p>
      <button class="btn principal" type="submit">Enregistrer</button>
    </form>`;

  surEnvoi(main.querySelector('#form-tarifs'), async data => {
    const valeurs = {};
    for (const [k, v] of Object.entries(data)) {
      const x = lireNombre(v);
      if (x == null) throw new Error('Un des tarifs n\'est pas un nombre valide (ex. 37 ou 17,16).');
      valeurs[k] = x;
    }
    const { data: s } = await db.auth.getSession();
    await q(db.from('reglages').upsert({ user_id: s.session.user.id, ...valeurs }));
    toast('Tarifs enregistrés');
    aller('/reglages');
  });
}

// Lit un nombre positif avec jusqu'à 3 décimales ("0,605", "17,16")
export function lireNombre(texte) {
  const t = String(texte ?? '').replace(/[\s€%]/g, '').replace(',', '.');
  return /^\d+(\.\d{1,3})?$/.test(t) ? Number(t) : null;
}

// ---------- Trajets enregistrés ----------

export async function trajets(main) {
  titre('Trajets enregistrés', '/reglages');
  const liste = await q(db.from('trajets').select('*').order('destination'));
  main.innerHTML = `
    <a class="btn principal" href="#/reglages/trajet/nouveau">+ Nouveau trajet</a>
    <p class="aide">Ces trajets sont proposés quand tu touches « Aller-retour » sur un chantier.</p>
    <div class="liste">
      ${liste.map(t => `
        <a class="ligne" href="#/reglages/trajet/${t.id}">
          <strong>${esc(t.destination)}</strong>
          <span>${String(t.km ?? 0).replace('.', ',')} km</span>
        </a>`).join('') || '<p class="vide">Aucun trajet enregistré.</p>'}
    </div>`;
}

export async function trajetFormulaire(main, { id }) {
  const t = id ? await q(db.from('trajets').select('*').eq('id', id).single()) : {};
  titre(id ? 'Modifier le trajet' : 'Nouveau trajet', '/reglages/trajets');
  main.innerHTML = `
    <form class="carte" id="form-trajet">
      <label>Destination *
        <input name="destination" required value="${esc(t.destination ?? '')}" placeholder="ex. Chantier naval de Kernevel">
      </label>
      <label>Distance aller-retour (km) *
        <input name="km" inputmode="decimal" required value="${t.km != null ? String(t.km).replace('.', ',') : ''}">
      </label>
      <button class="btn principal" type="submit">Enregistrer</button>
    </form>
    ${id ? '<button class="btn danger" id="supprimer">Supprimer ce trajet</button>' : ''}`;

  surEnvoi(main.querySelector('#form-trajet'), async data => {
    if (!data.destination) throw new Error('La destination est obligatoire.');
    data.km = lireMontant(data.km);
    if (!data.km || data.km > 5000) throw new Error('Distance invalide (en km, ex. 42 ou 42,5).');
    if (id) await q(db.from('trajets').update(data).eq('id', id));
    else await q(db.from('trajets').insert(data));
    toast('Trajet enregistré');
    aller('/reglages/trajets');
  });

  const suppr = main.querySelector('#supprimer');
  if (suppr) suppr.onclick = () => tenter(async () => {
    if (!confirm('Supprimer ce trajet ?')) return;
    await q(db.from('trajets').delete().eq('id', id));
    toast('Trajet supprimé');
    aller('/reglages/trajets');
  });
}

// ---------- Boutons rapides personnalisés ----------

export async function boutons(main) {
  titre('Boutons rapides', '/reglages');
  const liste = await q(db.from('boutons_rapides').select('*').order('libelle'));
  main.innerHTML = `
    <a class="btn principal" href="#/reglages/bouton/nouveau">+ Nouveau bouton</a>
    <p class="aide">Ces boutons apparaissent sur la page de chaque chantier.
      Ils ouvrent une dépense déjà remplie, dont tu peux changer le montant.</p>
    <div class="liste">
      ${liste.map(b => `
        <a class="ligne" href="#/reglages/bouton/${b.id}">
          <div><strong>${esc(b.libelle)}</strong><small>${esc(nomCategorie('depense', b.categorie))}</small></div>
          <span>${euros(b.montant)}</span>
        </a>`).join('') || '<p class="vide">Aucun bouton. Exemples : « Péage », « Plein de produits ».</p>'}
    </div>`;
}

export async function boutonFormulaire(main, { id }) {
  const b = id ? await q(db.from('boutons_rapides').select('*').eq('id', id).single()) : { categorie: 'produits' };
  titre(id ? 'Modifier le bouton' : 'Nouveau bouton', '/reglages/boutons');
  main.innerHTML = `
    <form class="carte" id="form-bouton">
      <label>Nom du bouton *
        <input name="libelle" required maxlength="30" value="${esc(b.libelle ?? '')}" placeholder="ex. Péage">
      </label>
      <label>Catégorie de la dépense
        <select name="categorie">
          ${Object.entries(CATEGORIES.depense).map(([k, v]) =>
            `<option value="${k}" ${k === b.categorie ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label>Montant par défaut (€) *
        <input name="montant" inputmode="decimal" required value="${b.montant != null ? String(b.montant).replace('.', ',') : ''}">
      </label>
      <button class="btn principal" type="submit">Enregistrer</button>
    </form>
    ${id ? '<button class="btn danger" id="supprimer">Supprimer ce bouton</button>' : ''}`;

  surEnvoi(main.querySelector('#form-bouton'), async data => {
    if (!data.libelle) throw new Error('Le nom du bouton est obligatoire.');
    data.montant = lireMontant(data.montant);
    if (data.montant == null || data.montant > 1000000) throw new Error('Montant invalide (ex. 12 ou 12,50).');
    if (id) await q(db.from('boutons_rapides').update(data).eq('id', id));
    else await q(db.from('boutons_rapides').insert(data));
    toast('Bouton enregistré');
    aller('/reglages/boutons');
  });

  const suppr = main.querySelector('#supprimer');
  if (suppr) suppr.onclick = () => tenter(async () => {
    if (!confirm('Supprimer ce bouton ?')) return;
    await q(db.from('boutons_rapides').delete().eq('id', id));
    toast('Bouton supprimé');
    aller('/reglages/boutons');
  });
}
