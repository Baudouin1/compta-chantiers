-- Usure du véhicule au km (ajoutée au coût de l'essence pour les aller-retours)
alter table reglages add column if not exists usure_km numeric(6,3) not null default 0;
