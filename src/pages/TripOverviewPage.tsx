import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { useTripQuery, useTripDestinations, useInboxClusters, useDeleteTrip, useToggleFavorite, useCompanionsQuery, useCreateDestination, queryKeys, type DestWithCount } from '../hooks/queries'
import { useCompanions as useCompanionsLegacy } from '../hooks/useCompanions'
import type { CompanionWithUser, PendingInvite } from '../hooks/useCompanions'
import { useRoutes } from '../hooks/useRoutes'
import type { Trip, TripStatus, TripNote, TripRoute, SharePrivacy } from '../types'
import LocationAutocomplete, { type LocationSelection } from '../components/LocationAutocomplete'
import { fetchPlacePhoto } from '../lib/googleMaps'
import { fetchDestinationPhoto } from '../lib/unsplash'
import { getScopedCountryCodes } from '../lib/continentCodes'
import TripMap from '../components/map/TripMap'
import { optimizedImageUrl } from '../lib/optimizedImage'
import { trySetTripCoverFromName, maybeUpdateCoverFromDestination } from '../lib/tripCoverImage'
import { type CountryCluster } from '../lib/clusters'
import { CountryCodeBadge, DashedCard, PrimaryButton, SecondaryButton, ConfirmDeleteModal } from '../components/ui'
import DestinationCard from '../components/DestinationCard'
import CalendarRangePicker from '../components/CalendarRangePicker'
import RouteCard from '../components/RouteCard'
import DottedConnector from '../components/DottedConnector'
import SwipeToDelete from '../components/SwipeToDelete'
import { shortName } from '../components/BilingualName'
import { Plus, ChevronDown, Check } from 'lucide-react'
import ScrollToTop from '../components/ScrollToTop'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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

// ── Local types ────────────────────────────────────────────────────────────────

type OverviewEntry =
  | { type: 'destination'; destination: DestWithCount; sortKey: number }
  | { type: 'route'; route: TripRoute; destinations: DestWithCount[]; sortKey: number }

type TabId = 'destinations' | 'itinerary' | 'logistics'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

function shortDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

function spacedCountryName(name: string): string {
  return name.toUpperCase().split('').join(' ')
}

function getEntryCountry(entry: OverviewEntry): string {
  if (entry.type === 'destination') {
    return entry.destination.location_country ?? 'Unknown'
  }
  const first = entry.destinations[0]
  return first?.location_country ?? 'Unknown'
}

function getEntryCountryCode(entry: OverviewEntry): string {
  if (entry.type === 'destination') {
    return entry.destination.location_country_code ?? ''
  }
  const first = entry.destinations[0]
  return first?.location_country_code ?? ''
}

function getEntryId(entry: OverviewEntry): string {
  return entry.type === 'destination' ? entry.destination.id : entry.route.id
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

// ── General Section (Checklist) ───────────────────────────────────────────────

function SortableChecklistItem({
  note, onToggle, onDelete, onUpdate,
}: {
  note: TripNote
  onToggle: () => void
  onDelete: () => void
  onUpdate: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(note.text)
  const inputRef = useRef<HTMLInputElement>(null)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { scale: '1.03', boxShadow: '0 8px 25px rgba(0,0,0,0.12)', zIndex: 50, position: 'relative' as const } : {}),
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleSaveEdit = () => {
    const trimmed = editText.trim()
    setEditing(false)
    if (trimmed && trimmed !== note.text) {
      onUpdate(trimmed)
    } else {
      setEditText(note.text)
    }
  }

  const handleStartEdit = () => {
    if (note.completed) return
    setEditText(note.text)
    setEditing(true)
  }

  return (
    <div ref={setNodeRef} style={style}>
      <SwipeToDelete onDelete={onDelete} enabled>
        <div
          className={`flex items-center gap-2.5 bg-bg-card rounded-xl border border-border-subtle px-3 py-2.5 shadow-sm transition-colors ${
            isDragging ? 'ring-2 ring-accent/25' : ''
          }`}
          {...attributes}
          {...(listeners as React.HTMLAttributes<HTMLDivElement>)}
        >
          {/* Checkbox */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
              note.completed
                ? 'bg-accent border-accent'
                : 'border-border-input hover:border-accent'
            }`}
            aria-label={note.completed ? 'Uncheck' : 'Check'}
          >
            {note.completed && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-white">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Text / Edit */}
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit()
                if (e.key === 'Escape') { setEditing(false); setEditText(note.text) }
              }}
              className="flex-1 text-sm bg-transparent border-b border-accent focus:outline-none py-0 min-w-0"
            />
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              className={`flex-1 text-left text-sm min-w-0 truncate transition-colors ${
                note.completed
                  ? 'line-through text-text-faint'
                  : 'text-text-primary hover:text-text-secondary'
              }`}
            >
              {note.text}
            </button>
          )}
        </div>
      </SwipeToDelete>
    </div>
  )
}

function GeneralSection({
  notes, onAddNote, onDeleteNote, onUpdateNote, onReorderNotes, onClearCompleted,
}: {
  notes: TripNote[]
  onAddNote: (text: string) => void
  onDeleteNote: (noteId: string) => void
  onUpdateNote: (noteId: string, updates: Partial<TripNote>) => void
  onReorderNotes: (reordered: TripNote[]) => void
  onClearCompleted: () => void
}) {
  const [draft, setDraft] = useState('')
  const [showInput, setShowInput] = useState(false)
  const noteInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    const text = draft.trim()
    if (!text) return
    onAddNote(text)
    setDraft('')
  }

  // Sort by sort_order only — checked items stay in place (just strikethrough)
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [notes])

  const uncheckedIds = useMemo(
    () => sortedNotes.filter(n => !n.completed).map(n => n.id),
    [sortedNotes],
  )

  const noteSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleNoteDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Reorder within the full list (checked items stay in place)
    const oldIdx = sortedNotes.findIndex(n => n.id === active.id)
    const newIdx = sortedNotes.findIndex(n => n.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return

    const reordered = arrayMove(sortedNotes, oldIdx, newIdx)
    const all = reordered.map((n, i) => ({ ...n, sort_order: i }))
    onReorderNotes(all)
  }

  const handleOpenInput = () => {
    setShowInput(true)
    setTimeout(() => noteInputRef.current?.focus(), 50)
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-text-primary">Notes</h2>
        <span className="text-sm text-text-faint">Trip-wide notes</span>
      </div>

      {/* Checklist */}
      {notes.length === 0 && !showInput ? (
        <DashedCard
          onClick={handleOpenInput}
          className="flex items-center justify-center gap-2 py-4 text-sm font-semibold text-text-tertiary"
        >
          <Plus className="w-4 h-4" />
          Add trip-wide items like packing lists or visa guides
        </DashedCard>
      ) : (
        <>
          {/* Note input */}
          <div className="flex items-center gap-2 mb-3">
            <input
              ref={noteInputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="Pack power adapter, check visa…"
              className="flex-1 text-sm px-3 py-2 bg-bg-page border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-text-faint"
            />
            <PrimaryButton
              onClick={handleSubmit}
              disabled={!draft.trim()}
              className="px-3 py-2 rounded-xl shrink-0"
            >
              Add
            </PrimaryButton>
          </div>

          {notes.length === 0 ? (
            <p className="text-sm text-text-faint py-1">Type above and press Enter to add your first note.</p>
          ) : (
        <>
          {/* All items in a single list — checked items stay in place with strikethrough */}
          <DndContext sensors={noteSensors} collisionDetection={closestCenter} onDragEnd={handleNoteDragEnd}>
            <SortableContext items={uncheckedIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {sortedNotes.map(note => note.completed ? (
                  <div key={note.id} className="flex items-center gap-2.5 bg-bg-card rounded-xl border border-border-subtle px-3 py-2.5 shadow-sm opacity-60">
                    <button
                      type="button"
                      onClick={() => onUpdateNote(note.id, { completed: false })}
                      className="w-5 h-5 rounded-md border-2 bg-accent border-accent flex items-center justify-center shrink-0"
                      aria-label="Uncheck"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-white">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <span className="flex-1 text-sm text-text-faint line-through min-w-0 truncate">{note.text}</span>
                  </div>
                ) : (
                  <SortableChecklistItem
                    key={note.id}
                    note={note}
                    onToggle={() => onUpdateNote(note.id, { completed: true })}
                    onDelete={() => onDeleteNote(note.id)}
                    onUpdate={(text) => onUpdateNote(note.id, { text })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Clear completed */}
          {notes.some(n => n.completed) && (
            <button
              type="button"
              onClick={onClearCompleted}
              className="mt-2 text-xs text-text-faint hover:text-error font-medium transition-colors"
            >
              Clear completed
            </button>
          )}
        </>
      )}
        </>
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
  suggestions: Array<{ key: string; label: string; countryCode: string; itemCount: number; loc: LocationSelection }>
  onSelect: (loc: LocationSelection) => void
  disabled?: boolean
}) {
  if (!suggestions.length) return null
  return (
    <div className="mt-2 border border-border-subtle rounded-xl overflow-hidden">
      {suggestions.map((s, i) => (
        <div
          key={s.key}
          className={`flex items-center justify-between px-3 py-2 ${i > 0 ? 'border-t border-border-subtle' : ''}`}
        >
          <span className="flex items-center gap-1.5 text-sm text-text-secondary min-w-0">
            <CountryCodeBadge code={s.countryCode} />
            <span className="truncate">{s.label}</span>
            <span className="text-xs text-text-faint shrink-0">· {s.itemCount}</span>
          </span>
          <button
            type="button"
            onClick={() => onSelect(s.loc)}
            disabled={disabled}
            className="ml-2 w-6 h-6 flex items-center justify-center rounded-full bg-bg-muted hover:bg-accent-light text-text-tertiary hover:text-accent transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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

// ── Sortable Overview Entry ────────────────────────────────────────────────────

function SortableOverviewEntry({ entry, children }: { entry: OverviewEntry; children: React.ReactNode }) {
  const id = entry.type === 'destination' ? entry.destination.id : entry.route.id
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { scale: '1.02', boxShadow: '0 8px 25px rgba(0,0,0,0.12)', zIndex: 50, position: 'relative' as const } : {}),
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...(listeners as React.HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  )
}

// ── Tab Navigation ─────────────────────────────────────────────────────────────

const tabs: { id: TabId; label: string }[] = [
  { id: 'destinations', label: 'Destinations' },
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'logistics', label: 'Logistics' },
]

function TabNav({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  return (
    <div className="flex gap-6 border-b border-border">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`pb-2.5 text-[13px] font-medium transition-colors ${
            activeTab === tab.id
              ? 'text-text-primary font-semibold border-b-2 border-accent -mb-px'
              : 'text-text-faint hover:text-text-tertiary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Itinerary Tab (stub) ───────────────────────────────────────────────────────

function ItineraryTab({ destinations }: { destinations: DestWithCount[] }) {
  const datedDests = destinations
    .filter(d => d.start_date && d.end_date)
    .sort((a, b) => a.start_date!.localeCompare(b.start_date!))

  if (datedDests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span className="font-mono text-[28px] text-text-faint opacity-25 mb-3">--</span>
        <p className="text-sm text-text-faint">No dates set yet</p>
        <p className="font-mono text-xs text-text-ghost mt-1">Set dates on your destinations to see the timeline</p>
      </div>
    )
  }

  return (
    <div className="relative pl-8 pt-4">
      {/* Vertical timeline line */}
      <div className="absolute left-3 top-4 bottom-0 w-px bg-border-dashed" />

      {datedDests.map((dest, destIdx) => {
        const city = shortName(dest.location_name)
        const chapterNum = String(destIdx + 1).padStart(2, '0')
        const days = dest.start_date && dest.end_date
          ? Math.ceil((new Date(dest.end_date + 'T00:00:00').getTime() - new Date(dest.start_date + 'T00:00:00').getTime()) / 86400000) + 1
          : 0

        return (
          <div key={dest.id} className="mb-8 last:mb-0">
            {/* Destination header */}
            <div className="flex items-center gap-3 -ml-8 mb-4">
              <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0 z-10">
                <span className="font-mono text-[10px] font-bold text-white">{chapterNum}</span>
              </div>
              <div>
                <p className="text-[17px] font-semibold text-text-primary leading-snug">{city}</p>
                {dest.start_date && dest.end_date && (
                  <span className="font-mono text-[11px] text-text-tertiary">
                    {shortDateRange(dest.start_date, dest.end_date)}
                  </span>
                )}
              </div>
            </div>

            {/* Day entries */}
            {Array.from({ length: days }, (_, dayIdx) => (
              <div key={dayIdx} className="flex items-start gap-3 -ml-8 mb-3 last:mb-0">
                <div className="w-6 h-6 flex items-center justify-center shrink-0 z-10">
                  <div className="w-2 h-2 rounded-full bg-border-dashed" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[11px] font-semibold text-text-tertiary">
                    Day {dayIdx + 1}
                  </p>
                  <p className="text-xs text-text-ghost mt-0.5">No activities planned</p>
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Logistics Tab (empty state) ────────────────────────────────────────────────

function LogisticsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <span className="font-mono text-[28px] text-text-faint opacity-25 mb-3">✎</span>
      <p className="text-sm text-text-faint">No logistics added yet</p>
      <p className="font-mono text-xs text-text-ghost mt-1">Transport, accommodation, and visa info will appear here</p>
    </div>
  )
}

// ── Trip Overview Page ─────────────────────────────────────────────────────────

export default function TripOverviewPage() {
  const { id } = useParams()
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
  const createDestMutation = useCreateDestination()

  // Local mutable state derived from query data (for optimistic updates)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [tripLoading, setTripLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [destinations, setDestinations] = useState<DestWithCount[]>([])
  const [destsLoading, setDestsLoading] = useState(true)
  const [tripNotes, setTripNotes] = useState<TripNote[]>([])

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

  // Active tab
  const [activeTab, setActiveTab] = useState<TabId>('destinations')

  // Editable title
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Add destination
  const addDestFormRef = useRef<HTMLDivElement>(null)
  const [showAddDest, setShowAddDest] = useState(false)
  const [addingDest, setAddingDest] = useState(false)
  const [addDestKey, setAddDestKey] = useState(0)
  const [addDestError, setAddDestError] = useState<string | null>(null)

  // (accordion state removed — destinations navigate to map view now)

  // Clusters
  const inboxClustersRef = useRef<CountryCluster[]>([])
  const [clustersLoaded, setClustersLoaded] = useState(false)
  const [frozenSuggestions, setFrozenSuggestions] = useState<Array<{
    key: string; label: string; countryCode: string; itemCount: number; loc: LocationSelection
  }>>([])
  const [tripPageSuggestions, setTripPageSuggestions] = useState<Array<{
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

  // Organize mode
  const [organizeMode, setOrganizeMode] = useState(false)
  const [selectedDestIds, setSelectedDestIds] = useState<Set<string>>(new Set())
  const [routeNameInput, setRouteNameInput] = useState('')
  const [showRouteNameInput, setShowRouteNameInput] = useState(false)

  // Routes
  const { routes, fetchRoutes, createRoute, ungroupRoute, renameRoute } = useRoutes(id)

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

  const buildTripPageSuggestions = useCallback(
    (currentDests: DestWithCount[]) => {
      let clusters = inboxClustersRef.current
      if (!clusters.length) return []
      // If trip name implies a geographic scope, only suggest from those countries
      if (tripNameScopedCodes && currentDests.length === 0) {
        clusters = clusters.filter((c) => tripNameScopedCodes.has(c.country_code))
        if (!clusters.length) return []
      }
      const existingCodes = new Set(currentDests.map((d) => d.location_country_code))
      const suggs: Array<{ key: string; label: string; countryCode: string; itemCount: number; loc: LocationSelection }> = []
      for (const cluster of clusters) {
        if (!existingCodes.has(cluster.country_code)) {
          // Always show country-level label for countries not yet in the trip.
          // Even if all items cluster into one city/neighborhood, the suggestion
          // represents the country as a whole (e.g. "Thailand · 3" not "Makkasan · 3").
          suggs.push({
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
            const alreadyAdded = currentDests.some(
              (d) =>
                Math.abs((d.location_lat ?? 999) - city.lat) < 0.45 &&
                Math.abs((d.location_lng ?? 999) - city.lng) < 0.45,
            )
            if (!alreadyAdded) {
              suggs.push({
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
      return suggs
    },
    [tripNameScopedCodes],
  )

  // ── Overview entries (destinations + routes) ──────────────────────────────

  const overviewEntries = useMemo((): OverviewEntry[] => {
    const standalone = destinations.filter(d => !d.route_id)

    // Split into dated and undated, sort dated chronologically
    const dated = standalone
      .filter(d => d.start_date)
      .sort((a, b) => a.start_date!.localeCompare(b.start_date!))
    const undated = standalone
      .filter(d => !d.start_date)
      .sort((a, b) => a.sort_order - b.sort_order)

    const sortedStandalone = [...dated, ...undated].map((d, i) => ({
      type: 'destination' as const, destination: d, sortKey: i,
    }))

    const routeEntries = routes.map(r => {
      const routeDests = destinations
        .filter(d => d.route_id === r.id)
        .sort((a, b) => a.sort_order - b.sort_order)
      // Use earliest destination date or high sortKey for undated routes
      const earliestDate = routeDests.find(d => d.start_date)?.start_date
      return {
        type: 'route' as const,
        route: r,
        destinations: routeDests,
        sortKey: earliestDate
          ? dated.findIndex(d => d.start_date! >= earliestDate)
          : sortedStandalone.length + r.sort_order,
      }
    })

    return [...sortedStandalone, ...routeEntries].sort((a, b) => a.sortKey - b.sortKey)
  }, [destinations, routes])

  // Track where undated destinations start (for "Unscheduled" divider)
  const firstUndatedIndex = useMemo(() => {
    const hasDated = overviewEntries.some(e =>
      e.type === 'destination' && e.destination.start_date
    )
    if (!hasDated) return -1 // No divider needed if nothing is dated
    return overviewEntries.findIndex(e =>
      e.type === 'destination' && !e.destination.start_date
    )
  }, [overviewEntries])

  const entryIds = useMemo(() => overviewEntries.map(getEntryId), [overviewEntries])

  // Country grouping
  const hasMultipleCountries = useMemo(() => {
    const countries = new Set(overviewEntries.map(getEntryCountry))
    return countries.size > 1
  }, [overviewEntries])

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

  // Sync tripNotes from trip record
  useEffect(() => {
    if (trip) setTripNotes(Array.isArray(trip.notes) ? trip.notes : [])
  }, [trip])

  // Sync inbox clusters from React Query
  useEffect(() => {
    if (inboxClustersData) {
      inboxClustersRef.current = inboxClustersData
      setClustersLoaded(true)
    }
  }, [inboxClustersData])

  // Recompute trip-page suggestions
  useEffect(() => {
    if (!clustersLoaded) return
    setTripPageSuggestions(buildTripPageSuggestions(destinations))
  }, [clustersLoaded, destinations, buildTripPageSuggestions])

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

  const handleAddDestination = async (loc: LocationSelection | null) => {
    if (!loc || !id) return
    setAddingDest(true)
    setAddDestError(null)

    try {
      // Fetch photo: Unsplash first, Google Places fallback (same as trip creation)
      const unsplash = await fetchDestinationPhoto(loc.name).catch(() => null)
      let imageUrl: string | undefined
      let imageSource: string | undefined
      let imageCreditName: string | undefined
      let imageCreditUrl: string | undefined

      if (unsplash?.url) {
        imageUrl = unsplash.url
        imageSource = 'unsplash'
        imageCreditName = unsplash.photographer
        imageCreditUrl = unsplash.profileUrl
      } else {
        const gPhoto = await fetchPlacePhoto(loc.place_id).catch(() => null)
        if (gPhoto) {
          imageUrl = gPhoto
          imageSource = 'google_places'
        }
      }

      // Use the shared mutation (same as trip creation flow)
      const dest = await createDestMutation.mutateAsync({
        tripId: id,
        location: loc,
        sortOrder: destinations.length,
        imageUrl,
        imageSource,
        imageCreditName,
        imageCreditUrl,
      })

      setShowAddDest(false)
      setDestinations((prev) => [...prev, { ...dest, _count: 0 } as DestWithCount])

      // Upgrade trip cover if needed
      if (imageUrl && trip && trip.cover_image_source !== 'user_upload') {
        void maybeUpdateCoverFromDestination(id, imageUrl, trip.cover_image_source).then(() => {
          setTrip((prev) => prev ? { ...prev, cover_image_url: imageUrl!, cover_image_source: 'destination' } : prev)
        })
      }

      // Nudge trip to planning if aspirational
      void supabase.from('trips').update({ status: 'planning' }).eq('id', id).eq('status', 'aspirational')
    } catch (err) {
      console.error('Failed to create destination:', err)
      setAddDestError('Failed to add destination. Please try again.')
    } finally {
      setAddingDest(false)
      setAddDestKey((k) => k + 1)
    }
  }

  const handleAddFromSuggestion = (loc: LocationSelection) => {
    trackEvent('cluster_suggestion_accepted', user?.id ?? null, {
      trip_id: id,
      location_name: loc.name,
      location_type: loc.location_type,
      context: 'add_destination',
    })
    // Add destination, then auto-link nearby saved items
    void (async () => {
      await handleAddDestination(loc)
      // Find the newly created destination
      const { data: newDests } = await supabase
        .from('trip_destinations')
        .select('id, location_lat, location_lng, proximity_radius_km')
        .eq('trip_id', id!)
        .eq('location_place_id', loc.place_id)
        .order('created_at', { ascending: false })
        .limit(1)
      const newDest = newDests?.[0]
      if (!newDest || !user) return

      // Find nearby saved items (within proximity radius)
      const radiusDeg = (newDest.proximity_radius_km ?? 50) / 111
      const { data: nearbyItems } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .not('location_lat', 'is', null)
        .not('location_lng', 'is', null)
        .gte('location_lat', newDest.location_lat - radiusDeg)
        .lte('location_lat', newDest.location_lat + radiusDeg)
        .gte('location_lng', newDest.location_lng - radiusDeg)
        .lte('location_lng', newDest.location_lng + radiusDeg)

      if (!nearbyItems || nearbyItems.length === 0) return

      // Check which items are already linked to any destination in this trip
      const { data: existingLinks } = await supabase
        .from('destination_items')
        .select('item_id, destination_id')
        .in('item_id', nearbyItems.map(i => i.id))

      const linkedItemIds = new Set((existingLinks ?? [])
        .filter(l => destinations.some(d => d.id === l.destination_id))
        .map(l => l.item_id))

      // Link unlinked nearby items to the new destination
      const toLink = nearbyItems.filter(i => !linkedItemIds.has(i.id))
      if (toLink.length === 0) return

      const inserts = toLink.map((item, idx) => ({
        destination_id: newDest.id,
        item_id: item.id,
        day_index: null,
        sort_order: idx,
      }))

      await supabase.from('destination_items').insert(inserts)
      console.log(`[suggestion] Auto-linked ${toLink.length} items to ${loc.name}`)

      // Nudge trip to planning (items are now linked)
      void supabase.from('trips').update({ status: 'planning' }).eq('id', id!).eq('status', 'aspirational')

      // Refresh destination data
      queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(id!) })
      queryClient.invalidateQueries({ queryKey: queryKeys.trips(user.id) })
    })()
  }

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

  const persistNotes = async (notes: TripNote[]) => {
    if (!id) return
    const { error } = await supabase
      .from('trips')
      .update({ notes })
      .eq('id', id)
    if (error) console.error('Failed to save notes:', error)
    else queryClient.invalidateQueries({ queryKey: queryKeys.trip(id!) })
  }

  const handleAddNote = async (text: string) => {
    if (!id) return
    const note: TripNote = {
      id: crypto.randomUUID(),
      text,
      created_at: new Date().toISOString(),
      completed: false,
      sort_order: tripNotes.length,
    }
    const updated = [...tripNotes, note]
    setTripNotes(updated)
    await persistNotes(updated)
  }

  const handleDeleteNote = async (noteId: string) => {
    const updated = tripNotes.filter((n) => n.id !== noteId)
    setTripNotes(updated)
    await persistNotes(updated)
  }

  const handleUpdateNote = async (noteId: string, updates: Partial<TripNote>) => {
    const updated = tripNotes.map(n => n.id === noteId ? { ...n, ...updates } : n)
    setTripNotes(updated)
    await persistNotes(updated)
  }

  const handleReorderNotes = async (reordered: TripNote[]) => {
    setTripNotes(reordered)
    await persistNotes(reordered)
  }

  const handleClearCompleted = async () => {
    const updated = tripNotes.filter(n => !n.completed)
    setTripNotes(updated)
    await persistNotes(updated)
  }

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

  // ── Organize mode ─────────────────────────────────────────────────────────

  const toggleOrganizeMode = () => {
    if (organizeMode) {
      // Exit organize mode
      setOrganizeMode(false)
      setSelectedDestIds(new Set())
      setShowRouteNameInput(false)
      setRouteNameInput('')
    } else {
      setOrganizeMode(true)
    }
  }

  const handleLongPress = (destId: string) => {
    setOrganizeMode(true)
    setSelectedDestIds(new Set([destId]))
  }

  const toggleDestSelection = (destId: string) => {
    setSelectedDestIds(prev => {
      const next = new Set(prev)
      if (next.has(destId)) next.delete(destId)
      else next.add(destId)
      return next
    })
  }

  const handleGroupAsRoute = () => {
    if (selectedDestIds.size < 2) return
    setShowRouteNameInput(true)
    setRouteNameInput('')
  }

  const handleCreateRoute = async () => {
    const name = routeNameInput.trim()
    if (!name || selectedDestIds.size < 2) return

    // Find the minimum sort_order among selected destinations
    const selectedDests = destinations.filter(d => selectedDestIds.has(d.id))
    const minSort = Math.min(...selectedDests.map(d => d.sort_order))

    const route = await createRoute(name, Array.from(selectedDestIds), minSort)
    if (route) {
      // Update local destinations to reflect route_id
      setDestinations(prev => prev.map(d =>
        selectedDestIds.has(d.id) ? { ...d, route_id: route.id } : d
      ))
      trackEvent('route_created', user?.id ?? null, {
        trip_id: id,
        route_name: name,
        destination_count: selectedDestIds.size,
      })
    }

    // Exit organize mode
    setOrganizeMode(false)
    setSelectedDestIds(new Set())
    setShowRouteNameInput(false)
    setRouteNameInput('')
  }

  const handleUngroupRoute = async (routeId: string) => {
    await ungroupRoute(routeId)
    // Update local destinations to clear route_id
    setDestinations(prev => prev.map(d =>
      d.route_id === routeId ? { ...d, route_id: null } : d
    ))
  }

  const handleRenameRoute = async (routeId: string, newName: string) => {
    await renameRoute(routeId, newName)
  }

  // ── Delete destination (unlinks items back to Horizon) ────────────────────

  const handleDeleteDestination = async (destId: string) => {
    // 1. Delete destination_items links (items stay in saved_items / Horizon)
    await supabase.from('destination_items').delete().eq('destination_id', destId)
    // 2. Delete the destination itself
    await supabase.from('trip_destinations').delete().eq('id', destId)
    // 3. Update local state
    setDestinations(prev => prev.filter(d => d.id !== destId))
    queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(id!) })
    queryClient.invalidateQueries({ queryKey: queryKeys.trips(user?.id ?? '') })
  }

  // ── DnD ───────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = overviewEntries.findIndex(e => getEntryId(e) === active.id)
    const newIndex = overviewEntries.findIndex(e => getEntryId(e) === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(overviewEntries, oldIndex, newIndex)

    // Assign new sort_orders
    const updates: Array<{ table: 'trip_destinations' | 'trip_routes'; id: string; sort_order: number }> = []
    reordered.forEach((entry, idx) => {
      if (entry.type === 'destination') {
        updates.push({ table: 'trip_destinations', id: entry.destination.id, sort_order: idx })
      } else {
        updates.push({ table: 'trip_routes', id: entry.route.id, sort_order: idx })
        // Also keep child destination sort_orders relative within the route
      }
    })

    // Optimistically update local state
    setDestinations(prev => {
      const updated = [...prev]
      for (const u of updates) {
        if (u.table === 'trip_destinations') {
          const dest = updated.find(d => d.id === u.id)
          if (dest) dest.sort_order = u.sort_order
        }
      }
      return updated.sort((a, b) => a.sort_order - b.sort_order)
    })

    // Persist to DB
    await Promise.all(
      updates.map(u =>
        supabase.from(u.table).update({ sort_order: u.sort_order }).eq('id', u.id)
      )
    )
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

      {/* ── Trip Map (full bleed, replaces old header) ── */}
      {destinations.length > 0 && (
        <TripMap
          destinations={destinations.map(d => ({
            id: d.id,
            location_lat: d.location_lat,
            location_lng: d.location_lng,
            location_name: d.location_name.split(',')[0],
          }))}
          header={trip ? {
            title: trip.title,
            statusLabel: trip.status === 'aspirational' ? 'Someday' : trip.status === 'planning' ? 'Planning' : 'Upcoming',
            metadataLine: metadataItems.join(' · '),
          } : undefined}
          onDestinationTap={(destId) => navigate(`/trip/${id}/dest/${destId}`)}
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
          showHint={!localStorage.getItem('youji_map_hint_dismissed')}
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

      {/* ── Tab Navigation ── */}
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ── Tab Content ── */}
      <div className="mt-5">
        {/* ── Destinations Tab ── */}
        {activeTab === 'destinations' && (
          <>
            {/* Organize toggle */}
            {destinations.length >= 2 && (
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-[11px] font-medium text-text-tertiary">
                  {destinations.length} destination{destinations.length !== 1 ? 's' : ''}
                </p>
                <button
                  type="button"
                  onClick={toggleOrganizeMode}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                    organizeMode ? 'text-accent bg-accent-light' : 'text-text-faint hover:text-text-secondary'
                  }`}
                >
                  {organizeMode ? 'Done' : 'Organize'}
                </button>
              </div>
            )}

            {/* ── Overview entries ── */}
            {destinations.length === 0 ? (
              /* Empty state with autocomplete + suggestions */
              <DashedCard className="bg-bg-card p-5">
                <div className="text-center mb-5">
                  <div className="w-12 h-12 bg-accent-light rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-accent">
                      <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-base font-semibold text-text-primary">Where are you headed?</p>
                  <p className="text-sm text-text-faint mt-1">Add a city, country, or region to get started</p>
                </div>
                {tripPageSuggestions.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-2">
                      Suggested from your saves
                    </p>
                    <AddDestSuggestionList
                      suggestions={tripPageSuggestions}
                      onSelect={handleAddFromSuggestion}
                      disabled={addingDest}
                    />
                    <p className="mt-3 text-xs text-text-faint font-medium">Or add a destination manually</p>
                  </div>
                )}
                <LocationAutocomplete
                  key={addDestKey}
                  value=""
                  onSelect={handleAddDestination}
                  placesTypes={['(regions)']}
                  clearOnSelect
                  label=""
                  optional={false}
                  placeholder="e.g. Beijing, Tokyo, France…"
                />
                {addingDest && <p className="mt-2 text-xs text-text-tertiary text-center">Adding destination…</p>}
                {addDestError && <p className="mt-2 text-xs text-error text-center">{addDestError}</p>}
              </DashedCard>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={entryIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0">
                    {overviewEntries.map((entry, i) => {
                      const country = getEntryCountry(entry)
                      const countryCode = getEntryCountryCode(entry)
                      const prevCountry = i > 0 ? getEntryCountry(overviewEntries[i - 1]) : null
                      const showCountryHeader = hasMultipleCountries && country !== prevCountry
                      const showConnector = i > 0
                      const showUnscheduledDivider = i === firstUndatedIndex
                      const entryId = getEntryId(entry)

                      // Chapter number: count destination entries up to this point
                      const destIndex = overviewEntries.slice(0, i).filter(e => e.type === 'destination').length
                      const chapterNum = entry.type === 'destination' ? String(destIndex + 1).padStart(2, '0') : null

                      return (
                        <div key={entryId}>
                          {showUnscheduledDivider && (
                            <p className="font-mono text-[10px] font-medium tracking-[1.5px] text-text-faint uppercase mt-5 mb-2">UNSCHEDULED</p>
                          )}
                          {showCountryHeader && (
                            <div className={`flex items-center gap-2 ${i > 0 ? 'mt-5' : ''} mb-3`}>
                              <CountryCodeBadge code={countryCode} />
                              <span className="font-mono text-[11px] font-bold tracking-[2px] text-text-faint">
                                {spacedCountryName(country)}
                              </span>
                            </div>
                          )}
                          {showConnector && !showUnscheduledDivider && !showCountryHeader && (
                            <DottedConnector longer={false} />
                          )}
                          <SortableOverviewEntry entry={entry}>
                            {entry.type === 'destination' ? (
                              organizeMode ? (
                                /* Organize mode: use existing DestinationCard with selection */
                                <SwipeToDelete
                                  onDelete={() => handleDeleteDestination(entry.destination.id)}
                                  enabled={false}
                                >
                                  <DestinationCard
                                    destination={entry.destination}
                                    itemCount={entry.destination._count}
                                    tripId={id!}
                                    index={destIndex}
                                    organizeMode={organizeMode}
                                    isSelected={selectedDestIds.has(entry.destination.id)}
                                    onToggleSelect={() => toggleDestSelection(entry.destination.id)}
                                    onAddDates={() => setDatePickerDestId(entry.destination.id)}
                                    onDatesTap={() => setDatePickerDestId(entry.destination.id)}
                                    onLongPress={() => handleLongPress(entry.destination.id)}
                                  />
                                </SwipeToDelete>
                              ) : (
                                /* Simple destination row — taps to navigate */
                                <SwipeToDelete
                                  onDelete={() => handleDeleteDestination(entry.destination.id)}
                                  enabled
                                >
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/trip/${id}/dest/${entry.destination.id}`)}
                                    className="w-full flex items-center overflow-hidden rounded-xl border border-border hover:border-accent/25 hover:shadow-sm transition-all duration-150"
                                  >
                                    {/* Chapter number */}
                                    <div className="w-[64px] shrink-0 flex items-center justify-center bg-bg-muted self-stretch">
                                      <span className="font-mono text-[24px] font-extrabold leading-none text-border-dashed">
                                        {chapterNum}
                                      </span>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0 bg-bg-card px-4 py-3.5 flex items-center gap-3">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[16px] font-semibold text-text-primary leading-snug truncate">
                                          {shortName(entry.destination.location_name)}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                          {entry.destination.start_date && entry.destination.end_date ? (
                                            <span className="font-mono text-[10px] text-text-tertiary">
                                              {shortDateRange(entry.destination.start_date, entry.destination.end_date)}
                                            </span>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); setDatePickerDestId(entry.destination.id) }}
                                              className="font-mono text-[10px] text-accent font-medium"
                                            >
                                              + add dates
                                            </button>
                                          )}
                                          <span className="font-mono text-[10px] text-text-ghost">·</span>
                                          <span className="font-mono text-[10px] text-text-tertiary">
                                            {entry.destination._count} save{entry.destination._count !== 1 ? 's' : ''}
                                          </span>
                                        </div>
                                      </div>
                                      <ChevronDown className="w-4 h-4 text-text-ghost shrink-0 -rotate-90" />
                                    </div>
                                  </button>
                                </SwipeToDelete>
                              )
                            ) : (
                              <RouteCard
                                route={entry.route}
                                destinations={entry.destinations.map(d => ({ ...d, itemCount: d._count }))}
                                tripId={id!}
                                organizeMode={organizeMode}
                                onUngroup={() => handleUngroupRoute(entry.route.id)}
                                onRename={(newName) => handleRenameRoute(entry.route.id, newName)}
                              />
                            )}
                          </SortableOverviewEntry>
                        </div>
                      )
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* Dashed "+ Add another destination" card */}
            {destinations.length > 0 && (
              <div className="mt-5">
                {showAddDest ? (
                  <div ref={addDestFormRef} className="bg-bg-card rounded-xl border border-border p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-text-secondary">Add destination</p>
                      <button type="button" onClick={() => { setShowAddDest(false); setAddDestKey(k => k + 1) }}
                        className="p-1 rounded-full text-text-faint hover:text-text-secondary hover:bg-bg-muted transition-colors" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                    </div>
                    <LocationAutocomplete
                      key={addDestKey}
                      value=""
                      onSelect={handleAddDestination}
                      label=""
                      optional={false}
                      placeholder="Search for a destination..."
                      placesTypes={['(regions)']}
                      clearOnSelect
                    />
                    {addingDest && <p className="mt-2 text-xs text-text-tertiary text-center">Adding destination…</p>}
                    {addDestError && <p className="mt-2 text-xs text-error text-center">{addDestError}</p>}
                    {frozenSuggestions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border-subtle">
                        <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-2">
                          Suggested from your saves
                        </p>
                        <AddDestSuggestionList
                          suggestions={frozenSuggestions}
                          onSelect={handleAddFromSuggestion}
                          disabled={addingDest}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <DashedCard
                    onClick={openAddDest}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-text-tertiary"
                  >
                    <Plus className="w-4 h-4" />
                    Add another destination
                  </DashedCard>
                )}
              </div>
            )}

            {/* Trip notes (General section) */}
            <GeneralSection
              notes={tripNotes}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
              onUpdateNote={handleUpdateNote}
              onReorderNotes={handleReorderNotes}
              onClearCompleted={handleClearCompleted}
            />
          </>
        )}

        {/* ── Itinerary Tab ── */}
        {activeTab === 'itinerary' && (
          <ItineraryTab destinations={destinations} />
        )}

        {/* ── Logistics Tab ── */}
        {activeTab === 'logistics' && (
          <LogisticsTab />
        )}
      </div>

      {/* Organize mode bottom bar */}
      {organizeMode && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pb-2">
          <div className="bg-bg-card border border-border rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3">
            {showRouteNameInput ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={routeNameInput}
                  onChange={(e) => setRouteNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateRoute(); if (e.key === 'Escape') { setShowRouteNameInput(false); setRouteNameInput('') } }}
                  placeholder="Route name…"
                  className="flex-1 text-sm px-3 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-text-faint"
                  autoFocus
                />
                <PrimaryButton
                  onClick={handleCreateRoute}
                  disabled={!routeNameInput.trim()}
                  className="px-4 py-2 rounded-xl shrink-0"
                >
                  Create
                </PrimaryButton>
                <SecondaryButton
                  onClick={() => { setShowRouteNameInput(false); setRouteNameInput('') }}
                  className="px-3 py-2 rounded-xl shrink-0"
                >
                  Cancel
                </SecondaryButton>
              </div>
            ) : (
              <>
                <span className="text-sm text-text-secondary flex-1">
                  {selectedDestIds.size === 0
                    ? 'Select destinations to group'
                    : `${selectedDestIds.size} selected`
                  }
                </span>
                <PrimaryButton
                  onClick={handleGroupAsRoute}
                  disabled={selectedDestIds.size < 2}
                  className="px-4 py-2 rounded-xl shrink-0"
                >
                  Group as Route
                </PrimaryButton>
                <SecondaryButton
                  onClick={toggleOrganizeMode}
                  className="px-3 py-2 rounded-xl shrink-0"
                >
                  Done
                </SecondaryButton>
              </>
            )}
          </div>
        </div>
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
