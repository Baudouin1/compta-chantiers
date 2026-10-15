// Petites fonctions utilisées partout

export const STATUTS = {
  devis: 'Devis',
  en_cours: 'En cours',
  termine: 'Terminé',
  paye: 'Payé',
};

export const CATEGORIES = {
  depense: {
    achat_fournisseur: 'Achat fournisseur',
    produits: 'Produits / consommables',
    pieces: 'Pièces',
    sous_traitance: 'Sous-traitance',
    deplacement: 'Déplacement',
    autre: 'Autre',
  },
  gain: {
    facture: 'Facture client',
    acompte: 'Acompte',
    autre: 'Autre',
  },
};

// Modes de paiement (obligatoires dans le livre des recettes d'une micro-entreprise)
export const MODES_PAIEMENT = {
  virement: 'Virement',
  cheque: 'Chèque',
  especes: 'Espèces',
  carte: 'Carte bancaire',
  autre: 'Autre',
};

// Petite icône affichée devant chaque mouvement
export const ICONES = {
  depense: { achat_fournisseur: '🛒', produits: '🧴', pieces: '⚙️', sous_traitance: '🤝', deplacement: '🚗', autre: '📦' },
  gain: { facture: '🧾', acompte: '💶', autre: '💰' },
};

export function iconeCategorie(sens, cat) {
  return ICONES[sens]?.[cat] || (sens === 'gain' ? '💰' : '📦');
}

export function nomCategorie(sens, cat) {
  return CATEGORIES[sens]?.[cat] || cat;
}

// 1234.5 -> "1 234,50 €"
export function euros(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
}

// "2026-10-15" -> "15/10/2026"
export function dateFr(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

// Date du jour au format "2026-10-15"
export function aujourdhui() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Lit un nombre tapé au clavier ("12,50", "12.50", "1 234,5 €")
// Renvoie null si ce n'est pas un nombre valide (lettres, plusieurs virgules, négatif…)
export function lireMontant(texte) {
  const t = String(texte ?? '').replace(/[\s€]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

// Protège le texte avant de l'afficher dans la page
export function esc(texte) {
  return String(texte ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Totaux d'une liste de mouvements
export function totaux(mouvements) {
  let depenses = 0, gains = 0, refacturable = 0;
  for (const m of mouvements || []) {
    const v = Number(m.montant) || 0;
    if (m.sens === 'gain') gains += v;
    else {
      depenses += v;
      if (m.refacturable) refacturable += v;
    }
  }
  return { depenses, gains, marge: gains - depenses, refacturable };
}

// Classe CSS selon que la marge est positive ou négative
export function classeMarge(n) {
  return n < 0 ? 'neg' : 'pos';
}

// Récupère les valeurs d'un formulaire sous forme d'objet (champs vides -> null)
export function lireFormulaire(form) {
  const obj = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') obj[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) obj[el.name] = el.value; }
    else obj[el.name] = el.value.trim() === '' ? null : el.value.trim();
  }
  return obj;
}

// Petit message temporaire en bas de l'écran
export function toast(message) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ---------- Navigation entre les écrans ----------
// On gère l'historique nous-mêmes pour que « glisser pour revenir » sur iPhone reste logique :
// - les 4 onglets du bas sont des points de départ : on ne peut pas revenir avant ;
// - après un enregistrement, on ne revient jamais sur le formulaire.

const RACINES = ['/', '/chantiers', '/clients', '/reglages'];
let afficheur = () => {};
let pile = [];               // écrans ouverts, du plus ancien au plus récent
let racineEnAttente = null;  // onglet à afficher une fois revenu au début de l'historique

const profondeur = () => history.state?.p ?? 0;
export const cheminActuel = () => location.hash.slice(1) || '/';

// Écrans de saisie (la barre du bas y est cachée, et on ne revient pas dessus après l'enregistrement)
export function estFormulaire(chemin) {
  return /\/(nouveau|modifier)$/.test(chemin)
    || /^\/(mouvement|deplacement|calendrier|export|reglages\/(trajet|bouton)\/)/.test(chemin);
}

export function demarrerNavigation(fn) {
  afficheur = fn;
  history.replaceState({ p: profondeur() }, '', '#' + cheminActuel());
  pile[profondeur()] = cheminActuel();

  window.addEventListener('popstate', () => {
    if (racineEnAttente !== null && profondeur() === 0) {
      history.replaceState({ p: 0 }, '', '#' + racineEnAttente);
      pile = [racineEnAttente];
      racineEnAttente = null;
    } else {
      pile[profondeur()] = cheminActuel();
      pile.length = profondeur() + 1;
    }
    afficheur();
  });

  // Tous les liens internes (href="#/...") passent par aller()
  document.addEventListener('click', e => {
    const lien = e.target.closest('a[href^="#/"]');
    if (!lien) return;
    e.preventDefault();
    aller(lien.getAttribute('href').slice(1));
  });
}

export function aller(chemin) {
  const p = profondeur();
  if (RACINES.includes(chemin.split('?')[0])) {
    // Onglet : on efface l'historique de l'appli
    if (p > 0) {
      racineEnAttente = chemin;
      history.go(-p);
      return;
    }
    history.replaceState({ p: 0 }, '', '#' + chemin);
    pile = [chemin];
  } else if (p > 0 && pile[p - 1] === chemin) {
    // C'est l'écran d'avant (ex. retour sur le chantier après avoir ajouté une dépense)
    history.back();
    return;
  } else if (estFormulaire(cheminActuel())) {
    // On quitte un formulaire : il est remplacé, pour ne pas pouvoir revenir dessus
    history.replaceState({ p }, '', '#' + chemin);
    pile[p] = chemin;
  } else {
    history.pushState({ p: p + 1 }, '', '#' + chemin);
    pile[p + 1] = chemin;
    pile.length = p + 2;
  }
  afficheur();
}

// Bouton ‹ en haut à gauche : écran précédent, ou l'écran "parent" si on vient d'ouvrir l'appli
function revenir(parent) {
  if (profondeur() > 0) history.back();
  else aller(parent);
}

// Titre en haut de l'écran : bouton retour si besoin, sinon le logo
export function titre(texte, retour = null) {
  const entete = document.getElementById('entete');
  entete.innerHTML = `
    ${retour ? `<button class="retour" aria-label="Retour">‹</button>` : '<img class="logo-entete" src="icons/icon-192.png" alt="">'}
    <h1>${esc(texte)}</h1>`;
  if (retour) entete.querySelector('.retour').onclick = () => revenir(retour);
}

// Traduit les erreurs techniques en message compréhensible
export function erreurLisible(err) {
  const m = err?.message || String(err);
  if (/failed to fetch|network|load failed/i.test(m)) return 'Pas de connexion internet. Réessaie quand tu as du réseau.';
  if (/mode_paiement/i.test(m)) return 'La base doit être mise à jour pour le mode de paiement (script Supabase « mode_paiement.sql » à lancer).';
  if (/foreign key|violates/i.test(m)) return 'Opération impossible : des éléments liés existent encore.';
  if (/JWT|token|not authenticated/i.test(m)) return 'Session expirée : déconnecte-toi puis reconnecte-toi.';
  return m;
}

// Lance une action et affiche un message clair en cas de problème
export async function tenter(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    alert(erreurLisible(err));
  }
}

// Gère l'envoi d'un formulaire : bloque le double clic et affiche les erreurs.
// Dans fn, faire "throw new Error('message')" pour refuser la saisie avec un message.
export function surEnvoi(form, fn) {
  form.onsubmit = async e => {
    e.preventDefault();
    const bouton = form.querySelector('[type=submit]');
    if (bouton) bouton.disabled = true;
    await tenter(() => fn(lireFormulaire(form)));
    if (bouton) bouton.disabled = false;
  };
}

// Vérifie une date "AAAA-MM-JJ" (année raisonnable)
export function dateValide(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
  const annee = Number(iso.slice(0, 4));
  return annee >= 2000 && annee <= 2100;
}

// ---------- Ouvrir une autre appli (GPS…) ----------
// On essaie d'ouvrir l'appli directement ; si rien ne se passe (appli pas installée),
// on ouvre la version web au bout d'un instant.
export function ouvrirAppli(lienAppli, lienWeb) {
  let quitte = false;
  const surQuitte = () => { quitte = true; };
  document.addEventListener('visibilitychange', surQuitte, { once: true });
  location.href = lienAppli;
  setTimeout(() => {
    document.removeEventListener('visibilitychange', surQuitte);
    if (!quitte && !document.hidden) window.open(lienWeb, '_blank');
  }, 1500);
}

// Petit menu de choix qui monte du bas de l'écran
// options : [{ texte, action }]
export function menuChoix(titreMenu, options) {
  const fond = document.createElement('div');
  fond.className = 'menu-fond';
  fond.innerHTML = `
    <div class="menu-choix">
      <p>${esc(titreMenu)}</p>
      ${options.map((o, i) => `<button class="btn" data-i="${i}">${o.texte}</button>`).join('')}
      <button class="btn lien" data-i="annuler">Annuler</button>
    </div>`;
  fond.onclick = e => {
    const i = e.target.closest('[data-i]')?.dataset.i;
    if (e.target !== fond && i === undefined) return;
    fond.remove();
    if (i !== undefined && i !== 'annuler') options[i].action();
  };
  document.body.appendChild(fond);
}
