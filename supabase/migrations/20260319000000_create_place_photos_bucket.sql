-- Create the place-photos storage bucket for persisted Google Places photos
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do nothing;

-- Allow anyone to read place photos (public bucket)
create policy "Public read access for place photos"
  on storage.objects for select
  to public
  using (bucket_id = 'place-photos');

-- Only service role can write (Edge Function uses admin client)
-- No insert/delete policies for authenticated users needed
