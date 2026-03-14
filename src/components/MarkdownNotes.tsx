/**
 * MarkdownNotes — inline editable notes with markdown rendering.
 *
 * Modes:
 * - empty: shows a subtle "Add notes" link
 * - viewing: renders markdown (bold, italic, lists, links)
 * - editing: textarea with debounced auto-save
 *
 * Used for both destination notes and activity notes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Pencil } from 'lucide-react'

// ── Markdown renderer (read-only) ────────────────────────────────────────────

function RenderedMarkdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`prose prose-sm prose-gray max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Keep links safe
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">
              {children}
            </a>
          ),
          p: ({ children }) => <p className="my-1 text-sm text-gray-600 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="my-1 ml-4 list-disc text-sm text-gray-600 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 ml-4 list-decimal text-sm text-gray-600 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-sm text-gray-600">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          // Block elements we want simple
          h1: ({ children }) => <p className="text-sm font-semibold text-gray-800 my-1">{children}</p>,
          h2: ({ children }) => <p className="text-sm font-semibold text-gray-800 my-1">{children}</p>,
          h3: ({ children }) => <p className="text-sm font-semibold text-gray-800 my-1">{children}</p>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export { RenderedMarkdown }

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Current notes value (empty string or null = no notes) */
  value: string | null
  /** Called with the new value on each debounced save */
  onSave: (notes: string | null) => void
  /** Placeholder for the empty state link text */
  placeholder?: string
  /** If true, read-only mode (no edit capability) */
  readOnly?: boolean
  /** Max lines to show in preview/compact mode (0 = no limit) */
  previewLines?: number
  /** Additional class names for the wrapper */
  className?: string
}

export default function MarkdownNotes({
  value,
  onSave,
  placeholder = 'Add notes',
  readOnly = false,
  previewLines = 0,
  className = '',
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep draft in sync if external value changes while not editing
  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  // Auto-focus and auto-resize textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      // Place cursor at end
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
      autoResize()
    }
  }, [editing])

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 60)}px`
  }

  // Debounced save — fires 800ms after last keystroke
  const debouncedSave = useCallback(
    (text: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        onSave(text.trim() || null)
      }, 800)
    },
    [onSave],
  )

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setDraft(text)
    debouncedSave(text)
    autoResize()
  }

  const handleBlur = () => {
    // Flush any pending save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    onSave(draft.trim() || null)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape to exit editing
    if (e.key === 'Escape') {
      e.preventDefault()
      handleBlur()
    }
  }

  const hasContent = !!(value && value.trim())

  // ── Read-only mode ──────────────────────────────────────────────────────────
  if (readOnly) {
    if (!hasContent) return null
    return (
      <div className={className}>
        <RenderedMarkdown
          text={value!}
          className={previewLines ? `line-clamp-${previewLines}` : ''}
        />
      </div>
    )
  }

  // ── Editing mode ────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className={className}>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Write notes... (supports **bold**, *italic*, - lists, [links](url))"
          className="w-full px-3 py-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 resize-none placeholder:text-gray-400 leading-relaxed"
          style={{ minHeight: '60px' }}
        />
        <p className="text-[10px] text-gray-300 mt-1 ml-1">Supports **bold**, *italic*, - lists, [links](url) · Esc to close</p>
      </div>
    )
  }

  // ── View mode with content ──────────────────────────────────────────────────
  if (hasContent) {
    return (
      <div className={`group relative ${className}`}>
        <div
          className={previewLines ? `line-clamp-${previewLines}` : ''}
        >
          <RenderedMarkdown text={value!} />
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute top-0 right-0 p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-gray-500 transition-all"
          aria-label="Edit notes"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-500 transition-colors ${className}`}
    >
      <Pencil className="w-3 h-3" />
      {placeholder}
    </button>
  )
}
