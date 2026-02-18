-- Create trips table
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled')),
  start_date date,
  end_date date,
  cover_image_url text,
  share_token text unique,
  share_privacy text check (share_privacy in ('city_only', 'city_dates', 'full')),
  forked_from_trip_id uuid references trips(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table trips enable row level security;

-- Users can read their own trips
create policy "Users can read own trips"
  on trips for select
  using (auth.uid() = owner_id);

-- Users can insert their own trips
create policy "Users can insert own trips"
  on trips for insert
  with check (auth.uid() = owner_id);

-- Users can update their own trips
create policy "Users can update own trips"
  on trips for update
  using (auth.uid() = owner_id);

-- Users can delete their own trips
create policy "Users can delete own trips"
  on trips for delete
  using (auth.uid() = owner_id);

-- Anyone can read trips with a share_token (for public sharing)
create policy "Anyone can read shared trips"
  on trips for select
  using (share_token is not null);

-- Create trip_items join table
create table if not exists trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  item_id uuid not null references saved_items(id) on delete cascade,
  day_index integer,
  sort_order integer not null default 0
);

-- Enable RLS on trip_items
alter table trip_items enable row level security;

-- Trip owners can read trip_items for their trips
create policy "Trip owners can read trip_items"
  on trip_items for select
  using (
    exists (
      select 1 from trips where trips.id = trip_items.trip_id and trips.owner_id = auth.uid()
    )
  );

-- Trip owners can insert trip_items
create policy "Trip owners can insert trip_items"
  on trip_items for insert
  with check (
    exists (
      select 1 from trips where trips.id = trip_items.trip_id and trips.owner_id = auth.uid()
    )
  );

-- Trip owners can update trip_items
create policy "Trip owners can update trip_items"
  on trip_items for update
  using (
    exists (
      select 1 from trips where trips.id = trip_items.trip_id and trips.owner_id = auth.uid()
    )
  );

-- Trip owners can delete trip_items
create policy "Trip owners can delete trip_items"
  on trip_items for delete
  using (
    exists (
      select 1 from trips where trips.id = trip_items.trip_id and trips.owner_id = auth.uid()
    )
  );
