-- Storage bucket for board media (Miro-style): images are uploaded as files and the board
-- doc stores only the URL, instead of embedding base64. Keeps boards light at any scale.
insert into storage.buckets (id, name, public) values ('board-media', 'board-media', true)
  on conflict (id) do nothing;

-- Access: any signed-in user can upload; the bucket is public so reads work via the public URL.
drop policy if exists "board_media_insert" on storage.objects;
drop policy if exists "board_media_read" on storage.objects;
drop policy if exists "board_media_delete" on storage.objects;
create policy "board_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'board-media');
create policy "board_media_read" on storage.objects for select to public
  using (bucket_id = 'board-media');
create policy "board_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'board-media');
