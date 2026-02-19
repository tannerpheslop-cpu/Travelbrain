-- Tracks email invitations sent to people who don't have an account yet.
-- When they sign up, a trigger (or the app on first login) can convert this
-- into a real companions row.

create table if not exists pending_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  email text not null,
  invited_at timestamptz not null default now(),
  unique (trip_id, email)
);

alter table pending_invites enable row level security;

-- Trip owners can read pending invites for their trips
create policy "Trip owners can read pending_invites"
  on pending_invites for select
  using (
    exists (
      select 1 from trips where trips.id = pending_invites.trip_id and trips.owner_id = auth.uid()
    )
  );

-- Trip owners can insert pending invites
create policy "Trip owners can insert pending_invites"
  on pending_invites for insert
  with check (
    auth.uid() = invited_by
    and exists (
      select 1 from trips where trips.id = pending_invites.trip_id and trips.owner_id = auth.uid()
    )
  );

-- Trip owners can delete pending invites (to revoke)
create policy "Trip owners can delete pending_invites"
  on pending_invites for delete
  using (
    exists (
      select 1 from trips where trips.id = pending_invites.trip_id and trips.owner_id = auth.uid()
    )
  );
