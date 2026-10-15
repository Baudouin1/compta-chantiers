-- ============================================================
-- Compta Chantiers : création des tables
-- À coller en entier dans Supabase > SQL Editor > New query > Run
-- (on peut le relancer sans risque, il ne supprime rien)
-- ============================================================

-- Clients
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nom text not null,
  telephone text,
  email text,
  adresse text,
  bateau text,
  port text,
  notes text,
  -- trajet par défaut (pour le bouton "Aller-retour")
  trajet_destination text,
  trajet_km numeric(8,1),
  trajet_forfait numeric(10,2),
  created_at timestamptz not null default now()
);

-- Chantiers
create table if not exists chantiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid not null references clients on delete restrict,
  nom text not null,
  description text,
  date_debut date,
  date_fin date,
  statut text not null default 'devis' check (statut in ('devis', 'en_cours', 'termine', 'paye')),
  created_at timestamptz not null default now()
);

-- Mouvements (dépenses et gains)
-- chantier_id vide = frais généraux (pas liés à un chantier)
create table if not exists mouvements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  chantier_id uuid references chantiers on delete cascade,
  date date not null default current_date,
  sens text not null check (sens in ('depense', 'gain')),
  categorie text not null,
  montant numeric(10,2) not null check (montant >= 0),
  description text,
  note text,
  refacturable boolean not null default false,
  sous_traitant text,
  photo_path text,
  created_at timestamptz not null default now()
);

-- Trajets enregistrés (étape 2)
create table if not exists trajets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  destination text not null,
  km numeric(8,1),
  forfait numeric(10,2),
  created_at timestamptz not null default now()
);

-- Boutons rapides personnalisés (étape 2)
create table if not exists boutons_rapides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  libelle text not null,
  categorie text not null default 'autre',
  montant numeric(10,2) not null default 0,
  ordre int not null default 0,
  created_at timestamptz not null default now()
);

-- Réglages (une ligne par utilisateur)
create table if not exists reglages (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  cout_km numeric(6,3) not null default 0.60
);

create index if not exists mouvements_chantier_idx on mouvements (chantier_id);
create index if not exists mouvements_date_idx on mouvements (date);
create index if not exists chantiers_client_idx on chantiers (client_id);

-- ------------------------------------------------------------
-- Sécurité : chaque utilisateur ne voit que ses propres données
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients', 'chantiers', 'mouvements', 'trajets', 'boutons_rapides', 'reglages'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "mes donnees" on %I', t);
    execute format('create policy "mes donnees" on %I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;
