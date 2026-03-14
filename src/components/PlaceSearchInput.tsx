/**
 * PlaceSearchInput — an inline Google Places autocomplete that creates a SavedItem
 * from the selected place and returns it for linking to a destination.
 *
 * This component:
 * 1. Renders a text input with Google Places Autocomplete
 * 2. Biases results toward a given lat/lng (destination center)
 * 3. On selection, auto-detects category from Google place types
 * 4. Fetches bilingual names + photo
 * 5. Returns the created SavedItem via onPlaceAdded callback
 */

import { useEffect, useRef, useState } from 'react'
import { MapPin, Loader2, X } from 'lucide-react'
import { loadGoogleMapsScript, fetchBilingualNames, fetchPlacePhoto } from '../lib/googleMaps'
import { supabase } from '../lib/supabase'
import { trackEvent } from '../lib/analytics'
import type { SavedItem, Category } from '../types'

// ── Google Places type → Category mapping ─────────────────────────────────────

const TYPE_CATEGORY_MAP: [string[], Category][] = [
  [['lodging', 'hotel', 'motel', 'resort_hotel'], 'hotel'],
  [['restaurant', 'food', 'cafe', 'bar', 'bakery', 'meal_delivery', 'meal_takeaway'], 'restaurant'],
  [['museum', 'art_gallery', 'library'], 'activity'],
  [['park', 'natural_feature', 'campground', 'national_park'], 'activity'],
  [['place_of_worship', 'temple', 'church', 'mosque', 'synagogue', 'hindu_temple'], 'activity'],
  [['shopping_mall', 'store', 'clothing_store', 'department_store', 'supermarket'], 'activity'],
  [['transit_station', 'train_station', 'bus_station', 'airport', 'subway_station'], 'transit'],
  [['tourist_attraction', 'point_of_interest', 'amusement_park', 'aquarium', 'zoo', 'stadium', 'spa', 'gym', 'night_club'], 'activity'],
]

function detectCategory(placeTypes: string[] | undefined): Category {
  if (!placeTypes?.length) return 'activity'
  for (const [types, category] of TYPE_CATEGORY_MAP) {
    if (placeTypes.some((t) => types.includes(t))) return category
  }
  return 'activity'
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** User ID for creating the saved_item */
  userId: string
  /** Destination coordinates to bias autocomplete results */
  biasLat: number
  biasLng: number
  /** Called when a place is selected and saved_item is created */
  onPlaceAdded: (item: SavedItem) => void
  /** Called when the user closes / collapses the search */
  onClose: () => void
}

export default function PlaceSearchInput({ userId, biasLat, biasLng, onPlaceAdded, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      await loadGoogleMapsScript()
      if (cancelled || !inputRef.current || !window.google?.maps?.places) return

      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ['place_id', 'name', 'formatted_address', 'geometry', 'types', 'address_components', 'photos'],
        types: ['establishment'],
      })

      // Bias toward destination coordinates (≈50km radius)
      const circle = new window.google.maps.Circle({
        center: { lat: biasLat, lng: biasLng },
        radius: 50000,
      })
      autocomplete.setBounds(circle.getBounds()!)

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (!place.place_id || !place.geometry?.location) return
        handlePlaceSelected(place)
      })

      autocompleteRef.current = autocomplete
    }

    init()

    // Focus input after a brief delay (for mount animation)
    const t = setTimeout(() => inputRef.current?.focus(), 150)

    return () => {
      cancelled = true
      clearTimeout(t)
      if (autocompleteRef.current) {
        window.google?.maps?.event?.clearInstanceListeners(autocompleteRef.current)
      }
    }
  }, [biasLat, biasLng]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlaceSelected = async (place: google.maps.places.PlaceResult) => {
    setLoading(true)

    try {
      const placeId = place.place_id!
      const lat = place.geometry!.location!.lat()
      const lng = place.geometry!.location!.lng()
      const placeName = place.name ?? place.formatted_address ?? 'Unknown Place'

      // Extract country from address_components
      const countryComponent = place.address_components?.find(
        (c: google.maps.GeocoderAddressComponent) => c.types.includes('country'),
      )
      const country = countryComponent?.long_name ?? null
      const countryCode = countryComponent?.short_name ?? null

      // Auto-detect category from place types
      const category = detectCategory(place.types ?? undefined)

      // Fetch bilingual names + photo in parallel
      const [bilingual, photoUrl] = await Promise.all([
        fetchBilingualNames(placeId, countryCode).catch(() => ({ name_en: placeName, name_local: null })),
        fetchPlacePhoto(placeId).catch(() => null),
      ])

      // Build the location_name from bilingual English or fallback to place name
      const locationName = bilingual.name_en || place.formatted_address || placeName

      // Create the saved_item
      const { data, error } = await supabase.from('saved_items').insert({
        user_id: userId,
        source_type: 'manual' as const,
        title: placeName,
        location_name: locationName,
        location_lat: lat,
        location_lng: lng,
        location_place_id: placeId,
        location_country: country,
        location_country_code: countryCode,
        location_name_en: bilingual.name_en || null,
        location_name_local: bilingual.name_local || null,
        category,
        image_url: photoUrl,
        notes: place.formatted_address || null,
      }).select().single()

      if (error || !data) {
        console.error('[PlaceSearch] Failed to create saved item:', error)
        setLoading(false)
        return
      }

      trackEvent('save_created', userId, {
        source_type: 'place_search',
        category,
        location_name: locationName,
      })

      onPlaceAdded(data as SavedItem)
    } catch (err) {
      console.error('[PlaceSearch] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
        {loading ? (
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
        ) : (
          <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder="Search for a restaurant, hotel, activity..."
          disabled={loading}
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          aria-label="Close search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {loading && (
        <p className="text-xs text-gray-400 mt-1.5 ml-1 animate-pulse">Adding place...</p>
      )}
    </div>
  )
}
