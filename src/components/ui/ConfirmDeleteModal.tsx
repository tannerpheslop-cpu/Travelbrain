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
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        style={{ maxWidth: 340, padding: 24, background: 'var(--bg-elevated-1)', borderRadius: 14, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
      >
        <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
          {title}
        </h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 8 }}>
          {description}
        </p>
        <div className="flex justify-end gap-2.5 mt-5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '8px 16px', borderRadius: 8,
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
              color: 'var(--text-secondary)', background: 'var(--bg-base)', border: 'none', cursor: 'pointer',
              opacity: loading ? 0.5 : 1, transition: 'background 150ms',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '8px 16px', borderRadius: 8,
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
              color: '#ffffff', background: '#c44a3d', border: 'none', cursor: 'pointer',
              opacity: loading ? 0.5 : 1, transition: 'background 150ms',
            }}
          >
            {loading ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
