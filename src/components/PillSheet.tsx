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
}: PillSheetProps) {
  const [visible, setVisible] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      data-testid="pill-sheet-overlay"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity duration-250 ease-out"
        style={{
          backgroundColor: visible ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0)',
        }}
        onClick={handleClose}
        data-testid="pill-sheet-backdrop"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative w-full max-w-lg transition-transform duration-250 ease-out"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          maxHeight: '85dvh',
          background: 'var(--color-bg-card)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          display: 'flex',
          flexDirection: 'column',
        }}
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
            style={{ color: 'var(--color-text-secondary)' }}
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
              color: 'var(--color-text-primary)',
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
            color: 'var(--color-text-tertiary)',
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
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: 8,
                }}
              >
                {customGroup?.title ?? 'My Tags'}
              </p>
              <div
                style={{
                  background: 'var(--color-bg-muted)',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div className="flex flex-wrap gap-2">
                  {(customGroup?.pills ?? []).map((pill) => (
                    <Pill
                      key={pill}
                      label={pill}
                      isSelected={selected.includes(pill)}
                      onToggle={() => togglePill(pill)}
                    />
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
                          color: 'var(--color-text-primary)',
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
                        color: 'var(--color-text-tertiary)',
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
                  color: 'var(--color-text-primary)',
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
              color: 'var(--color-text-tertiary)',
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
              color: hasSelections ? '#ffffff' : 'var(--color-text-primary)',
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
      </div>
    </div>
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
        color: isSelected ? 'var(--color-accent)' : 'var(--color-text-secondary)',
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
