import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { useCompanions } from '../hooks/useCompanions'
import { useRoutes } from '../hooks/useRoutes'
import type { CompanionWithUser, PendingInvite } from '../hooks/useCompanions'
import type { Trip, TripDestination, TripNote, TripRoute, SharePrivacy } from '../types'
import LocationAutocomplete, { type LocationSelection } from '../components/LocationAutocomplete'
import { fetchPlacePhoto } from '../lib/googleMaps'
import { trySetTripCoverFromName, maybeUpdateCoverFromDestination } from '../lib/tripCoverImage'
import { getInboxClusters, type CountryCluster } from '../lib/clusters'
import { BrandMark, CountryCodeBadge, StatusBadge, MetadataLine, DashedCard, PrimaryButton, SecondaryButton } from '../components/ui'
import DestinationCard from '../components/DestinationCard'
import CalendarRangePicker from '../components/CalendarRangePicker'
import RouteCard from '../components/RouteCard'
import DottedConnector from '../components/DottedConnector'
import SwipeToDelete from '../components/SwipeToDelete'
import { shortName } from '../components/BilingualName'
import { Plus, Share2, ChevronDown } from 'lucide-react'
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

type DestWithCount = TripDestination & { _count: number }

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-bg-card rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
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
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-bg-page border border-border rounded-xl px-3 py-2.5">
                <p className="flex-1 text-xs text-text-secondary font-mono truncate">{shareUrl}</p>
              </div>
              <div className="flex gap-2">
                <PrimaryButton onClick={handleCopy}
                  className={`flex-1 py-2.5 rounded-xl ${copied ? '!bg-success' : ''}`}>
                  {copied ? 'Copied!' : 'Copy Link'}
                </PrimaryButton>
                <SecondaryButton onClick={() => setShareUrl(null)} className="px-4 py-2.5 rounded-xl">
                  Change
                </SecondaryButton>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-error">{error}</p>}
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
      <div className="relative w-full max-w-lg bg-bg-card rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
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
                  const name = c.user.display_name ?? c.user.email
                  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('')
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent-light text-accent flex items-center justify-center text-sm font-semibold shrink-0">{initials || '?'}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{name}</p>
                        {c.user.display_name && <p className="text-xs text-text-faint truncate">{c.user.email}</p>}
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
    </div>
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

  // Sort: unchecked first by sort_order, then checked by sort_order
  const sortedNotes = useMemo(() => {
    const unchecked = notes.filter(n => !n.completed).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const checked = notes.filter(n => n.completed).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return [...unchecked, ...checked]
  }, [notes])

  const uncheckedIds = useMemo(
    () => sortedNotes.filter(n => !n.completed).map(n => n.id),
    [sortedNotes],
  )

  const hasCompleted = notes.some(n => n.completed)

  const noteSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleNoteDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const unchecked = sortedNotes.filter(n => !n.completed)
    const checked = sortedNotes.filter(n => n.completed)

    const oldIdx = unchecked.findIndex(n => n.id === active.id)
    const newIdx = unchecked.findIndex(n => n.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return

    const reordered = arrayMove(unchecked, oldIdx, newIdx)
    const all = [...reordered, ...checked].map((n, i) => ({ ...n, sort_order: i }))
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
          <DndContext sensors={noteSensors} collisionDetection={closestCenter} onDragEnd={handleNoteDragEnd}>
            <SortableContext items={uncheckedIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {sortedNotes.filter(n => !n.completed).map(note => (
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

          {/* Checked items (not draggable, just strikethrough + muted) */}
          {hasCompleted && (
            <div className="space-y-1.5 mt-2">
              {sortedNotes.filter(n => n.completed).map(note => (
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
              ))}
            </div>
          )}

          {/* Clear completed */}
          {hasCompleted && (
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

  // Core state
  const [trip, setTrip] = useState<Trip | null>(null)
  const [tripLoading, setTripLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [destinations, setDestinations] = useState<DestWithCount[]>([])
  const [destsLoading, setDestsLoading] = useState(true)

  const [tripNotes, setTripNotes] = useState<TripNote[]>([])

  // Active tab
  const [activeTab, setActiveTab] = useState<TabId>('destinations')

  // Editable title
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Add destination
  const [showAddDest, setShowAddDest] = useState(false)
  const [addingDest, setAddingDest] = useState(false)
  const [addDestKey, setAddDestKey] = useState(0)
  const [addDestError, setAddDestError] = useState<string | null>(null)

  // Expanded accordion destination
  const [expandedDestId, setExpandedDestId] = useState<string | null>(null)

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [datePickerDestId, setDatePickerDestId] = useState<string | null>(null)

  // Organize mode
  const [organizeMode, setOrganizeMode] = useState(false)
  const [selectedDestIds, setSelectedDestIds] = useState<Set<string>>(new Set())
  const [routeNameInput, setRouteNameInput] = useState('')
  const [showRouteNameInput, setShowRouteNameInput] = useState(false)

  // Routes
  const { routes, fetchRoutes, createRoute, ungroupRoute, renameRoute } = useRoutes(id)

  // Companions
  const { companions, pendingInvites, inviteByEmail, removeCompanion, removePendingInvite } = useCompanions(id)

  // Ref for global event listener
  const openAddDestRef = useRef<() => void>(() => {})

  // ── Build suggestions ─────────────────────────────────────────────────────

  const buildTripPageSuggestions = useCallback(
    (currentDests: DestWithCount[]) => {
      const clusters = inboxClustersRef.current
      if (!clusters.length) return []
      const existingCodes = new Set(currentDests.map((d) => d.location_country_code))
      const suggs: Array<{ key: string; label: string; countryCode: string; itemCount: number; loc: LocationSelection }> = []
      for (const cluster of clusters) {
        if (!existingCodes.has(cluster.country_code)) {
          const singleCity = cluster.cities.length === 1 ? cluster.cities[0] : null
          suggs.push({
            key: `country-${cluster.country_code}`,
            label: singleCity ? singleCity.name : cluster.country,
            countryCode: cluster.country_code,
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
    [],
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

  // ── Data fetching ─────────────────────────────────────────────────────────

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

  // Fetch destinations with item counts
  useEffect(() => {
    if (!id) return
    supabase
      .from('trip_destinations')
      .select('*, destination_items(count)')
      .eq('trip_id', id)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          const mapped: DestWithCount[] = (data as unknown as Array<TripDestination & { destination_items: Array<{ count: number }> }>)
            .map(d => ({
              ...d,
              _count: d.destination_items?.[0]?.count ?? 0,
            }))
          setDestinations(mapped)
        }
        setDestsLoading(false)
      })
  }, [id])

  // Fetch routes
  useEffect(() => {
    if (id) fetchRoutes()
  }, [id, fetchRoutes])

  // Sync tripNotes from trip record
  useEffect(() => {
    if (trip) setTripNotes(Array.isArray(trip.notes) ? trip.notes : [])
  }, [trip])

  // Load inbox clusters
  useEffect(() => {
    if (!user) return
    getInboxClusters(user.id).then((clusters) => {
      inboxClustersRef.current = clusters
      setClustersLoaded(true)
    })
  }, [user])

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

  const handleStartEditTitle = () => {
    setTitleDraft(trip?.title ?? '')
    setEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    const trimmed = titleDraft.trim()
    setEditingTitle(false)
    if (!trip || !trimmed || trimmed === trip.title) return
    const { data, error } = await supabase.from('trips').update({ title: trimmed }).eq('id', trip.id).select().single()
    if (!error && data) {
      const updatedTrip = data as Trip
      setTrip(updatedTrip)

      // If the trip has no destinations and the cover wasn't user-uploaded, re-check new name
      if (destinations.length === 0 && updatedTrip.cover_image_source !== 'user_upload') {
        void trySetTripCoverFromName(trip.id, trimmed).then((url) => {
          if (url) setTrip((prev) => prev ? { ...prev, cover_image_url: url, cover_image_source: 'trip_name' } : prev)
        })
      }
    }
  }

  const handleAddDestination = async (loc: LocationSelection | null) => {
    if (!loc || !id) return
    setAddingDest(true)
    setAddDestError(null)

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
        location_name_en: loc.name_en ?? null,
        location_name_local: loc.name_local ?? null,
        sort_order: destinations.length,
      }).select().single(),
      fetchPlacePhoto(loc.place_id).catch(() => null),
    ])

    const { data, error } = insertResult
    setAddingDest(false)
    setAddDestKey((k) => k + 1)

    if (error || !data) {
      console.error('Failed to create destination:', error)
      setAddDestError('Failed to add destination. Please try again.')
      return
    }

    setShowAddDest(false)

    const destData: DestWithCount = {
      ...(data as TripDestination),
      image_url: photoUrl ?? null,
      _count: 0,
    }
    setDestinations((prev) => [...prev, destData])
    trackEvent('destination_added', user?.id ?? null, { trip_id: id, location_name: loc.name, location_type: loc.location_type })

    if (photoUrl) {
      await supabase.from('trip_destinations').update({ image_url: photoUrl }).eq('id', data.id)

      // If trip's cover came from its name (or has none), upgrade to destination image
      if (trip) {
        void maybeUpdateCoverFromDestination(id, photoUrl, trip.cover_image_source).then(() => {
          if (trip.cover_image_source !== 'user_upload') {
            setTrip((prev) => prev ? { ...prev, cover_image_url: photoUrl, cover_image_source: 'destination' } : prev)
          }
        })
      }
    }

    // Nudge trip to planning if aspirational
    void supabase.from('trips').update({ status: 'planning' }).eq('id', id).eq('status', 'aspirational')
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
            countryCode: cluster.country_code,
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
  }

  openAddDestRef.current = openAddDest

  const persistNotes = async (notes: TripNote[]) => {
    if (!id) return
    const { error } = await supabase
      .from('trips')
      .update({ notes })
      .eq('id', id)
    if (error) console.error('Failed to save notes:', error)
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
      <div className="px-5 pb-24" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>
        <button onClick={() => navigate('/trips')} className="flex items-center gap-1 text-sm text-text-tertiary hover:text-text-secondary transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
          Trips
        </button>
        <div className="mt-16 text-center">
          <p className="text-text-tertiary font-medium">Trip not found</p>
          <p className="mt-1 text-sm text-text-faint">It may have been deleted.</p>
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

  const handleAccordionToggle = (destId: string) => {
    setExpandedDestId(prev => prev === destId ? null : destId)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-5 pb-24 max-w-[860px] mx-auto" style={{ paddingTop: 'calc(2.25rem + env(safe-area-inset-top))' }}>
      {/* ── Header ── */}
      <div className="mb-6">
        {/* Back + Brand */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate('/trips')} className="flex items-center gap-1 text-sm text-text-tertiary hover:text-text-secondary transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
            Trips
          </button>
          <BrandMark />
        </div>

        {/* Trip title */}
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
            className="text-[32px] font-bold text-text-primary leading-[1.2] tracking-[-0.5px] bg-transparent border-b-2 border-accent focus:outline-none w-full pb-0.5"
          />
        ) : (
          <button type="button" onClick={handleStartEditTitle} className="group flex items-center gap-2 text-left">
            <h1 className="text-[32px] font-bold text-text-primary leading-[1.2] tracking-[-0.5px]">{trip?.title}</h1>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className="w-4 h-4 text-text-ghost group-hover:text-text-tertiary transition-colors shrink-0 mt-2">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>
        )}

        {/* Metadata line + status badge */}
        <div className="flex items-center gap-2 mt-1.5">
          {trip && <StatusBadge status={trip.status} />}
          {metadataItems.length > 0 && <MetadataLine items={metadataItems} />}
        </div>

        {/* Action buttons (below metadata) */}
        <div className="flex items-center gap-2 mt-5">
          {destinations.length > 0 && (
            <PrimaryButton onClick={openAddDest} className="flex items-center gap-1.5 px-4 py-2 rounded-lg">
              <Plus className="w-4 h-4" />
              Add Destination
            </PrimaryButton>
          )}
          <SecondaryButton onClick={() => setShowShareModal(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg">
            <Share2 className="w-4 h-4" />
            Share
          </SecondaryButton>
          <SecondaryButton onClick={() => setShowInviteModal(true)} className="relative px-3 py-2 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            {companions.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent rounded-full text-[10px] text-white font-bold flex items-center justify-center">
                {companions.length}
              </span>
            )}
          </SecondaryButton>

          {/* ··· action menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowActionMenu(o => !o)}
              style={{
                background: '#ffffff', border: '1px solid #e0ddd7', borderRadius: 8,
                padding: '9px 14px', cursor: 'pointer', fontSize: 16, fontWeight: 500,
                color: '#6b6860', letterSpacing: 2, fontFamily: "'DM Sans', sans-serif", lineHeight: 1,
              }}
            >···</button>
            {showActionMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowActionMenu(false)} />
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
                  background: '#ffffff', border: '1px solid #e8e6e1', borderRadius: 10,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)', padding: '6px 0', minWidth: 180,
                }}>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowActionMenu(false)
                      if (!trip) return
                      const newVal = !trip.is_favorited
                      setTrip({ ...trip, is_favorited: newVal })
                      await supabase.from('trips').update({ is_favorited: false }).eq('owner_id', trip.owner_id).eq('is_favorited', true)
                      if (newVal) await supabase.from('trips').update({ is_favorited: true }).eq('id', trip.id)
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
          </div>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteConfirm && trip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteConfirm(false) }}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.3)' }} />
          <div style={{
            position: 'relative', background: '#ffffff', borderRadius: 14,
            maxWidth: 340, width: '90%', padding: 24,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Delete {trip.title}?
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
              This will permanently delete this trip and remove all destination links. Your saved items in the inbox won't be affected.
            </p>
            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  background: '#ffffff', border: '1px solid var(--color-border-input)',
                  borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 500,
                  color: 'var(--color-text-secondary)', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >Cancel</button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true)
                  // Delete in FK order: destination_items, trip_general_items, comments, votes, companions, destinations, trip
                  const destIds = destinations.map(d => d.id)
                  if (destIds.length > 0) {
                    await supabase.from('destination_items').delete().in('destination_id', destIds)
                  }
                  await supabase.from('trip_general_items').delete().eq('trip_id', trip.id)
                  await supabase.from('comments').delete().eq('trip_id', trip.id)
                  await supabase.from('votes').delete().eq('trip_id', trip.id)
                  await supabase.from('companions').delete().eq('trip_id', trip.id)
                  await supabase.from('trip_destinations').delete().eq('trip_id', trip.id)
                  await supabase.from('trips').delete().eq('id', trip.id)
                  navigate('/trips')
                }}
                style={{
                  background: '#c0392b', border: 'none', borderRadius: 8,
                  padding: '9px 20px', fontSize: 13, fontWeight: 600,
                  color: 'white', cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1, fontFamily: "'DM Sans', sans-serif",
                }}
              >{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
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

                      const isExpanded = entry.type === 'destination' && expandedDestId === entry.destination.id

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
                                /* Accordion destination card */
                                <SwipeToDelete
                                  onDelete={() => handleDeleteDestination(entry.destination.id)}
                                  enabled
                                >
                                  <div
                                    className={`flex overflow-hidden rounded-xl border transition-all duration-150 ${
                                      isExpanded
                                        ? 'border-accent/25 shadow-md'
                                        : 'border-border hover:border-accent/25 hover:shadow-sm'
                                    }`}
                                  >
                                    {/* Chapter number panel */}
                                    <div
                                      className={`w-[72px] shrink-0 flex items-center justify-center transition-colors duration-150 ${
                                        isExpanded ? 'bg-accent' : 'bg-bg-muted'
                                      }`}
                                    >
                                      <span
                                        className={`font-mono text-[28px] font-extrabold leading-none transition-colors duration-150 ${
                                          isExpanded ? 'text-white' : 'text-border-dashed'
                                        }`}
                                      >
                                        {chapterNum}
                                      </span>
                                    </div>

                                    {/* Content panel */}
                                    <div className="flex-1 min-w-0 bg-bg-card">
                                      {/* Collapsed header (always visible) */}
                                      <button
                                        type="button"
                                        onClick={() => handleAccordionToggle(entry.destination.id)}
                                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[18px] font-semibold text-text-primary leading-snug truncate">
                                            {shortName(entry.destination.location_name)}
                                          </p>
                                          <div className="flex items-center gap-0 mt-1">
                                            <MetadataLine items={[
                                              ...(entry.destination.start_date && entry.destination.end_date
                                                ? [shortDateRange(entry.destination.start_date, entry.destination.end_date)]
                                                : []),
                                              `${entry.destination._count} place${entry.destination._count !== 1 ? 's' : ''}`,
                                            ]} />
                                          </div>
                                        </div>
                                        <ChevronDown
                                          className={`w-5 h-5 text-text-ghost shrink-0 transition-transform duration-150 ${
                                            isExpanded ? 'rotate-180' : ''
                                          }`}
                                        />
                                      </button>

                                      {/* Expanded content */}
                                      {isExpanded && (
                                        <div className="px-4 pb-4 border-t border-border-subtle">
                                          {/* Item count summary */}
                                          {entry.destination._count === 0 ? (
                                            <DashedCard
                                              onClick={() => navigate(`/trip/${id}/dest/${entry.destination.id}`)}
                                              className="flex items-center justify-center gap-2 py-3 mt-3 text-sm font-semibold text-text-tertiary"
                                            >
                                              <Plus className="w-4 h-4" />
                                              Add places from your Horizon
                                            </DashedCard>
                                          ) : (
                                            <p className="font-mono text-[11px] text-text-tertiary pt-3 pb-2">
                                              {entry.destination._count} place{entry.destination._count !== 1 ? 's' : ''} saved
                                            </p>
                                          )}

                                          {/* Date button */}
                                          <div className="flex gap-2 mt-2">
                                            {entry.destination.start_date && entry.destination.end_date ? (
                                              <button
                                                type="button"
                                                onClick={() => setDatePickerDestId(entry.destination.id)}
                                                className="text-xs text-accent font-medium hover:text-accent transition-colors"
                                              >
                                                {shortDateRange(entry.destination.start_date, entry.destination.end_date)} (edit)
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setDatePickerDestId(entry.destination.id)}
                                                className="text-xs text-accent font-medium hover:text-accent transition-colors"
                                              >
                                                + Add Dates
                                              </button>
                                            )}
                                          </div>

                                          {/* View full destination link */}
                                          <button
                                            type="button"
                                            onClick={() => navigate(`/trip/${id}/dest/${entry.destination.id}`)}
                                            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border-input text-sm font-medium text-text-secondary hover:bg-bg-muted transition-colors"
                                          >
                                            View destination
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                            </svg>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
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
                  <div className="bg-bg-card rounded-xl border border-border p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-text-secondary">Add destination</p>
                      <button type="button" onClick={() => { setShowAddDest(false); setAddDestKey(k => k + 1) }}
                        className="p-1 rounded-full text-text-faint hover:text-text-secondary hover:bg-bg-muted transition-colors" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                    </div>
                    {frozenSuggestions.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-2">
                          Suggested from your saves
                        </p>
                        <AddDestSuggestionList
                          suggestions={frozenSuggestions}
                          onSelect={handleAddFromSuggestion}
                          disabled={addingDest}
                        />
                        <p className="mt-3 text-xs text-text-faint font-medium">Or search manually</p>
                      </div>
                    )}
                    <LocationAutocomplete
                      key={addDestKey}
                      value=""
                      onSelect={handleAddDestination}
                      label=""
                      optional={false}
                      placeholder="e.g. Beijing, Tokyo, France…"
                      placesTypes={['(regions)']}
                      clearOnSelect
                    />
                    {addingDest && <p className="mt-2 text-xs text-text-tertiary text-center">Adding destination…</p>}
                {addDestError && <p className="mt-2 text-xs text-error text-center">{addDestError}</p>}
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
    </div>
  )
}
