import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { useTripQuery, useTripDestinations, useInboxClusters, useDeleteTrip, useToggleFavorite, useCompanionsQuery, queryKeys, type DestWithCount } from '../hooks/queries'
import { useCompanions as useCompanionsLegacy } from '../hooks/useCompanions'
import type { CompanionWithUser, PendingInvite } from '../hooks/useCompanions'
import { useRoutes } from '../hooks/useRoutes'
import type { Trip, TripStatus, SharePrivacy } from '../types'
import { type LocationSelection } from '../components/LocationAutocomplete'
import { fetchDestinationPhoto } from '../lib/unsplash'
import { getScopedCountryCodes } from '../lib/continentCodes'
import UnifiedTripMap from '../components/map/UnifiedTripMap'
import { optimizedImageUrl } from '../lib/optimizedImage'
import { trySetTripCoverFromName } from '../lib/tripCoverImage'
import { type CountryCluster } from '../lib/clusters'
import { PrimaryButton, ConfirmDeleteModal } from '../components/ui'
import CalendarRangePicker from '../components/CalendarRangePicker'
import { Check } from 'lucide-react'
import ScrollToTop from '../components/ScrollToTop'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

// ── Share Trip Modal ───────────────────────────────────────────────────────────

const privacyOptions: { value: SharePrivacy; label: string; icon: string; description: string }[] = [
  { value: 'city_only',  label: 'City Only',      icon: 'C', description: 'Trip name and cities only — no dates or items' },
  { value: 'city_dates', label: 'City + Dates',   icon: 'D', description: 'Trip name, cities, and date range' },
  { value: 'full',       label: 'Full Itinerary', icon: 'F', description: 'Everything — all items and the day-by-day plan' },
]

function ShareTripModal({ trip, onClose, onUpdated }: { trip: Trip; onClose: () => void; onUpdated: (updated: Trip) => void }) {
  const [privacy, setPrivacy] = useState<SharePrivacy>(trip.share_privacy ?? 'full')
  const [generating, setGenerating] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(
    trip.share_token ? `${window.location.origin}/s/${trip.share_token}` : null
  )
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    const token = trip.share_token ?? crypto.randomUUID()
    const { data, error: dbError } = await supabase
      .from('trips')
      .update({ share_token: token, share_privacy: privacy })
      .eq('id', trip.id)
      .select()
      .single()
    setGenerating(false)
    if (dbError || !data) { setError('Failed to generate link. Please try again.'); return }
    onUpdated(data as Trip)
    setShareUrl(`${window.location.origin}/s/${token}`)
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }

  const selectedOption = privacyOptions.find((o) => o.value === privacy)!

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-50 bg-bg-card rounded-t-3xl shadow-xl overflow-hidden sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl"
        style={{ maxHeight: '85dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-border-input rounded-full mx-auto mt-3 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-base font-semibold text-text-primary">Share Trip</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-text-faint hover:text-text-secondary hover:bg-bg-muted transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-text-secondary mb-2">Who can see what?</p>
            <div className="flex gap-2">
              {privacyOptions.map((opt) => (
                <button key={opt.value} type="button" onClick={() => { setPrivacy(opt.value); setShareUrl(null) }}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-xs font-medium transition-colors ${privacy === opt.value ? 'border-accent bg-accent-light text-accent' : 'border-border text-text-secondary hover:bg-bg-page'}`}
                >
                  <span className="font-mono text-[11px] font-bold text-text-faint">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-text-faint">{selectedOption.description}</p>
          </div>
          {!shareUrl && (
            <PrimaryButton onClick={handleGenerate} disabled={generating} className="w-full py-3 rounded-xl">
              {generating ? 'Generating…' : 'Generate Link'}
            </PrimaryButton>
          )}
          {shareUrl && (
            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center gap-2 bg-bg-page border border-border rounded-xl px-3 py-2.5 hover:border-accent/40 transition-colors cursor-pointer"
            >
              <p className="flex-1 text-xs font-mono truncate text-left" style={{ color: copied ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                {copied ? 'Copied!' : shareUrl}
              </p>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" style={{ color: copied ? 'var(--color-accent)' : 'var(--color-text-faint)' }}>
                <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
              </svg>
            </button>
          )}
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
      </div>
    </>
  )
}

// ── Invite Companion Modal ─────────────────────────────────────────────────────

function InviteCompanionModal({
  companions, pendingInvites, onClose, onInviteByEmail, onRemove, onRemovePending,
}: {
  companions: CompanionWithUser[]
  pendingInvites: PendingInvite[]
  onClose: () => void
  onInviteByEmail: (email: string) => Promise<{ ok: boolean; type?: string; error?: string }>
  onRemove: (companionId: string) => void
  onRemovePending: (inviteId: string) => void
}) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'added' | 'invited' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => { emailRef.current?.focus() }, [])

  const handleInvite = async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    setStatus('loading')
    setErrorMsg('')
    const result = await onInviteByEmail(trimmed)
    if (!result.ok) {
      setStatus('error')
      setErrorMsg(result.error ?? 'Something went wrong.')
    } else {
      setEmail('')
      setStatus(result.type === 'added' ? 'added' : 'invited')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  const hasAny = companions.length > 0 || pendingInvites.length > 0

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-50 bg-bg-card rounded-t-3xl shadow-xl overflow-hidden flex flex-col sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl"
        style={{ maxHeight: '85dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-border-input rounded-full mx-auto mt-3 sm:hidden shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-base font-semibold text-text-primary">Invite Companions</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-text-faint hover:text-text-secondary hover:bg-bg-muted transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Invite by email</label>
            <div className="flex gap-2">
              <input ref={emailRef} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setStatus('idle') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleInvite() }}
                placeholder="friend@example.com"
                className="flex-1 px-3 py-2.5 border border-border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:text-text-faint" />
              <PrimaryButton onClick={handleInvite} disabled={status === 'loading' || !email.trim()}
                className="px-4 py-2.5 rounded-xl shrink-0">
                {status === 'loading' ? '…' : 'Invite'}
              </PrimaryButton>
            </div>
          </div>
          {status === 'added' && <p className="text-sm text-success font-medium">Companion added!</p>}
          {status === 'invited' && (
            <div className="bg-accent-light border border-accent rounded-xl px-4 py-3">
              <p className="text-sm font-medium text-accent">No account found</p>
              <p className="mt-0.5 text-sm text-text-tertiary">They'll need to sign up first. Share the trip link with them!</p>
            </div>
          )}
          {status === 'error' && <p className="text-sm text-error">{errorMsg}</p>}
          {companions.length > 0 && (
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">Companions</p>
              <div className="space-y-2">
                {companions.map((c) => {
                  const name = c.user?.display_name ?? c.user?.email ?? 'Unknown'
                  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('')
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent-light text-accent flex items-center justify-center text-sm font-semibold shrink-0">{initials || '?'}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{name}</p>
                        {c.user?.display_name && <p className="text-xs text-text-faint truncate">{c.user?.email}</p>}
                      </div>
                      <button type="button" onClick={() => onRemove(c.id)} className="text-xs text-text-faint hover:text-error transition-colors shrink-0">Remove</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {pendingInvites.length > 0 && (
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">Pending invitations</p>
              <div className="space-y-2">
                {pendingInvites.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-bg-muted flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-text-faint">
                        <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                        <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-secondary truncate">{p.email}</p>
                      <p className="text-xs text-text-faint">Invitation sent</p>
                    </div>
                    <button type="button" onClick={() => onRemovePending(p.id)} className="text-xs text-text-faint hover:text-error transition-colors shrink-0">Revoke</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!hasAny && <p className="text-sm text-text-faint">No companions yet. Invite someone above!</p>}
        </div>
      </div>
    </>
  )
}

// ── Trip Overview Page ─────────────────────────────────────────────────────────

export default function TripOverviewPage() {
  const { id, destId: urlDestId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const queryClient = useQueryClient()

  // Core state — from React Query
  const { data: tripData, isLoading: tripQueryLoading, error: tripError } = useTripQuery(id)
  const { data: destsData, isLoading: destsQueryLoading } = useTripDestinations(id)
  useCompanionsQuery(id) // pre-warm cache for companion modal
  const { data: inboxClustersData } = useInboxClusters()
  const deleteTripMutation = useDeleteTrip()
  const toggleFavMutation = useToggleFavorite()
  // Local mutable state derived from query data (for optimistic updates)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [tripLoading, setTripLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [destinations, setDestinations] = useState<DestWithCount[]>([])
  const [destsLoading, setDestsLoading] = useState(true)

  // Sync React Query data into local state (for optimistic mutations)
  useEffect(() => {
    if (tripData) {
      setTrip(tripData)
      setTripLoading(false)
      setNotFound(false)
    } else if (!tripQueryLoading && !tripData) {
      // Trip not found — either an error occurred or the query returned null
      // (Supabase returns null data without error for non-existent UUIDs)
      setNotFound(true)
      setTripLoading(false)
    }
  }, [tripData, tripQueryLoading, tripError])

  useEffect(() => {
    if (destsData) {
      setDestinations(destsData)
      setDestsLoading(false)
    } else if (!destsQueryLoading) {
      setDestsLoading(false)
    }
  }, [destsData, destsQueryLoading])

  // Prefetch destination images so they're cached before user taps a card
  useEffect(() => {
    if (!destsData) return
    for (const dest of destsData) {
      if (dest.image_url) {
        const img = new Image()
        img.src = optimizedImageUrl(dest.image_url, 'destination-card') ?? dest.image_url
      }
    }
  }, [destsData])

  // Editable title
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Add destination
  const addDestFormRef = useRef<HTMLDivElement>(null)
  const [showAddDest, setShowAddDest] = useState(false)

  // (accordion state removed — destinations navigate to map view now)

  // Clusters
  const inboxClustersRef = useRef<CountryCluster[]>([])
  const [frozenSuggestions, setFrozenSuggestions] = useState<Array<{
    key: string; label: string; countryCode: string; itemCount: number; loc: LocationSelection
  }>>([])

  // Modals
  const [showShareModal, setShowShareModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)
  const [, setTitleSavedVisible] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [datePickerDestId, setDatePickerDestId] = useState<string | null>(null)
  const [actionToast, setActionToast] = useState<string | null>(null)

  // Routes
  const { fetchRoutes } = useRoutes(id)

  // Companions (keep legacy hook for mutation functions)
  const { companions, pendingInvites, inviteByEmail, removeCompanion, removePendingInvite } = useCompanionsLegacy(id)

  // Ref for global event listener
  const openAddDestRef = useRef<() => void>(() => {})

  // ── Build suggestions ─────────────────────────────────────────────────────

  // Detect geographic scope from trip name (e.g. "New York 2026" → only show US suggestions)
  const tripNameScopedCodes = useMemo(() => {
    if (!trip?.title) return null
    return getScopedCountryCodes(trip.title, inboxClustersRef.current)
  }, [trip?.title])

  // Primary country for the metadata line
  const primaryCountry = useMemo(() => {
    const countries = new Set<string>()
    const codes = new Set<string>()
    for (const d of destinations) {
      if (d.location_country) countries.add(d.location_country)
      if (d.location_country_code) codes.add(d.location_country_code)
    }
    if (countries.size === 1) {
      const country = Array.from(countries)[0]
      const code = Array.from(codes)[0]
      return { name: country, code }
    }
    if (countries.size > 1) {
      return { name: `${countries.size} countries`, code: '' }
    }
    return null
  }, [destinations])

  // ── Global event listener ─────────────────────────────────────────────────

  useEffect(() => {
    const handleAddDest = () => openAddDestRef.current()
    window.addEventListener('youji-add-destination', handleAddDest)
    return () => window.removeEventListener('youji-add-destination', handleAddDest)
  }, [])

  // ── Data fetching (via React Query — see hooks above) ────────────────────

  // Fetch routes
  useEffect(() => {
    if (id) fetchRoutes()
  }, [id, fetchRoutes])

  // Sync inbox clusters from React Query
  useEffect(() => {
    if (inboxClustersData) {
      inboxClustersRef.current = inboxClustersData
    }
  }, [inboxClustersData])

  // Track suggestion display
  useEffect(() => {
    if (!showAddDest || !frozenSuggestions.length || !user) return
    trackEvent('cluster_suggestion_shown', user.id, {
      trip_id: id,
      context: 'add_destination',
      suggestions: frozenSuggestions.length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddDest])

  // Focus title input
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const titleSavingRef = useRef(false)

  const handleStartEditTitle = () => {
    setTitleDraft(trip?.title ?? '')
    setEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    // Guard against double-fire (blur + unmount on mobile)
    if (titleSavingRef.current) return
    const trimmed = titleDraft.trim()
    if (!trip || !trimmed || trimmed === trip.title) {
      setEditingTitle(false)
      return
    }
    // Mark as saving BEFORE any state changes to prevent re-entry
    titleSavingRef.current = true
    setEditingTitle(false)
    // Optimistic update — show the new title immediately
    setTrip((prev) => prev ? { ...prev, title: trimmed } : prev)
    const { data, error } = await supabase.from('trips').update({ title: trimmed }).eq('id', trip.id).select().single()
    titleSavingRef.current = false
    if (!error && data) {
      const updatedTrip = data as Trip
      setTrip(updatedTrip)
      queryClient.invalidateQueries({ queryKey: queryKeys.trip(trip.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.trips(user?.id ?? '') })

      // Show brief "Saved" confirmation
      setTitleSavedVisible(true)
      setTimeout(() => setTitleSavedVisible(false), 1500)

      // If the trip has no destinations and the cover wasn't user-uploaded, re-check new name
      if (destinations.length === 0 && updatedTrip.cover_image_source !== 'user_upload') {
        void trySetTripCoverFromName(trip.id, trimmed).then((url) => {
          if (url) setTrip((prev) => prev ? { ...prev, cover_image_url: url, cover_image_source: 'trip_name' } : prev)
        })
      }
    } else {
      // Revert optimistic update on failure
      setTrip((prev) => prev ? { ...prev, title: trip.title } : prev)
    }
  }

  // ── Status change handler ──────────────────────────────────────────────
  const statusOptions: Array<{ value: TripStatus; label: string }> = [
    { value: 'aspirational', label: 'Someday' },
    { value: 'planning', label: 'Planning' },
    { value: 'scheduled', label: 'Upcoming' },
  ]

  const handleChangeStatus = async (newStatus: TripStatus) => {
    if (!trip || newStatus === trip.status) {
      setShowStatusDropdown(false)
      return
    }
    setShowStatusDropdown(false)
    const oldStatus = trip.status
    // Optimistic update
    setTrip((prev) => prev ? { ...prev, status: newStatus } : prev)
    const { error: statusErr } = await supabase
      .from('trips')
      .update({ status: newStatus })
      .eq('id', trip.id)
    if (statusErr) {
      setTrip((prev) => prev ? { ...prev, status: oldStatus } : prev)
    } else {
      queryClient.invalidateQueries({ queryKey: queryKeys.trip(trip.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.trips(user?.id ?? '') })
      trackEvent('trip_status_changed', user?.id ?? null, { trip_id: trip.id, from: oldStatus, to: newStatus })
    }
  }

  // Close status dropdown on outside click
  useEffect(() => {
    if (!showStatusDropdown) return
    const handleClick = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showStatusDropdown])

  const openAddDest = () => {
    let clusters = inboxClustersRef.current
    const suggestions: typeof frozenSuggestions = []

    // If trip name implies a geographic scope and no destinations yet, filter clusters
    if (tripNameScopedCodes && destinations.length === 0 && clusters.length) {
      clusters = clusters.filter((c) => tripNameScopedCodes.has(c.country_code))
    }

    if (clusters.length) {
      const existingCodes = new Set(destinations.map((d) => d.location_country_code))
      for (const cluster of clusters) {
        const countryInTrip = existingCodes.has(cluster.country_code)
        if (!countryInTrip) {
          // Always show country-level label for countries not yet in the trip.
          // Even if all items cluster into one city/neighborhood, the suggestion
          // represents the country as a whole (e.g. "Thailand · 3" not "Makkasan · 3").
          suggestions.push({
            key: `country-${cluster.country_code}`,
            label: cluster.country,
            countryCode: cluster.country_code,
            itemCount: cluster.item_count,
            loc: {
              name: cluster.country,
              lat: cluster.lat,
              lng: cluster.lng,
              place_id: `country-${cluster.country_code}`,
              country: cluster.country,
              country_code: cluster.country_code,
              location_type: 'country',
              proximity_radius_km: 500,
              name_en: null,
              name_local: null,
            },
          })
        } else {
          for (const city of cluster.cities) {
            const cityAlreadyAdded = destinations.some(
              (d) =>
                Math.abs((d.location_lat ?? 999) - city.lat) < 0.45 &&
                Math.abs((d.location_lng ?? 999) - city.lng) < 0.45,
            )
            if (!cityAlreadyAdded) {
              suggestions.push({
                key: `city-${city.place_id}`,
                label: city.name,
                countryCode: cluster.country_code,
                itemCount: city.item_count,
                loc: {
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
                },
              })
            }
          }
        }
      }
    }

    setFrozenSuggestions(suggestions)
    setShowAddDest(true)
    // Scroll the form into view after render
    setTimeout(() => addDestFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
  }

  openAddDestRef.current = openAddDest

  // ── Destination date picker ──────────────────────────────────────────────

  const datePickerDest = destinations.find(d => d.id === datePickerDestId) ?? null

  // ── Refresh images handler ──────────────────────────────────────────────────
  const handleRefreshImages = useCallback(async () => {
    if (!trip) return
    setActionToast('Refreshing images...')

    let newCoverUrl: string | null = null

    for (const dest of destinations) {
      // Don't overwrite user uploads
      if (dest.image_source === 'user_upload') continue

      try {
        const photo = await fetchDestinationPhoto(dest.location_name)
        if (!photo?.url) continue

        await supabase
          .from('trip_destinations')
          .update({ image_url: photo.url, image_source: 'unsplash' })
          .eq('id', dest.id)

        // Track the first new image for cover update
        if (!newCoverUrl) newCoverUrl = photo.url
      } catch (err) {
        console.warn(`[RefreshImages] Failed for ${dest.location_name}:`, err)
      }
    }

    // Refresh trip cover if it's sourced from a destination or trip name
    if (newCoverUrl && trip.cover_image_source !== 'user_upload') {
      await supabase
        .from('trips')
        .update({ cover_image_url: newCoverUrl, cover_image_source: 'destination' as import('../types').CoverImageSource })
        .eq('id', trip.id)
    }

    // Invalidate caches so UI updates
    queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(trip.id) })
    queryClient.invalidateQueries({ queryKey: queryKeys.trips(user?.id ?? '') })

    setActionToast('Images refreshed')
    setTimeout(() => setActionToast(null), 2500)
  }, [trip, destinations, queryClient, user?.id])

  const handleDestDatesConfirm = async (start: string, end: string) => {
    if (!datePickerDestId) return
    const { data } = await supabase
      .from('trip_destinations')
      .update({ start_date: start, end_date: end })
      .eq('id', datePickerDestId)
      .select()
      .single()
    if (data) {
      setDestinations(prev => prev.map(d => d.id === datePickerDestId
        ? { ...d, start_date: start, end_date: end } : d
      ))
    }
    setDatePickerDestId(null)
    // Nudge trip status to scheduled if not already
    if (trip?.status !== 'scheduled') {
      await supabase.from('trips').update({ status: 'scheduled' }).eq('id', trip!.id)
      setTrip(prev => prev ? { ...prev, status: 'scheduled' } : prev)
    }
    trackEvent('destination_dates_set', user?.id ?? null, { trip_id: id, destination_id: datePickerDestId })
    queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(id!) })
    queryClient.invalidateQueries({ queryKey: queryKeys.trip(id!) })
    queryClient.invalidateQueries({ queryKey: queryKeys.trips(user?.id ?? '') })
  }

  const handleDestDatesRemove = async () => {
    if (!datePickerDestId) return
    await supabase
      .from('trip_destinations')
      .update({ start_date: null, end_date: null })
      .eq('id', datePickerDestId)
    setDestinations(prev => prev.map(d => d.id === datePickerDestId
      ? { ...d, start_date: null, end_date: null } : d
    ))
    setDatePickerDestId(null)
    queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(id!) })
  }

  // ── Computed values (must be before early returns to satisfy Rules of Hooks) ──

  const coverImage = destinations.find(d => d.image_url)?.image_url ?? trip?.cover_image_url ?? null
  void coverImage // preserved for future use

  const derivedDateRange = useMemo(() => {
    const starts = destinations.filter(d => d.start_date).map(d => d.start_date!)
    const ends = destinations.filter(d => d.end_date).map(d => d.end_date!)
    if (!starts.length || !ends.length) return null
    return formatDateRange(starts.sort()[0], ends.sort().reverse()[0])
  }, [destinations])

  // ── Loading / error states ────────────────────────────────────────────────

  if (!tripLoading && notFound) {
    return (
      <div className="px-5 pb-24" data-testid="trip-not-found" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>
        <button onClick={() => navigate('/trips')} className="flex items-center gap-1 text-sm text-text-tertiary hover:text-text-secondary transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
          Trips
        </button>
        <div className="mt-16 text-center">
          <p className="text-text-tertiary font-medium text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>Trip not found</p>
          <p className="mt-2 text-sm text-text-faint" style={{ fontFamily: "'DM Sans', sans-serif" }}>This trip may have been deleted or you don't have access.</p>
        </div>
      </div>
    )
  }

  if (tripLoading || destsLoading) {
    return (
      <div className="px-5 pb-24 animate-pulse" style={{ paddingTop: 'calc(2.25rem + env(safe-area-inset-top))' }}>
        <div className="h-3 w-16 bg-bg-muted rounded mb-4" />
        <div className="h-8 w-3/4 bg-bg-muted rounded-lg mb-2" />
        <div className="h-4 w-1/2 bg-bg-muted rounded mb-4" />
        <div className="flex gap-2 mb-6">
          <div className="h-10 w-40 bg-bg-muted rounded-lg" />
          <div className="h-10 w-24 bg-bg-muted rounded-lg" />
        </div>
        <div className="h-px bg-bg-muted mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  // ── Build metadata items for the header ──────────────────────────────────

  const metadataItems: string[] = []
  if (primaryCountry) {
    metadataItems.push(primaryCountry.code ? `[${primaryCountry.code}] ${primaryCountry.name}` : primaryCountry.name)
  }
  if (destinations.length > 0) {
    metadataItems.push(`${destinations.length} destination${destinations.length !== 1 ? 's' : ''}`)
  }
  if (derivedDateRange) {
    metadataItems.push(derivedDateRange)
  }

  // ── Accordion toggle ─────────────────────────────────────────────────────

  // handleAccordionToggle removed — destinations navigate to map view

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-5 pb-24 max-w-[860px] mx-auto" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>

      {/* ── Unified Trip Map (trip + destination levels) ── */}
      {destinations.length > 0 && (
        <UnifiedTripMap
          tripId={id!}
          tripTitle={trip?.title ?? ''}
          statusLabel={trip?.status === 'aspirational' ? 'Someday' : trip?.status === 'planning' ? 'Planning' : 'Upcoming'}
          metadataLine={metadataItems.join(' · ')}
          destinations={destinations}
          collapsed={trip?.map_collapsed ?? false}
          onCollapseToggle={(collapsed) => {
            if (trip) setTrip({ ...trip, map_collapsed: collapsed })
            void supabase.from('trips').update({ map_collapsed: collapsed }).eq('id', id)
          }}
          onBack={() => navigate('/trips')}
          onTitleEdit={handleStartEditTitle}
          onStatusTap={() => setShowStatusDropdown(v => !v)}
          onAddDestination={openAddDest}
          onShare={() => setShowShareModal(true)}
          onCompanions={() => setShowInviteModal(true)}
          companionCount={companions.length}
          onOpenMenu={() => setShowActionMenu(o => !o)}
          onItemSelect={(itemId) => navigate(`/item/${itemId}?backTo=${encodeURIComponent(`/trip/${id}`)}`)}
          onDatesTap={(destId) => setDatePickerDestId(destId)}
          initialDestId={urlDestId ?? null}
          onLevelChange={(_level, destId) => {
            const newPath = destId ? `/trip/${id}/dest/${destId}` : `/trip/${id}`
            if (window.location.pathname !== newPath) {
              window.history.pushState(null, '', newPath)
            }
          }}
        />
      )}

      {/* ── Title editing overlay (shown when editing) ── */}
      {editingTitle && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-5 bg-black/30" onClick={() => setEditingTitle(false)}>
          <div className="bg-bg-card rounded-xl p-4 w-full max-w-sm shadow-lg" onClick={e => e.stopPropagation()}>
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              className="text-xl font-bold text-text-primary bg-transparent border-b-2 border-accent focus:outline-none w-full pb-1"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            />
          </div>
        </div>
      )}

      {/* ── Status dropdown (positioned below map) ── */}
      {showStatusDropdown && trip && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowStatusDropdown(false)} />
          <div
            ref={statusDropdownRef}
            className="bg-bg-card border border-border-subtle rounded-xl shadow-lg overflow-hidden z-50 min-w-[140px] mb-2"
            style={{ position: 'relative', zIndex: 50 }}
          >
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChangeStatus(opt.value)}
                className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                  opt.value === trip.status
                    ? 'text-accent bg-accent-light font-medium'
                    : 'text-text-secondary hover:bg-bg-muted'
                }`}
              >
                {opt.label}
                {opt.value === trip.status && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Action menu dropdown ── */}
      {showActionMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowActionMenu(false)} />
          <div style={{
            position: 'relative', zIndex: 50, marginBottom: 8,
            background: '#ffffff', border: '1px solid #e8e6e1', borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)', padding: '6px 0',
          }}>
            <button
              type="button"
              onClick={() => {
                setShowActionMenu(false)
                if (!trip) return
                const newVal = !trip.is_favorited
                setTrip({ ...trip, is_favorited: newVal })
                toggleFavMutation.mutate({ tripId: trip.id, favorite: newVal })
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px',
                fontSize: 14, color: '#2a2a28', cursor: 'pointer', border: 'none',
                background: 'transparent', fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f3f0')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >{trip?.is_favorited ? 'Unpin' : 'Pin to top'}</button>
            <button
              type="button"
              onClick={() => { setShowActionMenu(false); handleRefreshImages() }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px',
                fontSize: 14, color: '#2a2a28', cursor: 'pointer', border: 'none',
                background: 'transparent', fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f3f0')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >Refresh images</button>
            <button
              type="button"
              onClick={() => { setShowActionMenu(false); setShowDeleteConfirm(true) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px',
                fontSize: 14, color: '#c0392b', cursor: 'pointer', border: 'none',
                background: 'transparent', fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fdf0ef')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >Delete trip</button>
          </div>
        </>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteConfirm && trip && (
        <ConfirmDeleteModal
          title={`Delete ${trip.title}?`}
          description="This will permanently delete this trip and all its destinations. Your saved items won't be affected."
          onCancel={() => setShowDeleteConfirm(false)}
          loading={deleting}
          onConfirm={async () => {
            setDeleting(true)
            const destIds = destinations.map(d => d.id)
            deleteTripMutation.mutate({ tripId: trip.id, destIds }, {
              onSuccess: () => navigate('/trips'),
              onError: () => setDeleting(false),
            })
          }}
        />
      )}

      {/* Modals */}
      {showShareModal && trip && (
        <ShareTripModal
          trip={trip}
          onClose={() => setShowShareModal(false)}
          onUpdated={(updated) => setTrip(updated)}
        />
      )}
      {showInviteModal && (
        <InviteCompanionModal
          companions={companions}
          pendingInvites={pendingInvites}
          onClose={() => setShowInviteModal(false)}
          onInviteByEmail={inviteByEmail}
          onRemove={removeCompanion}
          onRemovePending={removePendingInvite}
        />
      )}
      {datePickerDestId && datePickerDest && (
        <CalendarRangePicker
          startDate={datePickerDest.start_date ?? null}
          endDate={datePickerDest.end_date ?? null}
          onConfirm={handleDestDatesConfirm}
          onRemove={datePickerDest.start_date ? handleDestDatesRemove : undefined}
          onClose={() => setDatePickerDestId(null)}
        />
      )}
      {/* Scroll to top */}
      <ScrollToTop bottom={80} />
      {/* Action toast */}
      {actionToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-text-primary text-white text-sm rounded-full shadow-lg whitespace-nowrap pointer-events-none">
          {actionToast}
        </div>
      )}
    </div>
  )
}
