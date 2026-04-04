import { supabase } from './supabase'

/**
 * Derives location metadata for a Route from its saved_items.
 * Writes derived_city, derived_country, city_count, country_count
 * to the routes record.
 *
 * Called after:
 *  1. Route creation from Unpack (all saves written)
 *  2. A save within the Route has its location updated
 */

interface DerivedLocation {
  cityCount: number
  countryCount: number
  singleCity: string | null
  singleCityCountryCode: string | null
  singleCountry: string | null
  singleCountryCode: string | null
}

export function deriveLocationFromItems(
  items: Array<{
    location_name: string | null
    location_country: string | null
    location_country_code: string | null
  }>,
): DerivedLocation {
  const uniqueCities = new Map<string, { country_code: string | null }>()
  const uniqueCountries = new Map<string, string>() // code → country name

  for (const item of items) {
    if (item.location_name) {
      // Use location_name as the city-level key (e.g. "Beijing, China")
      if (!uniqueCities.has(item.location_name)) {
        uniqueCities.set(item.location_name, {
          country_code: item.location_country_code ?? null,
        })
      }
    }
    if (item.location_country_code && item.location_country) {
      uniqueCountries.set(item.location_country_code, item.location_country)
    }
  }

  const cityEntries = [...uniqueCities.entries()]
  const countryEntries = [...uniqueCountries.entries()]

  return {
    cityCount: uniqueCities.size,
    countryCount: uniqueCountries.size,
    singleCity: cityEntries.length === 1 ? cityEntries[0][0] : null,
    singleCityCountryCode: cityEntries.length === 1 ? cityEntries[0][1].country_code : null,
    singleCountry: countryEntries.length === 1 ? countryEntries[1 - 1][1] : null,
    singleCountryCode: countryEntries.length === 1 ? countryEntries[0][0] : null,
  }
}

export async function deriveRouteLocation(routeId: string): Promise<DerivedLocation | null> {
  try {
    const { data: items, error: fetchErr } = await supabase
      .from('saved_items')
      .select('location_name, location_country, location_country_code')
      .eq('route_id', routeId)

    if (fetchErr || !items) {
      console.error('[deriveRouteLocation] Failed to fetch items:', fetchErr?.message)
      return null
    }

    const derived = deriveLocationFromItems(items)

    // Check location_locked before overwriting
    const { data: route } = await supabase
      .from('routes')
      .select('location_locked')
      .eq('id', routeId)
      .single()

    if (route?.location_locked) {
      console.log(`[deriveRouteLocation] Route ${routeId} is location_locked, skipping`)
      return derived
    }

    const { error: updateErr } = await supabase
      .from('routes')
      .update({
        derived_city: derived.singleCity,
        derived_city_country_code: derived.singleCityCountryCode,
        derived_country: derived.singleCountry,
        derived_country_code: derived.singleCountryCode,
        city_count: derived.cityCount,
        country_count: derived.countryCount,
      })
      .eq('id', routeId)

    if (updateErr) {
      console.error('[deriveRouteLocation] Failed to update route:', updateErr.message)
      return null
    }

    console.log(`[deriveRouteLocation] Route ${routeId}: ${derived.cityCount} cities, ${derived.countryCount} countries`)
    return derived
  } catch (err) {
    console.error('[deriveRouteLocation] Failed:', (err as Error).message)
    return null
  }
}
