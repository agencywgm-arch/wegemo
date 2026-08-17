-- Create a PUBLIC bucket named `assets` in Storage first (Dashboard → Storage → New
-- bucket → tick "Public"), then run these policies.
drop policy if exists "Public read assets" on storage.objects;
create policy "Public read assets" on storage.objects for select using (bucket_id = 'assets');
drop policy if exists "Auth upload assets" on storage.objects;
create policy "Auth upload assets" on storage.objects for insert with check (bucket_id = 'assets' and auth.role() = 'authenticated');
drop policy if exists "Auth update assets" on storage.objects;
create policy "Auth update assets" on storage.objects for update using (bucket_id = 'assets' and auth.role() = 'authenticated');
drop policy if exists "Auth delete assets" on storage.objects;
create policy "Auth delete assets" on storage.objects for delete using (bucket_id = 'assets' and auth.role() = 'authenticated');
