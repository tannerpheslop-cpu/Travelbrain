-- Performance indexes for the most common query patterns.
-- These speed up the React Query data fetching hooks.

-- saved_items: Horizon page fetches by (user_id, is_archived) ordered by created_at
CREATE INDEX IF NOT EXISTS idx_saved_items_user_active
  ON saved_items (user_id, is_archived, created_at DESC);

-- saved_items: location-based queries for clustering and suggestions
CREATE INDEX IF NOT EXISTS idx_saved_items_user_location
  ON saved_items (user_id, location_country_code)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

-- trips: Trips page fetches by owner_id ordered by updated_at
CREATE INDEX IF NOT EXISTS idx_trips_owner_updated
  ON trips (owner_id, updated_at DESC);

-- trips: favorited trip lookup (one per user)
CREATE INDEX IF NOT EXISTS idx_trips_owner_favorited
  ON trips (owner_id)
  WHERE is_favorited = true;

-- trip_destinations: Trip overview fetches by trip_id ordered by sort_order
CREATE INDEX IF NOT EXISTS idx_trip_destinations_trip_sort
  ON trip_destinations (trip_id, sort_order);

-- destination_items: Destination detail fetches by destination_id ordered by sort_order
CREATE INDEX IF NOT EXISTS idx_destination_items_dest_sort
  ON destination_items (destination_id, sort_order);

-- destination_items: item lookup for cascade deletes and trip-item mappings
CREATE INDEX IF NOT EXISTS idx_destination_items_item
  ON destination_items (item_id);

-- trip_general_items: Trip general section fetches by trip_id
CREATE INDEX IF NOT EXISTS idx_trip_general_items_trip
  ON trip_general_items (trip_id, sort_order);

-- trip_general_items: item lookup for cascade deletes
CREATE INDEX IF NOT EXISTS idx_trip_general_items_item
  ON trip_general_items (item_id);

-- comments: fetch by (trip_id, item_id) for item comment threads
CREATE INDEX IF NOT EXISTS idx_comments_trip_item
  ON comments (trip_id, item_id, created_at);

-- votes: fetch by (trip_id, item_id) for vote counts
CREATE INDEX IF NOT EXISTS idx_votes_trip_item
  ON votes (trip_id, item_id);

-- trip_routes: route overview fetches by trip_id
CREATE INDEX IF NOT EXISTS idx_trip_routes_trip_sort
  ON trip_routes (trip_id, sort_order);
