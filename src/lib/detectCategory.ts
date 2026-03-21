/**
 * Automatic category detection using Google Places types + keyword matching.
 *
 * Category is suggested, not forced — the user can override.
 * Priority: Place types (structured data) > keyword matching (fuzzy).
 */

export type Category = 'restaurant' | 'activity' | 'hotel' | 'transit' | 'general'

/**
 * Detect category from Google Places type array.
 * Returns null if no category can be confidently inferred.
 */
export function detectCategoryFromPlaceTypes(types: string[]): Category | null {
  const typeSet = new Set(types.map((t) => t.toLowerCase()))

  // Food / Restaurant
  if (
    typeSet.has('restaurant') || typeSet.has('cafe') || typeSet.has('bakery') ||
    typeSet.has('bar') || typeSet.has('meal_delivery') || typeSet.has('meal_takeaway') ||
    typeSet.has('food') || typeSet.has('night_club')
  ) {
    return 'restaurant'
  }

  // Stay / Hotel
  if (
    typeSet.has('lodging') || typeSet.has('hotel') || typeSet.has('motel') ||
    typeSet.has('hostel') || typeSet.has('campground') || typeSet.has('rv_park')
  ) {
    return 'hotel'
  }

  // Transit
  if (
    typeSet.has('airport') || typeSet.has('train_station') || typeSet.has('transit_station') ||
    typeSet.has('bus_station') || typeSet.has('subway_station') || typeSet.has('taxi_stand') ||
    typeSet.has('ferry_terminal')
  ) {
    return 'transit'
  }

  // Activity
  if (
    typeSet.has('tourist_attraction') || typeSet.has('amusement_park') ||
    typeSet.has('aquarium') || typeSet.has('art_gallery') || typeSet.has('museum') ||
    typeSet.has('park') || typeSet.has('stadium') || typeSet.has('zoo') ||
    typeSet.has('place_of_worship') || typeSet.has('spa') || typeSet.has('gym')
  ) {
    return 'activity'
  }

  return null
}

/**
 * Detect category from free-form text using keyword matching.
 * Returns null if no keywords match.
 */
export function detectCategoryFromText(text: string): Category | null {
  const lower = text.toLowerCase()

  /** Match keyword with word boundaries to avoid substring false positives (e.g. "eat" in "great") */
  function matchesKeyword(keyword: string): boolean {
    // Multi-word phrases use simple includes (they're specific enough)
    if (keyword.includes(' ')) return lower.includes(keyword)
    // Single words use word-boundary regex
    return new RegExp(`\\b${keyword}\\b`).test(lower)
  }

  const foodWords = [
    'ramen', 'restaurant', 'food', 'cafe', 'coffee', 'eat', 'eating', 'dining',
    'sushi', 'noodle', 'hotpot', 'barbecue', 'bakery', 'brunch', 'lunch', 'dinner',
    'street food', 'market food', 'foodie', 'izakaya', 'pub', 'bar', 'brewery',
    'dim sum', 'dumpling', 'pizza', 'curry', 'soup',
  ]
  if (foodWords.some(matchesKeyword)) return 'restaurant'

  const stayWords = [
    'hotel', 'hostel', 'lodge', 'airbnb', 'stay', 'accommodation',
    'guesthouse', 'resort', 'motel', 'inn', 'ryokan', 'homestay', 'bnb',
    'apartment', 'villa', 'glamping', 'camping',
  ]
  if (stayWords.some(matchesKeyword)) return 'hotel'

  const transitWords = [
    'train', 'bus', 'flight', 'airport', 'metro', 'subway',
    'ferry', 'taxi', 'uber', 'transport', 'rail pass', 'jr pass', 'transit',
    'transfer', 'getting to', 'getting from', 'how to get',
  ]
  if (transitWords.some(matchesKeyword)) return 'transit'

  const activityWords = [
    'hike', 'hiking', 'trek', 'trekking', 'tour', 'dive', 'diving',
    'climb', 'climbing', 'temple', 'shrine', 'museum', 'gallery', 'park',
    'beach', 'waterfall', 'mountain', 'viewpoint', 'sunset', 'sunrise',
    'snorkel', 'kayak', 'surf', 'bike', 'cycling', 'zipline', 'bungee',
    'rafting', 'safari', 'explore', 'visit', 'see', 'attraction',
  ]
  if (activityWords.some(matchesKeyword)) return 'activity'

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
 * Unlike detectCategoryFromPlaceTypes which returns the first match,
 * this returns every matching category.
 */
export function detectCategoriesFromPlaceTypes(types: string[]): Category[] {
  const typeSet = new Set(types.map((t) => t.toLowerCase()))
  const result: Category[] = []

  if (
    typeSet.has('restaurant') || typeSet.has('cafe') || typeSet.has('bakery') ||
    typeSet.has('bar') || typeSet.has('meal_delivery') || typeSet.has('meal_takeaway') ||
    typeSet.has('food') || typeSet.has('night_club')
  ) {
    result.push('restaurant')
  }

  if (
    typeSet.has('lodging') || typeSet.has('hotel') || typeSet.has('motel') ||
    typeSet.has('hostel') || typeSet.has('campground') || typeSet.has('rv_park')
  ) {
    result.push('hotel')
  }

  if (
    typeSet.has('airport') || typeSet.has('train_station') || typeSet.has('transit_station') ||
    typeSet.has('bus_station') || typeSet.has('subway_station') || typeSet.has('taxi_stand') ||
    typeSet.has('ferry_terminal')
  ) {
    result.push('transit')
  }

  if (
    typeSet.has('tourist_attraction') || typeSet.has('amusement_park') ||
    typeSet.has('aquarium') || typeSet.has('art_gallery') || typeSet.has('museum') ||
    typeSet.has('park') || typeSet.has('stadium') || typeSet.has('zoo') ||
    typeSet.has('place_of_worship') || typeSet.has('spa') || typeSet.has('gym')
  ) {
    result.push('activity')
  }

  return result
}

/**
 * Detect ALL matching categories from free-form text.
 * Unlike detectCategoryFromText which returns the first match,
 * this returns every matching category.
 */
export function detectCategoriesFromText(text: string): Category[] {
  const lower = text.toLowerCase()
  const result: Category[] = []

  function matchesKeyword(keyword: string): boolean {
    if (keyword.includes(' ')) return lower.includes(keyword)
    return new RegExp(`\\b${keyword}\\b`).test(lower)
  }

  const foodWords = [
    'ramen', 'restaurant', 'food', 'cafe', 'coffee', 'eat', 'eating', 'dining',
    'sushi', 'noodle', 'hotpot', 'barbecue', 'bakery', 'brunch', 'lunch', 'dinner',
    'street food', 'market food', 'foodie', 'izakaya', 'pub', 'bar', 'brewery',
    'dim sum', 'dumpling', 'pizza', 'curry', 'soup',
  ]
  if (foodWords.some(matchesKeyword)) result.push('restaurant')

  const stayWords = [
    'hotel', 'hostel', 'lodge', 'airbnb', 'stay', 'accommodation',
    'guesthouse', 'resort', 'motel', 'inn', 'ryokan', 'homestay', 'bnb',
    'apartment', 'villa', 'glamping', 'camping',
  ]
  if (stayWords.some(matchesKeyword)) result.push('hotel')

  const transitWords = [
    'train', 'bus', 'flight', 'airport', 'metro', 'subway',
    'ferry', 'taxi', 'uber', 'transport', 'rail pass', 'jr pass', 'transit',
    'transfer', 'getting to', 'getting from', 'how to get',
  ]
  if (transitWords.some(matchesKeyword)) result.push('transit')

  const activityWords = [
    'hike', 'hiking', 'trek', 'trekking', 'tour', 'dive', 'diving',
    'climb', 'climbing', 'temple', 'shrine', 'museum', 'gallery', 'park',
    'beach', 'waterfall', 'mountain', 'viewpoint', 'sunset', 'sunrise',
    'snorkel', 'kayak', 'surf', 'bike', 'cycling', 'zipline', 'bungee',
    'rafting', 'safari', 'explore', 'visit', 'see', 'attraction',
  ]
  if (activityWords.some(matchesKeyword)) result.push('activity')

  return result
}

/**
 * Combined multi-category detection: collects from Place types AND text.
 * Returns deduplicated array of all matching categories.
 * Example: "Tiger Leaping Gorge Halfway House" → ['activity', 'hotel']
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
