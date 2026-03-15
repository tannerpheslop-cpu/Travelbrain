import { useState, useRef, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import CreatePopover from './CreatePopover'

export default function GlobalActions() {
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

      {/* FAB — always visible, toggles between + and × */}
      <div
        className="fixed z-25 right-4 pointer-events-none"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 1rem)' }}
      >
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="pointer-events-auto w-13 h-13 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200/50 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          aria-label={showCreate ? 'Close' : 'Add save'}
        >
          <div className={`transition-transform duration-200 ${showCreate ? 'rotate-0' : 'rotate-0'}`}>
            {showCreate ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
          </div>
        </button>
      </div>

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
