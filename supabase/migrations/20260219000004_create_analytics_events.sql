create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  properties jsonb,
  created_at timestamptz not null default now()
);

alter table analytics_events enable row level security;

-- Users can insert their own events (or null user_id for anonymous)
create policy "Users can insert analytics events"
  on analytics_events for insert
  with check (
    user_id is null or auth.uid() = user_id
  );

-- Users can only read their own events (service role reads all for dashboards)
create policy "Users can read own analytics events"
  on analytics_events for select
  using (auth.uid() = user_id);
