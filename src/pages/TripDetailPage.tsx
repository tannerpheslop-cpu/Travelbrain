import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { useCompanions } from '../hooks/useCompanions'
import type { CompanionWithUser, PendingInvite } from '../hooks/useCompanions'
import type { Trip, TripDestination, SavedItem, Category, SharePrivacy } from '../types'
import LocationAutocomplete, { type LocationSelection } from '../components/LocationAutocomplete'
import { fetchPlacePhoto } from '../lib/googleMaps'
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Local types ───────────────────────────────────────────────────────────────

interface DestinationItem {
  id: string
  destination_id: string
  item_id: string
  day_index: number | null
  sort_order: number
  saved_item: SavedItem
}

interface DestinationWithItems extends TripDestination {
  destination_items: DestinationItem[]
}

interface GeneralItem {
  id: string
  trip_id: string
  item_id: string
  sort_order: number
  saved_item: SavedItem
}

interface LocatedItem {
  id: string
  location_lat: number
  location_lng: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEST_GRADIENTS = [
  'from-blue-400 to-indigo-600',
  'from-rose-400 to-pink-600',
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-600',
  'from-violet-400 to-purple-600',
  'from-cyan-400 to-sky-600',
]

const categoryColors: Record<Category, { bg: string; text: string }> = {
  restaurant: { bg: 'bg-orange-100', text: 'text-orange-700' },
  activity:   { bg: 'bg-purple-100', text: 'text-purple-700' },
  hotel:      { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  transit:    { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  general:    { bg: 'bg-slate-100',  text: 'text-slate-600'  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortDestName(locationName: string): string {
  return locationName.split(',')[0].trim()
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// ── Schedule Trip Modal ────────────────────────────────────────────────────────

function ScheduleTripModal({
  trip,
  onClose,
  onScheduled,
}: {
  trip: Trip
  onClose: () => void
  onScheduled: (updated: Trip) => void
}) {
  const isAlreadyScheduled = trip.status === 'scheduled'
  const [startDate, setStartDate] = useState(trip.start_date ?? '')
  const [endDate, setEndDate] = useState(trip.end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!startDate || !endDate) { setError('Both dates are required to schedule a trip.'); return }
    if (startDate > endDate) { setError('Start date must be before end date.'); return }

    setSaving(true)
    setError(null)
    const { data, error: dbError } = await supabase
      .from('trips')
      .update({ status: 'scheduled', start_date: startDate, end_date: endDate })
      .eq('id', trip.id)
      .select()
      .single()
    setSaving(false)

    if (dbError) { setError(dbError.message); return }
    onScheduled(data as Trip)
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
    onScheduled(data as Trip)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isAlreadyScheduled ? 'Edit Trip Dates' : 'Schedule Trip'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start date</label>
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setError(null) }} max={endDate || undefined} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">End date</label>
              <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setError(null) }} min={startDate || undefined} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" onClick={handleSave} disabled={saving} className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : isAlreadyScheduled ? 'Update Dates' : 'Schedule Trip'}
          </button>
          {isAlreadyScheduled && (
            <button type="button" onClick={handleUnschedule} disabled={saving} className="w-full py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50">
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

function ShareTripModal({
  trip,
  onClose,
  onUpdated,
}: {
  trip: Trip
  onClose: () => void
  onUpdated: (updated: Trip) => void
}) {
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
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'}`}
                >
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

// ── Invite Companion Modal ────────────────────────────────────────────────────

function InviteCompanionModal({
  companions,
  pendingInvites,
  onClose,
  onInviteByEmail,
  onRemove,
  onRemovePending,
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
              <input ref={emailRef} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setStatus('idle') }} onKeyDown={(e) => { if (e.key === 'Enter') handleInvite() }} placeholder="friend@example.com"
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400" />
              <button type="button" onClick={handleInvite} disabled={status === 'loading' || !email.trim()} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 shrink-0">
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

// ── Destination Card ──────────────────────────────────────────────────────────

function DestinationCard({
  destination,
  index,
  tripId,
  nearbySuggestionCount,
  onDelete,
  dragHandleAttributes,
  dragHandleListeners,
  isDragging,
}: {
  destination: DestinationWithItems
  index: number
  tripId: string
  nearbySuggestionCount: number
  onDelete: (id: string) => void
  dragHandleAttributes?: Record<string, unknown>
  dragHandleListeners?: Record<string, unknown>
  isDragging?: boolean
}) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const gradient = DEST_GRADIENTS[index % DEST_GRADIENTS.length]
  const items = destination.destination_items ?? []
  const thumbnails = items
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 4)
    .map((di) => di.saved_item)
    .filter(Boolean)

  const handleCardClick = () => {
    if (menuOpen) return
    navigate(`/trip/${tripId}/destination/${destination.id}`)
  }

  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm transition-shadow ${isDragging ? 'opacity-40 shadow-lg' : 'hover:shadow-md'}`}
      onClick={handleCardClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Photo header (or gradient fallback) with city name overlay */}
      <div className="h-20 relative overflow-hidden flex items-end px-4 pb-3">
        {/* Background layer: real photo or colour gradient */}
        {destination.image_url ? (
          <>
            <img
              src={destination.image_url}
              alt={shortDestName(destination.location_name)}
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Dark scrim so white text stays legible over any photo */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-black/10" />
          </>
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
        )}

        <span className="relative z-10 text-white text-base font-bold drop-shadow-sm leading-tight">
          {shortDestName(destination.location_name)}
        </span>
        {/* Drag handle */}
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          {...(dragHandleAttributes as React.HTMLAttributes<HTMLButtonElement>)}
          {...(dragHandleListeners as React.HTMLAttributes<HTMLButtonElement>)}
          className="absolute top-2.5 right-10 z-10 p-1.5 rounded-full bg-white/20 hover:bg-white/35 text-white/80 hover:text-white touch-none cursor-grab active:cursor-grabbing transition-colors"
          aria-label="Drag to reorder"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 6zm0 6a2 2 0 10.001 4.001A2 2 0 007 12zm6-12a2 2 0 10.001 4.001A2 2 0 0013 2zm0 6a2 2 0 10.001 4.001A2 2 0 0013 6zm0 6a2 2 0 10.001 4.001A2 2 0 0013 12z" />
          </svg>
        </button>
        {/* ··· menu */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); setConfirming(false) }}
          className="absolute top-2.5 right-2 z-10 p-1.5 rounded-full bg-white/20 hover:bg-white/35 text-white/80 hover:text-white transition-colors"
          aria-label="Destination options"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
          </svg>
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirming(false) }} />
            <div className="absolute top-10 right-2 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
              {!confirming ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors text-left">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                  Remove destination
                </button>
              ) : (
                <div className="px-4 py-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">Remove this destination?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setConfirming(false); setMenuOpen(false) }}
                      className="flex-1 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(destination.id) }}
                      className="flex-1 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">Remove</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Card body */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{destination.location_name}</h3>
            {destination.start_date && destination.end_date ? (
              <p className="text-xs text-gray-500 mt-0.5">{formatDateRange(destination.start_date, destination.end_date)}</p>
            ) : (
              <p className="text-xs text-gray-400 mt-0.5">No dates yet</p>
            )}
          </div>
          <span className="shrink-0 text-xs text-gray-500 font-medium mt-0.5">
            {items.length} place{items.length !== 1 ? 's' : ''} saved
          </span>
        </div>

        {/* Thumbnails */}
        {thumbnails.length > 0 ? (
          <div className="flex gap-1.5 mt-2.5">
            {thumbnails.map((item) => (
              item.image_url ? (
                <img
                  key={item.id}
                  src={item.image_url}
                  alt={item.title}
                  className="w-12 h-12 rounded-xl object-cover bg-gray-100 shrink-0"
                />
              ) : (
                <div
                  key={item.id}
                  className={`w-12 h-12 rounded-xl shrink-0 flex items-center justify-center ${categoryColors[item.category].bg}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-300">
                    <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6z" clipRule="evenodd" />
                  </svg>
                </div>
              )
            ))}
            {items.length > 4 && (
              <div className="w-12 h-12 rounded-xl shrink-0 bg-gray-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-500">+{items.length - 4}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-400">No places added yet</p>
        )}

        {/* Nearby suggestions badge */}
        {nearbySuggestionCount > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="text-xs text-blue-600 font-medium">
              {nearbySuggestionCount} nearby suggestion{nearbySuggestionCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sortable Destination Card (wraps DestinationCard with dnd-kit) ─────────────

function SortableDestinationCard(props: Omit<React.ComponentProps<typeof DestinationCard>, 'dragHandleAttributes' | 'dragHandleListeners' | 'isDragging'>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.destination.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <DestinationCard
        {...props}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
        isDragging={isDragging}
      />
    </div>
  )
}

// ── General Section ───────────────────────────────────────────────────────────

function GeneralSection({ items }: { items: GeneralItem[] }) {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-900">General</h2>
        <span className="text-sm text-gray-400">Trip-wide items</span>
      </div>

      {items.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 px-5 py-6 text-center">
          <p className="text-sm text-gray-500 font-medium">No general items yet</p>
          <p className="mt-1 text-xs text-gray-400 leading-relaxed">
            Items you add to this trip without a specific city will appear here
          </p>
        </div>
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
              </div>
            )
          })}
        </div>
      )}
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

  const [locatedItems, setLocatedItems] = useState<LocatedItem[]>([])

  // Editable title
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Add destination
  const [showAddDest, setShowAddDest] = useState(false)
  const [addingDest, setAddingDest] = useState(false)
  const [addDestKey, setAddDestKey] = useState(0)

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)

  const { companions, pendingInvites, inviteByEmail, removeCompanion, removePendingInvite } = useCompanions(id)

  // Fetch trip
  useEffect(() => {
    if (!user || !id) return
    supabase
      .from('trips')
      .select('*')
      .eq('id', id)
      .eq('owner_id', user.id)
      .single()
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
        if (!error && data) {
          setDestinations(data as unknown as DestinationWithItems[])
        }
        setDestsLoading(false)
      })
  }, [id])

  // Fetch general items
  useEffect(() => {
    if (!id) return
    supabase
      .from('trip_general_items')
      .select('*, saved_item:saved_items(*)')
      .eq('trip_id', id)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setGeneralItems(data as unknown as GeneralItem[])
      })
  }, [id])

  // Fetch user's located items for proximity suggestions
  useEffect(() => {
    if (!user) return
    supabase
      .from('saved_items')
      .select('id, location_lat, location_lng')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .not('location_lat', 'is', null)
      .not('location_lng', 'is', null)
      .then(({ data }) => {
        if (data) setLocatedItems(data as LocatedItem[])
      })
  }, [user])

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
    const { data, error } = await supabase
      .from('trips')
      .update({ title: trimmed })
      .eq('id', trip.id)
      .select()
      .single()
    if (!error && data) setTrip(data as Trip)
  }

  const handleAddDestination = async (loc: LocationSelection | null) => {
    if (!loc || !id) return
    setAddingDest(true)

    // Run DB insert and Places photo fetch in parallel
    const [insertResult, photoUrl] = await Promise.all([
      supabase
        .from('trip_destinations')
        .insert({
          trip_id: id,
          location_name: loc.name,
          location_lat: loc.lat,
          location_lng: loc.lng,
          location_place_id: loc.place_id,
          sort_order: destinations.length,
        })
        .select()
        .single(),
      fetchPlacePhoto(loc.place_id).catch(() => null),
    ])

    const { data, error } = insertResult
    setAddingDest(false)
    setShowAddDest(false)
    setAddDestKey((k) => k + 1)

    if (!error && data) {
      // Optimistically set image_url in local state immediately
      const destData: TripDestination = { ...(data as TripDestination), image_url: photoUrl ?? null }
      const newDest: DestinationWithItems = { ...destData, destination_items: [] }
      setDestinations((prev) => [...prev, newDest])
      trackEvent('destination_added', user?.id ?? null, { trip_id: id, location_name: loc.name })

      // Persist photo URL to DB (fire and forget — local state already has it)
      if (photoUrl) {
        supabase
          .from('trip_destinations')
          .update({ image_url: photoUrl })
          .eq('id', data.id)
          .then(() => {/* no-op */})
          .catch(() => {/* non-critical */})
      }
    }
  }

  const handleDeleteDestination = async (destId: string) => {
    setDestinations((prev) => prev.filter((d) => d.id !== destId))
    await supabase.from('trip_destinations').delete().eq('id', destId)
  }

  // Drag-to-reorder
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

  // ── Loading / error states ────────────────────────────────────────────────────

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
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="h-20 bg-gray-100" />
              <div className="px-4 py-3 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-1/2" />
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((j) => <div key={j} className="w-12 h-12 bg-gray-100 rounded-xl" />)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isScheduled = trip?.status === 'scheduled'

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Back button */}
      <button onClick={() => navigate('/trips')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
        Trips
      </button>

      {/* Trip header */}
      <div className="mt-4 mb-5">
        {/* Editable title */}
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
          <button
            type="button"
            onClick={handleStartEditTitle}
            className="group flex items-center gap-2 text-left"
          >
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{trip?.title}</h1>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>
        )}

        {/* Status + date range */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            trip?.status === 'scheduled' ? 'bg-emerald-100 text-emerald-700' :
            trip?.status === 'planning'  ? 'bg-blue-100 text-blue-700' :
                                           'bg-gray-100 text-gray-500'
          }`}>
            {trip?.status === 'scheduled' ? 'Scheduled' : trip?.status === 'planning' ? 'Planning' : 'Aspirational'}
          </span>
          {isScheduled && trip?.start_date && trip?.end_date && (
            <span className="text-sm text-gray-500">{formatDateRange(trip.start_date, trip.end_date)}</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setShowScheduleModal(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
          </svg>
          {isScheduled ? 'Edit Dates' : 'Schedule'}
        </button>
        <button
          type="button"
          onClick={() => setShowShareModal(true)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 border rounded-xl text-sm font-semibold transition-colors ${
            trip?.share_token
              ? 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M13 4.5a2.5 2.5 0 11.702 1.737L6.97 9.604a2.518 2.518 0 010 .792l6.733 3.367a2.5 2.5 0 11-.671 1.341l-6.733-3.367a2.5 2.5 0 110-3.475l6.733-3.366A2.52 2.52 0 0113 4.5z" />
          </svg>
          {trip?.share_token ? 'Shared ✓' : 'Share'}
        </button>
        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 border rounded-xl text-sm font-semibold transition-colors ${
            companions.length > 0
              ? 'border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
          aria-label="Invite companions"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
          </svg>
          {companions.length > 0 ? companions.length.toString() : '+'}
        </button>
      </div>

      {/* Destination cards */}
      {destinations.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={destinations.map((d) => d.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {destinations.map((dest, idx) => {
                const linkedIds = new Set(dest.destination_items.map((di) => di.item_id))
                const nearbySuggestions = locatedItems.filter(
                  (li) =>
                    !linkedIds.has(li.id) &&
                    haversineKm(li.location_lat, li.location_lng, dest.location_lat, dest.location_lng) <= 50,
                ).length
                return (
                  <SortableDestinationCard
                    key={dest.id}
                    destination={dest}
                    index={idx}
                    tripId={id!}
                    nearbySuggestionCount={nearbySuggestions}
                    onDelete={handleDeleteDestination}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-gray-300 mx-auto mb-3">
            <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          <p className="text-gray-500 font-medium text-sm">No destinations yet</p>
          <p className="mt-1 text-xs text-gray-400">Add your first city or region below</p>
        </div>
      )}

      {/* Add Destination */}
      <div className="mt-4">
        {showAddDest ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <LocationAutocomplete
              key={addDestKey}
              value=""
              onSelect={handleAddDestination}
              label="New destination"
              optional={false}
              placeholder="e.g. Beijing, Tokyo, Paris"
            />
            {addingDest && <p className="mt-2 text-xs text-gray-500 text-center">Adding destination…</p>}
            {!addingDest && (
              <button
                type="button"
                onClick={() => setShowAddDest(false)}
                className="mt-2 w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddDest(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add Destination
          </button>
        )}
      </div>

      {/* General section */}
      <GeneralSection items={generalItems} />

      {/* Modals */}
      {showScheduleModal && trip && (
        <ScheduleTripModal
          trip={trip}
          onClose={() => setShowScheduleModal(false)}
          onScheduled={(updated) => {
            if (updated.status === 'scheduled' && trip.status !== 'scheduled') {
              trackEvent('trip_scheduled', user?.id ?? null, { trip_id: updated.id, start_date: updated.start_date, end_date: updated.end_date })
            }
            setTrip(updated)
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
    </div>
  )
}
