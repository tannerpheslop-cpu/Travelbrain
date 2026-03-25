import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { MapPin, Search, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { onItemAddedToDestination } from '../lib/triggerPrecisionUpgrade'
import { queryKeys } from '../hooks/queries'
import SavedItemImage from '../components/SavedItemImage'
import ImageWithFade from '../components/ImageWithFade'
import { CategoryPill, MetadataLine } from '../components/ui'
import type { TripDestination, SavedItem, Category } from '../types'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { shortName, shortLocalName } from '../components/BilingualName'
import PlaceSearchInput from '../components/PlaceSearchInput'
import MarkdownNotes from '../components/MarkdownNotes'
import SwipeToDelete from '../components/SwipeToDelete'
import { fetchPlacePhoto } from '../lib/googleMaps'
import { useDestinationImage } from '../hooks/useDestinationImage'
import DestinationMapView from '../components/map/DestinationMapView'

// ── Types ──────────────────────────────────────────────────────────────────────

interface LinkedItem {
  id: string
  destination_id: string
  item_id: string
  day_index: number | null
  sort_order: number
  saved_item: SavedItem
}

interface CitySuggestion {
  cityName: string
  lat: number
  lng: number
  placeId: string
  items: SavedItem[]
}

interface VoteState {
  count: number
  userVoted: boolean
}

interface CommentEntry {
  id: string
  user_id: string
  body: string
  created_at: string
  authorName: string
  avatarUrl: string | null
}

interface ItemInteraction {
  voteCount: number
  userHasVoted: boolean
  commentCount: number
  isExpanded: boolean
  onToggleVote: () => void
  onToggleComments: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEST_GRADIENTS = [
  'from-amber-700 to-orange-900',
  'from-stone-500 to-stone-700',
  'from-zinc-500 to-zinc-700',
  'from-neutral-500 to-neutral-700',
  'from-stone-500 to-stone-700',
  'from-slate-500 to-slate-700',
]

const categoryLabel: Record<Category, string> = {
  restaurant: 'Restaurant',
  activity:   'Activity',
  hotel:      'Hotel',
  transit:    'Transit',
  general:    'General',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

function getDayCount(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1)
}

function formatDayTabDate(startDate: string, dayIndex: number): string {
  const d = new Date(startDate + 'T00:00:00')
  d.setDate(d.getDate() + dayIndex - 1)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCommentTime(created_at: string): string {
  const d = new Date(created_at)
  const now = new Date()
  const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

// ── Shared icons ───────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

// ── Add Dates Modal ────────────────────────────────────────────────────────────

function AddDatesModal({
  destination,
  onClose,
  onSaved,
}: {
  destination: TripDestination
  onClose: () => void
  onSaved: (updated: TripDestination) => void
}) {
  const hasExisting = !!(destination.start_date && destination.end_date)
  const [startDate, setStartDate] = useState(destination.start_date ?? '')
  const [endDate, setEndDate] = useState(destination.end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!startDate || !endDate) { setError('Both dates are required.'); return }
    if (startDate > endDate) { setError('Arrival must be before departure.'); return }
    setSaving(true)
    setError(null)
    const { data, error: dbError } = await supabase
      .from('trip_destinations')
      .update({ start_date: startDate, end_date: endDate })
      .eq('id', destination.id)
      .select()
      .single()
    setSaving(false)
    if (dbError || !data) { setError('Failed to save dates. Please try again.'); return }
    onSaved(data as TripDestination)
    onClose()
  }

  const handleRemoveDates = async () => {
    setSaving(true)
    const { data, error: dbError } = await supabase
      .from('trip_destinations')
      .update({ start_date: null, end_date: null })
      .eq('id', destination.id)
      .select()
      .single()
    setSaving(false)
    if (!dbError && data) { onSaved(data as TripDestination); onClose() }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-50 bg-bg-card rounded-t-3xl shadow-xl overflow-hidden sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl"
        style={{ maxHeight: '85dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-bg-pill-dark rounded-full mx-auto mt-3 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-base font-semibold text-text-primary">
            {hasExisting ? 'Edit Dates' : 'Add Dates'} · {shortName(destination.location_name)}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-text-faint hover:text-text-secondary hover:bg-bg-muted transition-colors" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Arrival</label>
              <input type="date" value={startDate} max={endDate || undefined} onChange={(e) => { setStartDate(e.target.value); setError(null) }}
                className="w-full px-3 py-2.5 border border-border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Departure</label>
              <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => { setEndDate(e.target.value); setError(null) }}
                className="w-full px-3 py-2.5 border border-border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent" />
            </div>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <button type="button" onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent-hover active:bg-accent-hover transition-colors disabled:opacity-50">
            {saving ? 'Saving\u2026' : hasExisting ? 'Update Dates' : 'Save Dates'}
          </button>
          {hasExisting && (
            <button type="button" onClick={handleRemoveDates} disabled={saving}
              className="w-full py-2.5 border border-border text-text-tertiary rounded-xl text-sm font-medium hover:bg-bg-page transition-colors disabled:opacity-50">
              Remove dates
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Day Tab Row ────────────────────────────────────────────────────────────────

function DayTabRow({
  startDate,
  dayCount,
  activeDay,
  unassignedCount,
  itemCountByDay,
  onChange,
}: {
  startDate: string
  dayCount: number
  activeDay: number | null
  unassignedCount: number
  itemCountByDay: Record<number, number>
  onChange: (day: number | null) => void
}) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-1">
      <div className="flex gap-2" style={{ width: 'max-content' }}>
        <button type="button" onClick={() => onChange(null)}
          className={`flex flex-col items-center px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
            activeDay === null ? 'bg-text-primary text-white' : 'bg-bg-muted text-text-secondary hover:bg-bg-pill-dark'
          }`}
        >
          <span>Unplanned</span>
          <span className={`text-xs mt-0.5 tabular-nums ${activeDay === null ? 'text-white/60' : 'text-text-faint'}`}>
            {unassignedCount} item{unassignedCount !== 1 ? 's' : ''}
          </span>
        </button>
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((dayNum) => {
          const count = itemCountByDay[dayNum] ?? 0
          return (
            <button key={dayNum} type="button" onClick={() => onChange(dayNum)}
              className={`flex flex-col items-center px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                activeDay === dayNum ? 'bg-accent text-white' : 'bg-bg-muted text-text-secondary hover:bg-bg-pill-dark'
              }`}
            >
              <span>Day {dayNum}</span>
              <span className={`text-xs mt-0.5 ${activeDay === dayNum ? 'text-white/70' : 'text-text-faint'}`}>
                {formatDayTabDate(startDate, dayNum)}{count > 0 ? ` \u00b7 ${count}` : ''}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Item Interaction Bar ───────────────────────────────────────────────────────

function ItemInteractionBar({
  voteCount, userHasVoted, commentCount, isExpanded, onToggleVote, onToggleComments,
}: {
  voteCount: number; userHasVoted: boolean; commentCount: number; isExpanded: boolean
  onToggleVote: () => void; onToggleComments: () => void
}) {
  return (
    <div className="flex items-center gap-5 px-4 py-2 border-t border-border-subtle bg-bg-card">
      <button type="button" onClick={onToggleVote}
        className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${userHasVoted ? 'text-rose-500' : 'text-text-faint hover:text-rose-400'}`}
        aria-label={userHasVoted ? 'Remove vote' : 'Vote for this'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" opacity={userHasVoted ? 1 : 0.35}>
          <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-2.184C4.045 12.34 2 9.77 2 6.5a4.5 4.5 0 018-2.826A4.5 4.5 0 0118 6.5c0 3.27-2.045 5.84-3.885 7.536a22.049 22.049 0 01-2.582 2.184 21.86 21.86 0 01-1.162.682l-.019.01-.005.003h-.002a.739.739 0 01-.69 0l-.002-.001z" />
        </svg>
        {voteCount > 0 ? <span>{voteCount}</span> : null}
      </button>
      <button type="button" onClick={onToggleComments}
        className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${isExpanded ? 'text-accent' : 'text-text-faint hover:text-accent'}`}
        aria-label={isExpanded ? 'Hide comments' : 'Show comments'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" opacity={isExpanded ? 1 : 0.35}>
          <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.75.75 0 01.642-.413 47.81 47.81 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A47.814 47.814 0 0010 2z" clipRule="evenodd" />
        </svg>
        {commentCount > 0 ? <span>{commentCount}</span> : null}
      </button>
    </div>
  )
}

// ── Comment Thread ─────────────────────────────────────────────────────────────

function CommentThread({
  comments, loading, draft, posting, onDraftChange, onPost,
}: {
  comments: CommentEntry[]
  loading: boolean
  draft: string
  posting: boolean
  onDraftChange: (val: string) => void
  onPost: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="bg-bg-card border-x border-b border-border-subtle rounded-b-2xl shadow-sm px-4 pt-1 pb-3">
      {loading ? (
        <div className="py-3 text-xs text-text-faint text-center">Loading comments\u2026</div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-text-faint pt-2 pb-1">No comments yet — be the first!</p>
      ) : (
        <div className="space-y-3 pt-2 pb-3">
          {comments.map((c) => {
            const initials = c.authorName.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || '?'
            return (
              <div key={c.id} className="flex items-start gap-2">
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-accent-light text-accent flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">{initials}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xs font-semibold text-text-primary truncate">{c.authorName}</p>
                    <p className="text-xs text-text-faint shrink-0">{formatCommentTime(c.created_at)}</p>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{c.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-end gap-2 pt-1">
        <textarea ref={textareaRef} value={draft} onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onPost() } }}
          placeholder="Add a comment\u2026" rows={1}
          className="flex-1 text-xs px-3 py-2 bg-bg-page border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent resize-none placeholder:text-text-faint"
        />
        <button type="button" onClick={onPost} disabled={!draft.trim() || posting}
          className="px-3 py-2 bg-accent text-white rounded-xl text-xs font-semibold hover:bg-accent-hover active:bg-accent-hover transition-colors disabled:opacity-50 shrink-0">
          {posting ? '\u2026' : 'Post'}
        </button>
      </div>
    </div>
  )
}

// ── Day Item Card ──────────────────────────────────────────────────────────────

function DayItemCard({
  linkedItem, activeDayIndex, dayCount, startDate,
  onRemove, onMove, dragHandleAttributes, dragHandleListeners,
  isDragging, canEdit, backTo,
}: {
  linkedItem: LinkedItem
  activeDayIndex: number | null
  dayCount: number
  startDate: string
  onRemove: (linkId: string) => void
  onMove: (linkId: string, dayIndex: number | null) => void
  dragHandleAttributes?: DraggableAttributes
  dragHandleListeners?: Record<string, unknown>
  isDragging?: boolean
  canEdit?: boolean
  backTo?: string
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const item = linkedItem.saved_item

  const moveOptions: Array<{ label: string; dayIndex: number | null }> = []
  if (activeDayIndex !== null) moveOptions.push({ label: 'Unplanned', dayIndex: null })
  for (let i = 1; i <= dayCount; i++) {
    if (i !== activeDayIndex) moveOptions.push({ label: `Day ${i} \u00b7 ${formatDayTabDate(startDate, i)}`, dayIndex: i })
  }

  return (
    <div className={`bg-bg-card border border-border-subtle border-b-0 shadow-sm overflow-visible relative transition-opacity ${isDragging ? 'opacity-40' : ''} rounded-t-2xl`}>
      <div className="flex items-center p-2">
        {canEdit ? (
          <button type="button" onClick={(e) => e.preventDefault()}
            {...(dragHandleAttributes as React.HTMLAttributes<HTMLButtonElement>)}
            {...(dragHandleListeners as React.HTMLAttributes<HTMLButtonElement>)}
            className="pr-1.5 self-stretch flex items-center text-text-ghost hover:text-text-faint touch-none cursor-grab active:cursor-grabbing shrink-0"
            aria-label="Drag to reorder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <circle cx="5.5" cy="3" r="1" /><circle cx="10.5" cy="3" r="1" />
              <circle cx="5.5" cy="8" r="1" /><circle cx="10.5" cy="8" r="1" />
              <circle cx="5.5" cy="13" r="1" /><circle cx="10.5" cy="13" r="1" />
            </svg>
          </button>
        ) : (
          <div className="w-1" />
        )}
        <Link to={`/item/${item.id}`} state={backTo ? { from: backTo } : undefined} className="shrink-0 select-none" style={{ WebkitTouchCallout: 'none' }}>
          <SavedItemImage item={item} size="sm" className="rounded-lg pointer-events-none" />
        </Link>
        <Link to={`/item/${item.id}`} state={backTo ? { from: backTo } : undefined} className="flex-1 min-w-0 px-3 py-1">
          <p className="text-sm font-semibold text-text-primary truncate leading-snug">{item.title}</p>
          {item.location_name && <p className="text-xs text-text-tertiary mt-0.5 truncate">{item.location_name}{item.location_name_local && <span className="ml-1 opacity-60">{shortLocalName(item.location_name_local)}</span>}</p>}
          <CategoryPill label={categoryLabel[item.category]} dominant={item.category === 'hotel'} className="mt-1" />
        </Link>
        {canEdit && (
          <div className="flex items-center shrink-0 pr-1">
            {moveOptions.length > 0 && (
              <div className="relative">
                <button type="button" onClick={() => setShowMoveMenu((o) => !o)}
                  className="p-2 text-text-ghost hover:text-accent transition-colors" aria-label="Move to day">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M5 10a.75.75 0 01.75-.75h6.638L10.23 7.29a.75.75 0 111.04-1.08l3.5 3.25a.75.75 0 010 1.08l-3.5 3.25a.75.75 0 11-1.04-1.08l2.158-1.96H5.75A.75.75 0 015 10z" clipRule="evenodd" />
                  </svg>
                </button>
                {showMoveMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMoveMenu(false)} />
                    <div className="absolute right-0 bottom-full mb-1 z-20 bg-bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[170px]">
                      <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-text-faint uppercase tracking-wide">Move to</p>
                      {moveOptions.map((opt) => (
                        <button key={opt.dayIndex ?? 'unassigned'} type="button"
                          onClick={() => { setShowMoveMenu(false); onMove(linkedItem.id, opt.dayIndex) }}
                          className="w-full flex items-center px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-page text-left transition-colors">
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button type="button" onClick={() => onRemove(linkedItem.id)}
              className="p-2 text-text-ghost hover:text-error transition-colors" aria-label="Remove from destination">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sortable Day Item ──────────────────────────────────────────────────────────

function SortableDayItem(props: Omit<React.ComponentProps<typeof DayItemCard>, 'dragHandleAttributes' | 'dragHandleListeners' | 'isDragging'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.linkedItem.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { scale: '1.03', boxShadow: '0 8px 25px rgba(0,0,0,0.15)', zIndex: 50, position: 'relative' as const, borderRadius: '1rem' } : {}),
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...(listeners as React.HTMLAttributes<HTMLDivElement>)}>
      <DayItemCard {...props} dragHandleAttributes={attributes} dragHandleListeners={listeners} isDragging={isDragging} />
    </div>
  )
}

// ── Linked Item Card ───────────────────────────────────────────────────────────

function LinkedItemCardSummary({
  item, linkId, onRemove, canEdit, hasExpandedContent, backTo,
}: {
  item: SavedItem
  linkId: string
  onRemove: (linkId: string) => void
  canEdit?: boolean
  hasExpandedContent?: boolean
  backTo?: string
}) {
  return (
    <div className={`bg-bg-card border border-border-subtle shadow-sm overflow-hidden ${hasExpandedContent ? 'rounded-t-2xl border-b-0' : 'rounded-2xl'}`}>
      <div className="flex items-center gap-0 p-2">
        <Link to={`/item/${item.id}`} state={backTo ? { from: backTo } : undefined} className="shrink-0 select-none" style={{ WebkitTouchCallout: 'none' }}>
          <SavedItemImage item={item} size="md" className="rounded-xl pointer-events-none" />
        </Link>
        <Link to={`/item/${item.id}`} state={backTo ? { from: backTo } : undefined} className="flex-1 min-w-0 px-3 py-1">
          <p className="text-sm font-semibold text-text-primary truncate leading-snug">{item.title}</p>
          {item.location_name && <p className="text-xs text-text-tertiary mt-0.5 truncate">{item.location_name}{item.location_name_local && <span className="ml-1 opacity-60">{shortLocalName(item.location_name_local)}</span>}</p>}
          <CategoryPill label={categoryLabel[item.category]} dominant={item.category === 'hotel'} className="mt-1" />
        </Link>
        {canEdit && (
          <button type="button" onClick={() => onRemove(linkId)}
            className="p-3 shrink-0 text-text-ghost hover:text-error transition-colors" aria-label="Remove from destination">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function LinkedItemExpanded({
  item, canEdit, interaction, onNotesChange,
}: {
  item: SavedItem
  canEdit?: boolean
  interaction?: ItemInteraction
  onNotesChange?: (itemId: string, notes: string | null) => void
}) {
  return (
    <div className="bg-bg-card border border-border-subtle border-t-0 shadow-sm overflow-hidden rounded-b-2xl">
      <div className="px-3 pb-2">
        <MarkdownNotes
          value={item.notes}
          onSave={(notes) => onNotesChange?.(item.id, notes)}
          placeholder="Add note"
          readOnly={!canEdit || !onNotesChange}
          previewLines={2}
        />
      </div>
      {interaction && (
        <ItemInteractionBar
          voteCount={interaction.voteCount} userHasVoted={interaction.userHasVoted}
          commentCount={interaction.commentCount} isExpanded={interaction.isExpanded}
          onToggleVote={interaction.onToggleVote} onToggleComments={interaction.onToggleComments}
        />
      )}
    </div>
  )
}

// ── Suggestion Card ────────────────────────────────────────────────────────────

function SuggestionCard({ item, onAdd, onDismiss }: { item: SavedItem; onAdd: (item: SavedItem) => Promise<void>; onDismiss?: () => void }) {
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    setAdding(true)
    await onAdd(item)
    setAdding(false)
  }

  return (
    <div className="flex items-center gap-0 bg-accent-light border border-accent-light rounded-2xl overflow-hidden p-2">
      <div className="select-none" style={{ WebkitTouchCallout: 'none' }}>
        <SavedItemImage item={item} size="sm" className="rounded-lg pointer-events-none" />
      </div>
      <div className="flex-1 min-w-0 px-3 py-1">
        <p className="text-sm font-semibold text-text-primary truncate leading-snug">{item.title}</p>
        {item.location_name && <p className="text-xs text-text-tertiary mt-0.5 truncate">{item.location_name}{item.location_name_local && <span className="ml-1 opacity-60">{shortLocalName(item.location_name_local)}</span>}</p>}
        <CategoryPill label={categoryLabel[item.category]} dominant={item.category === 'hotel'} className="mt-1" />
      </div>
      <div className="flex items-center gap-1 mr-3 shrink-0">
        <button type="button" onClick={handleAdd} disabled={adding}
          className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white rounded-xl text-xs font-semibold hover:bg-accent-hover active:bg-accent-hover transition-colors disabled:opacity-50">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          {adding ? '\u2026' : 'Add'}
        </button>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="p-1.5 text-accent hover:text-accent transition-colors" aria-label="Dismiss">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Inbox Picker Row ───────────────────────────────────────────────────────────

function InboxPickerRow({ item, onAdd }: { item: SavedItem; onAdd: (item: SavedItem) => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  const handleTap = async () => {
    if (adding) return
    setAdding(true)
    await onAdd(item)
    setAdding(false)
  }
  return (
    <button type="button" onClick={handleTap} disabled={adding}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-bg-page active:bg-bg-muted transition-colors disabled:opacity-60 text-left">
      <div className="select-none" style={{ WebkitTouchCallout: 'none' }}>
        <SavedItemImage item={item} size="sm" className="rounded-xl pointer-events-none" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary truncate leading-snug">{item.title}</p>
        {item.location_name && <p className="text-xs text-text-tertiary mt-0.5 truncate">{item.location_name}{item.location_name_local && <span className="ml-1 opacity-60">{shortLocalName(item.location_name_local)}</span>}</p>}
      </div>
      {adding && <div className="shrink-0 w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
    </button>
  )
}

// ── Add from Horizon Sheet ─────────────────────────────────────────────────────

function AddFromInboxSheet({
  items, linkedItemIds, loading, onAdd, onClose,
}: {
  items: SavedItem[]
  linkedItemIds: Set<string>
  loading: boolean
  onAdd: (item: SavedItem) => Promise<void>
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  const q = search.trim().toLowerCase()
  const visible = items
    .filter((item) => !linkedItemIds.has(item.id))
    .filter((item) => !q || item.title.toLowerCase().includes(q) || (item.location_name?.toLowerCase().includes(q) ?? false))

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-50 bg-bg-card rounded-t-3xl shadow-xl flex flex-col sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl"
        style={{ maxHeight: '82dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-bg-pill-dark rounded-full mx-auto mt-3 shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-base font-semibold text-text-primary">Add from your Horizon</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-text-faint hover:text-text-secondary hover:bg-bg-muted transition-colors" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-border-subtle shrink-0">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your inbox\u2026"
              className="w-full pl-9 pr-8 py-2.5 bg-bg-page border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:text-text-faint" />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-secondary transition-colors" aria-label="Clear">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-2 pb-6">
          {loading ? (
            <div className="space-y-1 animate-pulse py-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2">
                  <div className="w-12 h-12 rounded-xl bg-bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-bg-muted rounded w-3/4" />
                    <div className="h-3 bg-bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-text-tertiary font-medium">
                {q ? 'No items match your search' : 'All inbox items are already added'}
              </p>
              {q && (
                <button type="button" onClick={() => setSearch('')}
                  className="mt-2 text-xs text-accent hover:text-accent font-medium transition-colors">
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {visible.map((item) => <InboxPickerRow key={item.id} item={item} onAdd={onAdd} />)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DestinationDetailPage() {
  const { id: tripId, destId } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const itemBackTo = `/trip/${tripId}/dest/${destId}`

  // Core state
  const [destination, setDestination] = useState<TripDestination | null>(null)
  const [tripTitle, setTripTitle] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [heroImageUrl] = useDestinationImage(destId, destination?.image_url, destination?.location_place_id)

  // Linked items
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>([])

  // Lazy-loaded data
  const [suggestions, setSuggestions] = useState<SavedItem[]>([])
  const [votes, setVotes] = useState<Record<string, VoteState>>({})
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})

  // Comment thread UI state
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [threadComments, setThreadComments] = useState<CommentEntry[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  // Day view state
  const [activeDay, setActiveDay] = useState<number | null>(null)

  // Add from Horizon sheet
  const [showInboxSheet, setShowInboxSheet] = useState(false)
  const [inboxItems, setInboxItems] = useState<SavedItem[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const inboxFetched = useRef(false)

  // Add/edit dates modal
  const [showAddDates, setShowAddDates] = useState(false)

  // Inline place search (Google Places)
  const [showPlaceSearch, setShowPlaceSearch] = useState(false)

  // Destination notes
  const [destNotes, setDestNotes] = useState<string | null>(null)

  // Location mismatch error
  const [locationError, setLocationError] = useState<string | null>(null)

  // Country-level city suggestions (for empty country destinations)
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([])
  const [expandedCitySugg, setExpandedCitySugg] = useState<string | null>(null)
  const [addingCitySugg, setAddingCitySugg] = useState<string | null>(null)

  // dnd-kit for items within a day view
  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── Data fetching (mount) ──────────────────────────────────────────────────

  useEffect(() => {
    if (!user || !tripId || !destId) return
    const load = async () => {
      const [destRes, tripRes, itemsRes] = await Promise.all([
        supabase.from('trip_destinations').select('*').eq('id', destId).eq('trip_id', tripId).single(),
        supabase.from('trips').select('owner_id, title').eq('id', tripId).single(),
        supabase.from('destination_items').select('*, saved_item:saved_items(*)').eq('destination_id', destId).order('sort_order'),
      ])
      if (destRes.error || !destRes.data) { setNotFound(true); setLoading(false); return }
      const dest = destRes.data as TripDestination
      setDestination(dest)
      setDestNotes(dest.notes ?? null)
      const tripData = tripRes.data as { owner_id: string; title: string } | null
      setCanEdit(tripData ? tripData.owner_id === user.id : false)
      setTripTitle(tripData?.title ?? '')
      setLinkedItems((itemsRes.data ?? []) as LinkedItem[])
      setLoading(false)
    }
    load()
  }, [user, tripId, destId])

  // ── Phase 2 loading (after destination loads) ──────────────────────────────

  useEffect(() => {
    if (!destination || !user) return
    loadInteractionData()
    loadSuggestions()
  }, [destination?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep inbox cache fresh when new items are created via quick-save ────────

  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent<SavedItem>).detail
      if (item) {
        setInboxItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)])
        queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })
      }
    }
    const updateHandler = (e: Event) => {
      const item = (e as CustomEvent<SavedItem>).detail
      if (item) {
        setInboxItems((prev) => prev.map((i) => i.id === item.id ? item : i))
        queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })
      }
    }
    window.addEventListener('horizon-item-created', handler)
    window.addEventListener('horizon-item-updated', updateHandler)
    return () => {
      window.removeEventListener('horizon-item-created', handler)
      window.removeEventListener('horizon-item-updated', updateHandler)
    }
  }, [queryClient, user?.id])

  // ── Load interaction data ──────────────────────────────────────────────────

  const loadInteractionData = async () => {
    const itemIds = linkedItems.map((li) => li.item_id)
    if (itemIds.length === 0) return

    const [votesRes, commentsRes] = await Promise.all([
      supabase.from('votes').select('item_id, user_id').eq('trip_id', tripId!).in('item_id', itemIds),
      supabase.from('comments').select('item_id').eq('trip_id', tripId!).in('item_id', itemIds),
    ])

    const voteMap: Record<string, VoteState> = {}
    for (const v of (votesRes.data ?? []) as { item_id: string; user_id: string }[]) {
      if (!voteMap[v.item_id]) voteMap[v.item_id] = { count: 0, userVoted: false }
      voteMap[v.item_id].count++
      if (v.user_id === user!.id) voteMap[v.item_id].userVoted = true
    }
    setVotes(voteMap)

    const countMap: Record<string, number> = {}
    for (const c of (commentsRes.data ?? []) as { item_id: string }[]) {
      countMap[c.item_id] = (countMap[c.item_id] ?? 0) + 1
    }
    setCommentCounts(countMap)
  }

  // ── Load suggestions ───────────────────────────────────────────────────────

  const loadSuggestions = async () => {
    if (!destination) return
    const isCountry = destination.location_type === 'country'
    const linkedIds = new Set(linkedItems.map((li) => li.item_id))

    if (isCountry) {
      // Country-level: fetch all items in this country, group by city
      const { data } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_archived', false)
        .eq('location_country', destination.location_country)
        .not('location_lat', 'is', null)
        .not('location_lng', 'is', null)
        .not('location_name', 'is', null)

      const items = ((data ?? []) as SavedItem[]).filter((s) => !linkedIds.has(s.id))
      setSuggestions(items) // flat list kept for badge count

      // Cluster items into city groups using simple proximity
      const clusters: Array<{ sumLat: number; sumLng: number; items: SavedItem[] }> = []
      for (const item of items) {
        if (item.location_lat == null || item.location_lng == null) continue
        let assigned = false
        for (const c of clusters) {
          const cx = c.sumLat / c.items.length
          const cy = c.sumLng / c.items.length
          if (Math.abs(item.location_lat - cx) <= 0.45 && Math.abs(item.location_lng - cy) <= 0.45) {
            c.items.push(item)
            c.sumLat += item.location_lat
            c.sumLng += item.location_lng
            assigned = true
            break
          }
        }
        if (!assigned) {
          clusters.push({ sumLat: item.location_lat, sumLng: item.location_lng, items: [item] })
        }
      }

      const cityGroups: CitySuggestion[] = clusters.map((c) => {
        const cx = c.sumLat / c.items.length
        const cy = c.sumLng / c.items.length
        // Pick most common location_name as city label
        const nameCounts = new Map<string, number>()
        for (const it of c.items) {
          const n = it.location_name ?? ''
          nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1)
        }
        const bestName = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
        const cityName = bestName.split(',')[0].trim()
        const rep = c.items[0]
        const placeId = rep.location_place_id ?? `cluster-${destination.location_country_code}-${Math.round(cx * 100)}-${Math.round(cy * 100)}`
        return { cityName, lat: cx, lng: cy, placeId, items: c.items }
      }).sort((a, b) => b.items.length - a.items.length)

      setCitySuggestions(cityGroups)
      if (items.length > 0) {
        trackEvent('nearby_suggestion_shown', user!.id, { destination_id: destination.id, count: items.length })
      }
    } else {
      // City-level: fetch nearby items
      const { data } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_archived', false)
        .not('location_lat', 'is', null)
        .not('location_lng', 'is', null)
        .gte('location_lat', destination.location_lat - 0.45)
        .lte('location_lat', destination.location_lat + 0.45)
        .gte('location_lng', destination.location_lng - 0.45)
        .lte('location_lng', destination.location_lng + 0.45)

      const nearby = ((data ?? []) as SavedItem[]).filter((s) => !linkedIds.has(s.id))
      setSuggestions(nearby)
      if (nearby.length > 0) {
        trackEvent('nearby_suggestion_shown', user!.id, { destination_id: destination.id, count: nearby.length })
      }
    }
  }

  // ── Add city from country-level suggestion ─────────────────────────────────

  const handleAddCitySuggestion = async (city: CitySuggestion) => {
    if (addingCitySugg || !destination) return
    setAddingCitySugg(city.placeId)
    // Create new destination
    let imageUrl: string | null = null
    if (city.placeId && !city.placeId.startsWith('cluster-')) {
      imageUrl = await fetchPlacePhoto(city.placeId)
    }
    const { data: newDest } = await supabase
      .from('trip_destinations')
      .insert({
        trip_id: tripId!,
        location_name: `${city.cityName}, ${destination.location_country}`,
        location_lat: city.lat,
        location_lng: city.lng,
        location_place_id: city.placeId,
        location_country: destination.location_country,
        location_country_code: destination.location_country_code,
        location_type: 'city',
        proximity_radius_km: 50,
        sort_order: 999,
        image_url: imageUrl,
      })
      .select()
      .single()
    if (newDest) {
      // Link items to new destination
      for (const item of city.items) {
        await supabase.from('destination_items').insert({
          destination_id: (newDest as TripDestination).id,
          item_id: item.id,
          day_index: null,
          sort_order: 0,
        })
      }
      // Remove from suggestions
      setCitySuggestions((prev) => prev.filter((c) => c.placeId !== city.placeId))
      setSuggestions((prev) => {
        const removedIds = new Set(city.items.map((it) => it.id))
        return prev.filter((s) => !removedIds.has(s.id))
      })
      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(tripId!) })
      queryClient.invalidateQueries({ queryKey: queryKeys.trips(user?.id ?? '') })
      // Navigate to new destination
      navigate(`/trip/${tripId}/dest/${(newDest as TripDestination).id}`)
    }
    setAddingCitySugg(null)
  }

  // ── Destination notes handler ──────────────────────────────────────────────

  const handleSaveDestNotes = useCallback((notes: string | null) => {
    setDestNotes(notes)
    if (destination) {
      supabase.from('trip_destinations').update({ notes }).eq('id', destination.id).then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(tripId!) })
      })
    }
  }, [destination?.id, queryClient, tripId])

  // ── Activity notes handler ─────────────────────────────────────────────────

  const handleItemNotesChange = useCallback((itemId: string, notes: string | null) => {
    setLinkedItems((prev) =>
      prev.map((li) =>
        li.item_id === itemId
          ? { ...li, saved_item: { ...li.saved_item, notes } }
          : li,
      ),
    )
    supabase.from('saved_items').update({ notes }).eq('id', itemId).then(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItem(itemId) })
    })
  }, [queryClient, user?.id])

  // ── Open inbox sheet (lazy fetch once) ─────────────────────────────────────

  const handleOpenInboxSheet = async () => {
    setShowInboxSheet(true)
    if (inboxFetched.current) return
    setInboxLoading(true)
    const { data } = await supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    inboxFetched.current = true
    setInboxItems((data ?? []) as SavedItem[])
    setInboxLoading(false)
  }

  // ── Link an item to this destination ───────────────────────────────────────

  const handleLinkItem = async (item: SavedItem): Promise<boolean> => {
    if (!destination) return false
    setLocationError(null)

    // Block location-mismatched items
    if (item.location_country && destination.location_country) {
      if (destination.location_type === 'country') {
        // Country destination: item's country must match
        if (item.location_country !== destination.location_country) {
          setLocationError(`This activity is in ${item.location_country} and doesn't match your ${shortName(destination.location_name)} trip.`)
          return false
        }
      } else {
        // City destination: item must be within ~100km
        if (item.location_lat != null && item.location_lng != null) {
          const dist = haversineKm(item.location_lat, item.location_lng, destination.location_lat, destination.location_lng)
          if (dist > 100) {
            setLocationError(`This activity is in ${item.location_country} and is ~${Math.round(dist)}km from ${shortName(destination.location_name)}.`)
            return false
          }
        }
      }
    }

    const { data, error } = await supabase
      .from('destination_items')
      .insert({ destination_id: destination.id, item_id: item.id, day_index: null, sort_order: linkedItems.length })
      .select()
      .single()

    if (error || !data) return false

    const row = data as { id: string; destination_id: string; item_id: string; day_index: number | null; sort_order: number }
    const newLinked: LinkedItem = { ...row, saved_item: item }
    setLinkedItems((prev) => [...prev, newLinked])
    setSuggestions((prev) => prev.filter((s) => s.id !== item.id))
    setVotes((prev) => ({ ...prev, [item.id]: prev[item.id] ?? { count: 0, userVoted: false } }))
    setCommentCounts((prev) => ({ ...prev, [item.id]: prev[item.id] ?? 0 }))

    // Nudge trip to planning status (best-effort — DB trigger is authoritative)
    void supabase.from('trips').update({ status: 'planning' }).eq('id', tripId!).eq('status', 'aspirational')
      .then(() => {/* no-op */})

    // Invalidate caches so other pages stay in sync
    queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(tripId!) })
    queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })
    queryClient.invalidateQueries({ queryKey: queryKeys.tripItemMappings(user?.id ?? '') })

    return true
  }

  const handleAddSuggestion = async (item: SavedItem) => {
    const ok = await handleLinkItem(item)
    if (ok) trackEvent('nearby_suggestion_accepted', user!.id, { destination_id: destination!.id, item_id: item.id })
  }

  const handleDismissSuggestion = (itemId: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== itemId))
    trackEvent('nearby_suggestion_dismissed', user!.id, { destination_id: destination!.id, item_id: itemId })
  }

  const handleAddFromInbox = async (item: SavedItem) => {
    const ok = await handleLinkItem(item)
    if (ok) {
      trackEvent('item_added_to_destination', user!.id, { destination_id: destination!.id, item_id: item.id })
      onItemAddedToDestination(item.id).catch(console.error)
    }
  }

  const handlePlaceAdded = async (item: SavedItem) => {
    if (!destination) return
    // Link the newly created saved_item to this destination
    const { data, error } = await supabase
      .from('destination_items')
      .insert({ destination_id: destination.id, item_id: item.id, day_index: null, sort_order: linkedItems.length })
      .select()
      .single()

    if (!error && data) {
      const row = data as { id: string; destination_id: string; item_id: string; day_index: number | null; sort_order: number }
      setLinkedItems((prev) => [...prev, { ...row, saved_item: item }])
      setVotes((prev) => ({ ...prev, [item.id]: { count: 0, userVoted: false } }))
      setCommentCounts((prev) => ({ ...prev, [item.id]: 0 }))
      trackEvent('item_added_to_destination', user!.id, { destination_id: destination.id, item_id: item.id, source: 'place_search' })
      onItemAddedToDestination(item.id).catch(console.error)
      // Nudge trip to planning status
      void supabase.from('trips').update({ status: 'planning' }).eq('id', tripId!).eq('status', 'aspirational')
      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })
      queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(tripId!) })
      queryClient.invalidateQueries({ queryKey: queryKeys.tripItemMappings(user?.id ?? '') })
    }
    setShowPlaceSearch(false)
  }

  // ── Remove a linked item ───────────────────────────────────────────────────

  const handleRemoveItem = async (linkId: string) => {
    if (!destination) return
    const removed = linkedItems.find((li) => li.id === linkId)
    setLinkedItems((prev) => prev.filter((li) => li.id !== linkId))

    if (removed && removed.saved_item.location_lat != null) {
      const lat = removed.saved_item.location_lat
      const lng = removed.saved_item.location_lng!
      if (
        Math.abs(lat - destination.location_lat) <= 0.45 &&
        Math.abs(lng - destination.location_lng) <= 0.45
      ) {
        setSuggestions((prev) => [removed.saved_item, ...prev])
      }
    }
    if (expandedItemId === removed?.item_id) setExpandedItemId(null)
    await supabase.from('destination_items').delete().eq('id', linkId)
    queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(tripId!) })
    queryClient.invalidateQueries({ queryKey: queryKeys.tripItemMappings(user?.id ?? '') })
  }

  // ── Move item to a different day ───────────────────────────────────────────

  const handleMoveItem = async (linkId: string, newDayIndex: number | null) => {
    const item = linkedItems.find((li) => li.id === linkId)
    if (!item) return
    const targetCount = linkedItems.filter((li) => li.day_index === newDayIndex && li.id !== linkId).length
    setLinkedItems((prev) =>
      prev.map((li) => li.id === linkId ? { ...li, day_index: newDayIndex, sort_order: targetCount } : li),
    )
    await supabase.from('destination_items').update({ day_index: newDayIndex, sort_order: targetCount }).eq('id', linkId)
    queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(tripId!) })
    if (newDayIndex !== null && destination) {
      trackEvent('item_assigned_to_day', user!.id, { destination_id: destination.id, item_id: item.item_id, day_index: newDayIndex })
    }
  }

  // ── Drag-to-reorder within active day ──────────────────────────────────────

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const dayItems = linkedItems.filter((li) => li.day_index === activeDay).sort((a, b) => a.sort_order - b.sort_order)
    const oldIdx = dayItems.findIndex((li) => li.id === active.id)
    const newIdx = dayItems.findIndex((li) => li.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(dayItems, oldIdx, newIdx)
    setLinkedItems((prev) => [
      ...prev.filter((li) => li.day_index !== activeDay),
      ...reordered.map((li, i) => ({ ...li, sort_order: i })),
    ])
    await Promise.all(
      reordered.map((li, idx) => supabase.from('destination_items').update({ sort_order: idx }).eq('id', li.id)),
    )
    queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(tripId!) })
  }

  // ── Toggle vote ────────────────────────────────────────────────────────────

  const handleToggleVote = async (itemId: string) => {
    const current = votes[itemId] ?? { count: 0, userVoted: false }
    if (current.userVoted) {
      setVotes((prev) => ({ ...prev, [itemId]: { count: Math.max(0, current.count - 1), userVoted: false } }))
      await supabase.from('votes').delete().eq('trip_id', tripId!).eq('item_id', itemId).eq('user_id', user!.id)
      trackEvent('vote_cast', user!.id, { trip_id: tripId!, item_id: itemId, action: 'remove' })
    } else {
      setVotes((prev) => ({ ...prev, [itemId]: { count: current.count + 1, userVoted: true } }))
      await supabase.from('votes').insert({ trip_id: tripId!, item_id: itemId, user_id: user!.id })
      trackEvent('vote_cast', user!.id, { trip_id: tripId!, item_id: itemId, action: 'add' })
    }
  }

  // ── Toggle comments ────────────────────────────────────────────────────────

  const handleToggleComments = async (itemId: string) => {
    if (expandedItemId === itemId) {
      setExpandedItemId(null)
      setCommentDraft('')
      return
    }
    setExpandedItemId(itemId)
    setCommentDraft('')
    setThreadLoading(true)
    setThreadComments([])

    const { data } = await supabase
      .from('comments')
      .select('id, user_id, body, created_at, user:users(display_name, email, avatar_url)')
      .eq('trip_id', tripId!)
      .eq('item_id', itemId)
      .order('created_at', { ascending: true })

    const entries: CommentEntry[] = ((data ?? []) as unknown as {
      id: string; user_id: string; body: string; created_at: string;
      user: { display_name: string | null; email: string; avatar_url: string | null } | null
    }[]).map((c) => ({
      id: c.id,
      user_id: c.user_id,
      body: c.body,
      created_at: c.created_at,
      authorName: c.user?.display_name ?? c.user?.email?.split('@')[0] ?? 'User',
      avatarUrl: c.user?.avatar_url ?? null,
    }))
    setThreadComments(entries)
    setThreadLoading(false)
  }

  // ── Post comment ───────────────────────────────────────────────────────────

  const handlePostComment = async () => {
    const body = commentDraft.trim()
    if (!body || !expandedItemId || postingComment) return
    setPostingComment(true)
    const { data } = await supabase
      .from('comments')
      .insert({ trip_id: tripId!, item_id: expandedItemId, user_id: user!.id, body })
      .select('id, user_id, body, created_at')
      .single()
    setPostingComment(false)
    if (data) {
      setThreadComments((prev) => [...prev, {
        id: (data as { id: string }).id,
        user_id: user!.id,
        body,
        created_at: (data as { created_at: string }).created_at,
        authorName: 'Me',
        avatarUrl: null,
      }])
      setCommentCounts((prev) => ({ ...prev, [expandedItemId]: (prev[expandedItemId] ?? 0) + 1 }))
      setCommentDraft('')
      trackEvent('comment_created', user!.id, { trip_id: tripId!, item_id: expandedItemId })
    }
  }

  // ── Build interaction object ───────────────────────────────────────────────

  const buildInteraction = (itemId: string): ItemInteraction => ({
    voteCount: votes[itemId]?.count ?? 0,
    userHasVoted: votes[itemId]?.userVoted ?? false,
    commentCount: commentCounts[itemId] ?? 0,
    isExpanded: expandedItemId === itemId,
    onToggleVote: () => handleToggleVote(itemId),
    onToggleComments: () => handleToggleComments(itemId),
  })

  // ── Derived values ─────────────────────────────────────────────────────────

  const city = destination ? shortName(destination.location_name) : ''
  const cityLocal = destination ? shortLocalName(destination.location_name_local) : null
  const hasSchedule = !!(destination?.start_date && destination?.end_date)
  const dayCount = hasSchedule ? getDayCount(destination!.start_date!, destination!.end_date!) : 0
  const activeItems = linkedItems.filter((li) => li.day_index === activeDay).sort((a, b) => a.sort_order - b.sort_order)
  const itemCountByDay: Record<number, number> = {}
  for (const li of linkedItems) {
    if (li.day_index !== null) itemCountByDay[li.day_index] = (itemCountByDay[li.day_index] ?? 0) + 1
  }
  const unassignedCount = linkedItems.filter((li) => li.day_index === null).length
  const linkedItemIds = new Set(linkedItems.map((li) => li.item_id))
  const gradient = DEST_GRADIENTS[0]

  // ── Render ─────────────────────────────────────────────────────────────────

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Not found
  if (notFound || !destination) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <p className="text-text-tertiary text-sm font-medium mb-4">Destination not found</p>
        <button
          onClick={() => navigate(tripId ? `/trip/${tripId}` : '/trips')}
          className="flex items-center gap-1.5 text-accent text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go back</span>
        </button>
      </div>
    )
  }

  // All saved items from linked items
  const allSavedItems = linkedItems.map(li => li.saved_item)

  return (
    <>
      {/* Map view overlay — full screen with sheet */}
      {destination && (
        <DestinationMapView
          destination={destination}
          items={allSavedItems}
          tripTitle={tripTitle}
          chapterNumber={(destination.sort_order ?? 0) + 1}
          onBack={() => navigate(`/trip/${tripId}`)}
          onItemSelect={(itemId) => navigate(`/item/${itemId}?backTo=${encodeURIComponent(itemBackTo)}`)}
          onLocationUpdated={() => {
            // Refetch linked items to pick up the updated location_precision
            if (user && destId) {
              supabase.from('destination_items').select('*, saved_item:saved_items(*)').eq('destination_id', destId).order('sort_order')
                .then(({ data }) => { if (data) setLinkedItems(data as LinkedItem[]) })
            }
          }}
          bilingualName={cityLocal}
        />
      )}

    <div className="pb-32" style={{ display: 'none' }}>
      {/* Old destination detail page — hidden, map view replaces it */}
      {/* 1. Back button */}
      <div className="px-4 pt-4 pb-2">
        <button onClick={() => navigate(`/trip/${tripId}`)} className="flex items-center gap-1.5 text-accent text-sm font-medium">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to trip</span>
        </button>
      </div>

      {/* 2. Hero image */}
      {heroImageUrl ? (
        <div className="mx-4 h-48 rounded-2xl overflow-hidden mb-4">
          <ImageWithFade src={heroImageUrl} alt={city} context="detail-page" className="w-full h-full object-cover" eager />
        </div>
      ) : (
        <div className={`mx-4 h-48 rounded-2xl overflow-hidden mb-4 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
          <MapPin className="w-12 h-12 text-white/50" />
        </div>
      )}

      {/* 3. Header: name + country + dates + item count */}
      <div className="px-4 mb-4">
        <h1 className="text-2xl font-bold text-text-primary truncate">
          {city}
          {cityLocal && <span className="ml-2 font-normal text-text-faint text-lg">{cityLocal}</span>}
        </h1>
        {destination.location_country && <p className="text-sm text-text-faint mt-0.5">{destination.location_country}</p>}

        {/* Add dates CTA — directly below name */}
        {hasSchedule ? (
          <div className="flex items-center gap-2 mt-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-text-faint shrink-0">
              <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
            </svg>
            <span className="text-xs text-text-secondary font-medium">{formatDateRange(destination.start_date!, destination.end_date!)}</span>
            {canEdit && (
              <button onClick={() => setShowAddDates(true)} className="text-xs text-accent hover:text-accent font-medium transition-colors">
                Edit
              </button>
            )}
          </div>
        ) : canEdit ? (
          <button onClick={() => setShowAddDates(true)} className="flex items-center gap-1.5 mt-2 text-xs text-accent hover:text-accent font-medium transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add dates
          </button>
        ) : (
          <span className="mt-2 text-xs text-text-faint block">No dates set</span>
        )}

        {/* Item count */}
        <div className="mt-2">
          <MetadataLine items={[`${linkedItems.length} place${linkedItems.length !== 1 ? 's' : ''}`]} />
        </div>
      </div>

      {/* 4. Destination notes */}
      <div className="px-4 mb-4">
        <MarkdownNotes
          value={destNotes}
          onSave={handleSaveDestNotes}
          placeholder="Add notes"
          readOnly={!canEdit}
        />
      </div>

      {/* 5. Content area with items */}
      <div className="px-4 space-y-4">
        {hasSchedule ? (
          /* Scheduled: day tabs + DnD items */
          <>
            <DayTabRow
              startDate={destination.start_date!}
              dayCount={dayCount}
              activeDay={activeDay}
              unassignedCount={unassignedCount}
              itemCountByDay={itemCountByDay}
              onChange={setActiveDay}
            />
            <div>
              {activeItems.length === 0 ? (
                <div className="text-center py-8 bg-bg-page rounded-2xl border border-dashed border-border">
                  <p className="text-sm text-text-tertiary font-medium">
                    {activeDay === null ? 'All items are assigned to days' : `Nothing planned for Day ${activeDay} yet`}
                  </p>
                  <p className="mt-1 text-xs text-text-faint">
                    {activeDay === null ? 'Add items from your Horizon below' : 'Move items here from Unplanned or another day'}
                  </p>
                </div>
              ) : (
                <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={activeItems.map((li) => li.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {activeItems.map((li) => (
                        <div key={li.id}>
                          <SwipeToDelete enabled={canEdit} onDelete={() => handleRemoveItem(li.id)}>
                            <SortableDayItem
                              linkedItem={li}
                              activeDayIndex={activeDay}
                              dayCount={dayCount}
                              startDate={destination.start_date!}
                              onRemove={handleRemoveItem}
                              onMove={handleMoveItem}
                              canEdit={canEdit}
                              backTo={itemBackTo}
                            />
                          </SwipeToDelete>
                          <LinkedItemExpanded
                            item={li.saved_item} canEdit={canEdit}
                            interaction={buildInteraction(li.item_id)}
                            onNotesChange={handleItemNotesChange}
                          />
                          {expandedItemId === li.item_id && (
                            <CommentThread
                              comments={threadComments} loading={threadLoading}
                              draft={commentDraft} posting={postingComment}
                              onDraftChange={setCommentDraft} onPost={handlePostComment}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </>
        ) : (
          /* Unscheduled: simple list or empty state */
          <>
            {linkedItems.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-text-faint py-1">No places saved yet</p>

                {/* Country-level: city cluster suggestions — ghost destination cards */}
                {destination.location_type === 'country' && citySuggestions.length > 0 && (
                  <div>
                    <p className="text-xs text-text-faint font-medium mb-2">Your saves in {destination.location_name.split(',')[0].trim()}</p>
                    <div className="space-y-2">
                      {citySuggestions.map((cityItem) => {
                        const isCityExpanded = expandedCitySugg === cityItem.placeId
                        const isAdding = addingCitySugg === cityItem.placeId
                        const thumbUrl = cityItem.items.find((it) => it.image_url)?.image_url ?? null
                        return (
                          <div key={cityItem.placeId} className="bg-bg-card border-2 border-dashed border-border rounded-2xl overflow-hidden">
                            {/* Card header — tap to expand/collapse; "+" always visible */}
                            <div
                              className="flex items-center gap-3 px-3 py-3 cursor-pointer select-none"
                              onClick={() => setExpandedCitySugg(isCityExpanded ? null : cityItem.placeId)}
                            >
                              {/* Ghost thumbnail — item image (muted) or map pin */}
                              <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex-none bg-bg-muted flex items-center justify-center">
                                {thumbUrl ? (
                                  <div className="w-full h-full opacity-50">
                                    <ImageWithFade src={thumbUrl} alt={cityItem.cityName} context="grid-thumbnail" className="w-full h-full object-cover" />
                                  </div>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-text-ghost">
                                    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              {/* City name + save count */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-text-faint truncate leading-snug">{cityItem.cityName}</p>
                                <p className="text-xs text-text-ghost">{cityItem.items.length} save{cityItem.items.length !== 1 ? 's' : ''}</p>
                              </div>
                              {/* Right: expand chevron + add button */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                                  className={`w-3.5 h-3.5 text-text-ghost transition-transform ${isCityExpanded ? 'rotate-180' : ''}`}>
                                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                                <button type="button" disabled={isAdding}
                                  onClick={(e) => { e.stopPropagation(); handleAddCitySuggestion(cityItem) }}
                                  className="flex items-center justify-center w-7 h-7 rounded-full bg-bg-muted text-text-faint hover:bg-accent-light hover:text-accent transition-colors disabled:opacity-50"
                                  aria-label={`Add ${cityItem.cityName}`}
                                >
                                  {isAdding ? (
                                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </div>
                            {/* Expanded: activity list with category pills */}
                            {isCityExpanded && (
                              <div className="px-3 pb-3 pt-1 border-t border-dashed border-border-subtle space-y-1">
                                {cityItem.items.map((it) => (
                                  <div key={it.id} className="flex items-center justify-between gap-2 py-0.5">
                                    <p className="text-xs text-text-faint truncate flex-1">{it.title}</p>
                                    <CategoryPill label={categoryLabel[it.category]} dominant={it.category === 'hotel'} className="shrink-0" />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* City-level: individual activity suggestions — ghost cards */}
                {destination.location_type !== 'country' && suggestions.length > 0 && (
                  <div>
                    <p className="text-xs text-text-faint font-medium mb-2">Your saves in {destination.location_name.split(',')[0].trim()}</p>
                    <div className="space-y-2">
                      {suggestions.map((item) => (
                        <div key={item.id} className="bg-bg-card border-2 border-dashed border-border rounded-2xl flex items-center gap-3 px-3 py-3">
                          {/* Ghost thumbnail */}
                          <div className="w-11 h-11 rounded-xl bg-bg-muted shrink-0 flex-none" />
                          {/* Activity title */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-faint truncate leading-snug">{item.title}</p>
                          </div>
                          {/* Add button */}
                          <button type="button"
                            onClick={() => handleAddSuggestion(item)}
                            className="flex items-center justify-center w-7 h-7 rounded-full bg-bg-muted text-text-faint hover:bg-accent-light hover:text-accent transition-colors shrink-0"
                            aria-label={`Add ${item.title}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons — prominent dashed buttons for empty state */}
                {canEdit && (
                  <div className="flex flex-col gap-2">
                    {showPlaceSearch ? (
                      <PlaceSearchInput
                        userId={user!.id}
                        biasLat={destination.location_lat}
                        biasLng={destination.location_lng}
                        onPlaceAdded={handlePlaceAdded}
                        onClose={() => setShowPlaceSearch(false)}
                      />
                    ) : (
                      <button type="button" onClick={() => setShowPlaceSearch(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-border rounded-xl text-sm font-medium text-text-tertiary hover:border-accent hover:text-accent transition-colors">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        Add a place
                      </button>
                    )}
                    <button type="button" onClick={handleOpenInboxSheet}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-border rounded-xl text-sm font-medium text-text-tertiary hover:border-accent hover:text-accent transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                        <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                      </svg>
                      Add from your Horizon
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {linkedItems.slice().sort((a, b) => a.sort_order - b.sort_order).map((li) => (
                  <div key={li.id}>
                    <SwipeToDelete enabled={canEdit} onDelete={() => handleRemoveItem(li.id)}>
                      <LinkedItemCardSummary
                        item={li.saved_item} linkId={li.id}
                        onRemove={handleRemoveItem} canEdit={canEdit}
                        hasExpandedContent backTo={itemBackTo}
                      />
                    </SwipeToDelete>
                    <LinkedItemExpanded
                      item={li.saved_item} canEdit={canEdit}
                      interaction={buildInteraction(li.item_id)}
                      onNotesChange={handleItemNotesChange}
                    />
                    {expandedItemId === li.item_id && (
                      <CommentThread
                        comments={threadComments} loading={threadLoading}
                        draft={commentDraft} posting={postingComment}
                        onDraftChange={setCommentDraft} onPost={handlePostComment}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

          </>
        )}

        {/* Add actions — shown when destination already has items */}
        {canEdit && linkedItems.length > 0 && (
          <div className="space-y-2">
            {showPlaceSearch ? (
              <PlaceSearchInput
                userId={user!.id}
                biasLat={destination.location_lat}
                biasLng={destination.location_lng}
                onPlaceAdded={handlePlaceAdded}
                onClose={() => setShowPlaceSearch(false)}
              />
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowPlaceSearch(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-border rounded-xl text-sm font-medium text-text-faint hover:border-accent hover:text-accent transition-colors">
                  <Search className="w-3.5 h-3.5" />
                  Add a place
                </button>
                <button type="button" onClick={handleOpenInboxSheet}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-border rounded-xl text-sm font-medium text-text-faint hover:border-accent hover:text-accent transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  Add from your Horizon
                </button>
              </div>
            )}
          </div>
        )}

        {/* Location mismatch error */}
        {locationError && (
          <div className="flex items-start gap-2 p-3 bg-error-bg border border-error/20 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-error shrink-0 mt-0.5">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <p className="text-xs text-error flex-1">{locationError}</p>
            <button type="button" onClick={() => setLocationError(null)} className="text-error hover:text-error shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
              </svg>
            </button>
          </div>
        )}

        {/* Nearby suggestions — hidden when empty (shown inline in empty state instead) */}
        {suggestions.length > 0 && canEdit && linkedItems.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
              <h3 className="text-sm font-semibold text-text-primary">Nearby Suggestions</h3>
              <span className="text-xs text-text-faint">from your inbox</span>
            </div>
            <div className="space-y-2">
              {suggestions.map((item) => (
                <SuggestionCard
                  key={item.id} item={item}
                  onAdd={handleAddSuggestion}
                  onDismiss={() => handleDismissSuggestion(item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddDates && destination && (
        <AddDatesModal
          destination={destination}
          onClose={() => setShowAddDates(false)}
          onSaved={(updated) => {
            setDestination(updated)
            queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(tripId!) })
            if (updated.start_date && updated.end_date) {
              trackEvent('destination_dates_set', user!.id, {
                destination_id: updated.id,
                trip_id: tripId!,
                start_date: updated.start_date,
                end_date: updated.end_date,
              })
            }
          }}
        />
      )}
      {showInboxSheet && canEdit && (
        <AddFromInboxSheet
          items={inboxItems} linkedItemIds={linkedItemIds}
          loading={inboxLoading} onAdd={handleAddFromInbox}
          onClose={() => setShowInboxSheet(false)}
        />
      )}
    </div>
    </>
  )
}
