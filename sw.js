// Service worker : garde une copie des fichiers de l'appli pour qu'elle s'ouvre vite.
// Stratégie "réseau d'abord" : on prend toujours la dernière version en ligne,
// et la copie ne sert que si le réseau ne répond pas.
// Les données Supabase ne passent PAS par ici (elles viennent toujours d'internet).

const CACHE = 'compta-chantiers-v9';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(noms => Promise.all(noms.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then(reponse => {
        const copie = reponse.clone();
        caches.open(CACHE).then(c => c.put(e.request, copie));
        return reponse;
      })
      .catch(() => caches.match(e.request))
  );
});
