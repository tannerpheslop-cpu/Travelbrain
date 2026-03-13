import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Zap, Link as LinkIcon, Camera, FileText, ArrowRight, MapPin, Loader2 } from 'lucide-react'
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

export default function CreatePopover({ onClose }: Props) {
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const [showQuickSave, setShowQuickSave] = useState(false)
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

  // ── Input handlers ─────────────────────────────────────────────────────

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

  // ── Click outside to close ─────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid closing on the same tap that opens it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
      document.addEventListener('touchstart', handler, { passive: true })
    }, 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [onClose])

  // ── Focus input when quick save is shown ───────────────────────────────

  useEffect(() => {
    if (showQuickSave) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [showQuickSave])

  // ── SaveSheet handler ──────────────────────────────────────────────────

  const handleSaveSheetSaved = useCallback((item: SavedItem) => {
    setRecentItems((prev) => [item, ...prev])
    dispatchSaveEvent('horizon-item-created', item)
    setShowSaveSheet(false)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <div
        ref={popoverRef}
        className="fixed z-30 right-4"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 4.5rem)' }}
      >
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden w-56 animate-in zoom-in-95 fade-in duration-150 origin-bottom-right">
          {/* Quick save mode */}
          {showQuickSave ? (
            <div className="p-3">
              <div className="relative flex items-center">
                <Plus className="absolute left-3 w-4 h-4 text-blue-500 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder="Add a place... (Enter to save)"
                  enterKeyHint="send"
                  className="w-full pl-9 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="absolute right-2 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center disabled:opacity-30 transition-colors"
                  aria-label="Save"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-white" />
                </button>
              </div>

              {/* Recently added items */}
              {recentItems.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                  {recentItems.slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 px-1 py-1.5 text-xs text-gray-500"
                    >
                      <div className="w-1 h-1 rounded-full bg-green-400 shrink-0" />
                      <span className="truncate flex-1">{item.title}</span>
                      {resolvingIds.has(item.id) && !item.location_name ? (
                        <Loader2 className="w-3 h-3 animate-spin shrink-0 text-gray-400" />
                      ) : item.location_name ? (
                        <span className="flex items-center gap-0.5 shrink-0 truncate max-w-[80px]">
                          <MapPin className="w-2.5 h-2.5" />
                          {item.location_name.split(',')[0].trim()}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Menu options */
            <div className="py-1">
              <button
                type="button"
                onClick={() => setShowQuickSave(true)}
                className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <Zap className="w-4.5 h-4.5 text-amber-500" />
                <span className="text-sm font-medium text-gray-800">Quick save</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSaveSheet(true)}
                className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <LinkIcon className="w-4.5 h-4.5 text-blue-500" />
                <span className="text-sm font-medium text-gray-800">Paste URL</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSaveSheet(true)}
                className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <Camera className="w-4.5 h-4.5 text-purple-500" />
                <span className="text-sm font-medium text-gray-800">Upload screenshot</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSaveSheet(true)}
                className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <FileText className="w-4.5 h-4.5 text-emerald-500" />
                <span className="text-sm font-medium text-gray-800">Full entry</span>
              </button>
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
