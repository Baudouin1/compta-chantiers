-- Smiley choisi pour chaque bouton rapide (ex. 🛢️ pour l'huile)
alter table boutons_rapides add column if not exists emoji text;
