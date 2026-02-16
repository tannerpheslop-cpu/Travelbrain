export type SourceType = 'url' | 'screenshot' | 'manual'

export type Category = 'restaurant' | 'activity' | 'hotel' | 'transit' | 'general'

export type TripStatus = 'draft' | 'scheduled'

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
  title: string
  description: string | null
  site_name: string | null
  city: string | null
  category: Category
  notes: string | null
  tags: string[] | null
  is_archived: boolean
  created_at: string
}

export interface Trip {
  id: string
  owner_id: string
  title: string
  status: TripStatus
  start_date: string | null
  end_date: string | null
  cover_image_url: string | null
  share_token: string | null
  share_privacy: SharePrivacy | null
  forked_from_trip_id: string | null
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
