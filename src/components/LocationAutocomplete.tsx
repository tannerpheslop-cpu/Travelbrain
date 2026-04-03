import { useEffect, useRef, useState, useCallback } from 'react'
import { loadGoogleMapsScript } from '../lib/googleMaps'
import { extractPlaceData } from '../lib/extractPlaceData'

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
  /** Google Places types filter. Use ['(regions)'] for destinations (cities/countries only).
   *  Leave undefined for item locations (allows businesses + regions). */
  placesTypes?: string[]
  /** If true, clear the input and refocus after selection (for rapid multi-entry). */
  clearOnSelect?: boolean
}

export default function LocationAutocomplete({
  value,
  onSelect,
  placeholder = 'e.g. Tokyo, Paris, New York',
  className = '',
  label = 'Location',
  optional = true,
  placesTypes,
  clearOnSelect = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [inputValue, setInputValue] = useState(value)
  const [ready, setReady] = useState(false)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Sync external value changes (e.g. when a saved item loads)
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Brief confirmation pill
  const showConfirmation = useCallback((name: string) => {
    setConfirmed(name)
    setTimeout(() => setConfirmed(null), 1500)
  }, [])

  // Process a selected place from the autocomplete widget.
  // Delegates all field extraction to extractPlaceData for consistency.
  const processPlace = useCallback(async (place: google.maps.places.PlaceResult) => {
    if (!place?.geometry?.location) return

    const defaultName = place.formatted_address || place.name || ''
    const shortName = defaultName.split(',')[0].trim()

    if (clearOnSelect) {
      // Clear input immediately for rapid multi-entry
      setInputValue('')
      showConfirmation(shortName)
      // Refocus after a tick (Google's widget may blur on select)
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setInputValue(defaultName)
    }

    // extractPlaceData handles: country resolution, location_type, bilingual names
    const locationData = await extractPlaceData(place)
    if (!locationData) return

    const selection: LocationSelection = {
      name: locationData.location_name,
      lat: locationData.location_lat,
      lng: locationData.location_lng,
      place_id: locationData.location_place_id,
      country: locationData.location_country,
      country_code: locationData.location_country_code,
      location_type: locationData.location_type,
      proximity_radius_km: locationData.proximity_radius_km,
      name_en: locationData.location_name_en,
      name_local: locationData.location_name_local,
    }

    if (!clearOnSelect) setInputValue(locationData.location_name)
    onSelectRef.current(selection)
  }, [clearOnSelect, showConfirmation])

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
        fields: ['formatted_address', 'geometry', 'name', 'place_id', 'addressComponents', 'types'],
        ...(placesTypes ? { types: placesTypes } : {}),
      })

      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        processPlace(place)
      })

      // Make Enter select the first suggestion when dropdown is open.
      // Google's widget already does this by default — pressing Enter
      // selects the highlighted item (first by default) and fires place_changed.
      // We add a keydown handler to also handle the case where the user
      // presses Enter before the pac-container renders (do nothing).
      const input = inputRef.current
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          // If Google's pac-container is visible with items, let Google handle it
          // (it will fire place_changed). If not visible, prevent form submission.
          const pacContainer = document.querySelector('.pac-container')
          const hasItems = pacContainer && pacContainer.querySelectorAll('.pac-item').length > 0
          const isVisible = pacContainer && (pacContainer as HTMLElement).style.display !== 'none'
          if (!hasItems || !isVisible) {
            e.preventDefault()
          }
          // Otherwise let Google's handler fire place_changed
        }
      }
      input.addEventListener('keydown', handleKeyDown)

      autocompleteRef.current = ac
      setReady(true)

      return () => {
        input.removeEventListener('keydown', handleKeyDown)
      }
    }).catch(() => {
      setReady(true)
    })

    return () => {
      cancelled = true
      if (autocompleteRef.current) {
        window.google?.maps?.event?.clearInstanceListeners(autocompleteRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesTypes, processPlace])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    if (!e.target.value.trim()) {
      onSelect(null)
    }
  }

  return (
    <div className="relative">
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
      {/* Brief confirmation pill */}
      {confirmed && (
        <div
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 500,
            color: '#B8441E', background: 'rgba(184,68,30,0.08)', borderRadius: 4,
            padding: '3px 8px', pointerEvents: 'none',
            animation: 'fadeOut 1.5s ease forwards',
          }}
        >+ {confirmed}</div>
      )}
      <style>{`@keyframes fadeOut { 0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }`}</style>
    </div>
  )
}
