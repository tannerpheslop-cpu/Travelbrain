import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PillGroup {
  title: string
  pills: string[]
  type: 'category' | 'country' | 'status' | 'custom'
}

export interface PillSheetProps {
  groups: PillGroup[]
  selected: string[]
  onSelectionChange: (selected: string[]) => void
  onClose: () => void
  title?: string
  allowCustom?: boolean
  onAddCustom?: (tagName: string) => void
  /** Called when user deletes a custom tag in edit mode */
  onDeleteCustomTag?: (tagName: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PillSheet({
  groups,
  selected,
  onSelectionChange,
  onClose,
  title = 'Filter',
  allowCustom = false,
  onAddCustom,
  onDeleteCustomTag,
}: PillSheetProps) {
  const [visible, setVisible] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const customInputRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Focus custom input when revealed
  useEffect(() => {
    if (showCustomInput) {
      customInputRef.current?.focus()
    }
  }, [showCustomInput])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 250)
  }, [onClose])

  const togglePill = useCallback(
    (pill: string) => {
      const next = selected.includes(pill)
        ? selected.filter((s) => s !== pill)
        : [...selected, pill]
      onSelectionChange(next)
    },
    [selected, onSelectionChange],
  )

  const clearAll = useCallback(() => {
    onSelectionChange([])
  }, [onSelectionChange])

  const handleAddCustom = useCallback(() => {
    const trimmed = customInput.trim()
    if (!trimmed) return
    onAddCustom?.(trimmed)
    // Also select the newly created tag
    if (!selected.includes(trimmed)) {
      onSelectionChange([...selected, trimmed])
    }
    setCustomInput('')
    setShowCustomInput(false)
  }, [customInput, onAddCustom, selected, onSelectionChange])

  const hasSelections = selected.length > 0

  // Find the custom group if allowCustom is true
  const customGroup = allowCustom ? groups.find((g) => g.type === 'custom') : null
  const nonCustomGroups = allowCustom ? groups.filter((g) => g.type !== 'custom') : groups

  return (
    <>
      {/* Backdrop — separate fixed element */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-250 ease-out"
        style={{
          backgroundColor: visible ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0)',
        }}
        onClick={handleClose}
        data-testid="pill-sheet-backdrop"
      />

      {/* Sheet — separate fixed element pinned to bottom */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 w-full max-w-lg mx-auto transition-transform duration-250 ease-out"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          maxHeight: '85dvh',
          background: 'var(--color-bg-card)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="pill-sheet"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'var(--color-border-input)',
            }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center px-4 pb-2 pt-1">
          <button
            onClick={handleClose}
            className="p-1 -ml-1"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close"
            data-testid="pill-sheet-back"
          >
            <ChevronLeft size={22} />
          </button>
          <h2
            className="flex-1 text-center -ml-6"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h2>
        </div>

        {/* Subtitle */}
        <p
          className="text-center pb-3"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'var(--text-tertiary)',
          }}
        >
          Tap to select. Tap again to deselect.
        </p>

        {/* Scrollable content */}
        <div
          className="overflow-y-auto flex-1 px-4 pb-4"
          style={{ overscrollBehavior: 'contain' }}
        >
          {/* Custom tags section (if allowCustom) */}
          {allowCustom && (
            <div className="mb-3">
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <p
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  {customGroup?.title ?? 'My Tags'}
                </p>
                {onDeleteCustomTag && (customGroup?.pills ?? []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditMode(!editMode)}
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: 500,
                      color: editMode ? 'var(--color-accent)' : 'var(--text-tertiary)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                    data-testid="edit-custom-tags-btn"
                  >
                    {editMode ? 'Done' : 'Edit'}
                  </button>
                )}
              </div>
              <div
                style={{
                  background: 'var(--color-bg-muted)',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div className="flex flex-wrap gap-2">
                  {(customGroup?.pills ?? []).map((pill) => (
                    <div key={pill} className="relative inline-flex">
                      <Pill
                        label={pill}
                        isSelected={selected.includes(pill)}
                        onToggle={() => !editMode && togglePill(pill)}
                      />
                      {editMode && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(pill) }}
                          style={{
                            position: 'absolute', top: -4, right: -4,
                            width: 18, height: 18, borderRadius: '50%',
                            background: '#c0392b', color: 'white',
                            border: 'none', cursor: 'pointer',
                            fontSize: 11, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            lineHeight: 1,
                          }}
                          data-testid={`delete-tag-${pill}`}
                          aria-label={`Delete tag ${pill}`}
                        >×</button>
                      )}
                    </div>
                  ))}

                  {/* Add custom tag button / input */}
                  {showCustomInput ? (
                    <div
                      className="inline-flex items-center"
                      style={{
                        border: '1.5px dashed var(--color-border-input)',
                        borderRadius: 20,
                        padding: '4px 10px',
                        minWidth: 80,
                      }}
                    >
                      <input
                        ref={customInputRef}
                        type="text"
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddCustom()
                          }
                          if (e.key === 'Escape') {
                            setShowCustomInput(false)
                            setCustomInput('')
                          }
                        }}
                        onBlur={() => {
                          if (!customInput.trim()) {
                            setShowCustomInput(false)
                          }
                        }}
                        placeholder="Tag name"
                        className="outline-none bg-transparent"
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          width: 80,
                        }}
                        data-testid="custom-tag-input"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCustomInput(true)}
                      className="inline-flex items-center justify-center transition-colors duration-150"
                      style={{
                        border: '1.5px dashed var(--color-border-input)',
                        borderRadius: 20,
                        padding: '6px 14px',
                        background: 'transparent',
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13,
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                      }}
                      data-testid="add-custom-tag-btn"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Standard groups */}
          {nonCustomGroups.map((group) => (
            <div key={group.title} className="mb-3">
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: 8,
                  marginTop: allowCustom || nonCustomGroups.indexOf(group) > 0 ? 16 : 0,
                }}
              >
                {group.title}
              </p>
              <div
                style={{
                  background: 'var(--color-bg-muted)',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div className="flex flex-wrap gap-2">
                  {group.pills.map((pill) => (
                    <Pill
                      key={pill}
                      label={pill}
                      isSelected={selected.includes(pill)}
                      onToggle={() => togglePill(pill)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex items-center justify-between px-4 pb-6 pt-3"
          style={{
            borderTop: '1px solid var(--color-border-light)',
          }}
        >
          <button
            onClick={clearAll}
            className="transition-opacity duration-150"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 400,
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              opacity: hasSelections ? 1 : 0.5,
            }}
            disabled={!hasSelections}
            data-testid="pill-sheet-clear"
          >
            Clear selection
          </button>
          <button
            onClick={handleClose}
            className="transition-colors duration-150"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              background: hasSelections ? 'var(--color-accent)' : 'var(--color-bg-muted)',
              color: hasSelections ? '#ffffff' : 'var(--text-primary)',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              cursor: 'pointer',
            }}
            data-testid="pill-sheet-done"
          >
            Done
          </button>
        </div>

        {/* Delete confirmation dialog */}
        {confirmDelete && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.4)', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
            onClick={() => setConfirmDelete(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--color-bg-card)',
                borderRadius: 14,
                padding: '20px 24px',
                maxWidth: 280,
                width: '85%',
                boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              }}
            >
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                Delete tag &lsquo;{confirmDelete}&rsquo;?
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
                This will remove it from all entries.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
                    color: 'var(--text-secondary)', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '8px 14px',
                  }}
                  data-testid="cancel-delete-tag"
                >Cancel</button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteCustomTag?.(confirmDelete)
                    // Also remove from selected filters if present
                    if (selected.includes(confirmDelete)) {
                      onSelectionChange(selected.filter((s) => s !== confirmDelete))
                    }
                    setConfirmDelete(null)
                  }}
                  style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                    color: '#ffffff', background: '#c0392b', border: 'none',
                    borderRadius: 8, cursor: 'pointer', padding: '8px 14px',
                  }}
                  data-testid="confirm-delete-tag"
                >Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Pill sub-component ────────────────────────────────────────────────────────

function Pill({
  label,
  isSelected,
  onToggle,
}: {
  label: string
  isSelected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="transition-all duration-150 ease-out"
      style={{
        border: `1.5px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-input)'}`,
        background: isSelected ? 'var(--color-accent-light)' : 'transparent',
        color: isSelected ? 'var(--color-accent)' : 'var(--text-secondary)',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: isSelected ? 500 : 400,
        borderRadius: 20,
        padding: '6px 14px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      data-testid={`pill-${label}`}
      aria-pressed={isSelected}
    >
      {label}
    </button>
  )
}
