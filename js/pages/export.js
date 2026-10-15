// Export CSV des mouvements (pour le comptable)
import { db, q } from '../db.js';
import { titre, surEnvoi, tenter, aujourdhui, dateFr, dateValide, nomCategorie, STATUTS } from '../utils.js';

// Champs demandés à Supabase pour l'export
export const CHAMPS_EXPORT = '*, chantiers(nom, statut, clients(nom, bateau))';

export async function afficher(main) {
  titre('Export CSV', '/reglages');
  const auj = aujourdhui();
  const a = Number(auj.slice(0, 4)), m = Number(auj.slice(5, 7));
  const mm = n => String(n).padStart(2, '0');
  const finMois = (an, mois) => `${an}-${mm(mois)}-${mm(new Date(an, mois, 0).getDate())}`;
  const [ap, mp] = m === 1 ? [a - 1, 12] : [a, m - 1];

  const periodes = {
    'Ce mois': [`${a}-${mm(m)}-01`, finMois(a, m)],
    'Mois dernier': [`${ap}-${mm(mp)}-01`, finMois(ap, mp)],
    'Cette année': [`${a}-01-01`, `${a}-12-31`],
    'Année dernière': [`${a - 1}-01-01`, `${a - 1}-12-31`],
  };

  main.innerHTML = `
    <form class="carte" id="form-export">
      <div class="filtres">
        ${Object.keys(periodes).map(p => `<button type="button" data-periode="${p}">${p}</button>`).join('')}
      </div>
      <label>Contenu
        <select name="contenu">
          <option value="tout">Dépenses et recettes</option>
          <option value="gain">Recettes seulement (livre des recettes)</option>
          <option value="depense">Dépenses seulement</option>
        </select>
      </label>
      <div class="cote-a-cote">
        <label>Du <input name="du" type="date" required></label>
        <label>Au <input name="au" type="date" required></label>
      </div>
      <button class="btn principal" type="submit">Préparer le fichier</button>
    </form>
    <div id="resultat"></div>
    <p class="aide">Le fichier s'ouvre dans Excel ou Numbers. Sur iPhone, tu peux l'envoyer
      directement par mail ou WhatsApp, ou l'enregistrer dans Fichiers.</p>`;

  const form = main.querySelector('#form-export');
  const choisir = nom => {
    [form.du.value, form.au.value] = periodes[nom];
    main.querySelector('#resultat').innerHTML = '';
    form.querySelectorAll('[data-periode]').forEach(b => b.classList.toggle('actif', b.dataset.periode === nom));
  };
  form.querySelectorAll('[data-periode]').forEach(b => b.onclick = () => choisir(b.dataset.periode));
  choisir('Mois dernier');

  surEnvoi(form, async data => {
    if (!dateValide(data.du) || !dateValide(data.au)) throw new Error('Dates invalides.');
    if (data.au < data.du) throw new Error('La date de fin ne peut pas être avant la date de début.');
    let requete = db.from('mouvements').select(CHAMPS_EXPORT).gte('date', data.du).lte('date', data.au);
    if (data.contenu !== 'tout') requete = requete.eq('sens', data.contenu);
    const mvts = await q(requete.order('date'));
    if (!mvts.length) throw new Error('Aucun mouvement sur cette période.');
    // L'iPhone n'autorise le partage que juste après un toucher : d'où ce 2e bouton
    const resultat = main.querySelector('#resultat');
    resultat.innerHTML = `<button class="btn gain" id="envoyer">📤 Envoyer le fichier (${mvts.length} mouvements)</button>`;
    resultat.querySelector('#envoyer').onclick = () =>
      tenter(() => partagerCSV(mvts, `${{ tout: 'mouvements', gain: 'recettes', depense: 'depenses' }[data.contenu]}_${data.du}_${data.au}.csv`));
  });
  form.oninput = () => { main.querySelector('#resultat').innerHTML = ''; };
}

// Fabrique le fichier CSV (format Excel français : ";" et virgule décimale)
export function fabriquerCSV(mouvements) {
  const nombre = n => n ? Number(n).toFixed(2).replace('.', ',') : '';
  const cellule = v => {
    const t = String(v ?? '');
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const entetes = ['Date', 'Chantier', 'Statut chantier', 'Client', 'Bateau', 'Type', 'Catégorie',
    'Description', 'Sous-traitant', 'Dépense (€)', 'Recette (€)', 'Refacturable', 'Note'];
  const lignes = mouvements.map(m => [
    dateFr(m.date),
    m.chantiers?.nom ?? 'Frais généraux',
    m.chantiers ? STATUTS[m.chantiers.statut] : '',
    m.chantiers?.clients?.nom ?? '',
    m.chantiers?.clients?.bateau ?? '',
    m.sens === 'gain' ? 'Recette' : 'Dépense',
    nomCategorie(m.sens, m.categorie),
    m.description,
    m.sous_traitant,
    m.sens === 'depense' ? nombre(m.montant) : '',
    m.sens === 'gain' ? nombre(m.montant) : '',
    m.sens === 'depense' ? (m.refacturable ? 'Oui' : 'Non') : '',
    m.note,
  ]);
  // "﻿" au début : pour qu'Excel affiche bien les accents
  return '﻿' + [entetes, ...lignes].map(l => l.map(cellule).join(';')).join('\r\n');
}

export function partagerCSV(mouvements, nomFichier) {
  return partagerFichier(fabriquerCSV(mouvements), nomFichier, 'text/csv');
}

// Propose d'envoyer un fichier (mail, WhatsApp, Fichiers…) ou le télécharge.
// Sur iPhone, à appeler directement après un toucher (pas après une attente réseau).
export async function partagerFichier(contenu, nomFichier, type) {
  const fichier = new File([contenu], nomFichier, { type });
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: nomFichier });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // l'utilisateur a fermé le menu de partage
      // Partage refusé (ex. Chrome sur ordinateur) : on télécharge le fichier à la place
    }
  }
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(fichier);
  lien.download = nomFichier;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
}
