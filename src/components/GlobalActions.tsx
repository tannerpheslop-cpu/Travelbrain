import { useState, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import CreatePopover from './CreatePopover'

/** Routes where the FAB should be hidden (trip/destination/route/item detail pages) */
const HIDDEN_FAB_PATTERNS = ['/trip/', '/item/']

export default function GlobalActions() {
  const location = useLocation()
  const hideFab = HIDDEN_FAB_PATTERNS.some((p) => location.pathname.startsWith(p))
  const [showCreate, setShowCreate] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)

  const handlePhotoCapture = useCallback(() => {
    // Triggered from CreatePopover's "Photo" button — opens file picker directly
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPendingPhoto(file)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }, [])

  return (
    <>
      {/* Hidden file input for photo capture — lives here to avoid popover click-outside issues */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* FAB — hidden on detail pages (trip, destination, route, item) */}
      {!hideFab && (
        <div
          className="fixed z-25 right-4 pointer-events-none"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 1rem)' }}
        >
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="pointer-events-auto w-13 h-13 rounded-full bg-accent text-white shadow-lg shadow-accent/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            aria-label={showCreate ? 'Close' : 'Add save'}
          >
            <div className={`transition-transform duration-200 ${showCreate ? 'rotate-0' : 'rotate-0'}`}>
              {showCreate ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
            </div>
          </button>
        </div>
      )}

      {showCreate && (
        <CreatePopover
          onClose={() => setShowCreate(false)}
          onPhotoCapture={handlePhotoCapture}
          pendingPhoto={pendingPhoto}
          onPhotoClear={() => setPendingPhoto(null)}
        />
      )}
    </>
  )
}
