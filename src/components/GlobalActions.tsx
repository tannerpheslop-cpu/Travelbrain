import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import SaveSheet from './SaveSheet'

/** FAB is ONLY visible on the Horizon page (/inbox) */
const FAB_VISIBLE_PATHS = ['/inbox']

export default function GlobalActions() {
  const location = useLocation()
  const showFab = FAB_VISIBLE_PATHS.includes(location.pathname)
  const [showSaveSheet, setShowSaveSheet] = useState(false)

  return (
    <>
      {/* FAB — only visible on Horizon page (/inbox) */}
      {showFab && (
        <div
          className="fixed z-25 right-4 pointer-events-none"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 1rem)' }}
        >
          <button
            type="button"
            onClick={() => setShowSaveSheet((v) => !v)}
            className="pointer-events-auto w-13 h-13 rounded-full bg-accent text-white shadow-lg shadow-accent/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            aria-label={showSaveSheet ? 'Close' : 'Add save'}
          >
            <div className="transition-transform duration-200">
              {showSaveSheet ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
            </div>
          </button>
        </div>
      )}

      {/* Unified save sheet — opens directly from FAB, no menu */}
      {showSaveSheet && (
        <SaveSheet
          onClose={() => setShowSaveSheet(false)}
          onSaved={() => {
            // Dispatch event so InboxPage can react (invalidate queries, etc.)
            window.dispatchEvent(new CustomEvent('horizon-item-created'))
          }}
        />
      )}
    </>
  )
}
