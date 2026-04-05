import { supabase } from './supabase'
import { deriveRouteLocation } from './deriveRouteLocation'
import { SYSTEM_CATEGORIES, getCategoryLabel, LEGACY_CATEGORY_MAP } from './categories'

/**
 * Auto-creates a Route from completed extraction results.
 * See /docs/UNPACK-CONTEXT.md and /docs/ROUTE-CONTEXT.md.
 *
 * Haiku data is authoritative — names, categories, context are never overwritten.
 * Photos and coordinates are left null (lazy enrichment when user views Route).
 */

interface ExtractedItem {
  name: string
  category: string            // primary category (first in categories array) — legacy column
  categories?: string[]       // full categories array from Haiku — written to item_tags
  location_name: string | null
  context: string | null
  address: string | null
  section_label: string
  section_location: string | null
  section_order: number
  item_order: number
}

interface CreateRouteResult {
  routeId: string
  itemCount: number
}

/** Auto-suggest a Route name from extracted items and article metadata. */
function suggestRouteName(
  items: ExtractedItem[],
  sourceTitle: string | null,
): string {
  // Priority 1: Source article title (always most meaningful for Unpack)
  if (sourceTitle && sourceTitle !== 'Untitled' && sourceTitle.length > 3) {
    return sourceTitle.length > 50 ? sourceTitle.slice(0, 47) + '...' : sourceTitle
  }

  // Priority 2: City + category heuristic (for manual merge, no article)
  const cities = new Map<string, number>()
  const countries = new Map<string, number>()
  const categories = new Map<string, number>()

  for (const item of items) {
    if (item.location_name) {
      const parts = item.location_name.split(',').map(s => s.trim())
      if (parts[0]) cities.set(parts[0], (cities.get(parts[0]) ?? 0) + 1)
      if (parts.length >= 2) {
        const country = parts[parts.length - 1]
        countries.set(country, (countries.get(country) ?? 0) + 1)
      }
    }
    if (item.category && item.category !== 'other') {
      categories.set(item.category, (categories.get(item.category) ?? 0) + 1)
    }
  }

  if (cities.size === 1) {
    const city = [...cities.keys()][0]
    const topCat = [...categories.entries()].sort((a, b) => b[1] - a[1])[0]
    if (topCat) {
      const catLabel = getCategoryLabel(topCat[0]) + 's'
      return `${city} ${catLabel}`
    }
    return `${city} Places`
  }

  if (countries.size === 1) {
    return `${[...countries.keys()][0]} Travel`
  }

  return 'Untitled group'
}

/** Determine location_scope from extracted items. */
function getLocationScope(items: ExtractedItem[]): string | null {
  const countries = new Set<string>()
  for (const item of items) {
    if (item.location_name) {
      const parts = item.location_name.split(',').map(s => s.trim())
      if (parts.length >= 2) countries.add(parts[parts.length - 1])
    }
  }
  if (countries.size === 1) return [...countries][0]
  if (countries.size > 1) return [...countries].slice(0, 3).join(', ')
  return null
}

/** Parse country name and code from a Haiku-provided location_name like "Beijing, China". */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'china': 'CN', 'japan': 'JP', 'taiwan': 'TW', 'south korea': 'KR', 'korea': 'KR',
  'thailand': 'TH', 'vietnam': 'VN', 'indonesia': 'ID', 'singapore': 'SG',
  'malaysia': 'MY', 'philippines': 'PH', 'cambodia': 'KH', 'india': 'IN',
  'sri lanka': 'LK', 'nepal': 'NP', 'myanmar': 'MM', 'laos': 'LA', 'mongolia': 'MN',
  'hong kong': 'HK', 'macau': 'MO',
  'united states': 'US', 'usa': 'US', 'united kingdom': 'GB', 'uk': 'GB',
  'france': 'FR', 'germany': 'DE', 'italy': 'IT', 'spain': 'ES',
  'portugal': 'PT', 'netherlands': 'NL', 'belgium': 'BE', 'switzerland': 'CH',
  'austria': 'AT', 'greece': 'GR', 'czech republic': 'CZ', 'czechia': 'CZ',
  'poland': 'PL', 'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI',
  'ireland': 'IE', 'croatia': 'HR', 'hungary': 'HU', 'romania': 'RO',
  'iceland': 'IS', 'turkey': 'TR', 'russia': 'RU',
  'australia': 'AU', 'new zealand': 'NZ',
  'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR', 'chile': 'CL',
  'colombia': 'CO', 'peru': 'PE', 'costa rica': 'CR', 'cuba': 'CU',
  'morocco': 'MA', 'egypt': 'EG', 'south africa': 'ZA', 'kenya': 'KE',
  'tanzania': 'TZ', 'ethiopia': 'ET',
  'united arab emirates': 'AE', 'uae': 'AE', 'israel': 'IL', 'jordan': 'JO',
  'canada': 'CA',
}

export function parseCountryFromLocationName(locationName: string | null): { country: string; countryCode: string } | null {
  if (!locationName) return null
  const parts = locationName.split(',').map(s => s.trim())
  if (parts.length < 2) {
    // Single segment — check if the whole string is a country name
    const code = COUNTRY_NAME_TO_CODE[locationName.trim().toLowerCase()]
    if (!code) return null
    return { country: locationName.trim(), countryCode: code }
  }
  const last = parts[parts.length - 1]
  const code = COUNTRY_NAME_TO_CODE[last.toLowerCase()]
  if (!code) return null
  return { country: last, countryCode: code }
}

const VALID_CATEGORIES = new Set<string>(
  SYSTEM_CATEGORIES.map(c => c.tagName),
)

/** Normalize a category from Haiku (which may use legacy values) to a system category. */
function normalizeCategory(cat: string): string {
  const mapped = LEGACY_CATEGORY_MAP[cat]
  if (mapped) return mapped
  if (VALID_CATEGORIES.has(cat)) return cat
  return 'activity'
}

export async function createRouteFromExtraction(
  extractionId: string,
  userId: string,
  sourceUrl: string,
  sourceTitle: string | null,
  sourceThumbnail: string | null,
  sourcePlatform: string | null,
): Promise<CreateRouteResult | null> {
  try {
    // Read full extraction data
    const { data: extraction, error: fetchErr } = await supabase
      .from('pending_extractions')
      .select('extracted_items, source_entry_id')
      .eq('id', extractionId)
      .single()

    if (fetchErr || !extraction) {
      console.error('[createRoute] Failed to fetch extraction:', fetchErr?.message)
      return null
    }

    const items = extraction.extracted_items as ExtractedItem[]
    if (!Array.isArray(items) || items.length === 0) {
      console.error('[createRoute] No items in extraction')
      return null
    }

    // Auto-suggest name
    const routeName = suggestRouteName(items, sourceTitle)
    const locationScope = getLocationScope(items)

    // Create Route
    const { data: route, error: routeErr } = await supabase
      .from('routes')
      .insert({
        user_id: userId,
        name: routeName,
        source_url: sourceUrl,
        source_title: sourceTitle,
        source_platform: sourcePlatform,
        source_thumbnail: sourceThumbnail,
        location_scope: locationScope,
        item_count: items.length,
      })
      .select('id')
      .single()

    if (routeErr || !route) {
      console.error('[createRoute] Route creation failed:', routeErr?.message)
      return null
    }

    // Create saved_items for each extracted item
    const savedItemRows = items.map(item => {
      const parsed = parseCountryFromLocationName(item.location_name)
      return {
        user_id: userId,
        source_type: 'manual' as const,
        source_url: sourceUrl,
        title: item.name, // FROM HAIKU — authoritative
        description: item.context, // FROM HAIKU — authoritative
        category: normalizeCategory(item.category),
        location_name: item.location_name,
        location_country: parsed?.country ?? null,
        location_country_code: parsed?.countryCode ?? null,
        route_id: route.id,
        image_display: 'none' as const,
        // No photo, no coordinates — lazy enrichment
        location_lat: null,
        location_lng: null,
        location_place_id: null,
        location_precision: null,
        has_pending_extraction: false,
      }
    })

    const { data: savedItems, error: insertErr } = await supabase
      .from('saved_items')
      .insert(savedItemRows)
      .select('id')

    if (insertErr || !savedItems) {
      console.error('[createRoute] Item creation failed:', insertErr?.message)
      // Rollback: delete the orphaned Route
      await supabase.from('routes').delete().eq('id', route.id)
      console.log('[createRoute] Rolled back orphaned Route:', route.id)
      return null
    }

    // Write categories to item_tags for each saved item
    // Normalize and deduplicate: ["park", "outdoors"] both map to "outdoors" → keep one
    const tagRows: Array<{ item_id: string; tag_name: string; tag_type: string; user_id: string }> = []
    for (let i = 0; i < savedItems.length; i++) {
      const rawCats = items[i]?.categories ?? (items[i]?.category ? [items[i].category] : [])
      const seen = new Set<string>()
      for (const cat of rawCats) {
        const normalizedCat = normalizeCategory(cat)
        if (VALID_CATEGORIES.has(normalizedCat) && !seen.has(normalizedCat)) {
          seen.add(normalizedCat)
          tagRows.push({
            item_id: savedItems[i].id,
            tag_name: normalizedCat,
            tag_type: 'category',
            user_id: userId,
          })
        }
      }
      // Ensure at least one category tag per item
      if (seen.size === 0) {
        tagRows.push({
          item_id: savedItems[i].id,
          tag_name: 'activity',
          tag_type: 'category',
          user_id: userId,
        })
      }
    }
    if (tagRows.length > 0) {
      const { error: tagErr } = await supabase
        .from('item_tags')
        .upsert(tagRows, { onConflict: 'item_id,tag_name', ignoreDuplicates: true })
      if (tagErr) {
        console.error('[createRoute] item_tags write failed:', tagErr.message)
      }
    }

    // Create route_items linking saves to Route with section metadata
    const routeItemRows = savedItems.map((si, i) => ({
      route_id: route.id,
      saved_item_id: si.id,
      route_order: i + 1,
      section_label: items[i]?.section_label ?? 'Places',
      section_order: items[i]?.section_order ?? 0,
    }))

    const { error: linkErr } = await supabase
      .from('route_items')
      .insert(routeItemRows)

    if (linkErr) {
      console.error('[createRoute] Route items linking failed:', linkErr.message)
      // Rollback: delete saved_items and the Route to avoid orphaned data
      const savedItemIds = savedItems.map(si => si.id)
      await supabase.from('item_tags').delete().in('item_id', savedItemIds)
      await supabase.from('saved_items').delete().in('id', savedItemIds)
      await supabase.from('routes').delete().eq('id', route.id)
      console.log('[createRoute] Rolled back Route + items after route_items failure')
      return null
    }

    // Derive location metadata from the newly created saves
    await deriveRouteLocation(route.id)

    // Update pending_extractions status to 'saved'
    await supabase
      .from('pending_extractions')
      .update({ status: 'saved' })
      .eq('id', extractionId)

    // Delete the bare source entry — Route items replace it
    if (extraction.source_entry_id) {
      await supabase
        .from('saved_items')
        .delete()
        .eq('id', extraction.source_entry_id)
    }

    console.log(`[createRoute] Created Route "${routeName}" with ${savedItems.length} items`)

    return { routeId: route.id, itemCount: savedItems.length }
  } catch (err) {
    console.error('[createRoute] Failed:', (err as Error).message)
    return null
  }
}
