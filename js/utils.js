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

// Lit un montant tapé au clavier ("12,50" ou "12.50")
export function lireMontant(texte) {
  const n = parseFloat(String(texte).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
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

// Gère l'envoi d'un formulaire : bloque le double clic et affiche les erreurs
export function surEnvoi(form, fn) {
  form.onsubmit = async e => {
    e.preventDefault();
    const bouton = form.querySelector('[type=submit]');
    if (bouton) bouton.disabled = true;
    try {
      await fn(lireFormulaire(form));
    } catch (err) {
      alert('Erreur : ' + err.message);
    } finally {
      if (bouton) bouton.disabled = false;
    }
  };
}
