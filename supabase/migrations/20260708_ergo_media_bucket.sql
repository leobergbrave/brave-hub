-- Storage bucket público para fotos e vídeos dos ergômetros (combos).
-- Rodar manualmente no SQL Editor do Supabase.

insert into storage.buckets (id, name, public)
values ('ergo-media', 'ergo-media', true)
on conflict (id) do update set public = true;

-- Leitura é pública (bucket public = true). Abaixo, permissão de escrita pelo painel.
drop policy if exists "ergo-media insert" on storage.objects;
drop policy if exists "ergo-media update" on storage.objects;
drop policy if exists "ergo-media delete" on storage.objects;

create policy "ergo-media insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'ergo-media');

create policy "ergo-media update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'ergo-media');

create policy "ergo-media delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'ergo-media');
