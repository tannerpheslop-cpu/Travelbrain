import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTrips, type TripWithDestinations } from '../hooks/useTrips'
import { useAuth } from '../lib/auth'
import LocationAutocomplete, { type LocationSelection } from '../components/LocationAutocomplete'
import { fetchPlacePhoto } from '../lib/googleMaps'
import { getInboxClusters, type CountryCluster } from '../lib/clusters'
import { trackEvent } from '../lib/analytics'
import { selectFeaturedTrip } from '../utils/featuredTrip'
import { useFirstDestinationImage } from '../hooks/useDestinationImage'
import type { SavedItem } from '../types'
import { supabase } from '../lib/supabase'
import { Plus } from 'lucide-react'
import { BrandMark, StatusBadge, MetadataLine, RouteChain, CategoryPill, DashedCard, PrimaryButton, CountryCodeBadge } from '../components/ui'

// ── Helpers ───────────────────────────────────────────────────────────────────

const gradients = [
  'from-amber-700 to-orange-900',
  'from-stone-500 to-stone-700',
  'from-zinc-500 to-zinc-700',
  'from-neutral-500 to-neutral-700',
  'from-warm-gray-500 to-warm-gray-700',
  'from-slate-500 to-slate-700',
]

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

// ── Stacked Trip Card (< 4 remaining trips) ─────────────────────────────────

function TripCard({
  trip,
  index,
  onDelete,
}: {
  trip: TripWithDestinations
  index: number
  onDelete: (id: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [coverImgFailed, setCoverImgFailed] = useState(false)
  const [coverImgLoaded, setCoverImgLoaded] = useState(false)

  const gradient = gradients[index % gradients.length]
  const dests = trip.trip_destinations ?? []
  const resolvedDestImage = useFirstDestinationImage(dests)
  const coverImage = !coverImgFailed ? (resolvedDestImage ?? trip.cover_image_url ?? null) : null
  const countryCode = getTripCountryCode(trip)
  const chapterNum = String(index + 2).padStart(2, '0') // hero is 01

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setMenuOpen((o) => !o); setConfirming(false)
  }
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); setConfirming(true)
  }
  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setMenuOpen(false); setConfirming(false); onDelete(trip.id)
  }
  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setConfirming(false); setMenuOpen(false)
  }

  return (
    <div className="relative group">
      <Link
        to={`/trip/${trip.id}`}
        className="flex bg-bg-card rounded-xl border border-border overflow-hidden transition-all duration-150 ease-out hover:border-accent/25 hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:-translate-y-0.5"
      >
        {/* Left: cover image or gradient */}
        <div className={`relative w-28 shrink-0 bg-gradient-to-br ${gradient} overflow-hidden`}>
          {coverImage && (
            <img
              src={coverImage}
              alt=""
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${coverImgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setCoverImgLoaded(true)}
              onError={() => setCoverImgFailed(true)}
            />
          )}
          {/* Watermark number */}
          <span className="absolute bottom-1 right-1.5 font-mono text-[48px] font-extrabold leading-none text-white/10 pointer-events-none select-none group-hover:text-white/20 transition-colors">
            {chapterNum}
          </span>
        </div>

        {/* Right: content */}
        <div className="flex-1 min-w-0 px-3.5 py-3 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1">
            {countryCode && <CountryCodeBadge code={countryCode} />}
            <StatusBadge status={trip.status} />
          </div>
          <h3 className="text-[16px] font-bold text-text-primary truncate group-hover:text-accent transition-colors">{trip.title}</h3>
          {dests.length > 0 ? (
            <div className="mt-1.5">
              <RouteChain destinations={dests.map((d) => shortDestName(d.location_name))} maxVisible={4} />
            </div>
          ) : (
            <p className="mt-1 font-mono text-[11px] text-text-faint">No destinations yet</p>
          )}
          {trip.status === 'scheduled' && trip.start_date && trip.end_date && (
            <MetadataLine items={[formatDateRange(trip.start_date, trip.end_date)]} className="mt-1" />
          )}
        </div>
      </Link>

      {/* ··· menu button */}
      <button
        type="button"
        onClick={handleMenuClick}
        className="absolute top-2 right-2 p-1.5 rounded-full text-text-faint hover:text-text-secondary hover:bg-bg-muted transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Trip options"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
        </svg>
      </button>

      {/* Dropdown */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirming(false) }} />
          <div className="absolute top-10 right-2 z-20 bg-bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[160px]">
            {!confirming ? (
              <button type="button" onClick={handleDeleteClick} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-error hover:bg-error-bg transition-colors text-left">
                Delete trip
              </button>
            ) : (
              <div className="px-4 py-3">
                <p className="text-xs font-medium text-text-secondary mb-2">Delete this trip?</p>
                <div className="flex gap-2">
                  <button type="button" onClick={handleCancelDelete} className="flex-1 py-1.5 text-xs border border-border-input text-text-secondary rounded-lg hover:bg-bg-page transition-colors">Cancel</button>
                  <button type="button" onClick={handleConfirmDelete} className="flex-1 py-1.5 text-xs bg-error text-white rounded-lg font-medium">Delete</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Create Trip Modal (2-step) ────────────────────────────────────────────────

type CreateStep = 'name' | 'destinations'

interface CreateTripModalProps {
  onClose: () => void
  onCreated: (tripId: string) => void
  createTrip: (input: { title: string }) => Promise<{ trip: TripWithDestinations | null; error: string | null }>
  createDestination: (tripId: string, location: LocationSelection, sortOrder: number, imageUrl?: string) => Promise<{ destination: unknown; error: string | null }>
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

    const [tripResult, photoUrls] = await Promise.all([
      createTrip({ title }),
      Promise.all(destinations.map((d) => fetchPlacePhoto(d.place_id).catch(() => null))),
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
      await createDestination(trip.id, destinations[i], i, photoUrls[i] ?? undefined)
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

// ── Featured Trip Hero ────────────────────────────────────────────────────────

function FeaturedTripHero({ trip }: { trip: TripWithDestinations }) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const dests = trip.trip_destinations ?? []
  const resolvedDestImage = useFirstDestinationImage(dests)
  const coverImage = !imgFailed ? (resolvedDestImage ?? trip.cover_image_url ?? null) : null
  const countryCode = getTripCountryCode(trip)
  const destNames = dests.map((d) => shortDestName(d.location_name))
  const hasBgImage = !!coverImage

  return (
    <Link
      to={`/trip/${trip.id}`}
      className="group block relative rounded-2xl overflow-hidden cursor-pointer"
      style={{ height: 210 }}
    >
      {/* Background: image or tinted fallback */}
      {hasBgImage ? (
        <>
          <img
            src={coverImage!}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
          />
          {/* Gradient overlay — critical for text readability */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)' }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-bg-tinted" />
      )}

      {/* Watermark "01" */}
      <span
        className="absolute pointer-events-none select-none font-mono text-[100px] font-extrabold leading-none"
        style={{ top: -10, right: 10, color: hasBgImage ? 'rgba(255,255,255,0.15)' : 'var(--color-border-subtle)', zIndex: 1 }}
      >
        01
      </span>

      {/* Country code badge — top-left */}
      {countryCode && (
        <span
          className="absolute font-mono text-[11px] font-bold tracking-[1px]"
          style={{
            top: 14, left: 14, zIndex: 2,
            color: hasBgImage ? 'white' : 'var(--color-text-tertiary)',
            background: hasBgImage ? 'rgba(255,255,255,0.2)' : 'var(--color-bg-pill)',
            borderRadius: 4, padding: '3px 8px',
          }}
        >
          {countryCode}
        </span>
      )}

      {/* Content block — bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-5" style={{ zIndex: 2 }}>
        {/* "UP NEXT" label */}
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[1px] text-accent">
          UP NEXT
        </span>

        {/* Trip name */}
        <h2
          className="mt-1 text-[24px] font-bold leading-[1.2] tracking-[-0.3px] truncate"
          style={{ color: hasBgImage ? 'white' : 'var(--color-text-primary)' }}
        >
          {trip.title}
        </h2>

        {/* Metadata */}
        <p
          className="mt-1 font-mono text-[11px]"
          style={{ color: hasBgImage ? 'rgba(255,255,255,0.7)' : 'var(--color-text-tertiary)' }}
        >
          {dests.length} destination{dests.length !== 1 ? 's' : ''}
          {trip.status === 'scheduled' && trip.start_date && trip.end_date && (
            <>
              <span style={{ color: hasBgImage ? 'rgba(255,255,255,0.4)' : 'var(--color-text-mist)', margin: '0 6px' }}>·</span>
              {formatDateRange(trip.start_date, trip.end_date)}
            </>
          )}
        </p>

        {/* Route chain */}
        {destNames.length > 0 && (
          <div className="mt-2 overflow-hidden whitespace-nowrap" style={{ textOverflow: 'ellipsis' }}>
            {destNames.slice(0, 4).map((name, i) => (
              <span key={i}>
                {i > 0 && (
                  <span
                    className="font-mono text-[9px] mx-[5px]"
                    style={{ color: hasBgImage ? 'rgba(255,255,255,0.4)' : 'var(--color-text-mist)' }}
                  >→</span>
                )}
                <span
                  className="text-[12px] font-medium"
                  style={{ color: hasBgImage ? 'rgba(255,255,255,0.85)' : 'var(--color-text-secondary)' }}
                >{name}</span>
              </span>
            ))}
            {destNames.length > 4 && (
              <span
                className="font-mono text-[10px] ml-1.5"
                style={{ color: hasBgImage ? 'rgba(255,255,255,0.4)' : 'var(--color-text-ghost)' }}
              >+{destNames.length - 4}</span>
            )}
          </div>
        )}

        {/* Status badge */}
        <span
          className="inline-block mt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.5px]"
          style={{
            padding: '3px 8px',
            borderRadius: 4,
            background: hasBgImage ? 'rgba(255,255,255,0.15)' : 'var(--color-accent-med)',
            color: hasBgImage ? 'white' : 'var(--color-accent)',
          }}
        >
          {trip.status === 'scheduled' ? 'Upcoming' : trip.status === 'planning' ? 'Planning' : 'Someday'}
        </span>
      </div>
    </Link>
  )
}

// ── Carousel Trip Card ───────────────────────────────────────────────────────

function CarouselTripCard({ trip, index }: { trip: TripWithDestinations; index: number }) {
  const [coverImgFailed, setCoverImgFailed] = useState(false)
  const [coverImgLoaded, setCoverImgLoaded] = useState(false)
  const gradient = gradients[index % gradients.length]
  const dests = trip.trip_destinations ?? []
  const resolvedDestImage = useFirstDestinationImage(dests)
  const coverImage = !coverImgFailed ? (resolvedDestImage ?? trip.cover_image_url ?? null) : null
  const countryCode = getTripCountryCode(trip)
  const chapterNum = String(index + 1).padStart(2, '0')

  return (
    <Link
      to={`/trip/${trip.id}`}
      className="group block w-[260px] shrink-0 snap-start rounded-xl bg-bg-card border border-border overflow-hidden transition-all duration-150 ease-out hover:border-accent/25 hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:-translate-y-0.5"
    >
      {/* Cover area */}
      <div className={`relative h-36 bg-gradient-to-br ${gradient} overflow-hidden`}>
        {coverImage && (
          <img
            src={coverImage}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${coverImgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setCoverImgLoaded(true)}
            onError={() => setCoverImgFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Watermark number */}
        <span className="absolute top-2 right-3 font-mono text-[56px] font-extrabold leading-none text-white/10 pointer-events-none select-none group-hover:text-white/20 transition-colors">
          {chapterNum}
        </span>

        {/* Country code badge */}
        {countryCode && (
          <div className="absolute bottom-2 left-3">
            <CountryCodeBadge code={countryCode} light />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-3 py-2.5">
        <h3 className="text-[16px] font-bold text-text-primary truncate group-hover:text-accent transition-colors">{trip.title}</h3>
        {dests.length > 0 && (
          <div className="mt-1">
            <RouteChain
              destinations={dests.map((d) => shortDestName(d.location_name))}
              maxVisible={4}
              truncate
              className="!text-[11px]"
            />
          </div>
        )}
      </div>

      {/* Bottom metadata bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border-subtle bg-bg-page">
        <MetadataLine items={[
          `${dests.length} dest`,
          ...(trip.start_date && trip.end_date ? [formatDateRange(trip.start_date, trip.end_date)] : []),
        ]} className="!text-[10px]" />
        <StatusBadge status={trip.status} />
      </div>
    </Link>
  )
}

// ── Phase Carousel ───────────────────────────────────────────────────────────

const phaseConfig: Record<string, { title: string; description: string }> = {
  scheduled:    { title: 'Upcoming',  description: 'Dates set and ready to go' },
  planning:     { title: 'Planning',  description: 'Actively building these trips' },
  aspirational: { title: 'Someday',   description: 'Ideas for future adventures' },
}

function PhaseCarousel({ phaseKey, trips, onNewTrip }: { phaseKey: string; trips: TripWithDestinations[]; onNewTrip: () => void }) {
  if (trips.length === 0) return null
  const config = phaseConfig[phaseKey] ?? { title: phaseKey, description: '' }
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <h3 className="text-[17px] font-semibold text-text-primary">{config.title}</h3>
          <p className="font-mono text-[11px] text-text-tertiary">{config.description}</p>
        </div>
        <span className="font-mono text-[11px] text-text-faint">{trips.length}</span>
      </div>
      <div className="flex overflow-x-auto scrollbar-hide snap-x snap-mandatory gap-3.5 -mx-5 px-5 pb-1">
        {trips.map((trip, i) => (
          <CarouselTripCard key={trip.id} trip={trip} index={i} />
        ))}
        {/* Dashed add card */}
        <DashedCard
          onClick={onNewTrip}
          className="w-[260px] shrink-0 snap-start flex flex-col items-center justify-center h-[254px] gap-2 cursor-pointer"
        >
          <Plus className="w-5 h-5 text-text-faint" />
          <span className="font-mono text-[11px] font-medium text-text-faint">New trip</span>
        </DashedCard>
      </div>
    </div>
  )
}

// ── Trips Page ────────────────────────────────────────────────────────────────

export default function TripsPage() {
  const { trips, loading, createTrip, createDestination, deleteTrip } = useTrips()
  const [showModal, setShowModal] = useState(false)
  const navigate = useNavigate()

  // Listen for create-trip event from global FAB
  useEffect(() => {
    const handler = () => setShowModal(true)
    window.addEventListener('youji-create-trip', handler)
    return () => window.removeEventListener('youji-create-trip', handler)
  }, [])

  const featuredTrip = useMemo(() => selectFeaturedTrip(trips), [trips])

  const remainingTrips = useMemo(
    () => trips.filter((t) => t.id !== featuredTrip?.id),
    [trips, featuredTrip],
  )

  const useCarouselLayout = remainingTrips.length >= 4

  // Group remaining trips by phase for carousel layout
  const groupedTrips = useMemo(() => {
    if (!useCarouselLayout) return null
    return {
      scheduled: remainingTrips.filter((t) => t.status === 'scheduled'),
      planning: remainingTrips.filter((t) => t.status === 'planning'),
      aspirational: remainingTrips.filter((t) => t.status === 'aspirational'),
    }
  }, [remainingTrips, useCarouselLayout])

  // Preload destination cover images
  useEffect(() => {
    if (loading) return
    for (const trip of trips) {
      const coverUrl =
        trip.trip_destinations?.find((d) => d.image_url)?.image_url ??
        trip.cover_image_url ??
        null
      if (coverUrl) {
        const img = new Image()
        img.src = coverUrl
      }
    }
  }, [trips, loading])

  // Count unique countries across all trips
  const totalCountries = useMemo(() => {
    const codes = new Set<string>()
    trips.forEach((t) => t.trip_destinations?.forEach((d) => { if (d.location_country_code) codes.add(d.location_country_code) }))
    return codes.size
  }, [trips])

  const totalDests = useMemo(() => trips.reduce((s, t) => s + (t.trip_destinations?.length ?? 0), 0), [trips])

  return (
    <div className="max-w-[860px] mx-auto px-5 pb-24" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>
      {/* ── Header ── */}
      <BrandMark className="mb-2 block" />
      <h1 className="text-[32px] font-bold leading-[1.2] tracking-[-0.5px] text-text-primary">Trips</h1>
      {trips.length > 0 && (
        <div className="mt-1.5">
          <MetadataLine items={[
            `${trips.length} trip${trips.length !== 1 ? 's' : ''}`,
            `${totalCountries} ${totalCountries === 1 ? 'country' : 'countries'}`,
            `${totalDests} destination${totalDests !== 1 ? 's' : ''}`,
          ]} />
        </div>
      )}

      {/* Action button — below metadata, never inline with title */}
      <div className="mt-5">
        <PrimaryButton onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" />
          New Trip
        </PrimaryButton>
      </div>

      {/* ── Divider ── */}
      <div className="mt-5 mb-5 border-t border-border" />

      {/* ── Loading Skeletons ── */}
      {loading && (
        <div className="space-y-4">
          <div className="flex rounded-2xl overflow-hidden bg-bg-muted animate-pulse h-[160px]" />
          {[0, 1].map((i) => (
            <div key={i} className="flex rounded-xl bg-bg-muted animate-pulse h-[100px]" />
          ))}
        </div>
      )}

      {/* ── Empty State — interactive DashedCard ── */}
      {!loading && trips.length === 0 && (
        <div className="mt-4" onClick={() => setShowModal(true)}>
          <DashedCard className="flex flex-col items-center justify-center py-20 px-6 cursor-pointer text-center">
            <span className="font-mono text-[28px] text-text-faint opacity-25 block mb-3">↗</span>
            <p className="text-[15px] font-semibold text-text-secondary">Plan your first trip</p>
            <p className="mt-1.5 font-mono text-xs text-text-ghost max-w-xs">
              Create a trip to start organizing your destinations and saves
            </p>
          </DashedCard>
        </div>
      )}

      {/* ── Trip Content ── */}
      {!loading && trips.length > 0 && (
        <div className="space-y-7">
          {/* Featured Trip Hero */}
          {featuredTrip && <FeaturedTripHero trip={featuredTrip} />}

          {/* Adaptive layout */}
          {!useCarouselLayout ? (
            /* Stacked cards */
            <div className="space-y-3">
              {remainingTrips.map((trip, index) => (
                <TripCard key={trip.id} trip={trip} index={index} onDelete={deleteTrip} />
              ))}
            </div>
          ) : (
            /* Phase carousels */
            <div className="space-y-6">
              {groupedTrips && (
                <>
                  <PhaseCarousel phaseKey="scheduled" trips={groupedTrips.scheduled} onNewTrip={() => setShowModal(true)} />
                  <PhaseCarousel phaseKey="planning" trips={groupedTrips.planning} onNewTrip={() => setShowModal(true)} />
                  <PhaseCarousel phaseKey="aspirational" trips={groupedTrips.aspirational} onNewTrip={() => setShowModal(true)} />
                </>
              )}
            </div>
          )}
        </div>
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
