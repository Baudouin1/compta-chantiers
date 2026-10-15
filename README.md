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
| `js/pages/*.js` | Un fichier par écran |
| `supabase/schema.sql` | Création des tables (à coller dans Supabase > SQL Editor) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Ce qui rend l'appli installable |
| `lib/supabase.js` | Bibliothèque Supabase (ne pas modifier) |

## Modifier les catégories

Dans `js/utils.js`, objet `CATEGORIES`. Ne change pas les codes de gauche
(ex. `pieces`) si des mouvements existent déjà, change seulement le texte affiché.

## Mise en route

1. Supabase > SQL Editor : coller `supabase/schema.sql` et cliquer Run.
2. Mettre l'URL du projet et la clé publishable/anon dans `js/config.js`.
3. Vercel : importer ce dépôt GitHub (aucun réglage, c'est un site statique).
