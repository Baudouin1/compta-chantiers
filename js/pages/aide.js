// Guide d'utilisation de l'appli
import { titre } from '../utils.js';

// Chaque rubrique : [titre, contenu HTML]. Facile à compléter.
const RUBRIQUES = [
  ['🚀 Bien démarrer', `
    <ol class="etapes">
      <li><strong>Réglages › Mes tarifs</strong> : tes taux horaires (nettoyage, entretien), les consommables
        (% et minimum), le prix du km facturé. Ils s'appliquent à tous les clients.</li>
      <li><strong>Clients</strong> : crée chaque client avec son bateau (ou ses bateaux, séparés par une virgule)
        et son <em>mode de facturation</em> : à l'heure, forfait par bateau ou sur devis.
        Si un client a un prix différent, change ses tarifs dans sa fiche.</li>
      <li>Après chaque passage : <strong>+ Nouvelle intervention</strong>. Tu mets les heures (une case pour
        les heures, une pour les minutes : 1 h 50 = « 1 » et « 50 »), l'appli calcule
        la facture, ton bénéfice net et ton taux horaire net.</li>
      <li>Ajoute tes <strong>frais réels</strong> sur l'intervention (produits, déplacement…) avec « − Dépense »
        ou les boutons rapides.</li>
    </ol>`],

  ['⏱️ Une intervention, comment ça marche', `
    <ul>
      <li><strong>À l'heure</strong> : heures nettoyage × taux + heures entretien × taux
        + consommables (ex. 10 % avec un minimum de 17,16 €).</li>
      <li><strong>Forfait par bateau</strong> : coche les bateaux faits (et leurs heures) :
        nombre de bateaux × forfait.</li>
      <li><strong>Sur devis</strong> : numéro et montant du devis. Mets quand même tes heures pour connaître
        ton taux horaire net.</li>
      <li><strong>Km facturés</strong> : pour un déplacement que tu factures au client (ex. 120 km × 0,50 €).</li>
      <li><strong>Produits revendus</strong> : enregistre l'achat en dépense en cochant « Refacturé au client » :
        il est ajouté à la facture avec ta marge.</li>
      <li>Le <strong>montant facturé</strong> est calculé tout seul, mais tu peux le changer
        (heure offerte, geste commercial…).</li>
      <li>Les <strong>tarifs</strong> sont copiés au moment où tu crées l'intervention : si tu augmentes
        tes prix plus tard, les anciennes interventions ne bougent pas.</li>
    </ul>`],

  ['🎨 Les statuts (comme les couleurs de ton Excel)', `
    <ul>
      <li>🔴 <strong>À facturer</strong> : travail fait, facture pas encore envoyée.</li>
      <li>🟠 <strong>Facturé – en attente</strong> : facture envoyée, pas encore payée.</li>
      <li>🟢 <strong>Payé</strong> : l'appli te demande la date et le mode de paiement, et ajoute
        la recette (livre des recettes, URSSAF).</li>
      <li>⚪ <strong>À ne pas facturer</strong> : geste offert, remboursement…</li>
      <li>📝 Devis et 🔧 En cours : pour les plus gros chantiers.</li>
    </ul>
    <p>Sur l'intervention, le gros bouton bleu te fait passer à l'étape suivante.
      L'accueil te rappelle ce qu'il reste à facturer et à encaisser.</p>`],

  ['📎 Factures et tickets', `
    <p>Dans une dépense ou un gain, touche <strong>📷 Ajouter une photo ou un PDF</strong> :
      prends le ticket en photo, ou choisis un PDF (reçu par mail, dans Fichiers…).</p>
    <ul>
      <li>Les photos sont <strong>allégées automatiquement</strong> (≈ 250 Ko) : assez pour en stocker des milliers.</li>
      <li>Les PDF sont limités à <strong>5 Mo</strong>. Si c'est trop lourd, prends plutôt une photo du document.</li>
      <li>Sur la page de l'intervention, la rubrique <strong>📎 Factures et tickets</strong> les regroupe tous.</li>
      <li>Place utilisée : en bas de <strong>Réglages</strong>.</li>
    </ul>`],

  ['⚡ Boutons rapides', `
    <p><strong>🚗 Aller-retour</strong> : crée la dépense de déplacement en 2 touchers avec le trajet du client.
      Tu peux choisir un autre trajet enregistré ou en taper un nouveau (et l'enregistrer pour la prochaine fois).</p>
    <p>Le coût est calculé avec <em>ton coût au km</em> (Réglages › Mes tarifs) : c'est un frais réel.</p>
    <p><strong>Tes propres boutons</strong> (« Péage », « Plein de produits »…) : crée-les dans
      Réglages › Boutons rapides, ou avec le <strong>＋</strong> sur une intervention.
      Ils ouvrent une dépense déjà remplie : il ne reste qu'à vérifier le montant.</p>`],

  ['🧾 Frais généraux', `
    <p>Pour une dépense qui n'est liée à aucune intervention (assurance, outillage, carburant du camion…) :
      sur l'accueil, touche <strong>− Dépense</strong> et laisse « Aucun (frais généraux) » dans le choix de l'intervention.
      Tu les retrouves dans <strong>Accueil › Frais généraux</strong>.</p>`],

  ['📅 Calendrier', `
    <p>Sur une intervention, touche <strong>Ajouter au calendrier</strong>
      (ou <strong>Rendez-vous</strong> sur une fiche client).
      Choisis « Journée(s) » pour un chantier sur plusieurs jours, ou « Rendez-vous » avec une heure.</p>
    <p>Safari s'ouvre : touche <strong>Autoriser</strong>, puis <strong>Ajouter au calendrier</strong>,
      et reviens dans l'appli.</p>
    <p class="astuce">L'événement est une copie : si la date change, modifie-le aussi dans ton calendrier.</p>`],

  ['📊 Bilan', `
    <p>Sur l'accueil, touche <strong>Voir le bilan de l'année</strong> : la marge mois par mois,
      où part l'argent (par catégorie) et tes clients les plus rentables.</p>`],

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
    <p>Pour une seule intervention : bouton <strong>Exporter (CSV)</strong> en bas de sa page.</p>`],

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
    <p class="astuce">👋 L'appli sert à suivre ce que te coûte et te rapporte chaque intervention.
      Touche une rubrique pour l'ouvrir.</p>
    ${RUBRIQUES.map(([t, contenu], i) => `
      <details class="carte" ${i === 0 ? 'open' : ''}>
        <summary>${t}</summary>
        ${contenu}
      </details>`).join('')}`;
}
