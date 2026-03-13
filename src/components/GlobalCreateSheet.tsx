import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, Plus, Link as LinkIcon, Camera, PenLine, MapPin, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useRapidCapture } from '../hooks/useRapidCapture'
import SaveSheet from './SaveSheet'
import type { SavedItem } from '../types'

interface Props {
  onClose: () => void
}

/** Dispatch a custom event so InboxPage (and other listeners) can react. */
function dispatchSaveEvent(name: string, item: SavedItem) {
  window.dispatchEvent(new CustomEvent(name, { detail: item }))
}

export default function GlobalCreateSheet({ onClose }: Props) {
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)

  const [input, setInput] = useState('')
  const [recentItems, setRecentItems] = useState<SavedItem[]>([])
  const [showSaveSheet, setShowSaveSheet] = useState(false)

  // ── Rapid capture ──────────────────────────────────────────────────────

  const handleItemCreated = useCallback((item: SavedItem) => {
    setRecentItems((prev) => [item, ...prev])
    dispatchSaveEvent('horizon-item-created', item)
  }, [])

  const handleItemUpdated = useCallback((updated: SavedItem) => {
    setRecentItems((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item)),
    )
    dispatchSaveEvent('horizon-item-updated', updated)
  }, [])

  const { createSaves, resolvingIds } = useRapidCapture(
    user?.id,
    handleItemCreated,
    handleItemUpdated,
  )

  // ── Input handlers (migrated from HorizonSheet) ─────────────────────────

  const handleSubmit = useCallback(() => {
    const val = input.trim()
    if (!val) return
    const lines = val.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    createSaves(lines)
    setInput('')
    inputRef.current?.focus()
  }, [input, createSaves])

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
          createSaves(lines)
          setInput('')
        }
      }
    },
    [createSaves],
  )

  // ── Autofocus ──────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  // ── SaveSheet handler ──────────────────────────────────────────────────

  const handleSaveSheetSaved = useCallback((item: SavedItem) => {
    setRecentItems((prev) => [item, ...prev])
    dispatchSaveEvent('horizon-item-created', item)
    setShowSaveSheet(false)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none">
        <div
          className="pointer-events-auto bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.1)] max-w-lg mx-auto flex flex-col"
          style={{
            maxHeight: '65dvh',
            paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))',
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Input bar */}
          <div className="px-4 pb-3 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Type a place name and press Enter..."
                enterKeyHint="send"
                className="w-full pl-10 pr-12 py-3 bg-gray-100 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="absolute right-2 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-700 active:bg-blue-800 transition-colors"
                aria-label="Add save"
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 px-4 pb-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowSaveSheet(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Paste URL
            </button>
            <button
              type="button"
              onClick={() => setShowSaveSheet(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              Screenshot
            </button>
            <button
              type="button"
              onClick={() => setShowSaveSheet(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors"
            >
              <PenLine className="w-3.5 h-3.5" />
              Manual
            </button>
          </div>

          {/* Recently created saves */}
          {recentItems.length > 0 && (
            <div className="flex-1 overflow-y-auto px-4 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Just added
              </p>
              <div className="flex flex-col">
                {recentItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                    <span className="text-sm text-gray-900 truncate flex-1 min-w-0">
                      {item.title}
                    </span>
                    {resolvingIds.has(item.id) && !item.location_name ? (
                      <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Resolving...
                      </span>
                    ) : item.location_name ? (
                      <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0 max-w-[140px] truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {item.location_name.split(',')[0].trim()}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SaveSheet sub-modal */}
      {showSaveSheet && (
        <SaveSheet
          onClose={() => setShowSaveSheet(false)}
          onSaved={handleSaveSheetSaved}
        />
      )}
    </>
  )
}
