-- Create saved_items table
create table if not exists saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('url', 'screenshot', 'manual')),
  source_url text,
  image_url text,
  title text not null,
  description text,
  site_name text,
  city text,
  category text not null default 'general' check (category in ('restaurant', 'activity', 'hotel', 'transit', 'general')),
  notes text,
  tags text[],
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table saved_items enable row level security;

-- Users can read their own saved items
create policy "Users can read own saved_items"
  on saved_items for select
  using (auth.uid() = user_id);

-- Users can insert their own saved items
create policy "Users can insert own saved_items"
  on saved_items for insert
  with check (auth.uid() = user_id);

-- Users can update their own saved items
create policy "Users can update own saved_items"
  on saved_items for update
  using (auth.uid() = user_id);

-- Users can delete their own saved items
create policy "Users can delete own saved_items"
  on saved_items for delete
  using (auth.uid() = user_id);
