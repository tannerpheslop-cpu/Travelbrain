export type SourceType = 'url' | 'screenshot' | 'manual'

export type Category = 'restaurant' | 'activity' | 'hotel' | 'transit' | 'general'

export type TripStatus = 'aspirational' | 'planning' | 'scheduled'

export type SharePrivacy = 'city_only' | 'city_dates' | 'full'

export type CompanionRole = 'companion'

export interface User {
  id: string
  email: string
  display_name: string | null
  created_at: string
}

export interface SavedItem {
  id: string
  user_id: string
  source_type: SourceType
  source_url: string | null
  image_url: string | null
  places_photo_url: string | null
  title: string
  description: string | null
  site_name: string | null
  /** Structured location fields — replaced the old free-text `city` column */
  location_name: string | null     // e.g. "Tokyo, Japan"
  location_lat: number | null
  location_lng: number | null
  location_place_id: string | null // Google Place ID
  location_country: string | null      // e.g. "Japan"
  location_country_code: string | null // e.g. "JP"
  location_name_en: string | null      // English place name (e.g. "Chongqing, China")
  location_name_local: string | null   // Local language name (e.g. "重庆市")
  category: Category
  notes: string | null
  tags: string[] | null
  is_archived: boolean
  image_display: 'featured' | 'thumbnail' | 'none' | null
  image_source: string | null
  image_credit_name: string | null
  image_credit_url: string | null
  image_options: Array<{ url: string; credit_name: string; credit_url: string }> | null
  image_option_index: number | null
  first_viewed_at: string | null
  left_recent: boolean
  location_locked: boolean
  location_precision: 'precise' | 'city' | 'country' | null
  has_pending_extraction: boolean
  source_title: string | null
  source_thumbnail: string | null
  source_author: string | null
  source_platform: string | null
  enrichment_source: string | null
  photo_attribution: string | null
  created_at: string
}

/** An extracted item from a URL (listicle, itinerary, guide). */
export interface ExtractedItem {
  name: string
  category: Category
  location_name: string | null
  description: string | null
  source_order: number
  enriched?: boolean
  place_id?: string
  photo_url?: string | null
  latitude?: number
  longitude?: number
  formatted_address?: string
}

/** A pending extraction result awaiting user review. */
export interface PendingExtraction {
  id: string
  user_id: string
  source_entry_id: string
  source_url: string
  extracted_items: ExtractedItem[]
  content_type: 'listicle' | 'itinerary' | 'guide'
  status: 'pending' | 'reviewed' | 'expired'
  created_at: string
  expires_at: string
}

export type CoverImageSource = 'destination' | 'trip_name' | 'user_upload'

export interface Trip {
  id: string
  owner_id: string
  title: string
  status: TripStatus
  start_date: string | null
  end_date: string | null
  cover_image_url: string | null
  cover_image_source: CoverImageSource | null
  share_token: string | null
  share_privacy: SharePrivacy | null
  forked_from_trip_id: string | null
  is_featured: boolean
  is_favorited: boolean
  map_collapsed: boolean | null
  notes: TripNote[]
  created_at: string
  updated_at: string
}

export interface TripNote {
  id: string
  text: string
  created_at: string
  completed?: boolean
  sort_order?: number
}

export interface TripDestination {
  id: string
  trip_id: string
  location_name: string
  location_lat: number
  location_lng: number
  location_place_id: string
  location_country: string
  location_country_code: string
  location_name_en: string | null
  location_name_local: string | null
  location_type: 'city' | 'country' | 'region'
  proximity_radius_km: number
  image_url: string | null
  image_source: string | null
  image_credit_name: string | null
  image_credit_url: string | null
  start_date: string | null
  end_date: string | null
  notes: string | null
  route_id: string | null
  sort_order: number
  created_at: string
}

export interface TripRoute {
  id: string
  trip_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface TripItem {
  id: string
  trip_id: string
  item_id: string
  day_index: number | null
  sort_order: number
}

export interface Companion {
  id: string
  trip_id: string
  user_id: string
  role: CompanionRole
  invited_at: string
}

export interface Comment {
  id: string
  trip_id: string
  item_id: string
  user_id: string
  body: string
  created_at: string
}

export interface Vote {
  trip_id: string
  item_id: string
  user_id: string
}

export type TagType = 'category' | 'custom'

export interface ItemTag {
  id: string
  item_id: string
  tag_name: string
  tag_type: TagType
  user_id: string
  created_at: string
}
