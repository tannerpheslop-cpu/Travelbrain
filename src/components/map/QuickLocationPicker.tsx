import { useRef, useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { loadGoogleMapsScript } from '../../lib/googleMaps'
import { extractPlaceData } from '../../lib/extractPlaceData'

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuickLocationPickerProps {
  itemId: string
  itemTitle: string
  /** Destination city center coordinates for location bias */
  biasLat: number
  biasLng: number
  /** Destination city name for display */
  cityName: string
  onSelect: (data: {
    itemId: string
    lat: number
    lng: number
    place_id: string
    location_name: string
    location_country: string | null
    location_country_code: string | null
  }) => void
  onClose: () => void
}

interface Suggestion {
  name: string
  address: string
  placeId: string
  lat: number
  lng: number
  distance: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function distanceText(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  const d = 2 * R * Math.asin(Math.sqrt(a))
  return d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`
}

// ── Component ────────────────────────────────────────────────────────────────

export default function QuickLocationPicker({
  itemId,
  itemTitle,
  biasLat,
  biasLng,
  cityName,
  onSelect,
  onClose,
}: QuickLocationPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const [showAutocomplete, setShowAutocomplete] = useState(false)

  // ── Pre-populated suggestions via Places Text Search ──
  useEffect(() => {
    let cancelled = false
    const fetchSuggestions = async () => {
      try {
        await loadGoogleMapsScript()
        const div = document.createElement('div')
        const service = new google.maps.places.PlacesService(div)

        const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
          service.textSearch(
            {
              query: itemTitle,
              location: new google.maps.LatLng(biasLat, biasLng),
              radius: 5000,
            },
            (res, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && res) {
                resolve(res.slice(0, 3))
              } else {
                resolve([])
              }
            },
          )
        })

        if (cancelled) return

        const mapped: Suggestion[] = results
          .filter(r => r.geometry?.location && r.place_id && r.name)
          .map(r => ({
            name: r.name!,
            address: r.formatted_address ?? '',
            placeId: r.place_id!,
            lat: r.geometry!.location!.lat(),
            lng: r.geometry!.location!.lng(),
            distance: distanceText(biasLat, biasLng, r.geometry!.location!.lat(), r.geometry!.location!.lng()),
          }))

        setSuggestions(mapped)
      } catch (err) {
        console.error('[quick-picker] Failed to fetch suggestions:', err)
      } finally {
        if (!cancelled) setLoadingSuggestions(false)
      }
    }

    fetchSuggestions()
    return () => { cancelled = true }
  }, [itemTitle, biasLat, biasLng])

  // ── Google Places Autocomplete setup ──
  useEffect(() => {
    if (!showAutocomplete || !inputRef.current) return

    let mounted = true
    const init = async () => {
      await loadGoogleMapsScript()
      if (!mounted || !inputRef.current) return

      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        fields: ['geometry', 'place_id', 'name', 'formatted_address', 'address_components', 'types'],
      })

      // Bias to destination city
      ac.setBounds(new google.maps.LatLngBounds(
        new google.maps.LatLng(biasLat - 0.1, biasLng - 0.1),
        new google.maps.LatLng(biasLat + 0.1, biasLng + 0.1),
      ))

      ac.addListener('place_changed', async () => {
        const place = ac.getPlace()
        if (!place?.geometry?.location || !place.place_id) return

        const data = await extractPlaceData(place)
        if (data) {
          onSelect({
            itemId,
            lat: data.location_lat,
            lng: data.location_lng,
            place_id: data.location_place_id,
            location_name: data.location_name,
            location_country: data.location_country,
            location_country_code: data.location_country_code,
          })
        }
      })

      autocompleteRef.current = ac
    }

    init()
    return () => { mounted = false }
  }, [showAutocomplete, biasLat, biasLng, itemId, onSelect])

  // ── Auto-focus input ──
  useEffect(() => {
    // Focus after a brief delay to allow sheet animation
    const timer = setTimeout(() => inputRef.current?.focus(), 300)
    return () => clearTimeout(timer)
  }, [])

  // ── Handle selecting a pre-populated suggestion ──
  const handleSuggestionTap = useCallback((s: Suggestion) => {
    // Fetch place details to get country info
    const fetchAndSelect = async () => {
      try {
        await loadGoogleMapsScript()
        const div = document.createElement('div')
        const service = new google.maps.places.PlacesService(div)

        const details = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
          service.getDetails(
            { placeId: s.placeId, fields: ['address_components', 'geometry', 'name', 'formatted_address', 'types'] },
            (result, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && result) {
                resolve(result)
              } else {
                resolve(null)
              }
            },
          )
        })

        let country: string | null = null
        let countryCode: string | null = null
        if (details?.address_components) {
          for (const comp of details.address_components) {
            if (comp.types.includes('country')) {
              country = comp.long_name
              countryCode = comp.short_name
              break
            }
          }
        }

        onSelect({
          itemId,
          lat: s.lat,
          lng: s.lng,
          place_id: s.placeId,
          location_name: s.name,
          location_country: country,
          location_country_code: countryCode,
        })
      } catch (err) {
        console.error('[quick-picker] Failed to get place details:', err)
        // Fall back to basic data
        onSelect({
          itemId,
          lat: s.lat,
          lng: s.lng,
          place_id: s.placeId,
          location_name: s.name,
          location_country: null,
          location_country_code: null,
        })
      }
    }
    fetchAndSelect()
  }, [itemId, onSelect])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        data-testid="quick-picker-backdrop"
      />

      {/* Sheet — fixed bottom pattern */}
      <div
        className="fixed inset-x-0 bottom-0 z-50"
        style={{
          maxHeight: '85dvh',
          background: 'var(--color-bg-card)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
        data-testid="quick-location-picker"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border-input)' }} />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pb-3">
          <div className="flex-1 min-w-0">
            <h3
              data-testid="quick-picker-title"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {itemTitle}
            </h3>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: 'var(--color-text-tertiary)',
              margin: '2px 0 0',
            }}>
              Set precise location
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="quick-picker-close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-tertiary)', padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pb-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              if (!showAutocomplete && e.target.value.length > 0) {
                setShowAutocomplete(true)
              }
            }}
            placeholder="Search for this place..."
            data-testid="quick-picker-input"
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1.5px solid var(--color-border-input)',
              background: 'var(--color-bg-page)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 16, // Prevents iOS zoom
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
        </div>

        {/* Pre-populated suggestions (before user types) */}
        {!showAutocomplete && (
          <div className="px-4 pb-4 overflow-y-auto" style={{ flex: 1, maxHeight: '50dvh' }}>
            {loadingSuggestions ? (
              <div style={{
                textAlign: 'center', padding: '20px 0',
                fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                color: 'var(--color-text-tertiary)',
              }}>
                Searching...
              </div>
            ) : suggestions.length > 0 ? (
              <>
                <p style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}>
                  Is this the place?
                </p>
                {suggestions.map(s => (
                  <button
                    key={s.placeId}
                    type="button"
                    onClick={() => handleSuggestionTap(s)}
                    data-testid={`suggestion-${s.placeId}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '12px 0',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border-light, #f0eeea)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 14, fontWeight: 500,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {s.name}
                      </div>
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        color: 'var(--color-text-tertiary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginTop: 1,
                      }}>
                        {s.address}
                      </div>
                    </div>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      color: 'var(--color-accent)',
                      flexShrink: 0,
                    }}>
                      {s.distance}
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <div style={{
                textAlign: 'center', padding: '20px 0',
                fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                color: 'var(--color-text-tertiary)',
              }}>
                No suggestions found. Try searching above.
              </div>
            )}
          </div>
        )}

        {/* When autocomplete is active, Google's dropdown handles the results */}
        {showAutocomplete && (
          <div className="px-4 pb-4" style={{ minHeight: 100 }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, fontWeight: 600,
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Search results near {cityName}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
