import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTrips, type TripWithDestinations } from '../hooks/useTrips'
import { useAuth } from '../lib/auth'
import LocationAutocomplete, { type LocationSelection } from '../components/LocationAutocomplete'
import { fetchPlacePhoto } from '../lib/googleMaps'
import { fetchDestinationPhoto } from '../lib/unsplash'
import { getInboxClusters, type CountryCluster } from '../lib/clusters'
import { trackEvent } from '../lib/analytics'
import { selectFeaturedTrip } from '../utils/featuredTrip'
import type { SavedItem } from '../types'
import { supabase } from '../lib/supabase'
import { Plus } from 'lucide-react'
import { CategoryPill, DashedCard } from '../components/ui'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get the primary two-letter country code for a trip from its first destination */
function getTripCountryCode(trip: TripWithDestinations): string | null {
  const code = trip.trip_destinations?.[0]?.location_country_code
  return code ?? null
}


/** Keep only the first segment of a Google Places name, e.g. "Chengdu, Sichuan, China" → "Chengdu" */
function shortDestName(locationName: string): string {
  return locationName.split(',')[0].trim()
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

/**
 * Returns whether the trip name matches this cluster at the city or country level.
 * City match takes priority (more specific).
 */
function matchClusterToTripName(cluster: CountryCluster, tripName: string): 'city' | 'country' | null {
  const q = tripName.toLowerCase().trim()
  if (!q) return null
  for (const city of cluster.cities) {
    const cn = city.name.toLowerCase()
    if (cn.includes(q) || q.includes(cn)) return 'city'
  }
  const country = cluster.country.toLowerCase()
  if (country.includes(q) || q.includes(country)) return 'country'
  return null
}

function clusterSummary(cluster: CountryCluster): string {
  const { cities, item_count } = cluster
  const saves = `${item_count} save${item_count !== 1 ? 's' : ''}`
  if (cities.length === 0) return saves
  if (cities.length === 1) return `${saves} in ${cities[0].name}`
  const top = cities.slice(0, 3).map((c) => c.name)
  const more = cities.length > 3 ? ` +${cities.length - 3} more` : ''
  return `${saves} across ${top.join(', ')}${more}`
}

function buildLocationLabel(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.length} destinations`
}

// ── Status label helper ──────────────────────────────────────────────────────

function statusLabel(status: string): string {
  switch (status) {
    case 'scheduled': return 'UPCOMING'
    case 'planning': return 'PLANNING'
    case 'aspirational': return 'SOMEDAY'
    default: return status.toUpperCase()
  }
}

// ── Create Trip Modal (2-step) ────────────────────────────────────────────────

type CreateStep = 'name' | 'destinations'

interface CreateTripModalProps {
  onClose: () => void
  onCreated: (tripId: string) => void
  createTrip: (input: { title: string }) => Promise<{ trip: TripWithDestinations | null; error: string | null }>
  createDestination: (tripId: string, location: LocationSelection, sortOrder: number, imageUrl?: string, imageSource?: string) => Promise<{ destination: unknown; error: string | null }>
}

function CreateTripModal({ onClose, onCreated, createTrip, createDestination }: CreateTripModalProps) {
  const { user } = useAuth()
  const [step, setStep] = useState<CreateStep>('name')
  const [title, setTitle] = useState('')
  const [destinations, setDestinations] = useState<LocationSelection[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autocompleteKey, setAutocompleteKey] = useState(0)

  // Cluster suggestion state
  const [clusters, setClusters] = useState<CountryCluster[]>([])
  const [allLocatedItems, setAllLocatedItems] = useState<SavedItem[]>([])
  const [clustersLoading, setClustersLoading] = useState(false)
  const [expandedSuggKey, setExpandedSuggKey] = useState<string | null>(null)

  const handleNextStep = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Trip name is required.'); return }
    setError(null)
    setStep('destinations')

    if (user) {
      setClustersLoading(true)
      const [clusterResults, { data: itemData }] = await Promise.all([
        getInboxClusters(user.id),
        supabase
          .from('saved_items')
          .select('id, title, category, image_url, location_lat, location_lng, location_country_code, location_place_id')
          .eq('user_id', user.id)
          .eq('is_archived', false)
          .not('location_lat', 'is', null)
          .not('location_lng', 'is', null)
          .not('location_country_code', 'is', null),
      ])
      setClusters(clusterResults)
      setAllLocatedItems((itemData as SavedItem[] | null) ?? [])
      setClustersLoading(false)
      if (clusterResults.length > 0) {
        trackEvent('cluster_suggestion_shown', user.id, {
          countries: clusterResults.map((c) => c.country),
          total_items: clusterResults.reduce((s, c) => s + c.item_count, 0),
        })
      }
    }
  }

  const addDestination = useCallback(
    (loc: LocationSelection) => {
      setDestinations((prev) => {
        if (prev.some((d) => d.place_id === loc.place_id)) return prev
        return [...prev, loc]
      })
    },
    [],
  )

  const handleLocationSelect = (loc: LocationSelection | null) => {
    if (!loc) return
    addDestination(loc)
    setAutocompleteKey((k) => k + 1)
  }

  const removeDestination = (placeId: string) => {
    setDestinations((prev) => prev.filter((d) => d.place_id !== placeId))
  }

  // ── Cluster suggestion handlers ──────────────────────────────────────────────

  const handleAddClusterDest = useCallback(
    (loc: LocationSelection) => {
      addDestination(loc)
      setExpandedSuggKey(null)
      trackEvent('cluster_suggestion_accepted', user?.id ?? null, {
        name: loc.name,
        type: loc.location_type,
      })
    },
    [addDestination, user],
  )

  const handleCreate = async () => {
    setSaving(true)
    setError(null)

    // Fetch photos: try Unsplash first, fall back to Google Places
    const [tripResult, photoResults] = await Promise.all([
      createTrip({ title }),
      Promise.all(destinations.map(async (d) => {
        // Try Unsplash first
        const unsplash = await fetchDestinationPhoto(d.name).catch(() => null)
        if (unsplash?.url) return { url: unsplash.url, source: 'unsplash' as const }
        // Fall back to Google Places
        const gPhoto = await fetchPlacePhoto(d.place_id).catch(() => null)
        if (gPhoto) return { url: gPhoto, source: 'google_places' as const }
        return null
      })),
    ])

    const { trip, error: tripError } = tripResult
    if (tripError || !trip) {
      setError(tripError ?? 'Failed to create trip.')
      setSaving(false)
      return
    }

    // Save destinations sequentially to avoid stale-state race conditions
    // in the useTrips hook's setTrips updater
    for (let i = 0; i < destinations.length; i++) {
      const photo = photoResults[i]
      await createDestination(trip.id, destinations[i], i, photo?.url, photo?.source)
    }
    onCreated(trip.id)
  }

  // ── Suggestion scope ────────────────────────────────────────────────────────
  // Determines what kind of suggestions to show (if any) based on trip context.

  type SuggScope =
    | { kind: 'city'; items: SavedItem[]; locationLabel: string; addLoc: LocationSelection | null }
    | { kind: 'country'; clusters: CountryCluster[]; locationLabel: string }

  const suggScope: SuggScope | null = (() => {
    if (clusters.length === 0) return null

    if (destinations.length > 0) {
      const countryDests = destinations.filter((d) => d.location_type === 'country')
      const cityDests = destinations.filter((d) => d.location_type !== 'country')

      if (countryDests.length > 0) {
        const matching = clusters.filter((c) =>
          countryDests.some((d) => d.country_code === c.country_code),
        )
        if (matching.length === 0) return null
        const labels = countryDests.map((d) => shortDestName(d.name))
        return { kind: 'country', clusters: matching, locationLabel: buildLocationLabel(labels) }
      }

      if (cityDests.length > 0) {
        const items = allLocatedItems.filter((item) =>
          cityDests.some(
            (d) =>
              item.location_country_code === d.country_code &&
              Math.abs((item.location_lat ?? 999) - d.lat) <= 0.45 &&
              Math.abs((item.location_lng ?? 999) - d.lng) <= 0.45,
          ),
        )
        if (items.length === 0) return null
        const labels = cityDests.map((d) => shortDestName(d.name))
        return { kind: 'city', items, locationLabel: buildLocationLabel(labels), addLoc: null }
      }

      return null
    }

    // No destinations yet — infer scope from trip name
    const q = title.trim()
    if (!q) return null

    for (const cluster of clusters) {
      const matchType = matchClusterToTripName(cluster, q)
      if (matchType === 'city') {
        const lq = q.toLowerCase()
        const matchedCity = cluster.cities.find((c) => {
          const cn = c.name.toLowerCase()
          return cn.includes(lq) || lq.includes(cn)
        })
        if (!matchedCity) continue
        const items = allLocatedItems.filter(
          (i) =>
            i.location_country_code === cluster.country_code &&
            Math.abs((i.location_lat ?? 999) - matchedCity.lat) <= 0.45 &&
            Math.abs((i.location_lng ?? 999) - matchedCity.lng) <= 0.45,
        )
        if (items.length === 0) continue
        const addLoc: LocationSelection = {
          name: matchedCity.name,
          lat: matchedCity.lat,
          lng: matchedCity.lng,
          place_id: matchedCity.place_id,
          country: cluster.country,
          country_code: cluster.country_code,
          location_type: 'city',
          proximity_radius_km: 50,
          name_en: null,
          name_local: null,
        }
        return { kind: 'city', items, locationLabel: matchedCity.name, addLoc }
      }
      if (matchType === 'country') {
        return { kind: 'country', clusters: [cluster], locationLabel: cluster.country }
      }
    }

    return null
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-bg-card rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="w-10 h-1 bg-border-input rounded-full mx-auto mt-2 sm:hidden" />

        {/* Header — compact */}
        <div className="px-4 py-3 border-b border-border-subtle">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {step === 'destinations' && (
                <button
                  type="button"
                  onClick={() => setStep('name')}
                  className="text-text-faint hover:text-text-secondary transition-colors"
                  aria-label="Back"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              <h2 className="text-base font-semibold text-text-primary">
                {step === 'name' ? 'New Trip' : title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-text-faint hover:text-text-secondary hover:bg-bg-muted transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body — compact spacing */}
        <div className="px-4 py-3 max-h-[80vh] overflow-y-auto">
          {/* ── Step 1: Name ── */}
          {step === 'name' && (
            <form onSubmit={handleNextStep} className="space-y-3">
              <input
                type="text"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(null) }}
                placeholder="Trip name, e.g. China 2026"
                autoFocus
                className="w-full px-4 py-3 border border-border-input rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:text-text-faint"
              />
              {error && <p className="text-sm text-error">{error}</p>}
              <button
                type="submit"
                disabled={!title.trim()}
                className="w-full py-3 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent-hover active:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </form>
          )}

          {/* ── Step 2: Destinations ── */}
          {step === 'destinations' && (
            <div className="space-y-3">

              {/* Search input + inline suggestions panel */}
              <div>
                <LocationAutocomplete
                  key={autocompleteKey}
                  value=""
                  onSelect={handleLocationSelect}
                  label=""
                  optional={false}
                  placeholder="Search destinations..."
                  className={clustersLoading || suggScope !== null ? 'rounded-t-xl rounded-b-none' : ''}
                />

                {/* Suggestions panel — visually attached below the input */}
                {(clustersLoading || suggScope !== null) && (
                  <div className="border-x border-b border-border-input rounded-b-xl bg-bg-card overflow-hidden shadow-sm">

                    {/* Loading skeleton */}
                    {clustersLoading && (
                      <div className="px-3.5 py-3 space-y-3 animate-pulse border-t border-border-subtle">
                        <div className="h-3 bg-bg-muted rounded-full w-36" />
                        {[0, 1].map((i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-bg-muted rounded-lg shrink-0" />
                            <div className="flex-1 space-y-1.5">
                              <div className="h-3 bg-bg-muted rounded-full w-24" />
                              <div className="h-2.5 bg-bg-muted rounded-full w-36" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Results */}
                    {!clustersLoading && suggScope !== null && (
                      <>
                        {/* Section label */}
                        <div className="px-3.5 pt-2.5 pb-1.5 border-t border-border-subtle">
                          <p className="text-xs font-medium text-text-faint uppercase tracking-wide">
                            Your saves in {suggScope.locationLabel}
                          </p>
                        </div>

                        {/* City-scoped: individual save rows (hide items whose city is already added) */}
                        {suggScope.kind === 'city' && (() => {
                          const visibleItems = suggScope.items.filter((item) =>
                            !destinations.some(
                              (d) =>
                                d.country_code === item.location_country_code &&
                                Math.abs((item.location_lat ?? 999) - d.lat) <= 0.45 &&
                                Math.abs((item.location_lng ?? 999) - d.lng) <= 0.45,
                            ),
                          )
                          if (visibleItems.length === 0 && !suggScope.addLoc) return null
                          return (
                          <div>
                            {visibleItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 px-3.5 py-2.5 border-t border-border-subtle"
                              >
                                <div className="w-8 h-8 rounded-lg shrink-0 flex-none bg-bg-muted overflow-hidden flex items-center justify-center">
                                  {item.image_url ? (
                                    <img src={item.image_url} alt={item.title} className="w-full h-full object-cover opacity-60" />
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-text-ghost">
                                      <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-2.003 3.5-4.697 3.5-8.338C20 5.945 16.368 2 12 2 7.632 2 4 5.945 4 10.988c0 3.64 1.556 6.334 3.5 8.337a19.578 19.578 0 002.683 2.282 16.944 16.944 0 001.144.742zM12 14a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-text-secondary truncate leading-snug">{item.title}</p>
                                  <p className="text-xs text-text-faint leading-snug">{suggScope.locationLabel}</p>
                                </div>
                                <CategoryPill
                                  label={item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                                  dominant={item.category === 'hotel'}
                                  className="shrink-0"
                                />
                              </div>
                            ))}
                            {/* Add city row */}
                            {suggScope.addLoc && !destinations.some((d) => d.place_id === suggScope.addLoc?.place_id) && (
                              <button
                                type="button"
                                onClick={() => handleAddClusterDest(suggScope.addLoc!)}
                                className="w-full flex items-center gap-3 px-3.5 py-2.5 border-t border-border-subtle text-accent hover:bg-accent-light transition-colors"
                              >
                                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-light shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                                  </svg>
                                </span>
                                <span className="text-sm font-medium">Add {shortDestName(suggScope.addLoc.name)} to trip</span>
                              </button>
                            )}
                          </div>
                          )
                        })()}

                        {/* Country-scoped: cluster rows */}
                        {suggScope.kind === 'country' && (
                          <div>
                            {suggScope.clusters.map((cluster) => {
                              const isExpanded = expandedSuggKey === cluster.country_code
                              return (
                                <div key={cluster.country_code}>
                                  {/* Cluster row — tap to expand */}
                                  <div
                                    className="flex items-center gap-3 px-3.5 py-2.5 border-t border-border-subtle cursor-pointer hover:bg-bg-page active:bg-bg-muted transition-colors select-none"
                                    onClick={() => setExpandedSuggKey(isExpanded ? null : cluster.country_code)}
                                  >
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-bg-muted text-xs font-bold text-text-tertiary shrink-0 tracking-wide">
                                      {cluster.country_code}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-text-secondary leading-snug">{cluster.country}</p>
                                      <p className="text-xs text-text-faint leading-snug">{clusterSummary(cluster)}</p>
                                    </div>
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 16 16"
                                      fill="currentColor"
                                      className={`w-4 h-4 text-text-faint shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    >
                                      <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                    </svg>
                                  </div>

                                  {/* Expanded: activity tree grouped by city */}
                                  {isExpanded && (
                                    <div className="bg-bg-page border-t border-border-subtle">
                                      <div className="mx-3.5 mt-2.5 mb-1 border-l-2 border-border space-y-2">
                                        {cluster.cities.map((city) => {
                                          const cityItems = allLocatedItems.filter(
                                            (i) =>
                                              i.location_country_code === cluster.country_code &&
                                              Math.abs((i.location_lat ?? 999) - city.lat) <= 0.45 &&
                                              Math.abs((i.location_lng ?? 999) - city.lng) <= 0.45,
                                          )
                                          const alreadyAdded = destinations.some((d) => d.place_id === city.place_id)
                                          const addBtn = (
                                            <button
                                              type="button"
                                              disabled={alreadyAdded}
                                              onClick={() => {
                                                if (alreadyAdded) return
                                                handleAddClusterDest({
                                                  name: city.name,
                                                  lat: city.lat,
                                                  lng: city.lng,
                                                  place_id: city.place_id,
                                                  country: cluster.country,
                                                  country_code: cluster.country_code,
                                                  location_type: 'city',
                                                  proximity_radius_km: 50,
                                                  name_en: null,
                                                  name_local: null,
                                                })
                                              }}
                                              className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors shrink-0 ${
                                                alreadyAdded
                                                  ? 'bg-bg-muted text-text-tertiary cursor-default'
                                                  : 'bg-bg-card border border-border text-text-faint hover:border-accent/50 hover:text-accent'
                                              }`}
                                              aria-label={alreadyAdded ? `${city.name} added` : `Add ${city.name}`}
                                            >
                                              {alreadyAdded ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                                                </svg>
                                              ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                                                </svg>
                                              )}
                                            </button>
                                          )
                                          return (
                                            <div key={city.place_id}>
                                              {/* City label */}
                                              <p className="text-xs font-semibold text-text-faint uppercase tracking-wide pl-3 pb-0.5">
                                                {city.name}
                                              </p>
                                              {/* Activity rows — one per inbox item near this city */}
                                              {cityItems.length > 0 ? (
                                                cityItems.map((item) => (
                                                  <div key={item.id} className="flex items-center gap-2 pl-3 pr-0 py-1">
                                                    <p className="text-sm text-text-secondary truncate flex-1 leading-snug">{item.title}</p>
                                                    {addBtn}
                                                  </div>
                                                ))
                                              ) : (
                                                /* Fallback: no items resolved, show count row */
                                                <div className="flex items-center gap-2 pl-3 pr-0 py-1">
                                                  <p className="text-sm text-text-tertiary flex-1">{city.item_count} save{city.item_count !== 1 ? 's' : ''}</p>
                                                  {addBtn}
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })}
                                      </div>
                                      <div className="border-t border-border-subtle px-3.5 py-2.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleAddClusterDest({
                                              name: cluster.country,
                                              lat: cluster.lat,
                                              lng: cluster.lng,
                                              place_id: `cluster-country-${cluster.country_code}`,
                                              country: cluster.country,
                                              country_code: cluster.country_code,
                                              location_type: 'country',
                                              proximity_radius_km: 500,
                                              name_en: null,
                                              name_local: null,
                                            })
                                          }
                                          className="text-sm text-accent hover:text-accent transition-colors"
                                        >
                                          Just add {cluster.country} — I'll pick cities later
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Added destinations pills */}
              {destinations.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {destinations.map((d) => (
                    <div
                      key={d.place_id}
                      className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-accent-light border border-accent/25 rounded-full"
                    >
                      <span className="text-xs font-medium text-accent">{shortDestName(d.name)}</span>
                      <button
                        type="button"
                        onClick={() => removeDestination(d.place_id)}
                        className="text-text-faint hover:text-accent transition-colors"
                        aria-label={`Remove ${d.name}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-error">{error}</p>}

              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-3 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent-hover active:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving
                  ? 'Creating…'
                  : destinations.length === 0
                  ? 'Create Trip'
                  : `Create with ${destinations.length} destination${destinations.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DISPLAY COMPONENTS — Rebuilt from spec
// ══════════════════════════════════════════════════════════════════════════════

// ── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({ trip }: { trip: TripWithDestinations }) {
  const dests = trip.trip_destinations ?? []
  const imageDest = dests.find(d => d.image_url)
  const coverImage = imageDest?.image_url ?? trip.cover_image_url ?? null
  const isUnsplash = imageDest?.image_source === 'unsplash'
  const countryCode = getTripCountryCode(trip)
  const destNames = dests.map(d => shortDestName(d.location_name))
  const hasBgImage = !!coverImage

  // Hero card with bg image
  return (
    <Link to={`/trip/${trip.id}`} className="block" style={{ marginBottom: 28 }}>
      <div style={{
        borderRadius: 16, overflow: 'hidden', position: 'relative', height: 220,
        cursor: 'pointer', background: hasBgImage ? '#1a1a1a' : '#f8f7f4',
      }}>
        {/* Background image */}
        {hasBgImage && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundImage: `url(${coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center',
          }} />
        )}
        {/* Gradient overlay */}
        {hasBgImage && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.72) 100%)',
            zIndex: 1,
          }} />
        )}
        {/* Watermark 01 */}
        <div style={{
          position: 'absolute', top: -12, right: 12,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 100, fontWeight: 800,
          color: hasBgImage ? 'rgba(255,255,255,0.12)' : '#f0eeea',
          lineHeight: 1, pointerEvents: 'none', zIndex: 2,
        }}>01</div>
        {/* Country code badge */}
        {countryCode && (
          <div style={{
            position: 'absolute', top: 14, left: 14, zIndex: 2,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: 1,
            color: hasBgImage ? 'white' : '#9e9b94',
            background: hasBgImage ? 'rgba(255,255,255,0.18)' : '#f0eeea',
            borderRadius: 4, padding: '3px 8px',
          }}>{countryCode}</div>
        )}
        {/* Content at bottom */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, zIndex: 2 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
            letterSpacing: 1, textTransform: 'uppercase' as const,
            color: '#c45a2d', marginBottom: 4,
          }}>Up next</div>
          <div style={{
            fontSize: 24, fontWeight: 700, letterSpacing: -0.3,
            color: hasBgImage ? 'white' : '#2a2a28',
          }}>{trip.title}</div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: hasBgImage ? 'rgba(255,255,255,0.65)' : '#9e9b94', marginTop: 5,
          }}>
            {dests.length} destination{dests.length !== 1 ? 's' : ''}
            {trip.start_date && trip.end_date && (
              <><span style={{ color: hasBgImage ? 'rgba(255,255,255,0.35)' : '#d5d2cb', margin: '0 6px' }}>·</span>{formatDateRange(trip.start_date, trip.end_date)}</>
            )}
          </div>
          {/* Route chain */}
          {destNames.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap' as const }}>
              {destNames.slice(0, 4).map((name, i) => (
                <span key={i}>
                  {i > 0 && <span style={{ margin: '0 5px', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: hasBgImage ? 'rgba(255,255,255,0.35)' : '#d5d2cb' }}>→</span>}
                  <span style={{ fontSize: 12, fontWeight: 500, color: hasBgImage ? 'rgba(255,255,255,0.85)' : '#6b6860' }}>{name}</span>
                </span>
              ))}
              {destNames.length > 4 && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: hasBgImage ? 'rgba(255,255,255,0.35)' : '#c5c2bb', marginLeft: 6 }}>+{destNames.length - 4}</span>}
            </div>
          )}
          {/* Status badge */}
          <div style={{ marginTop: 10 }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
              letterSpacing: 0.5, textTransform: 'uppercase' as const, padding: '3px 8px', borderRadius: 4,
              background: hasBgImage ? 'rgba(255,255,255,0.15)' : 'rgba(196,90,45,0.13)',
              color: hasBgImage ? 'white' : '#c45a2d',
            }}>{statusLabel(trip.status)}</span>
          </div>
        </div>
        {/* Unsplash attribution */}
        {hasBgImage && isUnsplash && (
          <div style={{
            position: 'absolute', bottom: 6, right: 12, zIndex: 2,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: 'rgba(255,255,255,0.4)',
          }}>Photo: Unsplash</div>
        )}
      </div>
    </Link>
  )
}

// ── Carousel Card (white, NO background image) ──────────────────────────────

function CarouselCard({ trip, globalNum }: { trip: TripWithDestinations; globalNum: number }) {
  const dests = trip.trip_destinations ?? []
  const num = String(globalNum).padStart(2, '0')
  const countryCodes = [...new Set(dests.map(d => d.location_country_code).filter(Boolean))] as string[]
  const destNames = dests.map(d => shortDestName(d.location_name))
  const visibleNames = destNames.slice(0, 4)
  const overflow = destNames.length - 4

  return (
    <Link
      to={`/trip/${trip.id}`}
      className="group"
      style={{ width: 260, flexShrink: 0, borderRadius: 12, overflow: 'hidden', background: '#ffffff', border: '1px solid #e8e6e1', cursor: 'pointer', transition: 'all 0.15s ease', display: 'block', alignSelf: 'start' }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.border = '1px solid rgba(196,90,45,0.25)'; el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.05)'; el.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.border = '1px solid #e8e6e1'; el.style.boxShadow = 'none'; el.style.transform = 'none' }}
    >
      {/* Top content */}
      <div style={{ padding: '16px 16px 12px', position: 'relative', overflow: 'hidden', minHeight: 100 }}>
        {/* Watermark */}
        <div className="group-hover:!text-[rgba(196,90,45,0.13)]" style={{
          position: 'absolute', top: -6, right: 6,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 56, fontWeight: 800,
          color: '#f0eeea', lineHeight: 1, pointerEvents: 'none', transition: 'color 0.15s ease',
        }}>{num}</div>
        {/* Country badges */}
        {countryCodes.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, position: 'relative' }}>
            {countryCodes.map(code => (
              <span key={code} style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: 1,
                color: '#9e9b94', background: '#f0eeea', borderRadius: 3, padding: '2px 6px',
              }}>{code}</span>
            ))}
          </div>
        )}
        {/* Trip name */}
        <div className="group-hover:!text-[#c45a2d]" style={{
          fontSize: 16, fontWeight: 700, letterSpacing: -0.2, position: 'relative',
          whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
          color: '#2a2a28', transition: 'color 0.15s ease',
        }}>{trip.title}</div>
        {/* Route chain */}
        {destNames.length > 0 && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9e9b94',
            marginTop: 6, position: 'relative', whiteSpace: 'nowrap' as const,
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {visibleNames.map((name, i) => (
              <span key={i}>{i > 0 && <span style={{ color: '#d5d2cb', margin: '0 3px' }}>→</span>}{name}</span>
            ))}
            {overflow > 0 && <span style={{ color: '#c5c2bb', marginLeft: 4 }}>+{overflow}</span>}
          </div>
        )}
        {/* Date range */}
        {trip.start_date && trip.end_date && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#b5b2ab',
            marginTop: 4, position: 'relative',
          }}>{formatDateRange(trip.start_date, trip.end_date)}</div>
        )}
      </div>
      {/* Bottom bar */}
      <div style={{
        padding: '8px 16px', borderTop: '1px solid #f0eeea', background: '#faf9f7',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9e9b94' }}>
          {dests.length} dest · {dests.length} saves
        </span>
        <div style={{ display: 'flex', gap: 3 }}>
          {[...new Set(dests.map(d => d.location_type ?? 'city'))].slice(0, 2).map(cat => (
            <span key={cat} style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 500,
              padding: '2px 5px', borderRadius: 3, background: '#eeece8', color: '#9e9b94',
            }}>{cat}</span>
          ))}
        </div>
      </div>
    </Link>
  )
}

// ── Phase Carousel Section ───────────────────────────────────────────────────

const phaseConfig: Record<string, { title: string; description: string }> = {
  scheduled:    { title: 'Upcoming',  description: 'Dates set and ready to go' },
  planning:     { title: 'Planning',  description: 'Actively building these trips' },
  aspirational: { title: 'Someday',   description: 'Ideas for future adventures' },
}

function PhaseCarousel({ phaseKey, trips, startNum, onNewTrip }: {
  phaseKey: string; trips: TripWithDestinations[]; startNum: number; onNewTrip: () => void
}) {
  if (trips.length === 0) return null
  const config = phaseConfig[phaseKey] ?? { title: phaseKey, description: '' }
  return (
    <div style={{ marginTop: 28 }}>
      {/* Section header */}
      <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{config.title}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9e9b94', marginTop: 3 }}>{config.description}</div>
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#b5b2ab' }}>{trips.length}</span>
      </div>
      {/* Scroll container */}
      <div className="scrollbar-hide" style={{
        display: 'flex', gap: 14, overflowX: 'auto', padding: '0 20px 4px',
        scrollbarWidth: 'none' as const, WebkitOverflowScrolling: 'touch' as const,
      }}>
        {trips.map((trip, i) => (
          <CarouselCard key={trip.id} trip={trip} globalNum={startNum + i} />
        ))}
        {/* Dashed "New trip" */}
        <div
          onClick={onNewTrip}
          style={{
            width: 180, flexShrink: 0, borderRadius: 12, border: '1.5px dashed #d5d2cb',
            display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', gap: 3, minHeight: 140, transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = '#c45a2d'; el.style.background = 'rgba(196,90,45,0.06)' }}
          onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = '#d5d2cb'; el.style.background = 'transparent' }}
        >
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: '#d5d2cb', fontWeight: 300 }}>+</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#b5b2ab' }}>New trip</span>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function TripsPage() {
  const { trips, loading, createTrip, createDestination } = useTrips()
  const [showModal, setShowModal] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = () => setShowModal(true)
    window.addEventListener('youji-create-trip', handler)
    return () => window.removeEventListener('youji-create-trip', handler)
  }, [])

  const featuredTrip = useMemo(() => selectFeaturedTrip(trips), [trips])
  const remainingTrips = useMemo(() => trips.filter(t => t.id !== featuredTrip?.id), [trips, featuredTrip])

  // Group by phase for carousels
  const grouped = useMemo(() => ({
    scheduled: remainingTrips.filter(t => t.status === 'scheduled'),
    planning: remainingTrips.filter(t => t.status === 'planning'),
    aspirational: remainingTrips.filter(t => t.status === 'aspirational'),
  }), [remainingTrips])

  // Preload destination images
  useEffect(() => {
    if (loading) return
    for (const trip of trips) {
      const url = trip.trip_destinations?.find(d => d.image_url)?.image_url ?? trip.cover_image_url
      if (url) { const img = new Image(); img.src = url }
    }
  }, [trips, loading])

  const totalCountries = useMemo(() => {
    const codes = new Set<string>()
    trips.forEach(t => t.trip_destinations?.forEach(d => { if (d.location_country_code) codes.add(d.location_country_code) }))
    return codes.size
  }, [trips])
  const totalDests = useMemo(() => trips.reduce((s, t) => s + (t.trip_destinations?.length ?? 0), 0), [trips])
  // Global numbering: hero=01, then sequential across all carousels
  let globalNum = 2 // hero is 01
  const scheduledStart = globalNum; globalNum += grouped.scheduled.length
  const planningStart = globalNum; globalNum += grouped.planning.length
  const aspirationalStart = globalNum

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 96, background: '#faf9f7' }}>
      {/* ── Header ── */}
      <div style={{ padding: '28px 20px 0' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: 3, textTransform: 'uppercase' as const, color: '#b5b2ab', marginBottom: 4 }}>
          youji 游记
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, margin: 0, color: '#2a2a28' }}>Trips</h1>
        {trips.length > 0 && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9e9b94', marginTop: 5, display: 'flex', gap: 10 }}>
            <span>{trips.length} trips</span>
            <span style={{ color: '#d5d2cb' }}>·</span>
            <span>{totalCountries} countries</span>
            <span style={{ color: '#d5d2cb' }}>·</span>
            <span>{totalDests} destinations</span>
          </div>
        )}
        <button
          onClick={() => setShowModal(true)}
          style={{
            marginTop: 14, padding: '9px 20px', fontSize: 13, fontWeight: 600,
            border: 'none', borderRadius: 8, background: '#c45a2d', color: 'white',
            fontFamily: "'DM Sans', sans-serif", boxShadow: '0 1px 4px rgba(196,90,45,0.25)',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Plus size={14} /> New trip
        </button>
        <div style={{ height: 1, background: '#e8e6e1', margin: '18px 0 20px' }} />
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: '0 20px' }}>
          <div style={{ height: 160, borderRadius: 16, background: '#f5f3f0' }} className="animate-pulse" />
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && trips.length === 0 && (
        <div style={{ padding: '0 20px' }} onClick={() => setShowModal(true)}>
          <DashedCard className="flex flex-col items-center justify-center py-20 px-6 cursor-pointer text-center">
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, color: '#b5b2ab', opacity: 0.25, display: 'block', marginBottom: 12 }}>↗</span>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#6b6860' }}>Plan your first trip</p>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#c5c2bb', marginTop: 6, maxWidth: 280 }}>
              Create a trip to start organizing your destinations and saves
            </p>
          </DashedCard>
        </div>
      )}

      {/* ── Content ── */}
      {!loading && trips.length > 0 && (
        <>
          {/* Hero card */}
          {featuredTrip && (
            <div style={{ padding: '0 20px' }}>
              <HeroCard trip={featuredTrip} />
            </div>
          )}

          {/* Phase carousels */}
          <PhaseCarousel phaseKey="scheduled" trips={grouped.scheduled} startNum={scheduledStart} onNewTrip={() => setShowModal(true)} />
          <PhaseCarousel phaseKey="planning" trips={grouped.planning} startNum={planningStart} onNewTrip={() => setShowModal(true)} />
          <PhaseCarousel phaseKey="aspirational" trips={grouped.aspirational} startNum={aspirationalStart} onNewTrip={() => setShowModal(true)} />
        </>
      )}

      {/* Create Trip Modal */}
      {showModal && (
        <CreateTripModal
          onClose={() => setShowModal(false)}
          onCreated={(tripId) => { setShowModal(false); navigate(`/trip/${tripId}`) }}
          createTrip={createTrip}
          createDestination={createDestination}
        />
      )}
    </div>
  )
}
