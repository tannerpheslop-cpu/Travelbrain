-- Create routes table — ordered collections of saves with their own identity.
-- See /docs/ROUTE-CONTEXT.md for the full specification.

CREATE TABLE routes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id),
  name             text NOT NULL,
  description      text,
  source_url       text,
  source_title     text,
  source_platform  text,
  source_thumbnail text,
  location_scope   text,
  item_count       integer DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_routes_user ON routes(user_id);

-- Junction table: saves within a route, with ordering.
CREATE TABLE route_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id       uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  saved_item_id  uuid NOT NULL REFERENCES saved_items(id) ON DELETE CASCADE,
  route_order    integer NOT NULL,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(route_id, saved_item_id)
);

CREATE INDEX idx_route_items_route ON route_items(route_id);
CREATE INDEX idx_route_items_saved_item ON route_items(saved_item_id);

-- Denormalized route_id on saved_items for fast lookups.
-- A save belongs to zero or one Route.
ALTER TABLE saved_items
ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saved_items_route ON saved_items(route_id);

-- RLS: routes
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own routes"
  ON routes FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own routes"
  ON routes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routes"
  ON routes FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own routes"
  ON routes FOR DELETE USING (auth.uid() = user_id);

-- RLS: route_items (user must own the parent route)
ALTER TABLE route_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own route items"
  ON route_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM routes WHERE routes.id = route_items.route_id AND routes.user_id = auth.uid()));

CREATE POLICY "Users can insert own route items"
  ON route_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM routes WHERE routes.id = route_items.route_id AND routes.user_id = auth.uid()));

CREATE POLICY "Users can update own route items"
  ON route_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM routes WHERE routes.id = route_items.route_id AND routes.user_id = auth.uid()));

CREATE POLICY "Users can delete own route items"
  ON route_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM routes WHERE routes.id = route_items.route_id AND routes.user_id = auth.uid()));
