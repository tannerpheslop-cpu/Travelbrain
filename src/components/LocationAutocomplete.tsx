import { useEffect, useRef, useState } from 'react'
import { loadGoogleMapsScript, fetchBilingualNames } from '../lib/googleMaps'

export interface LocationSelection {
  name: string              // formatted display name, e.g. "Tokyo, Japan"
  lat: number
  lng: number
  place_id: string
  country: string | null        // e.g. "China"
  country_code: string | null   // e.g. "CN"
  location_type: 'city' | 'country' | 'region'
  proximity_radius_km: number   // 50 for city, 200 for region, 500 for country
  name_en: string | null        // English name
  name_local: string | null     // Local language name
}

interface Props {
  /** Current display value (location_name from DB, or empty string) */
  value: string
  /** Called when the user selects a place, or null when they clear the field */
  onSelect: (location: LocationSelection | null) => void
  placeholder?: string
  className?: string
  label?: string
  optional?: boolean
}

export default function LocationAutocomplete({
  value,
  onSelect,
  placeholder = 'e.g. Tokyo, Paris, New York',
  className = '',
  label = 'Location',
  optional = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [inputValue, setInputValue] = useState(value)
  const [ready, setReady] = useState(false)

  // Sync external value changes (e.g. when a saved item loads)
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Load Google Maps script and initialise Autocomplete widget
  useEffect(() => {
    let cancelled = false

    loadGoogleMapsScript().then(() => {
      if (cancelled) return
      if (!inputRef.current || !window.google?.maps?.places) {
        setReady(true)
        return
      }

      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ['formatted_address', 'geometry', 'name', 'place_id', 'address_components', 'types'],
        // No 'types' filter — accepts countries, regions, and cities
      })

      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (!place?.geometry?.location) return

        // Extract country name + code from address_components
        const countryComponent = place.address_components?.find(
          (c: google.maps.GeocoderAddressComponent) => c.types.includes('country')
        )
        const country = countryComponent?.long_name ?? null
        const country_code = countryComponent?.short_name ?? null

        // Determine location_type + proximity radius from the place's own types
        // No 'types' restriction on autocomplete — valleys, regions, natural features all accepted
        const placeTypes: string[] = place.types ?? []
        let location_type: 'city' | 'country' | 'region' = 'city'
        let proximity_radius_km = 50
        if (placeTypes.includes('country')) {
          location_type = 'country'
          proximity_radius_km = 500
        } else if (
          placeTypes.some((t: string) => t.startsWith('administrative_area_level')) ||
          placeTypes.includes('natural_feature') ||
          placeTypes.includes('colloquial_area') ||
          placeTypes.includes('sublocality')
        ) {
          location_type = 'region'
          proximity_radius_km = 200
        }

        const defaultName = place.formatted_address || place.name || ''
        const placeId = place.place_id ?? ''

        // Immediately select with default name, then update with bilingual
        setInputValue(defaultName)
        const selection: LocationSelection = {
          name: defaultName,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          place_id: placeId,
          country,
          country_code,
          location_type,
          proximity_radius_km,
          name_en: null,
          name_local: null,
        }

        // Fetch bilingual names async and update
        if (placeId) {
          fetchBilingualNames(placeId, country_code).then((bilingual) => {
            const enName = bilingual.name_en || defaultName
            selection.name = enName
            selection.name_en = enName
            selection.name_local = bilingual.name_local
            setInputValue(enName)
            onSelect({ ...selection })
          }).catch(() => {
            // Fall back to default name
            onSelect(selection)
          })
        } else {
          onSelect(selection)
        }
      })

      autocompleteRef.current = ac
      setReady(true)
    }).catch(() => {
      // Script failed to load — fall back to a plain text input
      setReady(true)
    })

    return () => {
      cancelled = true
      if (autocompleteRef.current) {
        window.google?.maps?.event?.clearInstanceListeners(autocompleteRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    // If user fully clears the field, clear the stored location
    if (!e.target.value.trim()) {
      onSelect(null)
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-text-secondary mb-1.5">
          {label}{' '}
          {optional && <span className="text-text-faint font-normal">(optional)</span>}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        placeholder={ready ? placeholder : 'Loading…'}
        disabled={false}
        autoComplete="off"
        className={`w-full px-4 py-3 border border-border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:text-text-faint ${className}`}
      />
    </div>
  )
}
