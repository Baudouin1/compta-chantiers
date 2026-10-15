// Point d'entrée de l'appli : connexion, navigation entre les écrans, installation
import { db } from './db.js';
import { esc, titre } from './utils.js';
import * as connexion from './pages/connexion.js';
import * as accueil from './pages/accueil.js';
import * as chantiers from './pages/chantiers.js';
import * as clients from './pages/clients.js';
import * as mouvements from './pages/mouvements.js';
import * as reglages from './pages/reglages.js';

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
  ['/reglages', reglages.afficher, 'reglages'],
];

const main = document.getElementById('page');
const nav = document.getElementById('onglets');

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
    return connexion.afficher(main);
  }
  nav.hidden = false;
  const [chemin, recherche] = (location.hash.slice(1) || '/').split('?');
  const { fn, onglet, params } = trouverRoute(chemin);
  params.query = Object.fromEntries(new URLSearchParams(recherche || ''));

  nav.querySelectorAll('a').forEach(a => a.classList.toggle('actif', a.dataset.onglet === onglet));
  main.innerHTML = '<p class="chargement">Chargement…</p>';
  window.scrollTo(0, 0);
  try {
    await fn(main, params);
  } catch (e) {
    main.innerHTML = `<div class="carte erreur">Erreur : ${esc(e.message)}<br><br>
      Vérifie ta connexion internet puis réessaie.</div>`;
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
