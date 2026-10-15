# Compta Chantiers

Petite appli (PWA) pour suivre les dépenses et les gains par chantier.
À installer sur iPhone depuis Safari : Partager → « Sur l'écran d'accueil ».

## Organisation des fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page unique de l'appli (en-tête, bandeau d'installation, onglets) |
| `style.css` | Toute l'apparence (couleurs en haut du fichier) |
| `js/config.js` | **Adresse et clé Supabase** |
| `js/app.js` | Démarrage, connexion, liste des écrans |
| `js/utils.js` | Catégories, statuts, formats (€, dates), totaux |
| `js/pages/*.js` | Un fichier par écran (accueil, bilan, chantiers, clients, mouvements, frais généraux, déplacement, export, calendrier, réglages, aide) |
| `js/pages/aide.js` | Le guide d'utilisation : facile à compléter (liste RUBRIQUES) |
| `api/ics.js` | Fabrique l'événement pour le calendrier de l'iPhone (fonction Vercel) |
| `supabase/schema.sql` | Création des tables (à coller dans Supabase > SQL Editor) |
| `supabase/mode_paiement.sql` | Ajout du mode de paiement (à coller une fois dans SQL Editor) |
| `supabase/justificatifs.sql` | Stockage des photos et PDF de factures (à coller une fois dans SQL Editor) |
| `js/justificatifs.js` | Compression des photos, envoi et ouverture des justificatifs |
| `sw.js`, `manifest.webmanifest`, `icons/` | Ce qui rend l'appli installable |
| `lib/supabase.js` | Bibliothèque Supabase (ne pas modifier) |
| `lib/xlsx-style.min.js` | Bibliothèque Excel (avec mise en forme) pour la sauvegarde (ne pas modifier) |
| `js/sauvegarde.js` | Fabrique la sauvegarde Excel mise en forme (couleurs, totaux, onglet Résumé) |

## Modifier les catégories

Dans `js/utils.js`, objet `CATEGORIES`. Ne change pas les codes de gauche
(ex. `pieces`) si des mouvements existent déjà, change seulement le texte affiché.

## Mise en route

1. Supabase > SQL Editor : coller `supabase/schema.sql` et cliquer Run.
2. Mettre l'URL du projet et la clé publishable/anon dans `js/config.js`.
3. Vercel : importer ce dépôt GitHub (aucun réglage, c'est un site statique).
