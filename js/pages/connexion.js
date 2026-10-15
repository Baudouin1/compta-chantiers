// Écran de connexion (email + mot de passe)
import { db } from '../db.js';
import { esc } from '../utils.js';

const ERREURS = {
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'Email not confirmed': "Email pas encore confirmé : clique sur le lien reçu par email, puis reviens ici.",
  'User already registered': 'Un compte existe déjà avec cet email. Connecte-toi.',
};

export function afficher(main) {
  let creation = false;

  function dessiner(message = '') {
    main.innerHTML = `
      <form class="carte" id="form-connexion">
        <h2>${creation ? 'Créer un compte' : 'Connexion'}</h2>
        <label>Email
          <input name="email" type="email" autocomplete="email" required>
        </label>
        <label>Mot de passe
          <input name="mdp" type="password" minlength="6" required
            autocomplete="${creation ? 'new-password' : 'current-password'}">
        </label>
        ${message ? `<p class="message">${esc(message)}</p>` : ''}
        <button class="btn principal" type="submit">${creation ? 'Créer le compte' : 'Se connecter'}</button>
      </form>
      <button class="btn lien" id="basculer">
        ${creation ? "J'ai déjà un compte" : 'Première fois ? Créer un compte'}
      </button>`;

    main.querySelector('#basculer').onclick = () => { creation = !creation; dessiner(); };

    main.querySelector('#form-connexion').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      const bouton = f.querySelector('button');
      bouton.disabled = true;
      const identifiants = { email: f.email.value.trim(), password: f.mdp.value };
      const { data, error } = creation
        ? await db.auth.signUp(identifiants)
        : await db.auth.signInWithPassword(identifiants);
      bouton.disabled = false;
      if (error) return dessiner(ERREURS[error.message] || error.message);
      if (creation && !data.session) {
        creation = false;
        dessiner('Compte créé. Ouvre le lien reçu par email pour confirmer, puis connecte-toi ici.');
      }
      // Si la connexion a marché, app.js affiche automatiquement l'accueil
    };
  }

  dessiner();
}
