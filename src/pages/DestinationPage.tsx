import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import type { TripDestination, SavedItem, Category } from '../types'
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

interface LinkedItem {
  id: string
  destination_id: string
  item_id: string
  day_index: number | null
  sort_order: number
  saved_item: SavedItem
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

// ── Constants / helpers ───────────────────────────────────────────────────────

const HERO_GRADIENT = 'from-blue-400 to-indigo-600'

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

function shortName(locationName: string): string {
  return locationName.split(',')[0].trim()
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

/** Number of days inclusive between two date strings. */
function getDayCount(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate + 'T00:00:00')
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1)
}

/** "Mar 5" label for a given 1-based dayIndex. */
function formatDayTabDate(startDate: string, dayIndex: number): string {
  const d = new Date(startDate + 'T00:00:00')
  d.setDate(d.getDate() + dayIndex - 1)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCommentTime(created_at: string): string {
  const d = new Date(created_at)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Shared icon fragments ─────────────────────────────────────────────────────

function PlaceholderIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6z" clipRule="evenodd" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

// ── Add / Edit Dates Modal ────────────────────────────────────────────────────

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
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Arrival</label>
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => { setStartDate(e.target.value); setError(null) }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Departure</label>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => { setEndDate(e.target.value); setError(null) }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : hasExisting ? 'Update Dates' : 'Save Dates'}
          </button>
          {hasExisting && (
            <button
              type="button"
              onClick={handleRemoveDates}
              disabled={saving}
              className="w-full py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
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
        {/* Unassigned tab */}
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`flex flex-col items-center px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
            activeDay === null
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
          }`}
        >
          <span>Unassigned</span>
          <span className={`text-xs mt-0.5 tabular-nums ${activeDay === null ? 'text-white/60' : 'text-gray-400'}`}>
            {unassignedCount} item{unassignedCount !== 1 ? 's' : ''}
          </span>
        </button>

        {/* Day N tabs */}
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((dayNum) => {
          const count = itemCountByDay[dayNum] ?? 0
          return (
            <button
              key={dayNum}
              type="button"
              onClick={() => onChange(dayNum)}
              className={`flex flex-col items-center px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                activeDay === dayNum
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
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

// ── Item Interaction Bar ──────────────────────────────────────────────────────

function ItemInteractionBar({
  voteCount,
  userHasVoted,
  commentCount,
  isExpanded,
  onToggleVote,
  onToggleComments,
}: {
  voteCount: number
  userHasVoted: boolean
  commentCount: number
  isExpanded: boolean
  onToggleVote: () => void
  onToggleComments: () => void
}) {
  return (
    <div className="flex items-center gap-5 px-4 py-2 border-t border-gray-50 bg-white">
      {/* Vote / heart button */}
      <button
        type="button"
        onClick={onToggleVote}
        className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
          userHasVoted ? 'text-rose-500' : 'text-gray-400 hover:text-rose-400'
        }`}
        aria-label={userHasVoted ? 'Remove vote' : 'Vote for this'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
          opacity={userHasVoted ? 1 : 0.35}
        >
          <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-2.184C4.045 12.34 2 9.77 2 6.5a4.5 4.5 0 018-2.826A4.5 4.5 0 0118 6.5c0 3.27-2.045 5.84-3.885 7.536a22.049 22.049 0 01-2.582 2.184 21.86 21.86 0 01-1.162.682l-.019.01-.005.003h-.002a.739.739 0 01-.69 0l-.002-.001z" />
        </svg>
        {voteCount > 0 ? <span>{voteCount}</span> : null}
      </button>

      {/* Comment button */}
      <button
        type="button"
        onClick={onToggleComments}
        className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
          isExpanded ? 'text-blue-600' : 'text-gray-400 hover:text-blue-500'
        }`}
        aria-label={isExpanded ? 'Hide comments' : 'Show comments'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
          opacity={isExpanded ? 1 : 0.35}
        >
          <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.75.75 0 01.642-.413 47.81 47.81 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A47.814 47.814 0 0010 2z" clipRule="evenodd" />
        </svg>
        {commentCount > 0 ? <span>{commentCount}</span> : null}
      </button>
    </div>
  )
}

// ── Comment Thread Panel ──────────────────────────────────────────────────────

function CommentThread({
  comments,
  loading,
  draft,
  posting,
  onDraftChange,
  onPost,
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
            const initials = c.authorName
              .split(/\s+/)
              .slice(0, 2)
              .map((s) => s[0]?.toUpperCase() ?? '')
              .join('') || '?'
            return (
              <div key={c.id} className="flex items-start gap-2">
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                    {initials}
                  </div>
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

      {/* Input */}
      <div className="flex items-end gap-2 pt-1">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onPost()
            }
          }}
          placeholder="Add a comment…"
          rows={1}
          className="flex-1 text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
        />
        <button
          type="button"
          onClick={onPost}
          disabled={!draft.trim() || posting}
          className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 shrink-0"
        >
          {posting ? '…' : 'Post'}
        </button>
      </div>
    </div>
  )
}

// ── Day Item Card (itinerary view, with drag handle + move menu) ───────────────

function DayItemCard({
  linkedItem,
  activeDayIndex,
  dayCount,
  startDate,
  onRemove,
  onMove,
  dragHandleAttributes,
  dragHandleListeners,
  isDragging,
  canEdit,
  interaction,
}: {
  linkedItem: LinkedItem
  activeDayIndex: number | null
  dayCount: number
  startDate: string
  onRemove: (linkId: string) => void
  onMove: (linkId: string, dayIndex: number | null) => void
  dragHandleAttributes?: Record<string, unknown>
  dragHandleListeners?: Record<string, unknown>
  isDragging?: boolean
  canEdit?: boolean
  interaction?: ItemInteraction
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const item = linkedItem.saved_item
  const colors = categoryColors[item.category]

  // Build list of "move to" options — every day except the current one
  const moveOptions: Array<{ label: string; dayIndex: number | null }> = []
  if (activeDayIndex !== null) {
    moveOptions.push({ label: 'Unassigned', dayIndex: null })
  }
  for (let i = 1; i <= dayCount; i++) {
    if (i !== activeDayIndex) {
      moveOptions.push({ label: `Day ${i} · ${formatDayTabDate(startDate, i)}`, dayIndex: i })
    }
  }

  return (
    <div
      className={`bg-white border border-gray-100 shadow-sm overflow-visible relative transition-opacity ${
        isDragging ? 'opacity-40' : ''
      } ${interaction?.isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'}`}
    >
      {/* Main content row */}
      <div className="flex items-center">
        {/* Drag handle — owners only */}
        {canEdit ? (
          <button
            type="button"
            onClick={(e) => e.preventDefault()}
            {...(dragHandleAttributes as React.HTMLAttributes<HTMLButtonElement>)}
            {...(dragHandleListeners as React.HTMLAttributes<HTMLButtonElement>)}
            className="pl-2.5 pr-1 self-stretch flex items-center text-gray-300 hover:text-gray-400 touch-none cursor-grab active:cursor-grabbing shrink-0"
            aria-label="Drag to reorder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 6zm0 6a2 2 0 10.001 4.001A2 2 0 007 12zm6-12a2 2 0 10.001 4.001A2 2 0 0013 2zm0 6a2 2 0 10.001 4.001A2 2 0 0013 6zm0 6a2 2 0 10.001 4.001A2 2 0 0013 12z" />
            </svg>
          </button>
        ) : (
          <div className="w-3" />
        )}

        {/* Thumbnail */}
        <Link to={`/item/${item.id}`} className="shrink-0">
          {item.image_url ? (
            <img src={item.image_url} alt={item.title} className="w-14 h-14 object-cover bg-gray-100" />
          ) : (
            <div className={`w-14 h-14 flex items-center justify-center ${colors.bg}`}>
              <PlaceholderIcon className="w-5 h-5 text-gray-300" />
            </div>
          )}
        </Link>

        {/* Content */}
        <Link to={`/item/${item.id}`} className="flex-1 min-w-0 px-3 py-2.5">
          <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
          {item.location_name && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>
          )}
          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
            {categoryLabel[item.category]}
          </span>
        </Link>

        {/* Actions — owners only */}
        {canEdit && (
          <div className="flex items-center shrink-0 pr-1">
            {/* Move to... */}
            {moveOptions.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoveMenu((o) => !o)}
                  className="p-2 text-gray-300 hover:text-blue-500 transition-colors"
                  aria-label="Move to day"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M5 10a.75.75 0 01.75-.75h6.638L10.23 7.29a.75.75 0 111.04-1.08l3.5 3.25a.75.75 0 010 1.08l-3.5 3.25a.75.75 0 11-1.04-1.08l2.158-1.96H5.75A.75.75 0 015 10z" clipRule="evenodd" />
                  </svg>
                </button>
                {showMoveMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMoveMenu(false)} />
                    <div className="absolute right-0 bottom-full mb-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[170px]">
                      <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        Move to
                      </p>
                      {moveOptions.map((opt) => (
                        <button
                          key={opt.dayIndex ?? 'unassigned'}
                          type="button"
                          onClick={() => { setShowMoveMenu(false); onMove(linkedItem.id, opt.dayIndex) }}
                          className="w-full flex items-center px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left transition-colors"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Remove */}
            <button
              type="button"
              onClick={() => onRemove(linkedItem.id)}
              className="p-2 text-gray-300 hover:text-red-400 transition-colors"
              aria-label="Remove from destination"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Interaction bar */}
      {interaction && (
        <ItemInteractionBar
          voteCount={interaction.voteCount}
          userHasVoted={interaction.userHasVoted}
          commentCount={interaction.commentCount}
          isExpanded={interaction.isExpanded}
          onToggleVote={interaction.onToggleVote}
          onToggleComments={interaction.onToggleComments}
        />
      )}
    </div>
  )
}

// ── Sortable Day Item (wraps DayItemCard with dnd-kit) ────────────────────────

function SortableDayItem(
  props: Omit<React.ComponentProps<typeof DayItemCard>, 'dragHandleAttributes' | 'dragHandleListeners' | 'isDragging'>,
) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.linkedItem.id,
  })
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style}>
      <DayItemCard {...props} dragHandleAttributes={attributes} dragHandleListeners={listeners} isDragging={isDragging} />
    </div>
  )
}

// ── Linked Item Card (simple list view, no scheduling) ────────────────────────

function LinkedItemCard({
  item,
  linkId,
  onRemove,
  canEdit,
  interaction,
}: {
  item: SavedItem
  linkId: string
  onRemove: (linkId: string) => void
  canEdit?: boolean
  interaction?: ItemInteraction
}) {
  const colors = categoryColors[item.category]

  return (
    <div className={`bg-white border border-gray-100 shadow-sm overflow-hidden ${
      interaction?.isExpanded ? 'rounded-t-2xl' : 'rounded-2xl'
    }`}>
      <div className="flex items-center gap-0">
        <Link to={`/item/${item.id}`} className="shrink-0">
          {item.image_url ? (
            <img src={item.image_url} alt={item.title} className="w-16 h-16 object-cover bg-gray-100" />
          ) : (
            <div className={`w-16 h-16 flex items-center justify-center ${colors.bg}`}>
              <PlaceholderIcon className="w-6 h-6 text-gray-300" />
            </div>
          )}
        </Link>
        <Link to={`/item/${item.id}`} className="flex-1 min-w-0 px-3 py-2.5">
          <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
          {item.location_name && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>
          )}
          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
            {categoryLabel[item.category]}
          </span>
        </Link>
        {canEdit && (
          <button
            type="button"
            onClick={() => onRemove(linkId)}
            className="p-3 shrink-0 text-gray-300 hover:text-red-400 transition-colors"
            aria-label="Remove from destination"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>

      {/* Interaction bar */}
      {interaction && (
        <ItemInteractionBar
          voteCount={interaction.voteCount}
          userHasVoted={interaction.userHasVoted}
          commentCount={interaction.commentCount}
          isExpanded={interaction.isExpanded}
          onToggleVote={interaction.onToggleVote}
          onToggleComments={interaction.onToggleComments}
        />
      )}
    </div>
  )
}

// ── Suggestion Card ───────────────────────────────────────────────────────────

function SuggestionCard({
  item,
  onAdd,
  onDismiss,
}: {
  item: SavedItem
  onAdd: (item: SavedItem) => Promise<void>
  onDismiss?: () => void
}) {
  const colors = categoryColors[item.category]
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    setAdding(true)
    await onAdd(item)
    setAdding(false)
  }

  return (
    <div className="flex items-center gap-0 bg-blue-50 border border-blue-100 rounded-2xl overflow-hidden">
      {item.image_url ? (
        <img src={item.image_url} alt={item.title} className="w-14 h-14 object-cover bg-gray-100 shrink-0" />
      ) : (
        <div className={`w-14 h-14 shrink-0 flex items-center justify-center ${colors.bg}`}>
          <PlaceholderIcon className="w-5 h-5 text-gray-300" />
        </div>
      )}
      <div className="flex-1 min-w-0 px-3 py-2.5">
        <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
        {item.location_name && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>
        )}
        <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
          {categoryLabel[item.category]}
        </span>
      </div>
      <div className="flex items-center gap-1 mr-3 shrink-0">
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          {adding ? '…' : 'Add'}
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 text-blue-400 hover:text-blue-600 transition-colors"
            aria-label="Dismiss suggestion"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Inbox Picker Row ──────────────────────────────────────────────────────────

function InboxPickerRow({
  item,
  onAdd,
}: {
  item: SavedItem
  onAdd: (item: SavedItem) => Promise<void>
}) {
  const colors = categoryColors[item.category]
  const [adding, setAdding] = useState(false)

  const handleTap = async () => {
    if (adding) return
    setAdding(true)
    await onAdd(item)
    setAdding(false)
  }

  return (
    <button
      type="button"
      onClick={handleTap}
      disabled={adding}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-60 text-left"
    >
      {item.image_url ? (
        <img src={item.image_url} alt={item.title} className="w-12 h-12 rounded-xl object-cover bg-gray-100 shrink-0" />
      ) : (
        <div className={`w-12 h-12 rounded-xl shrink-0 flex items-center justify-center ${colors.bg}`}>
          <PlaceholderIcon className="w-5 h-5 text-gray-300" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
        {item.location_name && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>
        )}
      </div>
      {adding && (
        <div className="shrink-0 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      )}
    </button>
  )
}

// ── Add from Inbox Sheet ──────────────────────────────────────────────────────

function AddFromInboxSheet({
  items,
  linkedItemIds,
  loading,
  onAdd,
  onClose,
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
    .filter(
      (item) =>
        !q ||
        item.title.toLowerCase().includes(q) ||
        (item.location_name?.toLowerCase().includes(q) ?? false),
    )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-xl flex flex-col max-h-[82vh]">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Add from Inbox</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your inbox…"
              className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Clear search"
              >
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
              {visible.map((item) => (
                <InboxPickerRow key={item.id} item={item} onAdd={onAdd} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Destination Page ───────────────────────────────────────────────────────────

export default function DestinationPage() {
  const { tripId, destId } = useParams<{ tripId: string; destId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [destination, setDestination] = useState<TripDestination | null>(null)
  const [destLoading, setDestLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>([])
  const [suggestions, setSuggestions] = useState<SavedItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)

  // Day view state — null = Unassigned tab
  const [activeDay, setActiveDay] = useState<number | null>(null)

  // Inbox sheet state
  const [showInboxSheet, setShowInboxSheet] = useState(false)
  const [inboxItems, setInboxItems] = useState<SavedItem[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const inboxFetched = useRef(false)

  const [showAddDates, setShowAddDates] = useState(false)

  // ── Interaction state (comments + votes) ────────────────────────────────────
  const [canInteract, setCanInteract] = useState(false)
  // canEdit is true only for trip owners — controls Remove, Move, Add Dates, Add from Inbox
  const [canEdit, setCanEdit] = useState(false)
  const [votes, setVotes] = useState<Record<string, VoteState>>({})
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [threadComments, setThreadComments] = useState<CommentEntry[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── Fetch destination + items + suggestions ─────────────────────────────────

  useEffect(() => {
    if (!destId || !user) return

    supabase
      .from('trip_destinations')
      .select('*')
      .eq('id', destId)
      .single()
      .then(async ({ data: destData, error: destError }) => {
        if (destError || !destData) {
          setNotFound(true)
          setDestLoading(false)
          setItemsLoading(false)
          return
        }

        const dest = destData as TripDestination
        setDestination(dest)
        setDestLoading(false)

        const [linkedResult, suggestResult] = await Promise.all([
          supabase
            .from('destination_items')
            .select('*, saved_item:saved_items(*)')
            .eq('destination_id', destId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('saved_items')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_archived', false)
            .not('location_lat', 'is', null)
            .not('location_lng', 'is', null)
            .gte('location_lat', dest.location_lat - 0.45)
            .lte('location_lat', dest.location_lat + 0.45)
            .gte('location_lng', dest.location_lng - 0.45)
            .lte('location_lng', dest.location_lng + 0.45),
        ])

        const linked = (linkedResult.data ?? []) as LinkedItem[]
        setLinkedItems(linked)

        const linkedIds = new Set(linked.map((li) => li.item_id))
        const nearby = (suggestResult.data ?? []) as SavedItem[]
        const filtered = nearby.filter((s) => !linkedIds.has(s.id))
        setSuggestions(filtered)

        if (filtered.length > 0) {
          trackEvent('nearby_suggestion_shown', user.id, { destination_id: destId, count: filtered.length })
        }

        setItemsLoading(false)

        // ── Load interaction data ──────────────────────────────────────────
        const itemIds = linked.map((li) => li.item_id)

        const [tripRes, compRes] = await Promise.all([
          supabase.from('trips').select('owner_id').eq('id', dest.trip_id).maybeSingle(),
          supabase.from('companions').select('id').eq('trip_id', dest.trip_id).eq('user_id', user.id).maybeSingle(),
        ])
        const isOwner = tripRes.data?.owner_id === user.id
        const isCompanion = !!compRes.data
        setCanInteract(isOwner || isCompanion)
        setCanEdit(isOwner)

        if (itemIds.length > 0) {
          const [votesRes, commentsRes] = await Promise.all([
            supabase.from('votes').select('item_id, user_id').eq('trip_id', dest.trip_id).in('item_id', itemIds),
            supabase.from('comments').select('item_id').eq('trip_id', dest.trip_id).in('item_id', itemIds),
          ])

          const voteMap: Record<string, VoteState> = {}
          for (const v of (votesRes.data ?? []) as { item_id: string; user_id: string }[]) {
            if (!voteMap[v.item_id]) voteMap[v.item_id] = { count: 0, userVoted: false }
            voteMap[v.item_id].count++
            if (v.user_id === user.id) voteMap[v.item_id].userVoted = true
          }
          setVotes(voteMap)

          const countMap: Record<string, number> = {}
          for (const c of (commentsRes.data ?? []) as { item_id: string }[]) {
            countMap[c.item_id] = (countMap[c.item_id] ?? 0) + 1
          }
          setCommentCounts(countMap)
        }
      })
  }, [destId, user])

  // ── Inbox sheet (lazy-fetch once) ───────────────────────────────────────────

  const handleOpenInboxSheet = async () => {
    setShowInboxSheet(true)
    if (inboxFetched.current || !user) return
    setInboxLoading(true)
    const { data } = await supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    inboxFetched.current = true
    setInboxItems((data ?? []) as SavedItem[])
    setInboxLoading(false)
  }

  // ── Core: link an item to this destination ──────────────────────────────────

  const handleLinkItem = async (item: SavedItem): Promise<boolean> => {
    if (!destId) return false

    const { data, error } = await supabase
      .from('destination_items')
      .insert({ destination_id: destId, item_id: item.id, day_index: null, sort_order: linkedItems.length })
      .select()
      .single()

    if (error || !data) return false

    const row = data as { id: string; destination_id: string; item_id: string; day_index: number | null; sort_order: number }
    setLinkedItems((prev) => [...prev, { ...row, saved_item: item }])
    setSuggestions((prev) => prev.filter((s) => s.id !== item.id))
    // Init vote/comment state for new item
    setVotes((prev) => ({ ...prev, [item.id]: prev[item.id] ?? { count: 0, userVoted: false } }))
    setCommentCounts((prev) => ({ ...prev, [item.id]: prev[item.id] ?? 0 }))

    if (destination?.trip_id) {
      supabase
        .from('trips')
        .update({ status: 'planning' })
        .eq('id', destination.trip_id)
        .eq('status', 'aspirational')
        .then(() => {/* no-op */})
        .catch(() => {/* DB trigger is authoritative */})
    }

    return true
  }

  const handleAddSuggestion = async (item: SavedItem) => {
    const ok = await handleLinkItem(item)
    if (ok) trackEvent('nearby_suggestion_accepted', user?.id ?? null, { destination_id: destId, item_id: item.id })
  }

  const handleDismissSuggestion = (itemId: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== itemId))
    trackEvent('nearby_suggestion_dismissed', user?.id ?? null, { destination_id: destId, item_id: itemId })
  }

  const handleAddFromInbox = async (item: SavedItem) => {
    const ok = await handleLinkItem(item)
    if (ok) trackEvent('item_added_to_destination', user?.id ?? null, { destination_id: destId, item_id: item.id })
  }

  // ── Remove a linked item ────────────────────────────────────────────────────

  const handleRemoveItem = async (linkId: string) => {
    const removed = linkedItems.find((li) => li.id === linkId)
    setLinkedItems((prev) => prev.filter((li) => li.id !== linkId))

    if (removed && removed.saved_item.location_lat != null && destination) {
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

  // ── Move item to a different day ────────────────────────────────────────────

  const handleMoveItem = async (linkId: string, newDayIndex: number | null) => {
    const item = linkedItems.find((li) => li.id === linkId)
    if (!item) return
    const targetCount = linkedItems.filter((li) => li.day_index === newDayIndex && li.id !== linkId).length

    setLinkedItems((prev) =>
      prev.map((li) => li.id === linkId ? { ...li, day_index: newDayIndex, sort_order: targetCount } : li),
    )

    await supabase
      .from('destination_items')
      .update({ day_index: newDayIndex, sort_order: targetCount })
      .eq('id', linkId)

    if (newDayIndex !== null) {
      trackEvent('item_assigned_to_day', user?.id ?? null, {
        destination_id: destId,
        item_id: item.item_id,
        day_index: newDayIndex,
      })
    }
  }

  // ── Drag-to-reorder within active day ───────────────────────────────────────

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const dayItems = linkedItems
      .filter((li) => li.day_index === activeDay)
      .sort((a, b) => a.sort_order - b.sort_order)

    const oldIdx = dayItems.findIndex((li) => li.id === active.id)
    const newIdx = dayItems.findIndex((li) => li.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return

    const reordered = arrayMove(dayItems, oldIdx, newIdx)

    setLinkedItems((prev) => [
      ...prev.filter((li) => li.day_index !== activeDay),
      ...reordered.map((li, i) => ({ ...li, sort_order: i })),
    ])

    await Promise.all(
      reordered.map((li, idx) =>
        supabase.from('destination_items').update({ sort_order: idx }).eq('id', li.id),
      ),
    )
  }

  // ── Interaction: toggle vote ────────────────────────────────────────────────

  const handleToggleVote = async (itemId: string) => {
    if (!destination?.trip_id || !user) return
    const tripId_ = destination.trip_id
    const current = votes[itemId] ?? { count: 0, userVoted: false }

    if (current.userVoted) {
      setVotes((prev) => ({
        ...prev,
        [itemId]: { count: Math.max(0, current.count - 1), userVoted: false },
      }))
      await supabase
        .from('votes')
        .delete()
        .eq('trip_id', tripId_)
        .eq('item_id', itemId)
        .eq('user_id', user.id)
      trackEvent('vote_cast', user.id, { trip_id: tripId_, item_id: itemId, action: 'remove' })
    } else {
      setVotes((prev) => ({
        ...prev,
        [itemId]: { count: current.count + 1, userVoted: true },
      }))
      await supabase
        .from('votes')
        .insert({ trip_id: tripId_, item_id: itemId, user_id: user.id })
      trackEvent('vote_cast', user.id, { trip_id: tripId_, item_id: itemId, action: 'add' })
    }
  }

  // ── Interaction: toggle comments ────────────────────────────────────────────

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

    if (!destination?.trip_id) { setThreadLoading(false); return }

    const { data } = await supabase
      .from('comments')
      .select('id, user_id, body, created_at, user:users(display_name, email, avatar_url)')
      .eq('trip_id', destination.trip_id)
      .eq('item_id', itemId)
      .order('created_at', { ascending: true })

    const entries: CommentEntry[] = ((data ?? []) as {
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

  // ── Interaction: post comment ───────────────────────────────────────────────

  const handlePostComment = async () => {
    const body = commentDraft.trim()
    if (!body || !destination?.trip_id || !user || !expandedItemId || postingComment) return

    setPostingComment(true)
    const { data } = await supabase
      .from('comments')
      .insert({ trip_id: destination.trip_id, item_id: expandedItemId, user_id: user.id, body })
      .select('id, user_id, body, created_at')
      .single()

    setPostingComment(false)
    if (data) {
      const newEntry: CommentEntry = {
        id: (data as { id: string }).id,
        user_id: user.id,
        body,
        created_at: (data as { created_at: string }).created_at,
        authorName: user.email?.split('@')[0] ?? 'Me',
        avatarUrl: user.user_metadata?.avatar_url ?? null,
      }
      setThreadComments((prev) => [...prev, newEntry])
      setCommentCounts((prev) => ({
        ...prev,
        [expandedItemId]: (prev[expandedItemId] ?? 0) + 1,
      }))
      setCommentDraft('')
      trackEvent('comment_created', user.id, { trip_id: destination.trip_id, item_id: expandedItemId })
    }
  }

  // ── Helper: build interaction props for an item ─────────────────────────────

  const buildInteraction = (itemId: string): ItemInteraction => ({
    voteCount: votes[itemId]?.count ?? 0,
    userHasVoted: votes[itemId]?.userVoted ?? false,
    commentCount: commentCounts[itemId] ?? 0,
    isExpanded: expandedItemId === itemId,
    onToggleVote: () => handleToggleVote(itemId),
    onToggleComments: () => handleToggleComments(itemId),
  })

  // ── Loading / not-found states ──────────────────────────────────────────────

  if (!destLoading && notFound) {
    return (
      <div className="px-4 pt-6 pb-24">
        <button
          type="button"
          onClick={() => navigate(`/trip/${tripId}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <div className="mt-16 text-center">
          <p className="text-gray-500 font-medium">Destination not found</p>
          <p className="mt-1 text-sm text-gray-400">It may have been removed from this trip.</p>
        </div>
      </div>
    )
  }

  if (destLoading) {
    return (
      <div className="pb-24 animate-pulse">
        <div className="h-52 bg-gray-200" />
        <div className="px-4 pt-5 space-y-3">
          <div className="h-6 bg-gray-100 rounded-lg w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="mt-4 space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3">
                <div className="w-14 h-14 rounded bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const dest = destination!
  const cityName = shortName(dest.location_name)
  const fullName = dest.location_name !== cityName ? dest.location_name : null

  const hasSchedule = !!(dest.start_date && dest.end_date)
  const dayCount = hasSchedule ? getDayCount(dest.start_date!, dest.end_date!) : 0

  // Items for the currently-active tab, sorted
  const activeItems = linkedItems
    .filter((li) => li.day_index === activeDay)
    .sort((a, b) => a.sort_order - b.sort_order)

  // Counts per day for tab labels
  const itemCountByDay: Record<number, number> = {}
  for (const li of linkedItems) {
    if (li.day_index !== null) {
      itemCountByDay[li.day_index] = (itemCountByDay[li.day_index] ?? 0) + 1
    }
  }
  const unassignedCount = linkedItems.filter((li) => li.day_index === null).length

  // Reactive set for inbox sheet filter
  const linkedItemIds = new Set(linkedItems.map((li) => li.item_id))

  return (
    <div className="pb-24">

      {/* ── Hero header ───────────────────────────────────────────────────────── */}
      <div className="h-52 relative overflow-hidden">
        {dest.image_url ? (
          <>
            <img src={dest.image_url} alt={cityName} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-black/5" />
          </>
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${HERO_GRADIENT}`} />
        )}

        <button
          type="button"
          onClick={() => navigate(`/trip/${tripId}`)}
          className="absolute top-4 left-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white text-sm font-medium backdrop-blur-sm transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>

        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 z-10">
          <h1 className="text-3xl font-bold text-white drop-shadow leading-tight">{cityName}</h1>
          {fullName && <p className="text-white/75 text-sm mt-0.5">{fullName}</p>}
        </div>
      </div>

      {/* ── Date bar ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-white">
        {dest.start_date && dest.end_date ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 shrink-0">
                <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-gray-700 font-medium">
                {formatDateRange(dest.start_date, dest.end_date)}
              </span>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowAddDates(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        ) : canEdit ? (
          <button
            type="button"
            onClick={() => setShowAddDates(true)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add Dates
          </button>
        ) : (
          <span className="text-sm text-gray-400">No dates set</span>
        )}
        <span className="text-xs text-gray-400 font-medium">
          {linkedItems.length} place{linkedItems.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Content area ──────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4">

        {hasSchedule ? (
          /* ── Day-by-day itinerary view ──────────────────────────────────── */
          <>
            {/* Day tabs */}
            <DayTabRow
              startDate={dest.start_date!}
              dayCount={dayCount}
              activeDay={activeDay}
              unassignedCount={unassignedCount}
              itemCountByDay={itemCountByDay}
              onChange={setActiveDay}
            />

            {/* Active day items */}
            <div className="mt-3">
              {itemsLoading ? (
                <div className="space-y-2 animate-pulse mt-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center bg-white rounded-2xl border border-gray-100 overflow-hidden">
                      <div className="w-5 h-14 bg-gray-50 shrink-0" />
                      <div className="w-14 h-14 bg-gray-100 shrink-0" />
                      <div className="flex-1 space-y-2 py-2.5 px-3">
                        <div className="h-4 bg-gray-100 rounded w-3/4" />
                        <div className="h-3 bg-gray-100 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeItems.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200 mt-2">
                  <p className="text-sm text-gray-500 font-medium">
                    {activeDay === null
                      ? 'All items are assigned to days'
                      : `Nothing planned for Day ${activeDay} yet`}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {activeDay === null
                      ? 'Add items from your inbox or nearby suggestions'
                      : 'Move items here from Unassigned or another day'}
                  </p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext
                    items={activeItems.map((li) => li.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {activeItems.map((li) => (
                        <div key={li.id}>
                          <SortableDayItem
                            linkedItem={li}
                            activeDayIndex={activeDay}
                            dayCount={dayCount}
                            startDate={dest.start_date!}
                            onRemove={handleRemoveItem}
                            onMove={handleMoveItem}
                            canEdit={canEdit}
                            interaction={canInteract ? buildInteraction(li.item_id) : undefined}
                          />
                          {canInteract && expandedItemId === li.item_id && (
                            <CommentThread
                              comments={threadComments}
                              loading={threadLoading}
                              draft={commentDraft}
                              posting={postingComment}
                              onDraftChange={setCommentDraft}
                              onPost={handlePostComment}
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
          /* ── Simple list view (no dates set) ───────────────────────────── */
          <>
            {/* Unlock prompt — only shown to owners once items exist */}
            {!itemsLoading && linkedItems.length > 0 && canEdit && (
              <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                <span className="text-xl shrink-0">📅</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-900">Add dates to unlock day-by-day planning</p>
                  <button
                    type="button"
                    onClick={() => setShowAddDates(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-0.5 transition-colors"
                  >
                    Add dates →
                  </button>
                </div>
              </div>
            )}

            {/* Skeleton */}
            {itemsLoading && (
              <div className="space-y-2 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="w-16 h-16 bg-gray-100 shrink-0" />
                    <div className="flex-1 space-y-2 py-2.5 px-3">
                      <div className="h-4 bg-gray-100 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!itemsLoading && linkedItems.length === 0 && (
              <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-gray-300 mx-auto mb-3">
                  <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-gray-500 font-medium">No places saved here yet</p>
                <p className="mt-1 text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
                  Add from your inbox below, or save nearby items and they'll appear as suggestions
                </p>
              </div>
            )}

            {/* Items with interaction */}
            {!itemsLoading && linkedItems.length > 0 && (
              <div className="space-y-2">
                {linkedItems
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((li) => (
                    <div key={li.id}>
                      <LinkedItemCard
                        item={li.saved_item}
                        linkId={li.id}
                        onRemove={handleRemoveItem}
                        canEdit={canEdit}
                        interaction={canInteract ? buildInteraction(li.item_id) : undefined}
                      />
                      {canInteract && expandedItemId === li.item_id && (
                        <CommentThread
                          comments={threadComments}
                          loading={threadLoading}
                          draft={commentDraft}
                          posting={postingComment}
                          onDraftChange={setCommentDraft}
                          onPost={handlePostComment}
                        />
                      )}
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {/* ── Add from Inbox button (owners only) ───────────────────────────── */}
        {!itemsLoading && canEdit && (
          <div className="mt-4">
            <button
              type="button"
              onClick={handleOpenInboxSheet}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Add from Inbox
            </button>
          </div>
        )}

        {/* ── Nearby Suggestions (owners only — they can add items) ─────────── */}
        {!itemsLoading && suggestions.length > 0 && canEdit && (
          <div className="mt-8 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <h2 className="text-base font-semibold text-gray-900">Nearby Suggestions</h2>
              <span className="text-xs text-gray-400">from your inbox</span>
            </div>
            <div className="space-y-2">
              {suggestions.map((item) => (
                <SuggestionCard
                  key={item.id}
                  item={item}
                  onAdd={handleAddSuggestion}
                  onDismiss={() => handleDismissSuggestion(item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Add from Inbox Sheet ──────────────────────────────────────────────── */}
      {showInboxSheet && canEdit && (
        <AddFromInboxSheet
          items={inboxItems}
          linkedItemIds={linkedItemIds}
          loading={inboxLoading}
          onAdd={handleAddFromInbox}
          onClose={() => setShowInboxSheet(false)}
        />
      )}

      {/* ── Add / Edit Dates Modal ─────────────────────────────────────────────── */}
      {showAddDates && destination && canEdit && (
        <AddDatesModal
          destination={destination}
          onClose={() => setShowAddDates(false)}
          onSaved={(updated) => {
            setDestination(updated)
            if (updated.start_date && updated.end_date) {
              trackEvent('destination_dates_set', user?.id ?? null, {
                destination_id: updated.id,
                trip_id: updated.trip_id,
                start_date: updated.start_date,
                end_date: updated.end_date,
              })
            }
          }}
        />
      )}
    </div>
  )
}
