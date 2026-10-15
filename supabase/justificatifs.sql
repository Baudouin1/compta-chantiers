-- ============================================================
-- Justificatifs (photos de tickets, factures PDF)
-- À coller en entier dans Supabase > SQL Editor > New query > Run
-- (on peut le relancer sans risque)
-- ============================================================

-- Dossier de stockage privé : 5 Mo maximum par fichier, seulement des photos JPEG et des PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('justificatifs', 'justificatifs', false, 5242880, array['image/jpeg', 'application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Chaque utilisateur ne voit et ne touche que ses propres fichiers
-- (ils sont rangés dans un dossier à son nom : <id utilisateur>/...)
drop policy if exists "justificatifs lecture" on storage.objects;
drop policy if exists "justificatifs ajout" on storage.objects;
drop policy if exists "justificatifs modification" on storage.objects;
drop policy if exists "justificatifs suppression" on storage.objects;

create policy "justificatifs lecture" on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "justificatifs ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "justificatifs modification" on storage.objects for update to authenticated
  using (bucket_id = 'justificatifs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "justificatifs suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'justificatifs' and (storage.foldername(name))[1] = auth.uid()::text);
