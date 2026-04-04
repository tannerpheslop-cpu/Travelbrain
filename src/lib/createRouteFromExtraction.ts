import { supabase } from './supabase'
import type { Category } from '../types'

/**
 * Auto-creates a Route from completed extraction results.
 * See /docs/UNPACK-CONTEXT.md and /docs/ROUTE-CONTEXT.md.
 *
 * Haiku data is authoritative — names, categories, context are never overwritten.
 * Photos and coordinates are left null (lazy enrichment when user views Route).
 */

interface ExtractedItem {
  name: string
  category: string
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
      const catLabel = topCat[0] === 'restaurant' ? 'Restaurants'
        : topCat[0] === 'hotel' ? 'Hotels'
        : topCat[0] === 'museum' ? 'Museums'
        : topCat[0] === 'temple' ? 'Temples'
        : topCat[0] === 'park' ? 'Parks'
        : topCat[0] === 'hike' ? 'Hikes'
        : topCat[0] === 'historical' ? 'Historical Sites'
        : 'Places'
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

const VALID_CATEGORIES = new Set<Category>([
  'restaurant', 'hotel', 'museum', 'temple', 'park', 'hike',
  'historical', 'shopping', 'nightlife', 'entertainment',
  'transport', 'spa', 'beach', 'other',
  'activity', 'transit', 'general',
])

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
    const savedItemRows = items.map(item => ({
      user_id: userId,
      source_type: 'manual' as const,
      source_url: sourceUrl,
      title: item.name, // FROM HAIKU — authoritative
      description: item.context, // FROM HAIKU — authoritative
      category: VALID_CATEGORIES.has(item.category as Category) ? item.category : 'other',
      location_name: item.location_name,
      route_id: route.id,
      image_display: 'none' as const,
      // No photo, no coordinates — lazy enrichment
      location_lat: null,
      location_lng: null,
      location_place_id: null,
      location_precision: null,
      has_pending_extraction: false,
    }))

    const { data: savedItems, error: insertErr } = await supabase
      .from('saved_items')
      .insert(savedItemRows)
      .select('id')

    if (insertErr || !savedItems) {
      console.error('[createRoute] Item creation failed:', insertErr?.message)
      return null
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
    }

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
