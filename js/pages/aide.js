// Guide d'utilisation de l'appli
import { titre } from '../utils.js';

// Chaque rubrique : [titre, contenu HTML]. Facile à compléter.
const RUBRIQUES = [
  ['🚀 Bien démarrer', `
    <ol class="etapes">
      <li><strong>Réglages</strong> : vérifie le <em>coût au km</em> (0,60 € par défaut).</li>
      <li><strong>Clients</strong> : crée tes clients avec le nom du bateau, le port et le
        <em>trajet par défaut</em> (destination + km aller-retour).</li>
      <li><strong>Chantiers</strong> : crée un chantier pour un client (ex. « Antifouling printemps »).</li>
      <li>Sur la page du chantier, ajoute tes <strong>dépenses</strong> (rouge) et tes <strong>gains</strong> (vert).
        La marge se calcule toute seule.</li>
    </ol>`],

  ['➕ Ajouter une dépense ou un gain', `
    <p>Sur un chantier, touche <strong>− Dépense</strong> ou <strong>+ Gain</strong>.
      Tape le montant, choisis la catégorie, c'est tout. La date du jour est déjà remplie.</p>
    <ul>
      <li><strong>Sous-traitance</strong> : indique le nom du sous-traitant.</li>
      <li><strong>Refacturable au client</strong> : coche-la pour un achat fait pour le client
        (pièce, produit…). Le total « À refacturer » te rappelle quoi mettre sur la facture.</li>
      <li>Pour <strong>corriger ou supprimer</strong> un mouvement, touche-le dans la liste.</li>
    </ul>`],

  ['📎 Factures et tickets', `
    <p>Dans une dépense ou un gain, touche <strong>📷 Ajouter une photo ou un PDF</strong> :
      prends le ticket en photo, ou choisis un PDF (reçu par mail, dans Fichiers…).</p>
    <ul>
      <li>Les photos sont <strong>allégées automatiquement</strong> (≈ 250 Ko) : assez pour en stocker des milliers.</li>
      <li>Les PDF sont limités à <strong>5 Mo</strong>. Si c'est trop lourd, prends plutôt une photo du document.</li>
      <li>Sur la page du chantier, la rubrique <strong>📎 Factures et tickets</strong> les regroupe tous.</li>
      <li>Place utilisée : en bas de <strong>Réglages</strong>.</li>
    </ul>`],

  ['⚡ Boutons rapides', `
    <p><strong>🚗 Aller-retour</strong> : crée la dépense de déplacement en 2 touchers avec le trajet du client.
      Tu peux choisir un autre trajet enregistré ou en taper un nouveau (et l'enregistrer pour la prochaine fois).</p>
    <p><strong>Tes propres boutons</strong> (« Péage », « Plein de produits »…) : crée-les dans
      Réglages › Boutons rapides, ou avec le <strong>＋</strong> sur un chantier.
      Ils ouvrent une dépense déjà remplie : il ne reste qu'à vérifier le montant.</p>`],

  ['🏷️ Les statuts d\'un chantier', `
    <ul>
      <li><strong>Devis</strong> : pas encore accepté.</li>
      <li><strong>En cours</strong> : travaux en cours, il apparaît sur l'accueil.</li>
      <li><strong>Terminé</strong> : travaux finis, <em>en attente de paiement</em> (rappel sur l'accueil).</li>
      <li><strong>Payé</strong> : tout est réglé, le chantier est archivé.</li>
    </ul>
    <p>Change le statut directement en haut de la page du chantier.</p>`],

  ['🧾 Frais généraux', `
    <p>Pour une dépense qui n'est liée à aucun chantier (assurance, outillage, carburant du camion…) :
      sur l'accueil, touche <strong>− Dépense</strong> et laisse « Aucun (frais généraux) » dans le choix du chantier.
      Tu les retrouves dans <strong>Accueil › Frais généraux</strong>.</p>`],

  ['📅 Calendrier', `
    <p>Sur un chantier, touche <strong>Ajouter au calendrier</strong>
      (ou <strong>Rendez-vous</strong> sur une fiche client).
      Choisis « Journée(s) » pour un chantier sur plusieurs jours, ou « Rendez-vous » avec une heure.</p>
    <p>Safari s'ouvre : touche <strong>Autoriser</strong>, puis <strong>Ajouter au calendrier</strong>,
      et reviens dans l'appli.</p>
    <p class="astuce">L'événement est une copie : si la date change, modifie-le aussi dans ton calendrier.</p>`],

  ['📊 Bilan', `
    <p>Sur l'accueil, touche <strong>Voir le bilan de l'année</strong> : la marge mois par mois,
      où part l'argent (par catégorie) et tes chantiers les plus rentables.</p>`],

  ['🧮 Micro-entreprise : déclaration URSSAF', `
    <p>Dans <strong>Accueil › Voir le bilan</strong>, la rubrique <em>Chiffre d'affaires à déclarer</em>
      donne le total encaissé par mois et par trimestre : c'est ce montant qu'on déclare à l'URSSAF.</p>
    <p>Pour le <strong>livre des recettes</strong> : Réglages › Export CSV › « Recettes seulement ».
      Chaque recette doit avoir son <strong>mode de paiement</strong> (virement, chèque, espèces…) :
      l'appli le demande à chaque gain. Mets le numéro de facture dans la description.</p>
    <p class="astuce">Pense à bien saisir chaque paiement reçu (facture, acompte) avec la <strong>date
      où l'argent est arrivé</strong>.</p>`],

  ['📤 Envoyer au comptable', `
    <p><strong>Réglages › Export CSV</strong> : choisis la période (ex. « Mois dernier »),
      touche <em>Préparer le fichier</em> puis <em>Envoyer le fichier</em> (mail, WhatsApp…).
      Le fichier s'ouvre dans Excel.</p>
    <p>Pour un seul chantier : bouton <strong>Exporter (CSV)</strong> en bas de sa page.</p>`],

  ['💾 Sauvegarde', `
    <p>Tes données sont enregistrées en ligne : rien n'est perdu si tu changes de téléphone,
      il suffit de te reconnecter.</p>
    <p>Par sécurité, une fois par mois : <strong>Réglages › Sauvegarde complète</strong>,
      puis envoie-toi le fichier par mail. C'est un fichier <strong>Excel</strong> qu'on peut ouvrir
      et lire (un onglet pour les mouvements, les chantiers, les clients…).</p>`],

  ['📱 Installer, mettre à jour', `
    <ul>
      <li><strong>Installer</strong> : ouvre l'adresse de l'appli dans Safari, touche
        <strong>•••</strong> › <strong>Partager</strong> › <strong>Sur l'écran d'accueil</strong>.</li>
      <li><strong>Mettre à jour</strong> : rien à faire. Les nouveautés arrivent quand tu fermes
        et rouvres l'appli.</li>
      <li><strong>Mot de passe oublié</strong> : lien sur l'écran de connexion.</li>
      <li>Il faut <strong>du réseau</strong> pour enregistrer (même faible).</li>
    </ul>`],
];

export function afficher(main) {
  titre("Guide d'utilisation", '/reglages');
  main.innerHTML = `
    <p class="astuce">👋 L'appli sert à suivre ce que te coûte et te rapporte chaque chantier.
      Touche une rubrique pour l'ouvrir.</p>
    ${RUBRIQUES.map(([t, contenu], i) => `
      <details class="carte" ${i === 0 ? 'open' : ''}>
        <summary>${t}</summary>
        ${contenu}
      </details>`).join('')}`;
}
