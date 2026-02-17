-- Create the screenshots storage bucket
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "Users can upload own screenshots"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow anyone to read screenshots (public bucket for image display)
create policy "Public read access for screenshots"
  on storage.objects for select
  to public
  using (bucket_id = 'screenshots');

-- Allow users to delete their own screenshots
create policy "Users can delete own screenshots"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
