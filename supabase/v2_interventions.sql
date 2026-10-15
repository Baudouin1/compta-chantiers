-- ============================================================
-- Version 2 : heures, tarifs, modes de facturation, statuts de règlement
-- À coller en entier dans Supabase > SQL Editor > New query > Run
-- (on peut le relancer sans risque, il ne supprime aucune donnée)
-- ============================================================

-- Tarifs généraux (Réglages > Mes tarifs)
alter table reglages add column if not exists taux_nettoyage numeric(8,2) not null default 37;
alter table reglages add column if not exists taux_entretien numeric(8,2) not null default 48;
alter table reglages add column if not exists conso_pct numeric(6,2) not null default 10;
alter table reglages add column if not exists conso_min numeric(8,2) not null default 17.16;
alter table reglages add column if not exists prix_km_facture numeric(6,3) not null default 0.50;
alter table reglages add column if not exists marge_produits numeric(6,2) not null default 0;

-- Clients : mode de facturation et tarifs propres
alter table clients add column if not exists mode_facturation text not null default 'heure';
alter table clients drop constraint if exists clients_mode_facturation_check;
alter table clients add constraint clients_mode_facturation_check
  check (mode_facturation in ('heure', 'forfait', 'devis'));
alter table clients add column if not exists taux_nettoyage numeric(8,2);
alter table clients add column if not exists taux_entretien numeric(8,2);
alter table clients add column if not exists conso_pct numeric(6,2);
alter table clients add column if not exists conso_min numeric(8,2);
alter table clients add column if not exists prix_km_facture numeric(6,3);
alter table clients add column if not exists marge_produits numeric(6,2);
alter table clients add column if not exists forfait_bateau numeric(10,2);

-- Chantiers / interventions : temps passé, facturation
alter table chantiers add column if not exists mode_facturation text not null default 'heure';
alter table chantiers drop constraint if exists chantiers_mode_facturation_check;
alter table chantiers add constraint chantiers_mode_facturation_check
  check (mode_facturation in ('heure', 'forfait', 'devis'));
alter table chantiers add column if not exists heures_nettoyage numeric(6,2);
alter table chantiers add column if not exists heures_entretien numeric(6,2);
alter table chantiers add column if not exists taux_nettoyage numeric(8,2);
alter table chantiers add column if not exists taux_entretien numeric(8,2);
alter table chantiers add column if not exists conso_pct numeric(6,2);
alter table chantiers add column if not exists conso_min numeric(8,2);
alter table chantiers add column if not exists consommables numeric(10,2);   -- vide = calcul automatique
alter table chantiers add column if not exists marge_produits numeric(6,2);
alter table chantiers add column if not exists km_factures numeric(8,1);
alter table chantiers add column if not exists prix_km numeric(6,3);
alter table chantiers add column if not exists forfait_bateau numeric(10,2);
alter table chantiers add column if not exists bateaux_faits jsonb;          -- forfait : [{nom, fait, heures}]
alter table chantiers add column if not exists numero_devis text;
alter table chantiers add column if not exists montant_devis numeric(10,2);
alter table chantiers add column if not exists numero_facture text;
alter table chantiers add column if not exists montant_facture numeric(10,2); -- vide = calcul automatique

-- Statuts de règlement (comme les couleurs de l'Excel)
alter table chantiers drop constraint if exists chantiers_statut_check;
update chantiers set statut = 'facture' where statut = 'termine';
alter table chantiers add constraint chantiers_statut_check
  check (statut in ('devis', 'en_cours', 'a_facturer', 'facture', 'paye', 'ne_pas_facturer'));

-- Mode de paiement (si le script mode_paiement.sql n'a pas été lancé)
alter table mouvements add column if not exists mode_paiement text;
