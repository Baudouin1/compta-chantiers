// Point d'entrée de l'appli : connexion, navigation entre les écrans, installation
import { db } from './db.js';
import { esc, titre, erreurLisible } from './utils.js';
import * as connexion from './pages/connexion.js';
import * as accueil from './pages/accueil.js';
import * as chantiers from './pages/chantiers.js';
import * as clients from './pages/clients.js';
import * as mouvements from './pages/mouvements.js';
import * as reglages from './pages/reglages.js';
import * as deplacement from './pages/deplacement.js';
import * as exportCsv from './pages/export.js';
import * as calendrier from './pages/calendrier.js';
import * as frais from './pages/frais.js';

// Liste des écrans : adresse -> fonction qui affiche l'écran
const ROUTES = [
  ['/', accueil.afficher, 'accueil'],
  ['/chantiers', chantiers.liste, 'chantiers'],
  ['/chantier/nouveau', chantiers.formulaire, 'chantiers'],
  ['/chantier/:id', chantiers.fiche, 'chantiers'],
  ['/chantier/:id/modifier', chantiers.formulaire, 'chantiers'],
  ['/clients', clients.liste, 'clients'],
  ['/client/nouveau', clients.formulaire, 'clients'],
  ['/client/:id', clients.fiche, 'clients'],
  ['/client/:id/modifier', clients.formulaire, 'clients'],
  ['/mouvement/nouveau', mouvements.formulaire, null],
  ['/mouvement/:id', mouvements.formulaire, null],
  ['/frais', frais.liste, 'accueil'],
  ['/deplacement', deplacement.formulaire, null],
  ['/calendrier', calendrier.formulaire, null],
  ['/reglages', reglages.afficher, 'reglages'],
  ['/reglages/trajets', reglages.trajets, 'reglages'],
  ['/reglages/trajet/nouveau', reglages.trajetFormulaire, 'reglages'],
  ['/reglages/trajet/:id', reglages.trajetFormulaire, 'reglages'],
  ['/reglages/boutons', reglages.boutons, 'reglages'],
  ['/reglages/bouton/nouveau', reglages.boutonFormulaire, 'reglages'],
  ['/reglages/bouton/:id', reglages.boutonFormulaire, 'reglages'],
  ['/export', exportCsv.afficher, 'reglages'],
];

const main = document.getElementById('page');
const nav = document.getElementById('onglets');

function estFormulaire(chemin) {
  return /\/(nouveau|modifier)$/.test(chemin)
    || /^\/(mouvement|deplacement|calendrier|export|reglages\/(trajet|bouton)\/)/.test(chemin);
}

function trouverRoute(chemin) {
  for (const [modele, fn, onglet] of ROUTES) {
    const a = modele.split('/'), b = chemin.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((p, i) => p.startsWith(':') ? (params[p.slice(1)] = b[i]) : p === b[i])) {
      return { fn, onglet, params };
    }
  }
  return { fn: accueil.afficher, onglet: 'accueil', params: {} };
}

let session = null;

async function afficherEcran() {
  if (!session) {
    nav.hidden = true;
    titre('Compta Chantiers');
    // Lien "mot de passe oublié" expiré ou déjà utilisé : on nettoie l'adresse
    if (location.search) history.replaceState(null, '', '/');
    return connexion.afficher(main);
  }
  // Arrivée par le lien "mot de passe oublié" reçu par email
  if (new URLSearchParams(location.search).has('reinit')) {
    nav.hidden = true;
    return connexion.nouveauMotDePasse(main, () => {
      history.replaceState(null, '', '/');
      afficherEcran();
    });
  }
  nav.hidden = false;
  const [chemin, recherche] = (location.hash.slice(1) || '/').split('?');
  const { fn, onglet, params } = trouverRoute(chemin);
  params.query = Object.fromEntries(new URLSearchParams(recherche || ''));

  nav.querySelectorAll('a').forEach(a => a.classList.toggle('actif', a.dataset.onglet === onglet));
  // Sur les formulaires, on cache la barre du bas pour ne pas gêner la saisie
  document.body.classList.toggle('sans-onglets', estFormulaire(chemin));
  main.innerHTML = '<p class="chargement">Chargement…</p>';
  window.scrollTo(0, 0);
  try {
    await fn(main, params);
  } catch (e) {
    main.innerHTML = `<div class="carte erreur">${esc(erreurLisible(e))}</div>
      <button class="btn" onclick="location.reload()">Réessayer</button>`;
  }
}

window.addEventListener('hashchange', afficherEcran);

db.auth.onAuthStateChange((_evenement, s) => {
  const changement = !!s !== !!session;
  session = s;
  if (changement) afficherEcran();
});

const { data } = await db.auth.getSession();
session = data.session;
afficherEcran();

// ---------- Barre du bas cachée pendant qu'on tape au clavier ----------
document.addEventListener('focusin', e => {
  if (e.target.matches('input, textarea, select')) document.body.classList.add('saisie');
});
document.addEventListener('focusout', () => document.body.classList.remove('saisie'));

// ---------- Recharger l'appli si elle est restée longtemps en arrière-plan ----------
// (pour avoir les dernières mises à jour et des totaux à jour)
// On ne le fait pas sur un formulaire pour ne pas perdre une saisie en cours.
let cacheeDepuis = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return (cacheeDepuis = Date.now());
  const chemin = (location.hash.slice(1) || '/').split('?')[0];
  if (cacheeDepuis && Date.now() - cacheeDepuis > 30 * 60 * 1000 && !estFormulaire(chemin)) {
    location.reload();
  }
});

// ---------- Bandeau "Installer sur iPhone" ----------
const estIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const estSafari = !/crios|fxios|edgios/i.test(navigator.userAgent);
const estInstallee = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
let bandeauFerme = false;
try { bandeauFerme = localStorage.getItem('bandeau-ferme') === '1'; } catch {}

if (estIOS && estSafari && !estInstallee && !bandeauFerme) {
  const b = document.getElementById('bandeau-install');
  b.hidden = false;
  b.querySelector('button').onclick = () => {
    b.hidden = true;
    try { localStorage.setItem('bandeau-ferme', '1'); } catch {}
  };
}

// ---------- Service worker (fait marcher l'appli comme une vraie appli) ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
