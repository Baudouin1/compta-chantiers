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

export function aller(chemin) {
  location.hash = chemin;
}

// Titre en haut de l'écran, avec un bouton retour si besoin
export function titre(texte, retour = null) {
  const entete = document.getElementById('entete');
  entete.innerHTML = `
    ${retour ? `<button class="retour" aria-label="Retour">‹</button>` : ''}
    <h1>${esc(texte)}</h1>`;
  if (retour) entete.querySelector('.retour').onclick = () => { location.hash = retour; };
}

// Traduit les erreurs techniques en message compréhensible
export function erreurLisible(err) {
  const m = err?.message || String(err);
  if (/failed to fetch|network|load failed/i.test(m)) return 'Pas de connexion internet. Réessaie quand tu as du réseau.';
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
