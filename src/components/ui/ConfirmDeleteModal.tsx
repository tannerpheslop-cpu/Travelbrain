import { useEffect, useRef } from 'react'

interface ConfirmDeleteModalProps {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

/**
 * Shared confirmation modal for destructive actions (delete item, delete trip, delete account).
 * Renders a centered modal over a semi-transparent overlay.
 */
export default function ConfirmDeleteModal({
  title = 'Delete this save?',
  description = 'This will permanently remove this item from your Horizon and unlink it from any trips.',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDeleteModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus cancel button on mount for accessibility
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="bg-white rounded-[14px] w-full shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
        style={{ maxWidth: 340, padding: 24 }}
      >
        <h2 className="text-[18px] font-semibold text-text-primary leading-snug">
          {title}
        </h2>
        <p className="mt-2 text-[14px] text-text-secondary leading-relaxed">
          {description}
        </p>
        <div className="flex justify-end gap-2.5 mt-5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-text-secondary bg-bg-muted hover:bg-bg-pill-dark transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#c0392b' }}
          >
            {loading ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
