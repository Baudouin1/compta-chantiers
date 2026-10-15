// Écran Réglages
import { db } from '../db.js';
import { esc, titre } from '../utils.js';

export async function afficher(main) {
  titre('Réglages');
  const { data } = await db.auth.getUser();

  main.innerHTML = `
    <div class="carte">
      <div class="info"><span>Connecté avec</span><div>${esc(data.user?.email)}</div></div>
    </div>
    <p class="aide">Bientôt ici : coût au km, trajets enregistrés, boutons rapides, export CSV.</p>
    <button class="btn danger" id="deconnexion">Se déconnecter</button>`;

  main.querySelector('#deconnexion').onclick = async () => {
    if (!confirm('Se déconnecter ?')) return;
    await db.auth.signOut();
    location.hash = '/';
  };
}
