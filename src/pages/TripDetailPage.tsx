import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { useTripItems } from '../hooks/useTripItems'
import type { TripItemWithSave } from '../hooks/useTripItems'
import { useCompanions } from '../hooks/useCompanions'
import type { CompanionWithUser, PendingInvite } from '../hooks/useCompanions'
import type { Trip, Category, SharePrivacy } from '../types'
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

// ── Constants ─────────────────────────────────────────────────────────────────

const categoryColors: Record<Category, { bg: string; text: string }> = {
  restaurant: { bg: 'bg-orange-100', text: 'text-orange-700' },
  activity:   { bg: 'bg-purple-100', text: 'text-purple-700' },
  hotel:      { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  transit:    { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  general:    { bg: 'bg-gray-100',   text: 'text-gray-700'   },
}

const categoryOrder: Category[] = ['restaurant', 'activity', 'hotel', 'transit', 'general']

const categoryLabels: Record<Category, string> = {
  restaurant: 'Restaurants',
  activity:   'Activities',
  hotel:      'Hotels',
  transit:    'Transit',
  general:    'General',
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

function buildDayList(startDate: string, endDate: string): { dayIndex: number; shortDate: string }[] {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const msPerDay = 86400000
  const totalDays = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1
  return Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(start.getTime() + i * msPerDay)
    return {
      dayIndex: i + 1,
      shortDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }
  })
}

// ── TripItemCard (list / category views) ──────────────────────────────────────

function TripItemCard({
  tripItem,
  onRemove,
  inCategoryView,
}: {
  tripItem: TripItemWithSave
  onRemove: () => void
  inCategoryView?: boolean
}) {
  const item = tripItem.saved_item
  const colors = categoryColors[item.category]
  const [imgFailed, setImgFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const showImage = item.image_url && !imgFailed

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="flex gap-3 p-3">
        {showImage ? (
          <img
            src={item.image_url!}
            alt={item.title}
            className="w-20 h-20 object-cover rounded-xl bg-gray-100 shrink-0"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-20 h-20 bg-gray-100 rounded-xl shrink-0 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-gray-300">
              <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}

        <div className="flex-1 min-w-0 py-0.5">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{item.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            {!inCategoryView && (
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
              </span>
            )}
            {item.city && <span className="text-xs text-gray-500 truncate">{item.city}</span>}
          </div>
          {item.site_name && <p className="mt-1 text-xs text-gray-400 truncate">{item.site_name}</p>}
        </div>

        <div className="shrink-0 flex items-start pt-0.5">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="p-1.5 rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              aria-label="Remove from trip"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          ) : (
            <div className="flex gap-1 items-center">
              <button type="button" onClick={() => setConfirming(false)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">Keep</button>
              <button type="button" onClick={onRemove} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">Remove</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
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
      .update({ status: 'draft', start_date: null, end_date: null })
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
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setError(null) }}
                max={endDate || undefined}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setError(null) }}
                min={startDate || undefined}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" onClick={handleSave} disabled={saving} className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : isAlreadyScheduled ? 'Update Dates' : 'Schedule Trip'}
          </button>
          {isAlreadyScheduled && (
            <button type="button" onClick={handleUnschedule} disabled={saving} className="w-full py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50">
              Remove dates (back to Draft)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Share Trip Modal ───────────────────────────────────────────────────────────

const privacyOptions: { value: SharePrivacy; label: string; emoji: string; description: string }[] = [
  { value: 'city_only',  label: 'City Only',       emoji: '🏙️', description: 'Trip name and cities only — no dates or items' },
  { value: 'city_dates', label: 'City + Dates',    emoji: '📅', description: 'Trip name, cities, and date range' },
  { value: 'full',       label: 'Full Itinerary',  emoji: '✈️', description: 'Everything — all items and the day-by-day plan' },
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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Share Trip</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Privacy selector */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Who can see what?</p>
            <div className="flex gap-2">
              {privacyOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setPrivacy(opt.value); setShareUrl(null) }}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-xs font-medium transition-colors ${
                    privacy === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">{selectedOption.description}</p>
          </div>

          {/* Generate button */}
          {!shareUrl && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50"
            >
              {generating ? 'Generating…' : 'Generate Link'}
            </button>
          )}

          {/* Share URL + Copy */}
          {shareUrl && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                <p className="flex-1 text-xs text-gray-600 font-mono truncate">{shareUrl}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    copied
                      ? 'bg-green-600 text-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                  }`}
                >
                  {copied ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                        <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                      </svg>
                      Copy Link
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShareUrl(null)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
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

// ── CompanionChip ─────────────────────────────────────────────────────────────

function CompanionChip({
  companion,
  onRemove,
}: {
  companion: CompanionWithUser
  onRemove: () => void
}) {
  const name = companion.user.display_name ?? companion.user.email
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="flex items-center gap-1.5 bg-gray-100 rounded-full pl-1 pr-2 py-0.5 group">
      <div className="w-6 h-6 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-xs font-semibold shrink-0">
        {initials || '?'}
      </div>
      <span className="text-xs text-gray-700 font-medium max-w-[80px] truncate">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
        aria-label={`Remove ${name}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
        </svg>
      </button>
    </div>
  )
}

// ── InviteCompanionModal ───────────────────────────────────────────────────────

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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Invite Companions</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
          {/* Email input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Invite by email
            </label>
            <div className="flex gap-2">
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setStatus('idle') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleInvite() }}
                placeholder="friend@example.com"
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={handleInvite}
                disabled={status === 'loading' || !email.trim()}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 shrink-0"
              >
                {status === 'loading' ? '…' : 'Invite'}
              </button>
            </div>
          </div>

          {/* Feedback */}
          {status === 'added' && (
            <p className="text-sm text-green-700 font-medium">Companion added!</p>
          )}
          {status === 'invited' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm font-medium text-amber-800">No account found</p>
              <p className="mt-0.5 text-sm text-amber-700">
                They'll need to sign up first. Share the trip link with them!
              </p>
            </div>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          {/* Confirmed companions */}
          {companions.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Companions</p>
              <div className="space-y-2">
                {companions.map((c) => {
                  const name = c.user.display_name ?? c.user.email
                  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('')
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold shrink-0">
                        {initials || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                        {c.user.display_name && (
                          <p className="text-xs text-gray-400 truncate">{c.user.email}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(c.id)}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pending invites */}
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
                    <button
                      type="button"
                      onClick={() => onRemovePending(p.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasAny && (
            <p className="text-sm text-gray-400">No companions yet. Invite someone above!</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── MoveToDayPicker ────────────────────────────────────────────────────────────

function MoveToDayPicker({
  days,
  currentDay,
  onMove,
  onClose,
}: {
  days: { dayIndex: number; shortDate: string }[]
  currentDay: number | null
  onMove: (dayIndex: number | null) => void
  onClose: () => void
}) {
  return (
    <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
      <p className="text-xs text-gray-500 mb-2 font-medium">Move to day</p>
      <div className="flex flex-wrap gap-1.5">
        {days.map(({ dayIndex, shortDate }) => {
          if (dayIndex === currentDay) return null
          return (
            <button
              key={dayIndex}
              type="button"
              onClick={() => { onMove(dayIndex); onClose() }}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              Day {dayIndex} <span className="text-gray-400">{shortDate}</span>
            </button>
          )
        })}
        {currentDay !== null && (
          <button
            type="button"
            onClick={() => { onMove(null); onClose() }}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:border-red-200 hover:text-red-500 transition-colors"
          >
            Unassign
          </button>
        )}
      </div>
    </div>
  )
}

// ── ScheduledItemCard ─────────────────────────────────────────────────────────

function ScheduledItemCard({
  tripItem,
  days,
  onRemove,
  onMove,
}: {
  tripItem: TripItemWithSave
  days: { dayIndex: number; shortDate: string }[]
  onRemove: () => void
  onMove: (dayIndex: number | null) => void
}) {
  const item = tripItem.saved_item
  const colors = categoryColors[item.category]
  const [imgFailed, setImgFailed] = useState(false)
  const [showMovePicker, setShowMovePicker] = useState(false)
  const showImage = item.image_url && !imgFailed

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tripItem.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${isDragging ? 'border-blue-200 shadow-lg' : 'border-gray-200'}`}
    >
      <div className="flex gap-2 p-3">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 flex items-center self-stretch px-0.5 touch-none cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400"
          aria-label="Drag to reorder"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 6zm0 6a2 2 0 10.001 4.001A2 2 0 007 12zm6-12a2 2 0 10.001 4.001A2 2 0 0013 2zm0 6a2 2 0 10.001 4.001A2 2 0 0013 6zm0 6a2 2 0 10.001 4.001A2 2 0 0013 12z" />
          </svg>
        </button>

        {/* Thumbnail */}
        {showImage ? (
          <img src={item.image_url!} alt={item.title} className="w-16 h-16 object-cover rounded-xl bg-gray-100 shrink-0" onError={() => setImgFailed(true)} />
        ) : (
          <div className="w-16 h-16 bg-gray-100 rounded-xl shrink-0 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-gray-300">
              <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 py-0.5">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{item.title}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
              {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
            </span>
            {item.city && <span className="text-xs text-gray-500 truncate">{item.city}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <button type="button" onClick={() => setShowMovePicker((v) => !v)} className="text-xs text-blue-600 font-medium hover:text-blue-700">
              Move to...
            </button>
            <button type="button" onClick={onRemove} className="text-xs text-gray-400 font-medium hover:text-red-500">
              Remove
            </button>
          </div>
        </div>
      </div>

      {showMovePicker && (
        <div className="px-3 pb-3">
          <MoveToDayPicker
            days={days}
            currentDay={tripItem.day_index}
            onMove={onMove}
            onClose={() => setShowMovePicker(false)}
          />
        </div>
      )}
    </div>
  )
}

// ── AddItemsSheet ─────────────────────────────────────────────────────────────

function AddItemsSheet({
  unassignedItems,
  targetDay,
  onAssign,
  onClose,
}: {
  unassignedItems: TripItemWithSave[]
  targetDay: number
  onAssign: (tripItemId: string, dayIndex: number) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Add to Day {targetDay}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 pb-8">
          {unassignedItems.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-gray-500 font-medium">All items are assigned</p>
              <p className="mt-1 text-sm text-gray-400">Head to your Inbox to save more places.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {unassignedItems.map((ti) => {
                const si = ti.saved_item
                return (
                  <li key={ti.id}>
                    <button
                      type="button"
                      onClick={() => onAssign(ti.id, targetDay)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                    >
                      {si.image_url ? (
                        <img src={si.image_url} alt={si.title} className="w-10 h-10 object-cover rounded-xl shrink-0 bg-gray-100" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 rounded-xl shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{si.title}</p>
                        <p className="text-xs text-gray-400 truncate">{si.city ?? si.category}</p>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-blue-500 shrink-0">
                        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                      </svg>
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

// ── DayView ───────────────────────────────────────────────────────────────────

function DayView({
  dayIndex,
  dayItems,
  days,
  onReorder,
  onRemove,
  onMove,
  onOpenAddSheet,
}: {
  dayIndex: number
  dayItems: TripItemWithSave[]
  days: { dayIndex: number; shortDate: string }[]
  onReorder: (orderedIds: string[]) => void
  onRemove: (tripItemId: string) => void
  onMove: (tripItemId: string, dayIndex: number | null) => void
  onOpenAddSheet: () => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = dayItems.findIndex((i) => i.id === active.id)
    const newIndex = dayItems.findIndex((i) => i.id === over.id)
    const reordered = arrayMove(dayItems, oldIndex, newIndex)
    onReorder(reordered.map((i) => i.id))
  }

  return (
    <div className="mt-4">
      {dayItems.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-gray-400 text-sm">No places yet for this day</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={dayItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {dayItems.map((ti) => (
                <ScheduledItemCard
                  key={ti.id}
                  tripItem={ti}
                  days={days}
                  onRemove={() => onRemove(ti.id)}
                  onMove={(targetDay) => onMove(ti.id, targetDay)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <button
        type="button"
        onClick={onOpenAddSheet}
        className="mt-4 w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        Add places to Day {dayIndex}
      </button>
    </div>
  )
}

// ── UnassignedView ────────────────────────────────────────────────────────────

function UnassignedView({
  items,
  days,
  onMove,
  onRemove,
}: {
  items: TripItemWithSave[]
  days: { dayIndex: number; shortDate: string }[]
  onMove: (tripItemId: string, dayIndex: number | null) => void
  onRemove: (tripItemId: string) => void
}) {
  return (
    <div className="mt-4">
      {items.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-gray-500 font-medium">All items are assigned to days</p>
          <p className="mt-1 text-xs text-gray-400">Nice work!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((ti) => (
            <ScheduledItemCard
              key={ti.id}
              tripItem={ti}
              days={days}
              onRemove={() => onRemove(ti.id)}
              onMove={(targetDay) => onMove(ti.id, targetDay)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── DayTabs ───────────────────────────────────────────────────────────────────

function DayTabs({
  days,
  activeDay,
  onSelect,
  hasUnassigned,
}: {
  days: { dayIndex: number; shortDate: string }[]
  activeDay: number | 'unassigned'
  onSelect: (day: number | 'unassigned') => void
  hasUnassigned: boolean
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
      {days.map(({ dayIndex, shortDate }) => {
        const isActive = activeDay === dayIndex
        return (
          <button
            key={dayIndex}
            type="button"
            onClick={() => onSelect(dayIndex)}
            className={`shrink-0 flex flex-col items-center px-4 py-2 rounded-2xl transition-colors ${
              isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className="text-sm font-semibold">Day {dayIndex}</span>
            <span className={`text-xs mt-0.5 ${isActive ? 'text-blue-100' : 'text-gray-400'}`}>{shortDate}</span>
          </button>
        )
      })}
      {hasUnassigned && (
        <button
          type="button"
          onClick={() => onSelect('unassigned')}
          className={`shrink-0 flex flex-col items-center px-4 py-2 rounded-2xl transition-colors ${
            activeDay === 'unassigned' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <span className="text-sm font-semibold">Unassigned</span>
          <span className={`text-xs mt-0.5 ${activeDay === 'unassigned' ? 'text-gray-300' : 'text-gray-400'}`}>•••</span>
        </button>
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
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'category' | 'schedule'>('list')
  const [activeDay, setActiveDay] = useState<number | 'unassigned'>(1)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showAddItemsSheet, setShowAddItemsSheet] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)

  const { items, loading: itemsLoading, removeItem, assignToDay, reorderWithinDay } = useTripItems(id)
  const { companions, pendingInvites, inviteByEmail, removeCompanion, removePendingInvite } = useCompanions(id)

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

  // Auto-switch view mode when trip status changes
  useEffect(() => {
    if (trip?.status === 'scheduled') setViewMode('schedule')
    else if (trip?.status === 'draft') setViewMode('list')
  }, [trip?.status])

  const isLoading = tripLoading || itemsLoading

  // ── Not found ────────────────────────────────────────────────────────────────
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

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="px-4 pt-6 pb-24 animate-pulse">
        <div className="h-4 w-12 bg-gray-200 rounded mb-6" />
        <div className="h-7 w-2/3 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-1/3 bg-gray-200 rounded mb-8" />
        <div className="h-1 bg-gray-100 rounded-full" />
      </div>
    )
  }

  const isScheduled = trip?.status === 'scheduled'

  // Derived data for schedule view
  const days = isScheduled && trip?.start_date && trip?.end_date
    ? buildDayList(trip.start_date, trip.end_date)
    : []

  // Guard activeDay if trip date range shrinks
  if (days.length > 0 && typeof activeDay === 'number' && activeDay > days.length) {
    setActiveDay(1)
  }

  const unassignedItems = items.filter((i) => i.day_index === null)
  const hasUnassigned = unassignedItems.length > 0

  const activeDayItems = activeDay === 'unassigned'
    ? unassignedItems
    : items
        .filter((i) => i.day_index === activeDay)
        .sort((a, b) => a.sort_order - b.sort_order)

  // Filter for list / category views
  const filtered = items.filter((ti) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const si = ti.saved_item
    return (
      si.title.toLowerCase().includes(q) ||
      si.city?.toLowerCase().includes(q) ||
      si.notes?.toLowerCase().includes(q) ||
      si.category.toLowerCase().includes(q)
    )
  })

  const grouped = categoryOrder.reduce<Record<Category, TripItemWithSave[]>>(
    (acc, cat) => {
      acc[cat] = filtered.filter((ti) => ti.saved_item.category === cat)
      return acc
    },
    { restaurant: [], activity: [], hotel: [], transit: [], general: [] }
  )

  // Event handlers
  const handleAssignToDay = (tripItemId: string, dayIndex: number) => {
    assignToDay(tripItemId, dayIndex)
    if (dayIndex !== null) {
      trackEvent('item_assigned_to_day', user?.id ?? null, { trip_id: id, trip_item_id: tripItemId, day_index: dayIndex })
    }
    setShowAddItemsSheet(false)
  }

  const handleMoveToDay = (tripItemId: string, targetDay: number | null) => {
    assignToDay(tripItemId, targetDay)
    if (targetDay !== null) {
      trackEvent('item_assigned_to_day', user?.id ?? null, { trip_id: id, trip_item_id: tripItemId, day_index: targetDay })
    }
  }

  const handleReorder = (orderedIds: string[]) => {
    reorderWithinDay(orderedIds)
  }

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Back */}
      <button onClick={() => navigate('/trips')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
        Trips
      </button>

      {/* Trip header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{trip?.title}</h1>
          <span className={`shrink-0 mt-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isScheduled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
            {isScheduled ? 'Scheduled' : 'Draft'}
          </span>
        </div>
        {isScheduled && trip?.start_date && trip?.end_date ? (
          <p className="mt-1 text-sm text-gray-500">{formatDateRange(trip.start_date, trip.end_date)}</p>
        ) : (
          <p className="mt-1 text-sm text-gray-400">No dates set</p>
        )}
      </div>

      {/* Companion chips — shown when companions exist */}
      {companions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {companions.map((c) => (
            <CompanionChip
              key={c.id}
              companion={c}
              onRemove={() => removeCompanion(c.id)}
            />
          ))}
        </div>
      )}

      {/* Action buttons: Schedule + Share + Invite */}
      <div className="flex gap-2 mb-5">
        <button
          type="button"
          onClick={() => setShowScheduleModal(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
          </svg>
          {isScheduled ? 'Edit Dates' : 'Schedule Trip'}
        </button>
        <button
          type="button"
          onClick={() => setShowShareModal(true)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 border rounded-xl text-sm font-semibold transition-colors ${
            trip?.share_token
              ? 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M13 4.5a2.5 2.5 0 11.702 1.737L6.97 9.604a2.518 2.518 0 010 .792l6.733 3.367a2.5 2.5 0 11-.671 1.341l-6.733-3.367a2.5 2.5 0 110-3.475l6.733-3.366A2.52 2.52 0 0113 4.5z" />
          </svg>
          {trip?.share_token ? 'Shared ✓' : 'Share Trip'}
        </button>
        {/* Invite Companion button */}
        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 border rounded-xl text-sm font-semibold transition-colors ${
            companions.length > 0
              ? 'border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 active:bg-violet-200'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100'
          }`}
          aria-label="Invite companions"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
          </svg>
          {companions.length > 0 ? companions.length.toString() : '+'}
        </button>
      </div>

      {/* Controls — hidden when no items AND not in schedule view */}
      {(items.length > 0 || isScheduled) && (
        <>
          {/* Search bar — only for list / category views */}
          {viewMode !== 'schedule' && (
            <div className="relative mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search places in this trip..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
              />
            </div>
          )}

          {/* View toggle */}
          <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-xl">
            {(['list', 'category'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode === 'list' ? 'List View' : 'Category'}
              </button>
            ))}
            {isScheduled && (
              <button
                type="button"
                onClick={() => setViewMode('schedule')}
                className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  viewMode === 'schedule' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Schedule
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Schedule view ──────────────────────────────────────────────────── */}
      {viewMode === 'schedule' && isScheduled && (
        <>
          <DayTabs
            days={days}
            activeDay={activeDay}
            onSelect={setActiveDay}
            hasUnassigned={hasUnassigned}
          />

          {activeDay !== 'unassigned' ? (
            <DayView
              dayIndex={activeDay as number}
              dayItems={activeDayItems}
              days={days}
              onReorder={handleReorder}
              onRemove={removeItem}
              onMove={handleMoveToDay}
              onOpenAddSheet={() => setShowAddItemsSheet(true)}
            />
          ) : (
            <UnassignedView
              items={unassignedItems}
              days={days}
              onMove={handleMoveToDay}
              onRemove={removeItem}
            />
          )}

          {showAddItemsSheet && typeof activeDay === 'number' && (
            <AddItemsSheet
              unassignedItems={unassignedItems}
              targetDay={activeDay}
              onAssign={handleAssignToDay}
              onClose={() => setShowAddItemsSheet(false)}
            />
          )}
        </>
      )}

      {/* ── List view ──────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <>
          {!itemsLoading && items.length === 0 && (
            <div className="mt-12 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-gray-300">
                  <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="mt-4 text-gray-500 font-medium">No places added yet</p>
              <p className="mt-1 text-sm text-gray-400">
                Head to your{' '}
                <button type="button" onClick={() => navigate('/inbox')} className="text-blue-600 hover:underline">Inbox</button>
                {' '}to add some!
              </p>
            </div>
          )}
          {!itemsLoading && items.length > 0 && filtered.length === 0 && (
            <div className="mt-8 text-center">
              <p className="text-gray-500 font-medium">No matching places</p>
              <p className="mt-1 text-sm text-gray-400">Try a different search term</p>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((tripItem) => (
                <TripItemCard key={tripItem.id} tripItem={tripItem} onRemove={() => removeItem(tripItem.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Category view ─────────────────────────────────────────────────── */}
      {viewMode === 'category' && (
        <>
          {!itemsLoading && items.length === 0 && (
            <div className="mt-12 text-center">
              <p className="text-gray-500 font-medium">No places added yet</p>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="space-y-6">
              {categoryOrder.map((cat) => {
                const catItems = grouped[cat]
                if (catItems.length === 0) return null
                const colors = categoryColors[cat]
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>{categoryLabels[cat]}</span>
                      <span className="text-xs text-gray-400">{catItems.length}</span>
                    </div>
                    <div className="space-y-3">
                      {catItems.map((tripItem) => (
                        <TripItemCard key={tripItem.id} tripItem={tripItem} onRemove={() => removeItem(tripItem.id)} inCategoryView />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Schedule modal */}
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

      {/* Share modal */}
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

      {/* Invite companion modal */}
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
