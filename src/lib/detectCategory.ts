/**
 * Automatic category detection using Google Places types + keyword matching.
 *
 * Category is suggested, not forced — the user can override.
 * Priority: Place types (structured data) > keyword matching (fuzzy).
 *
 * Supports all 12 system categories from categories.ts.
 */

import type { SystemCategoryName } from './categories'
import { SYSTEM_CATEGORIES } from './categories'

export type Category = SystemCategoryName | 'general'

/** Set of all system category tagNames for quick lookup */
const SYSTEM_TAG_NAMES = new Set<string>(SYSTEM_CATEGORIES.map(c => c.tagName))

export function isSystemCategory(name: string): boolean {
  return SYSTEM_TAG_NAMES.has(name)
}

// ── Place-type → category mappings ──────────────────────────────────────────

const PLACE_TYPE_MAP: Record<string, SystemCategoryName> = {
  // restaurant
  restaurant: 'restaurant',
  food: 'restaurant',
  meal_delivery: 'restaurant',
  meal_takeaway: 'restaurant',
  // bar_nightlife
  bar: 'bar_nightlife',
  night_club: 'bar_nightlife',
  // coffee_cafe
  cafe: 'coffee_cafe',
  bakery: 'coffee_cafe',
  // hotel
  lodging: 'hotel',
  hotel: 'hotel',
  motel: 'hotel',
  hostel: 'hotel',
  campground: 'hotel',
  rv_park: 'hotel',
  // activity
  amusement_park: 'activity',
  aquarium: 'activity',
  stadium: 'activity',
  zoo: 'activity',
  bowling_alley: 'activity',
  movie_theater: 'activity',
  // attraction
  tourist_attraction: 'attraction',
  art_gallery: 'attraction',
  museum: 'attraction',
  church: 'attraction',
  hindu_temple: 'attraction',
  mosque: 'attraction',
  synagogue: 'attraction',
  place_of_worship: 'attraction',
  // shopping
  shopping_mall: 'shopping',
  clothing_store: 'shopping',
  department_store: 'shopping',
  jewelry_store: 'shopping',
  shoe_store: 'shopping',
  book_store: 'shopping',
  electronics_store: 'shopping',
  home_goods_store: 'shopping',
  store: 'shopping',
  // outdoors
  park: 'outdoors',
  natural_feature: 'outdoors',
  campground_outdoors: 'outdoors',
  // transport
  airport: 'transport',
  train_station: 'transport',
  transit_station: 'transport',
  bus_station: 'transport',
  subway_station: 'transport',
  taxi_stand: 'transport',
  ferry_terminal: 'transport',
  // wellness
  spa: 'wellness',
  gym: 'wellness',
  physiotherapist: 'wellness',
  // events
  event_venue: 'events',
  concert_hall: 'events',
}

// ── Keyword → category mappings ─────────────────────────────────────────────

const KEYWORD_MAP: { category: SystemCategoryName; words: string[] }[] = [
  {
    category: 'restaurant',
    words: [
      'ramen', 'restaurant', 'food', 'eat', 'eating', 'dining',
      'sushi', 'noodle', 'hotpot', 'barbecue', 'brunch', 'lunch', 'dinner',
      'street food', 'market food', 'foodie', 'izakaya',
      'dim sum', 'dumpling', 'pizza', 'curry', 'soup', 'seafood',
      'steakhouse', 'bistro', 'trattoria', 'taco', 'pho', 'bibimbap',
    ],
  },
  {
    category: 'bar_nightlife',
    words: [
      'bar', 'pub', 'brewery', 'cocktail', 'nightlife', 'nightclub', 'club',
      'speakeasy', 'rooftop bar', 'wine bar', 'beer garden', 'happy hour',
      'lounge', 'karaoke', 'live music venue',
    ],
  },
  {
    category: 'coffee_cafe',
    words: [
      'cafe', 'coffee', 'coffee shop', 'bakery', 'pastry', 'tea house',
      'matcha', 'latte', 'espresso', 'brewed',
    ],
  },
  {
    category: 'hotel',
    words: [
      'hotel', 'hostel', 'lodge', 'airbnb', 'stay', 'accommodation',
      'guesthouse', 'resort', 'motel', 'inn', 'ryokan', 'homestay', 'bnb',
      'apartment', 'villa', 'glamping',
    ],
  },
  {
    category: 'activity',
    words: [
      'tour', 'dive', 'diving', 'snorkel', 'kayak', 'surf', 'bike',
      'cycling', 'zipline', 'bungee', 'rafting', 'safari', 'cooking class',
      'workshop', 'boat tour', 'day trip', 'excursion', 'experience',
    ],
  },
  {
    category: 'attraction',
    words: [
      'temple', 'shrine', 'museum', 'gallery', 'palace', 'castle',
      'monument', 'ruins', 'cathedral', 'mosque', 'pagoda', 'attraction',
      'landmark', 'historic', 'heritage', 'viewpoint', 'lookout',
    ],
  },
  {
    category: 'shopping',
    words: [
      'shopping', 'market', 'bazaar', 'mall', 'boutique', 'souvenir',
      'thrift', 'vintage', 'flea market', 'night market', 'outlet',
      'duty free', 'antique',
    ],
  },
  {
    category: 'outdoors',
    words: [
      'hike', 'hiking', 'trek', 'trekking', 'trail', 'climb', 'climbing',
      'park', 'beach', 'waterfall', 'mountain', 'sunset', 'sunrise',
      'lake', 'river', 'canyon', 'gorge', 'forest', 'nature', 'camping',
      'national park', 'scenic', 'overlook',
    ],
  },
  {
    category: 'neighborhood',
    words: [
      'neighborhood', 'neighbourhood', 'district', 'quarter', 'area',
      'old town', 'downtown', 'walking street', 'alley', 'backstreet',
    ],
  },
  {
    category: 'transport',
    words: [
      'train', 'bus', 'flight', 'airport', 'metro', 'subway',
      'ferry', 'taxi', 'uber', 'transport', 'rail pass', 'jr pass', 'transit',
      'transfer', 'getting to', 'getting from', 'how to get',
    ],
  },
  {
    category: 'wellness',
    words: [
      'spa', 'massage', 'onsen', 'hot spring', 'sauna', 'hammam',
      'yoga', 'meditation', 'gym', 'fitness', 'wellness', 'retreat',
      'thermal bath',
    ],
  },
  {
    category: 'events',
    words: [
      'festival', 'concert', 'show', 'performance', 'exhibition',
      'carnival', 'parade', 'fireworks', 'event', 'conference',
      'pop-up', 'fair', 'cherry blossom',
    ],
  },
]

// ── Detection functions ─────────────────────────────────────────────────────

/** Match keyword with word boundaries to avoid substring false positives */
function matchesKeyword(lower: string, keyword: string): boolean {
  if (keyword.includes(' ')) return lower.includes(keyword)
  return new RegExp(`\\b${keyword}\\b`).test(lower)
}

/**
 * Detect category from Google Places type array.
 * Returns null if no category can be confidently inferred.
 */
export function detectCategoryFromPlaceTypes(types: string[]): Category | null {
  for (const t of types) {
    const cat = PLACE_TYPE_MAP[t.toLowerCase()]
    if (cat) return cat
  }
  return null
}

/**
 * Detect category from free-form text using keyword matching.
 * Returns null if no keywords match.
 */
export function detectCategoryFromText(text: string): Category | null {
  const lower = text.toLowerCase()
  for (const group of KEYWORD_MAP) {
    if (group.words.some((w) => matchesKeyword(lower, w))) return group.category
  }
  return null
}

/**
 * Combined detection: tries Place types first (structured, high-confidence),
 * then falls back to keyword matching on free-form text.
 */
export function detectCategory(
  text: string,
  placeTypes: string[] | null,
): Category | null {
  if (placeTypes && placeTypes.length > 0) {
    const fromTypes = detectCategoryFromPlaceTypes(placeTypes)
    if (fromTypes) return fromTypes
  }
  return detectCategoryFromText(text)
}

// ── Multi-category detection ────────────────────────────────────────────────

/**
 * Detect ALL matching categories from Google Places type array.
 */
export function detectCategoriesFromPlaceTypes(types: string[]): Category[] {
  const result = new Set<Category>()
  for (const t of types) {
    const cat = PLACE_TYPE_MAP[t.toLowerCase()]
    if (cat) result.add(cat)
  }
  return [...result]
}

/**
 * Detect ALL matching categories from free-form text.
 */
export function detectCategoriesFromText(text: string): Category[] {
  const lower = text.toLowerCase()
  const result: Category[] = []
  for (const group of KEYWORD_MAP) {
    if (group.words.some((w) => matchesKeyword(lower, w))) {
      result.push(group.category)
    }
  }
  return result
}

/**
 * Combined multi-category detection: collects from Place types AND text.
 * Returns deduplicated array of all matching categories.
 */
export function detectCategories(
  text: string,
  placeTypes: string[] | null,
): Category[] {
  const result = new Set<Category>()

  if (placeTypes && placeTypes.length > 0) {
    for (const cat of detectCategoriesFromPlaceTypes(placeTypes)) {
      result.add(cat)
    }
  }

  for (const cat of detectCategoriesFromText(text)) {
    result.add(cat)
  }

  return [...result]
}
