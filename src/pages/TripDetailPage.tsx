import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { useCompanions } from '../hooks/useCompanions'
import type { CompanionWithUser, PendingInvite } from '../hooks/useCompanions'
import type { Trip, TripDestination, SavedItem, Category, SharePrivacy } from '../types'
import LocationAutocomplete, { type LocationSelection } from '../components/LocationAutocomplete'
import { fetchPlacePhoto } from '../lib/googleMaps'
import { getInboxClusters, type CountryCluster } from '../lib/clusters'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import DestinationSection, { SortableDestinationSection, type DestinationWithItems, type LocatedItemBasic } from './DestinationSection'

// ── Local types ────────────────────────────────────────────────────────────────

interface GeneralItem {
  id: string
  trip_id: string
  item_id: string
  sort_order: number
  saved_item: SavedItem
}

// ── Constants ──────────────────────────────────────────────────────────────────

const categoryColors: Record<Category, { bg: string; text: string }> = {
  restaurant: { bg: 'bg-orange-100', text: 'text-orange-700' },
  activity:   { bg: 'bg-purple-100', text: 'text-purple-700' },
  hotel:      { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  transit:    { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  general:    { bg: 'bg-slate-100',  text: 'text-slate-600'  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return ''
  return code.toUpperCase().split('').map(c =>
    String.fromCodePoint(c.charCodeAt(0) - 0x41 + 0x1F1E6)
  ).join('')
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

// ── Schedule Trip Modal ────────────────────────────────────────────────────────

function ScheduleTripModal({
  trip,
  destinations,
  onClose,
  onScheduled,
}: {
  trip: Trip
  destinations: TripDestination[]
  onClose: () => void
  onScheduled: (updatedTrip: Trip, updatedDests: TripDestination[]) => void
}) {
  const isAlreadyScheduled = trip.status === 'scheduled'
  const [startDate, setStartDate] = useState(trip.start_date ?? '')
  const [endDate, setEndDate] = useState(trip.end_date ?? '')

  const [destDates, setDestDates] = useState<Record<string, { start: string; end: string }>>(() => {
    const init: Record<string, { start: string; end: string }> = {}
    for (const d of destinations) {
      init[d.id] = { start: d.start_date ?? '', end: d.end_date ?? '' }
    }
    return init
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setDestDate = (destId: string, field: 'start' | 'end', val: string) => {
    setDestDates((prev) => ({ ...prev, [destId]: { ...prev[destId], [field]: val } }))
  }

  const handleSave = async () => {
    if (!startDate || !endDate) { setError('Both trip dates are required.'); return }
    if (startDate > endDate) { setError('Start date must be before end date.'); return }
    setSaving(true)
    setError(null)

    const { data: tripData, error: tripError } = await supabase
      .from('trips')
      .update({ status: 'scheduled', start_date: startDate, end_date: endDate })
      .eq('id', trip.id)
      .select()
      .single()

    if (tripError || !tripData) { setSaving(false); setError(tripError?.message ?? 'Failed to save.'); return }

    const updatedDests = await Promise.all(
      destinations.map(async (d) => {
        const dates = destDates[d.id]
        if (!dates?.start || !dates?.end) return d
        const { data } = await supabase
          .from('trip_destinations')
          .update({ start_date: dates.start, end_date: dates.end })
          .eq('id', d.id)
          .select()
          .single()
        return (data as TripDestination) ?? d
      }),
    )

    setSaving(false)
    onScheduled(tripData as Trip, updatedDests)
    onClose()
  }

  const handleUnschedule = async () => {
    setSaving(true)
    setError(null)
    const { data, error: dbError } = await supabase
      .from('trips')
      .update({ status: 'aspirational', start_date: null, end_date: null })
      .eq('id', trip.id)
      .select()
      .single()
    setSaving(false)
    if (dbError || !data) { setError('Failed to unschedule. Please try again.'); return }
    onScheduled(data as Trip, destinations)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{isAlreadyScheduled ? 'Edit Trip Dates' : 'Schedule Trip'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-3">Trip dates</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Start</label>
                <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setError(null) }} max={endDate || undefined}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">End</label>
                <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setError(null) }} min={startDate || undefined}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>
          </div>

          {destinations.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-800">Destination dates</p>
                <span className="text-xs text-gray-400">Optional</span>
              </div>
              <div className="space-y-4">
                {destinations.map((d, i) => (
                  <div key={d.id} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">{i + 1}. {d.location_name.split(',')[0]}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Arrival</label>
                        <input type="date" value={destDates[d.id]?.start ?? ''} onChange={(e) => setDestDate(d.id, 'start', e.target.value)}
                          className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Departure</label>
                        <input type="date" value={destDates[d.id]?.end ?? ''} onChange={(e) => setDestDate(d.id, 'end', e.target.value)}
                          className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="button" onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : isAlreadyScheduled ? 'Update Dates' : 'Schedule Trip'}
          </button>
          {isAlreadyScheduled && (
            <button type="button" onClick={handleUnschedule} disabled={saving}
              className="w-full py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50">
              Remove dates
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Share Trip Modal ───────────────────────────────────────────────────────────

const privacyOptions: { value: SharePrivacy; label: string; emoji: string; description: string }[] = [
  { value: 'city_only',  label: 'City Only',      emoji: '🏙️', description: 'Trip name and cities only — no dates or items' },
  { value: 'city_dates', label: 'City + Dates',   emoji: '📅', description: 'Trip name, cities, and date range' },
  { value: 'full',       label: 'Full Itinerary', emoji: '✈️', description: 'Everything — all items and the day-by-day plan' },
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Share Trip</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Who can see what?</p>
            <div className="flex gap-2">
              {privacyOptions.map((opt) => (
                <button key={opt.value} type="button" onClick={() => { setPrivacy(opt.value); setShareUrl(null) }}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-xs font-medium transition-colors ${privacy === opt.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  <span className="text-base">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">{selectedOption.description}</p>
          </div>
          {!shareUrl && (
            <button type="button" onClick={handleGenerate} disabled={generating} className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50">
              {generating ? 'Generating…' : 'Generate Link'}
            </button>
          )}
          {shareUrl && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                <p className="flex-1 text-xs text-gray-600 font-mono truncate">{shareUrl}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleCopy}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'}`}>
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button type="button" onClick={() => setShareUrl(null)} className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Change
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Invite Companions</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Invite by email</label>
            <div className="flex gap-2">
              <input ref={emailRef} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setStatus('idle') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleInvite() }}
                placeholder="friend@example.com"
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400" />
              <button type="button" onClick={handleInvite} disabled={status === 'loading' || !email.trim()}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 shrink-0">
                {status === 'loading' ? '…' : 'Invite'}
              </button>
            </div>
          </div>
          {status === 'added' && <p className="text-sm text-green-700 font-medium">Companion added!</p>}
          {status === 'invited' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm font-medium text-amber-800">No account found</p>
              <p className="mt-0.5 text-sm text-amber-700">They'll need to sign up first. Share the trip link with them!</p>
            </div>
          )}
          {status === 'error' && <p className="text-sm text-red-600">{errorMsg}</p>}
          {companions.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Companions</p>
              <div className="space-y-2">
                {companions.map((c) => {
                  const name = c.user.display_name ?? c.user.email
                  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('')
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">{initials || '?'}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                        {c.user.display_name && <p className="text-xs text-gray-400 truncate">{c.user.email}</p>}
                      </div>
                      <button type="button" onClick={() => onRemove(c.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0">Remove</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {pendingInvites.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Pending invitations</p>
              <div className="space-y-2">
                {pendingInvites.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400">
                        <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                        <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{p.email}</p>
                      <p className="text-xs text-gray-400">Invitation sent</p>
                    </div>
                    <button type="button" onClick={() => onRemovePending(p.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0">Revoke</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!hasAny && <p className="text-sm text-gray-400">No companions yet. Invite someone above!</p>}
        </div>
      </div>
    </div>
  )
}

// ── General Item Picker Sheet ──────────────────────────────────────────────────

function GeneralItemPickerSheet({
  tripId, existingItemIds, userId, onClose, onAdded,
}: {
  tripId: string
  existingItemIds: Set<string>
  userId: string
  onClose: () => void
  onAdded: (newItem: GeneralItem) => void
}) {
  const [inboxItems, setInboxItems] = useState<SavedItem[]>([])
  const [pickerLoading, setPickerLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setInboxItems((data ?? []) as SavedItem[])
        setPickerLoading(false)
      })
    const t = setTimeout(() => inputRef.current?.focus(), 300)
    return () => clearTimeout(t)
  }, [userId])

  const q = search.trim().toLowerCase()
  const filtered = inboxItems
    .filter((item) => !existingItemIds.has(item.id))
    .filter((item) => !q || item.title.toLowerCase().includes(q) || (item.location_name?.toLowerCase().includes(q) ?? false))

  const handleAdd = async (item: SavedItem) => {
    if (addingId) return
    setAddingId(item.id)

    const { data: existing } = await supabase
      .from('trip_general_items').select('id').eq('trip_id', tripId).eq('item_id', item.id).maybeSingle()

    if (existing) { setAddingId(null); onClose(); return }

    const { data: maxRow } = await supabase
      .from('trip_general_items').select('sort_order').eq('trip_id', tripId)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const sortOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1

    const { data: newRow, error } = await supabase
      .from('trip_general_items')
      .insert({ trip_id: tripId, item_id: item.id, sort_order: sortOrder })
      .select('*, saved_item:saved_items(*)')
      .single()

    setAddingId(null)
    if (!error && newRow) {
      trackEvent('item_added_to_trip_general', userId, { trip_id: tripId, item_id: item.id })
      onAdded(newRow as unknown as GeneralItem)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full bg-white rounded-t-3xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-5 pt-3 pb-4 border-b border-gray-100 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Add to General</h2>
            <button type="button" onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
            </button>
          </div>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input ref={inputRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your saves…"
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {pickerLoading ? (
            <div className="py-12 flex justify-center">
              <svg className="w-6 h-6 text-gray-300 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center px-6">
              <p className="text-sm text-gray-500 font-medium">{search ? 'No matches' : 'All your saves are already added'}</p>
              {search && <p className="mt-1 text-xs text-gray-400">Try a different search term</p>}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((item) => {
                const colors = categoryColors[item.category]
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => handleAdd(item)} disabled={!!addingId}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left disabled:opacity-60">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.title} className="w-10 h-10 rounded-lg object-cover shrink-0 bg-gray-100" />
                      ) : (
                        <div className={`w-10 h-10 rounded-lg shrink-0 flex items-center justify-center ${colors.bg}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-300">
                            <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                        {item.location_name && <p className="text-xs text-gray-400 truncate mt-0.5">{item.location_name}</p>}
                      </div>
                      {addingId === item.id ? (
                        <svg className="w-5 h-5 text-blue-500 animate-spin shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-300 shrink-0">
                          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                        </svg>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ── General Section ────────────────────────────────────────────────────────────

function GeneralSection({
  items, onOpenPicker, onRemove,
}: {
  items: GeneralItem[]
  onOpenPicker: () => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">General</h2>
          <span className="text-sm text-gray-400">Trip-wide items</span>
        </div>
        {items.length > 0 && (
          <button type="button" onClick={onOpenPicker}
            className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add Item
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <button type="button" onClick={onOpenPicker}
          className="w-full flex items-center gap-3 bg-gray-50 rounded-2xl border border-dashed border-gray-200 px-4 py-4 hover:bg-gray-100 transition-colors text-left">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400">
              <path fillRule="evenodd" d="M6 4.75A.75.75 0 016.75 4h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 4.75zM6 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 10zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zM1.99 4.75a1 1 0 011-1h.01a1 1 0 010 2h-.01a1 1 0 01-1-1zM1.99 10a1 1 0 011-1h.01a1 1 0 010 2h-.01a1 1 0 01-1-1zm0 5.25a1 1 0 011-1h.01a1 1 0 010 2h-.01a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700">Add trip-wide items</p>
            <p className="text-xs text-gray-400 mt-0.5">Packing lists, visa guides, travel insurance…</p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-300 shrink-0">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
        </button>
      ) : (
        <div className="space-y-2">
          {items.map((gi) => {
            const item = gi.saved_item
            const colors = categoryColors[item.category]
            return (
              <div key={gi.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-3 py-2.5 shadow-sm">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} className="w-10 h-10 rounded-lg object-cover shrink-0 bg-gray-100" />
                ) : (
                  <div className={`w-10 h-10 rounded-lg shrink-0 flex items-center justify-center ${colors.bg}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-300">
                      <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                  <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                    {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                  </span>
                </div>
                <button type="button" onClick={() => onRemove(gi.id)}
                  className="p-1.5 rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0" aria-label="Remove item">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Add Destination Suggestion List ────────────────────────────────────────────

function AddDestSuggestionList({
  suggestions,
  onSelect,
  disabled = false,
}: {
  suggestions: Array<{ key: string; label: string; flag: string; itemCount: number; loc: LocationSelection }>
  onSelect: (loc: LocationSelection) => void
  disabled?: boolean
}) {
  if (!suggestions.length) return null
  return (
    <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden">
      {suggestions.map((s, i) => (
        <div
          key={s.key}
          className={`flex items-center justify-between px-3 py-2 ${i > 0 ? 'border-t border-gray-100' : ''}`}
        >
          <span className="flex items-center gap-1.5 text-sm text-gray-600 min-w-0">
            <span className="text-base leading-none shrink-0">{s.flag}</span>
            <span className="truncate">{s.label}</span>
            <span className="text-xs text-gray-400 shrink-0">· {s.itemCount}</span>
          </span>
          <button
            type="button"
            onClick={() => onSelect(s.loc)}
            disabled={disabled}
            className="ml-2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Add ${s.label}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Country-to-City Refinement Types ──────────────────────────────────────────

interface RefinementItem {
  id: string            // destination_items.id
  item_id: string
  saved_item: {
    id: string
    title: string
    location_name: string | null
    location_lat: number | null
    location_lng: number | null
    image_url: string | null
    category: string
  }
}

interface RefinementState {
  countryDest: DestinationWithItems
  newCityDest: DestinationWithItems
  nearbyItems: RefinementItem[]
}

// ── Refinement Modal ───────────────────────────────────────────────────────────

function RefinementModal({
  refinement,
  onMove,
  onKeep,
  moving,
}: {
  refinement: RefinementState
  onMove: () => void
  onKeep: () => void
  moving: boolean
}) {
  const { countryDest, newCityDest, nearbyItems } = refinement
  const cityName = newCityDest.location_name.split(',')[0].trim()
  const countryName = countryDest.location_name

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onKeep} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          Move saves to {cityName}?
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {nearbyItems.length} item{nearbyItems.length !== 1 ? 's' : ''} in your{' '}
          <span className="font-medium text-gray-700">{countryName}</span> bucket{' '}
          {nearbyItems.length !== 1 ? 'are' : 'is'} near {cityName}.
        </p>

        {/* Item list */}
        <div className="space-y-2 mb-5 max-h-48 overflow-y-auto">
          {nearbyItems.map((ri) => (
            <div key={ri.id} className="flex items-center gap-2.5">
              {ri.saved_item.image_url ? (
                <img
                  src={ri.saved_item.image_url}
                  alt=""
                  className="w-9 h-9 rounded-lg object-cover shrink-0 bg-gray-100"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{ri.saved_item.title}</p>
                {ri.saved_item.location_name && (
                  <p className="text-xs text-gray-400 truncate">{ri.saved_item.location_name}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onMove}
            disabled={moving}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {moving ? 'Moving…' : `Move to ${cityName}`}
          </button>
          <button
            type="button"
            onClick={onKeep}
            disabled={moving}
            className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Keep in {countryName}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Country Remove Prompt ──────────────────────────────────────────────────────

function CountryRemovePrompt({
  countryDest,
  onRemove,
  onKeep,
  removing,
}: {
  countryDest: DestinationWithItems
  onRemove: () => void
  onKeep: () => void
  removing: boolean
}) {
  const countryName = countryDest.location_name

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onKeep} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          Remove {countryName}?
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          All your {countryName} saves are now in specific cities. You can remove{' '}
          {countryName} as a destination or keep it as a placeholder.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {removing ? 'Removing…' : `Remove ${countryName}`}
          </button>
          <button
            type="button"
            onClick={onKeep}
            disabled={removing}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Keep it
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Trip Detail Page ───────────────────────────────────────────────────────────

export default function TripDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [tripLoading, setTripLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [destinations, setDestinations] = useState<DestinationWithItems[]>([])
  const [destsLoading, setDestsLoading] = useState(true)

  const [generalItems, setGeneralItems] = useState<GeneralItem[]>([])

  const [locatedItems, setLocatedItems] = useState<LocatedItemBasic[]>([])

  // Accordion — which destination is expanded
  const [expandedDestId, setExpandedDestId] = useState<string | null>(null)

  // Editable title
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Add destination
  const [showAddDest, setShowAddDest] = useState(false)
  const [addingDest, setAddingDest] = useState(false)
  const [addDestKey, setAddDestKey] = useState(0)

  // Clusters stored in a ref — intentionally NOT state so loading never triggers a re-render.
  // Any async re-render while a LocationAutocomplete is active disrupts the Google Places widget.
  const inboxClustersRef = useRef<CountryCluster[]>([])
  const [clustersLoaded, setClustersLoaded] = useState(false)
  // Suggestions snapshotted into state only at the moment the panel opens (in openAddDest).
  const [frozenSuggestions, setFrozenSuggestions] = useState<Array<{
    key: string; label: string; flag: string; itemCount: number; loc: LocationSelection
  }>>([])
  // Proactive destination suggestions shown directly on the trip page
  const [tripPageSuggestions, setTripPageSuggestions] = useState<Array<{
    key: string; label: string; flag: string; itemCount: number; loc: LocationSelection
  }>>([])

  /** Build destination suggestions for the trip page from current clusters + destinations. */
  const buildTripPageSuggestions = useCallback(
    (currentDests: DestinationWithItems[]) => {
      const clusters = inboxClustersRef.current
      if (!clusters.length) return []
      const existingCodes = new Set(currentDests.map((d) => d.location_country_code))
      const suggs: Array<{ key: string; label: string; flag: string; itemCount: number; loc: LocationSelection }> = []
      for (const cluster of clusters) {
        if (!existingCodes.has(cluster.country_code)) {
          const singleCity = cluster.cities.length === 1 ? cluster.cities[0] : null
          suggs.push({
            key: `country-${cluster.country_code}`,
            label: singleCity ? singleCity.name : cluster.country,
            flag: countryCodeToFlag(cluster.country_code),
            itemCount: cluster.item_count,
            loc: {
              name: singleCity ? singleCity.name : cluster.country,
              lat: singleCity ? singleCity.lat : cluster.lat,
              lng: singleCity ? singleCity.lng : cluster.lng,
              place_id: singleCity ? singleCity.place_id : `country-${cluster.country_code}`,
              country: cluster.country,
              country_code: cluster.country_code,
              location_type: singleCity ? 'city' : 'country',
              proximity_radius_km: singleCity ? 50 : 500,
            },
          })
        } else {
          for (const city of cluster.cities) {
            const alreadyAdded = currentDests.some(
              (d) =>
                Math.abs((d.location_lat ?? 999) - city.lat) < 0.45 &&
                Math.abs((d.location_lng ?? 999) - city.lng) < 0.45,
            )
            if (!alreadyAdded) {
              suggs.push({
                key: `city-${city.place_id}`,
                label: city.name,
                flag: countryCodeToFlag(cluster.country_code),
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
                },
              })
            }
          }
        }
      }
      return suggs
    },
    [],
  )

  // Country-to-city refinement
  const [refinement, setRefinement] = useState<RefinementState | null>(null)
  const [movingItems, setMovingItems] = useState(false)
  const [countryRemovePrompt, setCountryRemovePrompt] = useState<DestinationWithItems | null>(null)
  const [removingCountry, setRemovingCountry] = useState(false)

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showGeneralPicker, setShowGeneralPicker] = useState(false)

  // Country grouping — derived from destinations, recomputes when order changes
  const countryGroups = useMemo(() => {
    const groups: { country: string; countryCode: string; destinations: DestinationWithItems[] }[] = []
    const seen = new Map<string, number>()
    for (const dest of destinations) {
      const key = dest.location_country ?? 'Unknown'
      if (seen.has(key)) {
        groups[seen.get(key)!].destinations.push(dest)
      } else {
        seen.set(key, groups.length)
        groups.push({ country: key, countryCode: dest.location_country_code ?? '', destinations: [dest] })
      }
    }
    return groups
  }, [destinations])
  const hasMultipleCountries = countryGroups.length > 1

  const { companions, pendingInvites, inviteByEmail, removeCompanion, removePendingInvite } = useCompanions(id)

  // Fetch trip
  useEffect(() => {
    if (!user || !id) return
    supabase.from('trips').select('*').eq('id', id).eq('owner_id', user.id).single()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true)
        else setTrip(data as Trip)
        setTripLoading(false)
      })
  }, [user, id])

  // Fetch destinations with their items
  useEffect(() => {
    if (!id) return
    supabase
      .from('trip_destinations')
      .select('*, destination_items(*, saved_item:saved_items(*))')
      .eq('trip_id', id)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setDestinations(data as unknown as DestinationWithItems[])
        setDestsLoading(false)
      })
  }, [id])

  // Fetch general items
  useEffect(() => {
    if (!id) return
    supabase.from('trip_general_items').select('*, saved_item:saved_items(*)').eq('trip_id', id)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setGeneralItems(data as unknown as GeneralItem[])
      })
  }, [id])

  // Fetch located items for proximity count in collapsed headers
  useEffect(() => {
    if (!user) return
    supabase.from('saved_items').select('id, location_lat, location_lng')
      .eq('user_id', user.id).eq('is_archived', false)
      .not('location_lat', 'is', null).not('location_lng', 'is', null)
      .then(({ data }) => {
        if (data) setLocatedItems(data as LocatedItemBasic[])
      })
  }, [user])

  // Load inbox clusters into a ref; signal readiness via minimal boolean state
  useEffect(() => {
    if (!user) return
    getInboxClusters(user.id).then((clusters) => {
      inboxClustersRef.current = clusters
      setClustersLoaded(true)
    })
  }, [user])

  // Recompute trip-page destination suggestions whenever clusters arrive or destinations change.
  // Safe to depend on `destinations`: it only changes after a destination is added/removed,
  // at which point the LocationAutocomplete key is already incremented (reset) anyway.
  useEffect(() => {
    if (!clustersLoaded) return
    setTripPageSuggestions(buildTripPageSuggestions(destinations))
  }, [clustersLoaded, destinations, buildTripPageSuggestions])

  // Track when add-destination suggestions are shown
  useEffect(() => {
    if (!showAddDest || !frozenSuggestions.length || !user) return
    trackEvent('cluster_suggestion_shown', user.id, {
      trip_id: id,
      context: 'add_destination',
      suggestions: frozenSuggestions.length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddDest])

  // Focus title input when editing starts
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  const handleStartEditTitle = () => {
    setTitleDraft(trip?.title ?? '')
    setEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    const trimmed = titleDraft.trim()
    setEditingTitle(false)
    if (!trip || !trimmed || trimmed === trip.title) return
    const { data, error } = await supabase.from('trips').update({ title: trimmed }).eq('id', trip.id).select().single()
    if (!error && data) setTrip(data as Trip)
  }

  const handleAddDestination = async (loc: LocationSelection | null) => {
    if (!loc || !id) return
    setAddingDest(true)

    const [insertResult, photoUrl] = await Promise.all([
      supabase.from('trip_destinations').insert({
        trip_id: id,
        location_name: loc.name,
        location_lat: loc.lat,
        location_lng: loc.lng,
        location_place_id: loc.place_id,
        location_country: loc.country ?? 'Unknown',
        location_country_code: loc.country_code ?? 'XX',
        location_type: loc.location_type,
        proximity_radius_km: loc.proximity_radius_km,
        sort_order: destinations.length,
      }).select().single(),
      fetchPlacePhoto(loc.place_id).catch(() => null),
    ])

    const { data, error } = insertResult
    setAddingDest(false)
    setShowAddDest(false)
    setAddDestKey((k) => k + 1)

    if (!error && data) {
      const destData: DestinationWithItems = {
        ...(data as DestinationWithItems),
        image_url: photoUrl ?? null,
        destination_items: [],
      }
      setDestinations((prev) => [...prev, destData])
      setExpandedDestId(data.id) // auto-expand the new destination
      trackEvent('destination_added', user?.id ?? null, { trip_id: id, location_name: loc.name, location_type: loc.location_type })

      if (photoUrl) {
        supabase.from('trip_destinations').update({ image_url: photoUrl }).eq('id', data.id)
          .then(() => {/* no-op */}).catch(() => {/* non-critical */})
      }

      // ── Country-to-city refinement check ──────────────────────────────────
      // Only applies when the new destination is a city
      if (loc.location_type === 'city' && loc.country) {
        const countryDest = destinations.find(
          (d) => d.location_type === 'country' && d.location_country === loc.country,
        )
        if (countryDest && countryDest.destination_items.length > 0) {
          // Filter for items in the country bucket that are near this city (≈50km = 0.45°)
          const nearbyItems: RefinementItem[] = countryDest.destination_items
            .filter((di) => {
              const { location_lat, location_lng } = di.saved_item
              if (location_lat == null || location_lng == null) return false
              return (
                Math.abs(location_lat - loc.lat) <= 0.45 &&
                Math.abs(location_lng - loc.lng) <= 0.45
              )
            })
            .map((di) => ({
              id: di.id,
              item_id: di.item_id,
              saved_item: {
                id: di.saved_item.id,
                title: di.saved_item.title,
                location_name: di.saved_item.location_name ?? null,
                location_lat: di.saved_item.location_lat ?? null,
                location_lng: di.saved_item.location_lng ?? null,
                image_url: di.saved_item.image_url ?? null,
                category: di.saved_item.category,
              },
            }))

          if (nearbyItems.length > 0) {
            trackEvent('country_refinement_prompted', user?.id ?? null, {
              trip_id: id,
              country_dest_id: countryDest.id,
              city_dest_id: data.id,
              nearby_items: nearbyItems.length,
            })
            setRefinement({ countryDest, newCityDest: destData, nearbyItems })
          }
        }
      }
    }
  }

  const handleAddFromSuggestion = (loc: LocationSelection) => {
    trackEvent('cluster_suggestion_accepted', user?.id ?? null, {
      trip_id: id,
      location_name: loc.name,
      location_type: loc.location_type,
      context: 'add_destination',
    })
    void handleAddDestination(loc)
  }

  const handleRefinementMove = async () => {
    if (!refinement) return
    const { countryDest, newCityDest, nearbyItems } = refinement
    setMovingItems(true)

    // Move all nearby destination_items to the new city destination
    await Promise.all(
      nearbyItems.map((ri) =>
        supabase.from('destination_items').update({ destination_id: newCityDest.id }).eq('id', ri.id),
      ),
    )

    setMovingItems(false)

    // Update local state: remove items from country dest, add to city dest
    const movedIds = new Set(nearbyItems.map((ri) => ri.id))
    setDestinations((prev) =>
      prev.map((d) => {
        if (d.id === countryDest.id) {
          return { ...d, destination_items: d.destination_items.filter((di) => !movedIds.has(di.id)) }
        }
        if (d.id === newCityDest.id) {
          const addedItems = nearbyItems.map((ri) => ({
            id: ri.id,
            destination_id: newCityDest.id,
            item_id: ri.item_id,
            day_index: null,
            sort_order: d.destination_items.length,
            saved_item: ri.saved_item as SavedItem,
          }))
          return { ...d, destination_items: [...d.destination_items, ...addedItems] }
        }
        return d
      }),
    )

    trackEvent('country_refinement_accepted', user?.id ?? null, {
      trip_id: id,
      country_dest_id: countryDest.id,
      city_dest_id: newCityDest.id,
      moved_items: nearbyItems.length,
    })

    const remainingCount = countryDest.destination_items.length - nearbyItems.length
    setRefinement(null)

    // If country dest is now empty, prompt to remove it
    if (remainingCount === 0) {
      setCountryRemovePrompt(countryDest)
    }
  }

  const handleRefinementKeep = () => {
    setRefinement(null)
  }

  const handleCountryRemove = async () => {
    if (!countryRemovePrompt) return
    setRemovingCountry(true)
    await supabase.from('trip_destinations').delete().eq('id', countryRemovePrompt.id)
    setDestinations((prev) => prev.filter((d) => d.id !== countryRemovePrompt.id))
    if (expandedDestId === countryRemovePrompt.id) setExpandedDestId(null)
    setRemovingCountry(false)
    setCountryRemovePrompt(null)
  }

  const handleCountryKeep = () => {
    setCountryRemovePrompt(null)
  }

  // Opens the add-destination panel. Suggestions are computed here from the ref
  // (no state, no re-renders) and frozen for the lifetime of the open panel.
  const openAddDest = () => {
    const clusters = inboxClustersRef.current
    const suggestions: typeof frozenSuggestions = []

    if (clusters.length) {
      const existingCodes = new Set(destinations.map((d) => d.location_country_code))
      for (const cluster of clusters) {
        const countryInTrip = existingCodes.has(cluster.country_code)
        if (!countryInTrip) {
          const singleCity = cluster.cities.length === 1 ? cluster.cities[0] : null
          suggestions.push({
            key: `country-${cluster.country_code}`,
            label: singleCity ? singleCity.name : cluster.country,
            flag: countryCodeToFlag(cluster.country_code),
            itemCount: cluster.item_count,
            loc: {
              name: singleCity ? singleCity.name : cluster.country,
              lat: singleCity ? singleCity.lat : cluster.lat,
              lng: singleCity ? singleCity.lng : cluster.lng,
              place_id: singleCity ? singleCity.place_id : `country-${cluster.country_code}`,
              country: cluster.country,
              country_code: cluster.country_code,
              location_type: singleCity ? 'city' : 'country',
              proximity_radius_km: singleCity ? 50 : 500,
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
                flag: countryCodeToFlag(cluster.country_code),
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
                },
              })
            }
          }
        }
      }
    }

    setFrozenSuggestions(suggestions)
    setShowAddDest(true)
  }

  const handleDeleteDestination = async (destId: string) => {
    setDestinations((prev) => prev.filter((d) => d.id !== destId))
    if (expandedDestId === destId) setExpandedDestId(null)
    await supabase.from('trip_destinations').delete().eq('id', destId)
  }

  const handleDestDatesUpdated = (updated: TripDestination) => {
    setDestinations((prev) =>
      prev.map((d) =>
        d.id === updated.id
          ? { ...d, start_date: updated.start_date, end_date: updated.end_date }
          : d,
      ),
    )
  }

  const handleRemoveGeneralItem = async (generalItemId: string) => {
    setGeneralItems((prev) => prev.filter((gi) => gi.id !== generalItemId))
    await supabase.from('trip_general_items').delete().eq('id', generalItemId)
  }

  // Drag-to-reorder destinations
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = destinations.findIndex((d) => d.id === active.id)
    const newIndex = destinations.findIndex((d) => d.id === over.id)
    const reordered = arrayMove(destinations, oldIndex, newIndex)
    setDestinations(reordered)
    await Promise.all(
      reordered.map((dest, idx) =>
        supabase.from('trip_destinations').update({ sort_order: idx }).eq('id', dest.id),
      ),
    )
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (!tripLoading && notFound) {
    return (
      <div className="px-4 pt-6 pb-24">
        <button onClick={() => navigate('/trips')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
          Trips
        </button>
        <div className="mt-16 text-center">
          <p className="text-gray-500 font-medium">Trip not found</p>
          <p className="mt-1 text-sm text-gray-400">It may have been deleted.</p>
        </div>
      </div>
    )
  }

  if (tripLoading || destsLoading) {
    return (
      <div className="px-4 pt-6 pb-24 animate-pulse">
        <div className="h-4 w-12 bg-gray-100 rounded-lg mb-6" />
        <div className="h-7 w-2/3 bg-gray-100 rounded-lg mb-2" />
        <div className="h-4 w-1/3 bg-gray-100 rounded-lg mb-6" />
        <div className="flex gap-2 mb-6">
          <div className="h-10 flex-1 bg-gray-100 rounded-xl" />
          <div className="h-10 flex-1 bg-gray-100 rounded-xl" />
          <div className="h-10 w-12 bg-gray-100 rounded-xl" />
        </div>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 px-3 py-3">
                <div className="w-11 h-11 rounded-xl bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isScheduled = trip?.status === 'scheduled'
  const isSingleDest = destinations.length === 1

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Back button */}
      <button onClick={() => navigate('/trips')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
        Trips
      </button>

      {/* Single-destination hero image — destination photo + name + dates, shown in place of the small collapsed header */}
      {isSingleDest && destinations[0] && (
        <div className="relative -mx-4 mt-3 mb-5 h-44 overflow-hidden">
          {destinations[0].image_url ? (
            <img
              src={destinations[0].image_url}
              alt={destinations[0].location_name.split(',')[0].trim()}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-600" />
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          {/* Destination name + dates overlaid */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <p className="text-white font-bold text-xl leading-tight drop-shadow">
              {destinations[0].location_name.split(',')[0].trim()}
            </p>
            {destinations[0].start_date && destinations[0].end_date && (
              <p className="text-white/80 text-sm mt-0.5 drop-shadow">
                {formatDateRange(destinations[0].start_date, destinations[0].end_date)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Trip header */}
      <div className={`${isSingleDest ? '' : 'mt-4 '}mb-5`}>
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTitle()
              if (e.key === 'Escape') setEditingTitle(false)
            }}
            className="text-2xl font-bold text-gray-900 w-full focus:outline-none border-b-2 border-blue-500 pb-0.5 bg-transparent"
          />
        ) : (
          <button type="button" onClick={handleStartEditTitle} className="group flex items-center gap-2 text-left">
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{trip?.title}</h1>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            trip?.status === 'scheduled' ? 'bg-emerald-100 text-emerald-700' :
            trip?.status === 'planning'  ? 'bg-blue-100 text-blue-700' :
                                           'bg-gray-100 text-gray-500'
          }`}>
            {trip?.status === 'scheduled' ? 'Scheduled' : trip?.status === 'planning' ? 'Planning' : 'Aspirational'}
          </span>
          {isScheduled && trip?.start_date && trip?.end_date && (
            <button type="button" onClick={() => setShowScheduleModal(true)}
              className="text-sm text-gray-500 hover:text-gray-700 hover:underline underline-offset-2 transition-colors">
              {formatDateRange(trip.start_date, trip.end_date)}
            </button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-6">
        {!isScheduled && (
          <button type="button" onClick={() => setShowScheduleModal(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
            </svg>
            Schedule Trip
          </button>
        )}
        <button type="button" onClick={() => setShowShareModal(true)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 border rounded-xl text-sm font-semibold transition-colors ${
            trip?.share_token ? 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M13 4.5a2.5 2.5 0 11.702 1.737L6.97 9.604a2.518 2.518 0 010 .792l6.733 3.367a2.5 2.5 0 11-.671 1.341l-6.733-3.367a2.5 2.5 0 110-3.475l6.733-3.366A2.52 2.52 0 0113 4.5z" />
          </svg>
          {trip?.share_token ? 'Shared ✓' : 'Share'}
        </button>
        <button type="button" onClick={() => setShowInviteModal(true)}
          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 border rounded-xl transition-colors ${
            companions.length > 0 ? 'border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
          aria-label="Invite companions"
        >
          {companions.length === 0 ? (
            <span className="flex items-center gap-1 text-sm font-semibold">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
              </svg>
              <span>+</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="flex -space-x-1.5">
                {companions.slice(0, 3).map((c) => {
                  const name = c.user.display_name ?? c.user.email
                  const initials = name.split(/\s+/).slice(0, 2).map((s: string) => s[0]?.toUpperCase() ?? '').join('') || '?'
                  return (
                    <span key={c.id} className="w-6 h-6 rounded-full bg-violet-200 text-violet-800 text-xs font-bold flex items-center justify-center border-2 border-white shrink-0">
                      {initials}
                    </span>
                  )
                })}
              </span>
              {companions.length > 3 && <span className="text-xs font-semibold text-violet-700">+{companions.length - 3}</span>}
            </span>
          )}
        </button>
      </div>

      {/* ── Destination sections — adaptive layout ── */}
      {destinations.length === 0 ? (

        /* ── ZERO destinations: combined empty state with integrated autocomplete ── */
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-blue-400">
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Add your first destination</p>
              <p className="text-xs text-gray-400">Build your trip around cities, regions, or countries</p>
            </div>
          </div>
          {tripPageSuggestions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Suggested from your saves
              </p>
              <AddDestSuggestionList
                suggestions={tripPageSuggestions}
                onSelect={handleAddFromSuggestion}
                disabled={addingDest}
              />
              <p className="mt-3 text-xs text-gray-400 font-medium">Or add a destination manually</p>
            </div>
          )}
          <LocationAutocomplete
            key={addDestKey}
            value=""
            onSelect={handleAddDestination}
            label=""
            optional={false}
            placeholder="e.g. Beijing, Tokyo, France…"
          />
          {addingDest && <p className="mt-2 text-xs text-gray-500 text-center">Adding destination…</p>}
        </div>

      ) : isSingleDest ? (

        /* ── ONE destination: flat/hero layout — content rendered inline, no collapsible wrapper ── */
        <>
          {/* Flat destination content — always visible, no accordion */}
          <DestinationSection
            destination={destinations[0]}
            index={0}
            tripId={id!}
            userId={user!.id}
            isExpanded={true}
            isFlat={true}
            onToggle={() => {}}
            onDelete={handleDeleteDestination}
            onDatesUpdated={handleDestDatesUpdated}
            locatedItems={locatedItems}
            canEdit={true}
          />

          {/* Suggested destinations from inbox — shown when add-dest panel is closed */}
          {tripPageSuggestions.length > 0 && !showAddDest && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                Suggested from your saves
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <AddDestSuggestionList
                  suggestions={tripPageSuggestions}
                  onSelect={handleAddFromSuggestion}
                  disabled={addingDest}
                />
              </div>
            </div>
          )}

          {/* Add Destination — subtle button/form below destination content */}
          <div className="mt-4">
            {showAddDest ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <LocationAutocomplete
                  key={addDestKey}
                  value=""
                  onSelect={handleAddDestination}
                  label="New destination"
                  optional={false}
                  placeholder="e.g. Beijing, Tokyo, France…"
                />
                <AddDestSuggestionList
                  suggestions={frozenSuggestions}
                  onSelect={handleAddFromSuggestion}
                  disabled={addingDest}
                />
                {addingDest && <p className="mt-2 text-xs text-gray-500 text-center">Adding destination…</p>}
                {!addingDest && (
                  <button type="button" onClick={() => setShowAddDest(false)}
                    className="mt-2 w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <button type="button" onClick={openAddDest}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                Add Destination
              </button>
            )}
          </div>
        </>

      ) : (

        /* ── TWO OR MORE destinations: full collapsible accordion with country grouping ── */
        <>
          {/* Timeline + accordion sections */}
          <div className="relative">
            {/* Subtle vertical connecting line */}
            {destinations.length > 1 && (
              <div className="absolute left-[21px] top-8 bottom-8 w-px bg-gray-100 pointer-events-none z-0" />
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={destinations.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {countryGroups.map((group, groupIdx) => (
                    <div key={group.country}>
                      {/* Country group header — shown only when trip spans multiple countries */}
                      {hasMultipleCountries && (
                        <div className={`pl-[27px] flex items-center gap-1.5 ${groupIdx > 0 ? 'mt-4 mb-1.5' : 'mb-1.5'}`}>
                          <span className="text-sm leading-none">{countryCodeToFlag(group.countryCode)}</span>
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{group.country}</span>
                        </div>
                      )}
                      <div className="space-y-2">
                        {group.destinations.map((dest) => {
                          const destIdx = destinations.findIndex((d) => d.id === dest.id)
                          return (
                            <div key={dest.id} className="relative flex items-start gap-2.5">
                              {/* Timeline dot */}
                              <div className={`shrink-0 w-3.5 h-3.5 rounded-full mt-[18px] z-10 ring-2 ring-gray-50 transition-colors flex-none ${expandedDestId === dest.id ? 'bg-blue-500' : 'bg-gray-200'}`} />
                              {/* Section card */}
                              <div className="flex-1 min-w-0">
                                <SortableDestinationSection
                                  destination={dest}
                                  index={destIdx}
                                  tripId={id!}
                                  userId={user!.id}
                                  isExpanded={expandedDestId === dest.id}
                                  onToggle={() => setExpandedDestId(expandedDestId === dest.id ? null : dest.id)}
                                  onDelete={handleDeleteDestination}
                                  onDatesUpdated={handleDestDatesUpdated}
                                  locatedItems={locatedItems}
                                  canEdit={true}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Suggested destinations from inbox — shown when add-dest panel is closed */}
          {tripPageSuggestions.length > 0 && !showAddDest && (
            <div className="mt-3 pl-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                Suggested from your saves
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <AddDestSuggestionList
                  suggestions={tripPageSuggestions}
                  onSelect={handleAddFromSuggestion}
                  disabled={addingDest}
                />
              </div>
            </div>
          )}

          {/* Add Destination */}
          <div className="mt-3 pl-6">
            {showAddDest ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <LocationAutocomplete
                  key={addDestKey}
                  value=""
                  onSelect={handleAddDestination}
                  label="New destination"
                  optional={false}
                  placeholder="e.g. Beijing, Tokyo, France…"
                />
                <AddDestSuggestionList
                  suggestions={frozenSuggestions}
                  onSelect={handleAddFromSuggestion}
                  disabled={addingDest}
                />
                {addingDest && <p className="mt-2 text-xs text-gray-500 text-center">Adding destination…</p>}
                {!addingDest && (
                  <button type="button" onClick={() => setShowAddDest(false)}
                    className="mt-2 w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <button type="button" onClick={openAddDest}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                Add Destination
              </button>
            )}
          </div>
        </>
      )}

      {/* General section */}
      <GeneralSection
        items={generalItems}
        onOpenPicker={() => setShowGeneralPicker(true)}
        onRemove={handleRemoveGeneralItem}
      />

      {/* Modals */}
      {showScheduleModal && trip && (
        <ScheduleTripModal
          trip={trip}
          destinations={destinations}
          onClose={() => setShowScheduleModal(false)}
          onScheduled={(updated, updatedDests) => {
            if (updated.status === 'scheduled' && trip.status !== 'scheduled') {
              trackEvent('trip_scheduled', user?.id ?? null, { trip_id: updated.id, start_date: updated.start_date, end_date: updated.end_date })
            }
            setTrip(updated)
            setDestinations((prev) =>
              prev.map((d) => {
                const ud = updatedDests.find((u) => u.id === d.id)
                return ud ? { ...d, start_date: ud.start_date, end_date: ud.end_date } : d
              }),
            )
          }}
        />
      )}

      {showShareModal && trip && (
        <ShareTripModal
          trip={trip}
          onClose={() => setShowShareModal(false)}
          onUpdated={(updated) => {
            if (updated.share_token && !trip.share_token) {
              trackEvent('trip_shared', user?.id ?? null, { trip_id: updated.id, share_privacy: updated.share_privacy })
            }
            setTrip(updated)
          }}
        />
      )}

      {showInviteModal && (
        <InviteCompanionModal
          companions={companions}
          pendingInvites={pendingInvites}
          onClose={() => setShowInviteModal(false)}
          onInviteByEmail={async (email) => {
            const result = await inviteByEmail(email)
            if (result.ok && result.type === 'added') {
              trackEvent('companion_invited', user?.id ?? null, { trip_id: id })
            }
            return result
          }}
          onRemove={removeCompanion}
          onRemovePending={removePendingInvite}
        />
      )}

      {showGeneralPicker && id && user && (
        <GeneralItemPickerSheet
          tripId={id}
          existingItemIds={new Set(generalItems.map((gi) => gi.item_id))}
          userId={user.id}
          onClose={() => setShowGeneralPicker(false)}
          onAdded={(newItem) => setGeneralItems((prev) => [...prev, newItem])}
        />
      )}

      {refinement && (
        <RefinementModal
          refinement={refinement}
          onMove={handleRefinementMove}
          onKeep={handleRefinementKeep}
          moving={movingItems}
        />
      )}

      {countryRemovePrompt && (
        <CountryRemovePrompt
          countryDest={countryRemovePrompt}
          onRemove={handleCountryRemove}
          onKeep={handleCountryKeep}
          removing={removingCountry}
        />
      )}
    </div>
  )
}
