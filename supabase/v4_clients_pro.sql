-- Client professionnel ou particulier (+ n° SIRET pour les pros)
alter table clients add column if not exists type_client text not null default 'particulier';
alter table clients add column if not exists siret text;
