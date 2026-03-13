import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, Link as LinkIcon, Camera, PenLine } from 'lucide-react'
import { getCategoryIcon, categoryIconColors } from '../utils/categoryIcons'
import type { SavedItem } from '../types'

// ── Sheet snap states ─────────────────────────────────────────────────────────

type SheetState = 'peeking' | 'half' | 'full'

/** Height of the BottomNav (h-16 = 64px) */
const NAV_HEIGHT = 64

/** Height of the peek bar (drag handle + input + padding) */
const PEEK_HEIGHT = 72

/** getSnapY — returns the translateY for each state.
 *  translateY is measured from the TOP of the viewport. */
function getSnapY(state: SheetState): number {
  const vh = window.innerHeight
  switch (state) {
    case 'peeking':
      return vh - NAV_HEIGHT - PEEK_HEIGHT
    case 'half':
      return vh * 0.45
    case 'full':
      return vh * 0.08
  }
}

function closestSnap(y: number): SheetState {
  const peek = getSnapY('peeking')
  const half = getSnapY('half')
  const full = getSnapY('full')
  const dPeek = Math.abs(y - peek)
  const dHalf = Math.abs(y - half)
  const dFull = Math.abs(y - full)
  if (dFull < dHalf && dFull < dPeek) return 'full'
  if (dHalf < dPeek) return 'half'
  return 'peeking'
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  items: SavedItem[]
  search: string
  onSearchChange: (val: string) => void
  onRapidCapture: (titles: string[]) => void
  onOpenSaveSheet: (mode?: 'link' | 'screenshot' | 'manual') => void
  resolvingIds: Set<string>
}

export default function HorizonSheet({
  items,
  search,
  onSearchChange,
  onRapidCapture,
  onOpenSaveSheet,
  resolvingIds: _resolvingIds,
}: Props) {
  const [sheetState, setSheetState] = useState<SheetState>('peeking')
  const [translateY, setTranslateY] = useState(() => getSnapY('peeking'))
  const [isDragging, setIsDragging] = useState(false)

  const sheetRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragStartY = useRef(0)
  const dragStartTranslate = useRef(0)

  // Re-calculate snap position on window resize
  useEffect(() => {
    const handler = () => setTranslateY(getSnapY(sheetState))
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [sheetState])

  // ── Snap to a state ───────────────────────────────────────────────────────

  const snapTo = useCallback((state: SheetState) => {
    setSheetState(state)
    setTranslateY(getSnapY(state))
  }, [])

  // ── Touch drag ────────────────────────────────────────────────────────────

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true)
    dragStartY.current = e.touches[0].clientY
    dragStartTranslate.current = translateY
  }, [translateY])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return
    const dy = e.touches[0].clientY - dragStartY.current
    const newY = Math.max(getSnapY('full'), Math.min(getSnapY('peeking'), dragStartTranslate.current + dy))
    setTranslateY(newY)
  }, [isDragging])

  const onTouchEnd = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)

    // Snap to closest state based on current position
    const snapped = closestSnap(translateY)
    snapTo(snapped)

    // If collapsing to peek, blur input
    if (snapped === 'peeking') {
      inputRef.current?.blur()
    }
  }, [isDragging, translateY, snapTo])

  // ── Input focus → expand ──────────────────────────────────────────────────

  const handleInputFocus = useCallback(() => {
    if (sheetState === 'peeking') {
      snapTo('half')
    }
  }, [sheetState, snapTo])

  // ── Collapse on outside tap ───────────────────────────────────────────────

  useEffect(() => {
    if (sheetState === 'peeking') return

    const handler = (e: MouseEvent | TouchEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        snapTo('peeking')
        inputRef.current?.blur()
      }
    }

    // Use a small delay so the current interaction completes first
    const timer = setTimeout(() => {
      document.addEventListener('touchstart', handler, { passive: true })
      document.addEventListener('mousedown', handler)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('mousedown', handler)
    }
  }, [sheetState, snapTo])

  // ── Rapid capture handlers ────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const val = search.trim()
    if (!val) return
    const lines = val.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    onRapidCapture(lines)
    onSearchChange('')
    // Keep input focused for next entry
    inputRef.current?.focus()
  }, [search, onRapidCapture, onSearchChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text/plain')
      if (text.includes('\n')) {
        e.preventDefault()
        const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
        if (lines.length > 0) {
          onRapidCapture(lines)
          onSearchChange('')
        }
      }
    },
    [onRapidCapture, onSearchChange],
  )

  // ── Search results ────────────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return items
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.location_name?.toLowerCase().includes(q) ||
          item.notes?.toLowerCase().includes(q),
      )
      .slice(0, 20)
  }, [items, search])

  // ── Computed ──────────────────────────────────────────────────────────────

  const isExpanded = sheetState !== 'peeking'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={sheetRef}
      className="fixed inset-x-0 top-0 z-30 pointer-events-none overflow-hidden"
      style={{ bottom: `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom))` }}
    >
      <div
        className="pointer-events-auto absolute inset-x-0 bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)] flex flex-col max-w-lg mx-auto"
        style={{
          top: 0,
          transform: `translateY(${translateY}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
          height: `calc(100dvh - ${NAV_HEIGHT}px - env(safe-area-inset-bottom))`,
        }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing shrink-0"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={(e) => {
            // For desktop drag
            const startY = e.clientY
            const startT = translateY
            const onMove = (ev: MouseEvent) => {
              const dy = ev.clientY - startY
              const newY = Math.max(getSnapY('full'), Math.min(getSnapY('peeking'), startT + dy))
              setTranslateY(newY)
              setIsDragging(true)
            }
            const onUp = () => {
              document.removeEventListener('mousemove', onMove)
              document.removeEventListener('mouseup', onUp)
              setIsDragging(false)
              // Use a microtask to read the latest translateY
              requestAnimationFrame(() => {
                setTranslateY((current) => {
                  const snapped = closestSnap(current)
                  setSheetState(snapped)
                  if (snapped === 'peeking') inputRef.current?.blur()
                  return getSnapY(snapped)
                })
              })
            }
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
          }}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Input bar */}
        <div className="px-4 pb-2 shrink-0">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={handleInputFocus}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Search or add a save..."
              enterKeyHint="send"
              className="w-full pl-10 pr-12 py-3 bg-gray-100 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
            />
            {/* + button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!search.trim()}
              className="absolute right-2 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-700 active:bg-blue-800 transition-colors"
              aria-label="Add save"
            >
              <Plus className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Expanded content — action buttons + results */}
        {isExpanded && (
          <div className="flex-1 overflow-y-auto px-4">
            {/* Action buttons */}
            <div className="flex gap-2 pb-3">
              <button
                type="button"
                onClick={() => onOpenSaveSheet('link')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                Paste URL
              </button>
              <button
                type="button"
                onClick={() => onOpenSaveSheet('screenshot')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                Screenshot
              </button>
              <button
                type="button"
                onClick={() => onOpenSaveSheet('manual')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                <PenLine className="w-3.5 h-3.5" />
                Manual
              </button>
            </div>

            {/* Search results */}
            {search.trim() ? (
              searchResults.length > 0 ? (
                <div className="border-t border-gray-100 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Matching saves
                  </p>
                  <div className="flex flex-col">
                    {searchResults.map((item) => (
                      <SheetResultRow key={item.id} item={item} onTap={() => snapTo('peeking')} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="border-t border-gray-100 pt-6 text-center">
                  <p className="text-sm text-gray-400">No matching saves</p>
                  <p className="text-xs text-gray-300 mt-1">Press Enter to add "{search.trim()}" as a new save</p>
                </div>
              )
            ) : (
              <div className="border-t border-gray-100 pt-6 text-center">
                <p className="text-sm text-gray-400">Type to search your saves</p>
                <p className="text-xs text-gray-300 mt-1">or press Enter to quick-add a place</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Search result row ─────────────────────────────────────────────────────────

function SheetResultRow({ item, onTap }: { item: SavedItem; onTap: () => void }) {
  const Icon = getCategoryIcon(item.category)

  return (
    <Link
      to={`/item/${item.id}`}
      onClick={onTap}
      className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors"
    >
      <Icon className={`w-4 h-4 shrink-0 ${categoryIconColors[item.category]}`} />
      <span className="text-sm text-gray-900 truncate flex-1 min-w-0">{item.title}</span>
      {item.location_name && (
        <span className="text-xs text-gray-400 truncate shrink-0 max-w-[120px]">
          {item.location_name.split(',')[0].trim()}
        </span>
      )}
    </Link>
  )
}
