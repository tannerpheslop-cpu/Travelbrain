-- ── companions ────────────────────────────────────────────────────────────────

create table if not exists companions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'companion' check (role in ('companion')),
  invited_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

alter table companions enable row level security;

-- Trip owners can read companions for their trips
create policy "Trip owners can read companions"
  on companions for select
  using (
    exists (
      select 1 from trips where trips.id = companions.trip_id and trips.owner_id = auth.uid()
    )
  );

-- Companions can read their own companion row (so they can confirm membership)
create policy "Companions can read own row"
  on companions for select
  using (auth.uid() = user_id);

-- Trip owners can insert companions
create policy "Trip owners can insert companions"
  on companions for insert
  with check (
    exists (
      select 1 from trips where trips.id = companions.trip_id and trips.owner_id = auth.uid()
    )
  );

-- Trip owners can delete companions
create policy "Trip owners can delete companions"
  on companions for delete
  using (
    exists (
      select 1 from trips where trips.id = companions.trip_id and trips.owner_id = auth.uid()
    )
  );

-- ── Allow companions to read trips they've been invited to ────────────────────

-- Companions can read trips they're invited to
create policy "Companions can read invited trips"
  on trips for select
  using (
    exists (
      select 1 from companions where companions.trip_id = trips.id and companions.user_id = auth.uid()
    )
  );

-- Companions can read trip_items for trips they're invited to
create policy "Companions can read trip_items"
  on trip_items for select
  using (
    exists (
      select 1 from companions where companions.trip_id = trip_items.trip_id and companions.user_id = auth.uid()
    )
  );

-- ── comments ──────────────────────────────────────────────────────────────────

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  item_id uuid not null references saved_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table comments enable row level security;

-- Trip owners can read all comments on their trips
create policy "Trip owners can read comments"
  on comments for select
  using (
    exists (
      select 1 from trips where trips.id = comments.trip_id and trips.owner_id = auth.uid()
    )
  );

-- Companions can read comments on trips they're invited to
create policy "Companions can read comments"
  on comments for select
  using (
    exists (
      select 1 from companions where companions.trip_id = comments.trip_id and companions.user_id = auth.uid()
    )
  );

-- Authors can read their own comments
create policy "Authors can read own comments"
  on comments for select
  using (auth.uid() = user_id);

-- Companions can insert comments on trips they're invited to
create policy "Companions can insert comments"
  on comments for insert
  with check (
    auth.uid() = user_id
    and (
      -- trip owner
      exists (
        select 1 from trips where trips.id = comments.trip_id and trips.owner_id = auth.uid()
      )
      or
      -- companion
      exists (
        select 1 from companions where companions.trip_id = comments.trip_id and companions.user_id = auth.uid()
      )
    )
  );

-- Authors can delete their own comments
create policy "Authors can delete own comments"
  on comments for delete
  using (auth.uid() = user_id);

-- ── votes ─────────────────────────────────────────────────────────────────────

create table if not exists votes (
  trip_id uuid not null references trips(id) on delete cascade,
  item_id uuid not null references saved_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (trip_id, item_id, user_id)
);

alter table votes enable row level security;

-- Trip owners can read votes on their trips
create policy "Trip owners can read votes"
  on votes for select
  using (
    exists (
      select 1 from trips where trips.id = votes.trip_id and trips.owner_id = auth.uid()
    )
  );

-- Companions can read votes on trips they're invited to
create policy "Companions can read votes"
  on votes for select
  using (
    exists (
      select 1 from companions where companions.trip_id = votes.trip_id and companions.user_id = auth.uid()
    )
  );

-- Users can read their own votes
create policy "Users can read own votes"
  on votes for select
  using (auth.uid() = user_id);

-- Companions and owners can insert votes
create policy "Companions can insert votes"
  on votes for insert
  with check (
    auth.uid() = user_id
    and (
      exists (
        select 1 from trips where trips.id = votes.trip_id and trips.owner_id = auth.uid()
      )
      or
      exists (
        select 1 from companions where companions.trip_id = votes.trip_id and companions.user_id = auth.uid()
      )
    )
  );

-- Users can delete their own votes
create policy "Users can delete own votes"
  on votes for delete
  using (auth.uid() = user_id);
