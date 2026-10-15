// Écran de connexion (email + mot de passe)
import { db } from '../db.js';
import { esc, titre, surEnvoi, erreurLisible } from '../utils.js';

const ERREURS = {
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'Email not confirmed': "Email pas encore confirmé : clique sur le lien reçu par email, puis reviens ici.",
  'User already registered': 'Un compte existe déjà avec cet email. Connecte-toi.',
  'Signups not allowed for this instance': "La création de compte est fermée. Demande à l'administrateur.",
  'Password should be at least 6 characters.': 'Le mot de passe doit faire au moins 6 caractères.',
};

export function afficher(main) {
  let mode = 'connexion'; // 'connexion', 'creation' ou 'oubli'

  function dessiner(message = '') {
    const textes = {
      connexion: ['Connexion', 'Se connecter'],
      creation: ['Créer un compte', 'Créer le compte'],
      oubli: ['Mot de passe oublié', 'Recevoir un lien par email'],
    }[mode];

    main.innerHTML = `
      <form class="carte" id="form-connexion">
        <h2>${textes[0]}</h2>
        ${mode === 'oubli' ? '<p class="aide">Tu vas recevoir un email avec un lien pour choisir un nouveau mot de passe.</p>' : ''}
        <label>Email
          <input name="email" type="email" autocomplete="email" required>
        </label>
        ${mode !== 'oubli' ? `
        <label>Mot de passe
          <input name="mdp" type="password" minlength="6" required
            autocomplete="${mode === 'creation' ? 'new-password' : 'current-password'}">
        </label>` : ''}
        ${message ? `<p class="message">${esc(message)}</p>` : ''}
        <button class="btn principal" type="submit">${textes[1]}</button>
      </form>
      ${mode === 'connexion' ? `
        <button class="btn lien" data-mode="oubli">Mot de passe oublié ?</button>
        <button class="btn lien" data-mode="creation">Première fois ? Créer un compte</button>`
      : '<button class="btn lien" data-mode="connexion">‹ Retour à la connexion</button>'}`;

    main.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; dessiner(); });

    main.querySelector('#form-connexion').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      const bouton = f.querySelector('button');
      bouton.disabled = true;
      const email = f.email.value.trim();
      let resultat;
      if (mode === 'oubli') {
        // Le lien de l'email ramène sur l'appli avec "?reinit=1" pour choisir le nouveau mot de passe
        resultat = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/?reinit=1' });
      } else if (mode === 'creation') {
        resultat = await db.auth.signUp({ email, password: f.mdp.value });
      } else {
        resultat = await db.auth.signInWithPassword({ email, password: f.mdp.value });
      }
      bouton.disabled = false;
      const { data, error } = resultat;
      if (error) return dessiner(ERREURS[error.message] || erreurLisible(error));
      if (mode === 'oubli') {
        mode = 'connexion';
        dessiner('Email envoyé (pense à regarder les spams). Ouvre le lien reçu pour choisir un nouveau mot de passe.');
      } else if (mode === 'creation' && !data.session) {
        mode = 'connexion';
        dessiner('Compte créé. Ouvre le lien reçu par email pour confirmer, puis connecte-toi ici.');
      }
      // Si la connexion a marché, app.js affiche automatiquement l'accueil
    };
  }

  dessiner();
}

// Écran affiché après avoir cliqué sur le lien "mot de passe oublié" reçu par email
export function nouveauMotDePasse(main, fini) {
  titre('Nouveau mot de passe');
  main.innerHTML = `
    <form class="carte" id="form-mdp">
      <label>Nouveau mot de passe (6 caractères minimum)
        <input name="mdp" type="password" minlength="6" required autocomplete="new-password">
      </label>
      <label>Le retaper
        <input name="mdp2" type="password" minlength="6" required autocomplete="new-password">
      </label>
      <button class="btn principal" type="submit">Enregistrer</button>
    </form>`;

  surEnvoi(main.querySelector('#form-mdp'), async data => {
    if (data.mdp !== data.mdp2) throw new Error('Les deux mots de passe ne sont pas identiques.');
    const { error } = await db.auth.updateUser({ password: data.mdp });
    if (error) throw error;
    alert("Mot de passe changé. Si tu utilises l'appli installée sur l'écran d'accueil, ouvre-la et connecte-toi avec ce nouveau mot de passe.");
    fini();
  });
}
