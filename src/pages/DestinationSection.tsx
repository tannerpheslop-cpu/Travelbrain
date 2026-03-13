import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { trackEvent } from '../lib/analytics'
import SavedItemImage from '../components/SavedItemImage'
import type { TripDestination, SavedItem, Category } from '../types'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LinkedItem {
  id: string
  destination_id: string
  item_id: string
  day_index: number | null
  sort_order: number
  saved_item: SavedItem
}

export interface DestinationWithItems extends TripDestination {
  destination_items: LinkedItem[]
}

export interface LocatedItemBasic {
  id: string
  location_lat: number
  location_lng: number
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

/** A city cluster derived from inbox items within a country destination. */
interface CitySuggestion {
  cityName: string
  lat: number
  lng: number
  placeId: string
  items: SavedItem[]
}

export interface DestinationSectionProps {
  destination: DestinationWithItems
  index: number
  tripId: string
  userId: string
  isExpanded: boolean
  onToggle: () => void
  onDelete: (id: string) => void
  onDatesUpdated: (updated: TripDestination) => void
  locatedItems: LocatedItemBasic[]
  canEdit: boolean
  userAvatarUrl?: string | null
  dragHandleAttributes?: DraggableAttributes
  dragHandleListeners?: Record<string, unknown>
  isDragging?: boolean
  isFlat?: boolean
  onAddDestination?: () => void
  /** Add a city as a new trip destination and link items to it (country-level suggestions). */
  onAddCityWithItems?: (city: { name: string; lat: number; lng: number; placeId: string; country: string; countryCode: string }, itemIds: string[]) => Promise<void>
}

// ── Constants ──────────────────────────────────────────────────────────────────

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

const categoryLabel: Record<Category, string> = {
  restaurant: 'Restaurant',
  activity:   'Activity',
  hotel:      'Hotel',
  transit:    'Transit',
  general:    'General',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function shortName(s: string) { return s.split(',')[0].trim() }

function shortDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {hasExisting ? 'Edit Dates' : 'Add Dates'} · {shortName(destination.location_name)}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Arrival</label>
              <input type="date" value={startDate} max={endDate || undefined} onChange={(e) => { setStartDate(e.target.value); setError(null) }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Departure</label>
              <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => { setEndDate(e.target.value); setError(null) }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : hasExisting ? 'Update Dates' : 'Save Dates'}
          </button>
          {hasExisting && (
            <button type="button" onClick={handleRemoveDates} disabled={saving}
              className="w-full py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
              Remove dates
            </button>
          )}
        </div>
      </div>
    </div>
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
            activeDay === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <span>Unplanned</span>
          <span className={`text-xs mt-0.5 tabular-nums ${activeDay === null ? 'text-white/60' : 'text-gray-400'}`}>
            {unassignedCount} item{unassignedCount !== 1 ? 's' : ''}
          </span>
        </button>
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((dayNum) => {
          const count = itemCountByDay[dayNum] ?? 0
          return (
            <button key={dayNum} type="button" onClick={() => onChange(dayNum)}
              className={`flex flex-col items-center px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                activeDay === dayNum ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>Day {dayNum}</span>
              <span className={`text-xs mt-0.5 ${activeDay === dayNum ? 'text-white/70' : 'text-gray-400'}`}>
                {formatDayTabDate(startDate, dayNum)}{count > 0 ? ` · ${count}` : ''}
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
    <div className="flex items-center gap-5 px-4 py-2 border-t border-gray-50 bg-white">
      <button type="button" onClick={onToggleVote}
        className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${userHasVoted ? 'text-rose-500' : 'text-gray-400 hover:text-rose-400'}`}
        aria-label={userHasVoted ? 'Remove vote' : 'Vote for this'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" opacity={userHasVoted ? 1 : 0.35}>
          <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-2.184C4.045 12.34 2 9.77 2 6.5a4.5 4.5 0 018-2.826A4.5 4.5 0 0118 6.5c0 3.27-2.045 5.84-3.885 7.536a22.049 22.049 0 01-2.582 2.184 21.86 21.86 0 01-1.162.682l-.019.01-.005.003h-.002a.739.739 0 01-.69 0l-.002-.001z" />
        </svg>
        {voteCount > 0 ? <span>{voteCount}</span> : null}
      </button>
      <button type="button" onClick={onToggleComments}
        className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${isExpanded ? 'text-blue-600' : 'text-gray-400 hover:text-blue-500'}`}
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
    <div className="bg-white border-x border-b border-gray-100 rounded-b-2xl shadow-sm px-4 pt-1 pb-3">
      {loading ? (
        <div className="py-3 text-xs text-gray-400 text-center">Loading comments…</div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400 pt-2 pb-1">No comments yet — be the first!</p>
      ) : (
        <div className="space-y-3 pt-2 pb-3">
          {comments.map((c) => {
            const initials = c.authorName.split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || '?'
            return (
              <div key={c.id} className="flex items-start gap-2">
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">{initials}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xs font-semibold text-gray-800 truncate">{c.authorName}</p>
                    <p className="text-xs text-gray-400 shrink-0">{formatCommentTime(c.created_at)}</p>
                  </div>
                  <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{c.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-end gap-2 pt-1">
        <textarea ref={textareaRef} value={draft} onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onPost() } }}
          placeholder="Add a comment…" rows={1}
          className="flex-1 text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
        />
        <button type="button" onClick={onPost} disabled={!draft.trim() || posting}
          className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 shrink-0">
          {posting ? '…' : 'Post'}
        </button>
      </div>
    </div>
  )
}

// ── Day Item Card ──────────────────────────────────────────────────────────────

function DayItemCard({
  linkedItem, activeDayIndex, dayCount, startDate,
  onRemove, onMove, dragHandleAttributes, dragHandleListeners,
  isDragging, canEdit, interaction,
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
  interaction?: ItemInteraction
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const item = linkedItem.saved_item
  const colors = categoryColors[item.category]

  const moveOptions: Array<{ label: string; dayIndex: number | null }> = []
  if (activeDayIndex !== null) moveOptions.push({ label: 'Unplanned', dayIndex: null })
  for (let i = 1; i <= dayCount; i++) {
    if (i !== activeDayIndex) moveOptions.push({ label: `Day ${i} · ${formatDayTabDate(startDate, i)}`, dayIndex: i })
  }

  return (
    <div className={`bg-white border border-gray-100 shadow-sm overflow-visible relative transition-opacity ${isDragging ? 'opacity-40' : ''} ${interaction?.isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}>
      <div className="flex items-center p-2">
        {canEdit ? (
          <button type="button" onClick={(e) => e.preventDefault()}
            {...(dragHandleAttributes as React.HTMLAttributes<HTMLButtonElement>)}
            {...(dragHandleListeners as React.HTMLAttributes<HTMLButtonElement>)}
            className="pr-1.5 self-stretch flex items-center text-gray-300 hover:text-gray-400 touch-none cursor-grab active:cursor-grabbing shrink-0"
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
        <Link to={`/item/${item.id}`} className="shrink-0">
          <SavedItemImage item={item} size="sm" className="rounded-lg" />
        </Link>
        <Link to={`/item/${item.id}`} className="flex-1 min-w-0 px-3 py-1">
          <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
          {item.location_name && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>}
          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>{categoryLabel[item.category]}</span>
        </Link>
        {canEdit && (
          <div className="flex items-center shrink-0 pr-1">
            {moveOptions.length > 0 && (
              <div className="relative">
                <button type="button" onClick={() => setShowMoveMenu((o) => !o)}
                  className="p-2 text-gray-300 hover:text-blue-500 transition-colors" aria-label="Move to day">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M5 10a.75.75 0 01.75-.75h6.638L10.23 7.29a.75.75 0 111.04-1.08l3.5 3.25a.75.75 0 010 1.08l-3.5 3.25a.75.75 0 11-1.04-1.08l2.158-1.96H5.75A.75.75 0 015 10z" clipRule="evenodd" />
                  </svg>
                </button>
                {showMoveMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMoveMenu(false)} />
                    <div className="absolute right-0 bottom-full mb-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[170px]">
                      <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Move to</p>
                      {moveOptions.map((opt) => (
                        <button key={opt.dayIndex ?? 'unassigned'} type="button"
                          onClick={() => { setShowMoveMenu(false); onMove(linkedItem.id, opt.dayIndex) }}
                          className="w-full flex items-center px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left transition-colors">
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button type="button" onClick={() => onRemove(linkedItem.id)}
              className="p-2 text-gray-300 hover:text-red-400 transition-colors" aria-label="Remove from destination">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}
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

// ── Sortable Day Item ──────────────────────────────────────────────────────────

function SortableDayItem(props: Omit<React.ComponentProps<typeof DayItemCard>, 'dragHandleAttributes' | 'dragHandleListeners' | 'isDragging'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.linkedItem.id })
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style}>
      <DayItemCard {...props} dragHandleAttributes={attributes} dragHandleListeners={listeners} isDragging={isDragging} />
    </div>
  )
}

// ── Linked Item Card ───────────────────────────────────────────────────────────

function LinkedItemCard({
  item, linkId, onRemove, canEdit, interaction,
}: {
  item: SavedItem
  linkId: string
  onRemove: (linkId: string) => void
  canEdit?: boolean
  interaction?: ItemInteraction
}) {
  const colors = categoryColors[item.category]
  return (
    <div className={`bg-white border border-gray-100 shadow-sm overflow-hidden ${interaction?.isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}>
      <div className="flex items-center gap-0 p-2">
        <Link to={`/item/${item.id}`} className="shrink-0">
          <SavedItemImage item={item} size="md" className="rounded-xl" />
        </Link>
        <Link to={`/item/${item.id}`} className="flex-1 min-w-0 px-3 py-1">
          <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
          {item.location_name && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>}
          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>{categoryLabel[item.category]}</span>
        </Link>
        {canEdit && (
          <button type="button" onClick={() => onRemove(linkId)}
            className="p-3 shrink-0 text-gray-300 hover:text-red-400 transition-colors" aria-label="Remove from destination">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
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
  const colors = categoryColors[item.category]
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    setAdding(true)
    await onAdd(item)
    setAdding(false)
  }

  return (
    <div className="flex items-center gap-0 bg-blue-50 border border-blue-100 rounded-2xl overflow-hidden p-2">
      <SavedItemImage item={item} size="sm" className="rounded-lg" />
      <div className="flex-1 min-w-0 px-3 py-1">
        <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
        {item.location_name && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>}
        <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>{categoryLabel[item.category]}</span>
      </div>
      <div className="flex items-center gap-1 mr-3 shrink-0">
        <button type="button" onClick={handleAdd} disabled={adding}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          {adding ? '…' : 'Add'}
        </button>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="p-1.5 text-blue-400 hover:text-blue-600 transition-colors" aria-label="Dismiss">
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
      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-60 text-left">
      <SavedItemImage item={item} size="sm" className="rounded-xl" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
        {item.location_name && <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>}
      </div>
      {adding && <div className="shrink-0 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
    </button>
  )
}

// ── Add from Inbox Sheet ───────────────────────────────────────────────────────

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
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-xl flex flex-col max-h-[82vh]">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Add from Horizon</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your inbox…"
              className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400" />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Clear">
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
                  <div className="w-12 h-12 rounded-xl bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500 font-medium">
                {q ? 'No items match your search' : 'All inbox items are already added'}
              </p>
              {q && (
                <button type="button" onClick={() => setSearch('')}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
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
    </div>
  )
}

// ── Destination Section (main) ─────────────────────────────────────────────────

export default function DestinationSection({
  destination,
  index,
  tripId,
  userId,
  isExpanded,
  onToggle,
  onDelete,
  onDatesUpdated,
  locatedItems,
  canEdit,
  userAvatarUrl,
  dragHandleAttributes,
  dragHandleListeners,
  isDragging,
  isFlat = false,
  onAddDestination: _onAddDestination,
  onAddCityWithItems,
}: DestinationSectionProps) {
  // Linked items — initialized from preloaded destination_items, then managed locally
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>(destination.destination_items ?? [])

  // Lazy-loaded when expanded for first time
  const [dataLoaded, setDataLoaded] = useState(false)
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

  // Add from inbox sheet
  const [showInboxSheet, setShowInboxSheet] = useState(false)
  const [inboxItems, setInboxItems] = useState<SavedItem[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const inboxFetched = useRef(false)

  // Add/edit dates modal
  const [showAddDates, setShowAddDates] = useState(false)

  // Delete menu
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Unified add menu (empty state)


  // Country-level city suggestions (for empty country destinations)
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([])
  const [expandedCitySugg, setExpandedCitySugg] = useState<string | null>(null)
  const [addingCitySugg, setAddingCitySugg] = useState<string | null>(null)

  // dnd-kit for items within a day view
  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Load interaction data (votes, comments, suggestions) on first expand
  useEffect(() => {
    if (!isExpanded || dataLoaded) return
    setDataLoaded(true)
    loadInteractionData()
    loadSuggestions()
  }, [isExpanded]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadInteractionData = async () => {
    const itemIds = linkedItems.map((li) => li.item_id)
    if (itemIds.length === 0) return

    const [votesRes, commentsRes] = await Promise.all([
      supabase.from('votes').select('item_id, user_id').eq('trip_id', tripId).in('item_id', itemIds),
      supabase.from('comments').select('item_id').eq('trip_id', tripId).in('item_id', itemIds),
    ])

    const voteMap: Record<string, VoteState> = {}
    for (const v of (votesRes.data ?? []) as { item_id: string; user_id: string }[]) {
      if (!voteMap[v.item_id]) voteMap[v.item_id] = { count: 0, userVoted: false }
      voteMap[v.item_id].count++
      if (v.user_id === userId) voteMap[v.item_id].userVoted = true
    }
    setVotes(voteMap)

    const countMap: Record<string, number> = {}
    for (const c of (commentsRes.data ?? []) as { item_id: string }[]) {
      countMap[c.item_id] = (countMap[c.item_id] ?? 0) + 1
    }
    setCommentCounts(countMap)
  }

  const loadSuggestions = async () => {
    const isCountry = destination.location_type === 'country'
    const linkedIds = new Set(linkedItems.map((li) => li.item_id))

    if (isCountry) {
      // Country-level: fetch all items in this country, group by city
      const { data } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', userId)
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
        trackEvent('nearby_suggestion_shown', userId, { destination_id: destination.id, count: items.length })
      }
    } else {
      // City-level: fetch nearby items (existing logic)
      const { data } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', userId)
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
        trackEvent('nearby_suggestion_shown', userId, { destination_id: destination.id, count: nearby.length })
      }
    }
  }

  // ── Add city from country-level suggestion ───────────────────────────────────

  const handleAddCitySuggestion = async (city: CitySuggestion) => {
    if (!onAddCityWithItems || addingCitySugg) return
    setAddingCitySugg(city.placeId)
    await onAddCityWithItems(
      { name: city.cityName, lat: city.lat, lng: city.lng, placeId: city.placeId, country: destination.location_country, countryCode: destination.location_country_code },
      city.items.map((it) => it.id),
    )
    setCitySuggestions((prev) => prev.filter((c) => c.placeId !== city.placeId))
    setSuggestions((prev) => {
      const removedIds = new Set(city.items.map((it) => it.id))
      return prev.filter((s) => !removedIds.has(s.id))
    })
    setAddingCitySugg(null)
  }

  // ── Open inbox sheet (lazy fetch once) ────────────────────────────────────────

  const handleOpenInboxSheet = async () => {
    setShowInboxSheet(true)
    if (inboxFetched.current) return
    setInboxLoading(true)
    const { data } = await supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    inboxFetched.current = true
    setInboxItems((data ?? []) as SavedItem[])
    setInboxLoading(false)
  }

  // ── Link an item to this destination ──────────────────────────────────────────

  const [locationError, setLocationError] = useState<string | null>(null)

  const handleLinkItem = async (item: SavedItem): Promise<boolean> => {
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
    void supabase.from('trips').update({ status: 'planning' }).eq('id', tripId).eq('status', 'aspirational')
      .then(() => {/* no-op */})

    return true
  }

  const handleAddSuggestion = async (item: SavedItem) => {
    const ok = await handleLinkItem(item)
    if (ok) trackEvent('nearby_suggestion_accepted', userId, { destination_id: destination.id, item_id: item.id })
  }

  const handleDismissSuggestion = (itemId: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== itemId))
    trackEvent('nearby_suggestion_dismissed', userId, { destination_id: destination.id, item_id: itemId })
  }

  const handleAddFromInbox = async (item: SavedItem) => {
    const ok = await handleLinkItem(item)
    if (ok) trackEvent('item_added_to_destination', userId, { destination_id: destination.id, item_id: item.id })
  }

  // ── Remove a linked item ───────────────────────────────────────────────────────

  const handleRemoveItem = async (linkId: string) => {
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
  }

  // ── Move item to a different day ───────────────────────────────────────────────

  const handleMoveItem = async (linkId: string, newDayIndex: number | null) => {
    const item = linkedItems.find((li) => li.id === linkId)
    if (!item) return
    const targetCount = linkedItems.filter((li) => li.day_index === newDayIndex && li.id !== linkId).length
    setLinkedItems((prev) =>
      prev.map((li) => li.id === linkId ? { ...li, day_index: newDayIndex, sort_order: targetCount } : li),
    )
    await supabase.from('destination_items').update({ day_index: newDayIndex, sort_order: targetCount }).eq('id', linkId)
    if (newDayIndex !== null) {
      trackEvent('item_assigned_to_day', userId, { destination_id: destination.id, item_id: item.item_id, day_index: newDayIndex })
    }
  }

  // ── Drag-to-reorder within active day ─────────────────────────────────────────

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
  }

  // ── Toggle vote ────────────────────────────────────────────────────────────────

  const handleToggleVote = async (itemId: string) => {
    const current = votes[itemId] ?? { count: 0, userVoted: false }
    if (current.userVoted) {
      setVotes((prev) => ({ ...prev, [itemId]: { count: Math.max(0, current.count - 1), userVoted: false } }))
      await supabase.from('votes').delete().eq('trip_id', tripId).eq('item_id', itemId).eq('user_id', userId)
      trackEvent('vote_cast', userId, { trip_id: tripId, item_id: itemId, action: 'remove' })
    } else {
      setVotes((prev) => ({ ...prev, [itemId]: { count: current.count + 1, userVoted: true } }))
      await supabase.from('votes').insert({ trip_id: tripId, item_id: itemId, user_id: userId })
      trackEvent('vote_cast', userId, { trip_id: tripId, item_id: itemId, action: 'add' })
    }
  }

  // ── Toggle comments ────────────────────────────────────────────────────────────

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
      .eq('trip_id', tripId)
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

  // ── Post comment ───────────────────────────────────────────────────────────────

  const handlePostComment = async () => {
    const body = commentDraft.trim()
    if (!body || !expandedItemId || postingComment) return
    setPostingComment(true)
    const { data } = await supabase
      .from('comments')
      .insert({ trip_id: tripId, item_id: expandedItemId, user_id: userId, body })
      .select('id, user_id, body, created_at')
      .single()
    setPostingComment(false)
    if (data) {
      setThreadComments((prev) => [...prev, {
        id: (data as { id: string }).id,
        user_id: userId,
        body,
        created_at: (data as { created_at: string }).created_at,
        authorName: 'Me',
        avatarUrl: userAvatarUrl ?? null,
      }])
      setCommentCounts((prev) => ({ ...prev, [expandedItemId]: (prev[expandedItemId] ?? 0) + 1 }))
      setCommentDraft('')
      trackEvent('comment_created', userId, { trip_id: tripId, item_id: expandedItemId })
    }
  }

  const buildInteraction = (itemId: string): ItemInteraction => ({
    voteCount: votes[itemId]?.count ?? 0,
    userHasVoted: votes[itemId]?.userVoted ?? false,
    commentCount: commentCounts[itemId] ?? 0,
    isExpanded: expandedItemId === itemId,
    onToggleVote: () => handleToggleVote(itemId),
    onToggleComments: () => handleToggleComments(itemId),
  })

  // ── Derived values ─────────────────────────────────────────────────────────────

  const gradient = DEST_GRADIENTS[index % DEST_GRADIENTS.length]
  const city = shortName(destination.location_name)
  const hasSchedule = !!(destination.start_date && destination.end_date)
  const dayCount = hasSchedule ? getDayCount(destination.start_date!, destination.end_date!) : 0

  const activeItems = linkedItems.filter((li) => li.day_index === activeDay).sort((a, b) => a.sort_order - b.sort_order)
  const itemCountByDay: Record<number, number> = {}
  for (const li of linkedItems) {
    if (li.day_index !== null) itemCountByDay[li.day_index] = (itemCountByDay[li.day_index] ?? 0) + 1
  }
  const unassignedCount = linkedItems.filter((li) => li.day_index === null).length
  const linkedItemIds = new Set(linkedItems.map((li) => li.item_id))

  // Nearby suggestions count for collapsed badge (computed from locatedItems)
  const nearbySuggCount = locatedItems.filter(
    (li) =>
      !linkedItemIds.has(li.id) &&
      haversineKm(li.location_lat, li.location_lng, destination.location_lat, destination.location_lng) <= 50,
  ).length

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className={isFlat ? '' : `bg-white rounded-2xl border border-gray-100 shadow-sm transition-opacity ${isDragging ? 'opacity-40 shadow-md' : ''}`}>

      {/* ── Collapsed header row (hidden in flat mode) ── */}
      {!isFlat && (
      <div
        className="flex items-center gap-3 px-3 py-3 cursor-pointer select-none"
        onClick={onToggle}
      >
        {/* City thumbnail */}
        <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex-none">
          {destination.image_url ? (
            <img src={destination.image_url} alt={city} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
          )}
        </div>

        {/* Name + dates */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{city}</p>
          {destination.start_date && destination.end_date ? (
            <p className="text-xs text-blue-600 font-medium truncate">{shortDateRange(destination.start_date, destination.end_date)}</p>
          ) : (
            <p className="text-xs text-gray-400">No dates set</p>
          )}
        </div>

        {/* Right side: suggestions dot, count, drag, menu, chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
          {nearbySuggCount > 0 && (
            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" title={`${nearbySuggCount} nearby suggestion${nearbySuggCount !== 1 ? 's' : ''}`} />
          )}
          <span className="text-xs text-gray-400 font-medium min-w-[3ch] text-right">
            {linkedItems.length}
          </span>

          {/* Drag handle */}
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            {...(dragHandleAttributes as React.HTMLAttributes<HTMLButtonElement>)}
            {...(dragHandleListeners as React.HTMLAttributes<HTMLButtonElement>)}
            className="p-1 text-gray-300 hover:text-gray-400 touch-none cursor-grab active:cursor-grabbing transition-colors"
            aria-label="Drag to reorder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <circle cx="5.5" cy="3" r="1" /><circle cx="10.5" cy="3" r="1" />
              <circle cx="5.5" cy="8" r="1" /><circle cx="10.5" cy="8" r="1" />
              <circle cx="5.5" cy="13" r="1" /><circle cx="10.5" cy="13" r="1" />
            </svg>
          </button>

          {/* ··· menu */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); setConfirming(false) }}
              className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
              aria-label="Destination options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirming(false) }} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
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

          {/* Expand/collapse chevron */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
            className={`w-4 h-4 text-gray-300 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
      )}

      {/* ── Expanded content ── */}
      {isExpanded && (
        <div className={isFlat ? '' : 'border-t border-gray-50'}>
          {/* Date + item count bar */}
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-50">
            {hasSchedule ? (
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-400 shrink-0">
                  <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-gray-600 font-medium">{formatDateRange(destination.start_date!, destination.end_date!)}</span>
                {canEdit && (
                  <button type="button" onClick={() => setShowAddDates(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                    Edit
                  </button>
                )}
              </div>
            ) : canEdit ? (
              <button type="button" onClick={() => setShowAddDates(true)}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                Add dates
              </button>
            ) : (
              <span className="text-xs text-gray-400">No dates set</span>
            )}
            <span className="text-xs text-gray-400 font-medium">{linkedItems.length} place{linkedItems.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="px-4 pt-4 pb-5 space-y-4">
            {hasSchedule ? (
              /* ── Scheduled: day-tab itinerary view ── */
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
                    <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <p className="text-sm text-gray-500 font-medium">
                        {activeDay === null ? 'All items are assigned to days' : `Nothing planned for Day ${activeDay} yet`}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {activeDay === null ? 'Add items from your horizon below' : 'Move items here from Unplanned or another day'}
                      </p>
                    </div>
                  ) : (
                    <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={activeItems.map((li) => li.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {activeItems.map((li) => (
                            <div key={li.id}>
                              <SortableDayItem
                                linkedItem={li}
                                activeDayIndex={activeDay}
                                dayCount={dayCount}
                                startDate={destination.start_date!}
                                onRemove={handleRemoveItem}
                                onMove={handleMoveItem}
                                canEdit={canEdit}
                                interaction={buildInteraction(li.item_id)}
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
              /* ── Unscheduled: simple list ── */
              <>
                {/* "Add dates" prompt when items exist */}
                {linkedItems.length > 0 && canEdit && (
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                    <span className="text-xl shrink-0">📅</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-900">Add dates to unlock day-by-day planning</p>
                      <button type="button" onClick={() => setShowAddDates(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-0.5 transition-colors">
                        Add dates →
                      </button>
                    </div>
                  </div>
                )}

                {linkedItems.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-400 py-1">No places saved yet</p>

                    {/* Country-level: city cluster suggestions — ghost destination cards */}
                    {destination.location_type === 'country' && citySuggestions.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 font-medium mb-2">Your saves in {destination.location_name.split(',')[0].trim()}</p>
                        <div className="space-y-2">
                          {citySuggestions.map((city) => {
                            const isCityExpanded = expandedCitySugg === city.placeId
                            const isAdding = addingCitySugg === city.placeId
                            const thumbUrl = city.items.find((it) => it.image_url)?.image_url ?? null
                            return (
                              <div key={city.placeId} className="bg-white border-2 border-dashed border-gray-200 rounded-2xl overflow-hidden">
                                {/* Card header — tap to expand/collapse; "+" always visible */}
                                <div
                                  className="flex items-center gap-3 px-3 py-3 cursor-pointer select-none"
                                  onClick={() => setExpandedCitySugg(isCityExpanded ? null : city.placeId)}
                                >
                                  {/* Ghost thumbnail — item image (muted) or map pin */}
                                  <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex-none bg-gray-100 flex items-center justify-center">
                                    {thumbUrl ? (
                                      <img src={thumbUrl} alt={city.cityName} className="w-full h-full object-cover opacity-50" />
                                    ) : (
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-300">
                                        <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                      </svg>
                                    )}
                                  </div>
                                  {/* City name + save count */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-400 truncate leading-snug">{city.cityName}</p>
                                    <p className="text-xs text-gray-300">{city.items.length} save{city.items.length !== 1 ? 's' : ''}</p>
                                  </div>
                                  {/* Right: expand chevron + add button */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                                      className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isCityExpanded ? 'rotate-180' : ''}`}>
                                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                    </svg>
                                    <button type="button" disabled={isAdding}
                                      onClick={(e) => { e.stopPropagation(); handleAddCitySuggestion(city) }}
                                      className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors disabled:opacity-50"
                                      aria-label={`Add ${city.cityName}`}
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
                                  <div className="px-3 pb-3 pt-1 border-t border-dashed border-gray-100 space-y-1">
                                    {city.items.map((it) => (
                                      <div key={it.id} className="flex items-center justify-between gap-2 py-0.5">
                                        <p className="text-xs text-gray-400 truncate flex-1">{it.title}</p>
                                        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${categoryColors[it.category].bg} ${categoryColors[it.category].text}`}>
                                          {categoryLabel[it.category]}
                                        </span>
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
                        <p className="text-xs text-gray-400 font-medium mb-2">Your saves in {destination.location_name.split(',')[0].trim()}</p>
                        <div className="space-y-2">
                          {suggestions.map((item) => (
                            <div key={item.id} className="bg-white border-2 border-dashed border-gray-200 rounded-2xl flex items-center gap-3 px-3 py-3">
                              {/* Ghost thumbnail */}
                              <div className="w-11 h-11 rounded-xl bg-gray-100 shrink-0 flex-none" />
                              {/* Activity title */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-400 truncate leading-snug">{item.title}</p>
                              </div>
                              {/* Add button */}
                              <button type="button"
                                onClick={() => handleAddSuggestion(item)}
                                className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors shrink-0"
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

                    {/* Add from Inbox — compact inline, part of the empty state */}
                    {canEdit && (
                      <button type="button" onClick={handleOpenInboxSheet}
                        className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-700 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                        </svg>
                        Add from Horizon
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {linkedItems.slice().sort((a, b) => a.sort_order - b.sort_order).map((li) => (
                      <div key={li.id}>
                        <LinkedItemCard
                          item={li.saved_item} linkId={li.id}
                          onRemove={handleRemoveItem} canEdit={canEdit}
                          interaction={buildInteraction(li.item_id)}
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

            {/* Add from Inbox — shown when destination already has items */}
            {canEdit && linkedItems.length > 0 && (
              <button type="button" onClick={handleOpenInboxSheet}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                Add from Horizon
              </button>
            )}

            {/* Location mismatch error */}
            {locationError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400 shrink-0 mt-0.5">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-red-700 flex-1">{locationError}</p>
                <button type="button" onClick={() => setLocationError(null)} className="text-red-400 hover:text-red-600 shrink-0">
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
                  <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <h3 className="text-sm font-semibold text-gray-900">Nearby Suggestions</h3>
                  <span className="text-xs text-gray-400">from your inbox</span>
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
        </div>
      )}

      {/* Modals */}
      {showAddDates && (
        <AddDatesModal
          destination={destination}
          onClose={() => setShowAddDates(false)}
          onSaved={(updated) => {
            onDatesUpdated(updated)
            if (updated.start_date && updated.end_date) {
              trackEvent('destination_dates_set', userId, {
                destination_id: updated.id,
                trip_id: tripId,
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
  )
}

// ── Sortable wrapper ───────────────────────────────────────────────────────────

export function SortableDestinationSection(props: Omit<DestinationSectionProps, 'dragHandleAttributes' | 'dragHandleListeners' | 'isDragging'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.destination.id })
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style}>
      <DestinationSection
        {...props}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
        isDragging={isDragging}
      />
    </div>
  )
}
