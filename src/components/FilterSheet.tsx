import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { getCategoryIcon } from '../lib/categories'
import type { FilterPill } from './FilterBar'

type GroupMode = 'country' | 'city'

interface FilterSheetProps {
  allPills: FilterPill[]
  selectedFilters: string[]
  onSelectionChange: (filters: string[]) => void
  onClose: () => void
  groupMode: GroupMode
  onGroupModeChange: (mode: GroupMode) => void
  onDeleteCustomTag?: (tagName: string) => void
}

export default function FilterSheet({
  allPills,
  selectedFilters,
  onSelectionChange,
  onClose,
  groupMode,
  onGroupModeChange,
  onDeleteCustomTag,
}: FilterSheetProps) {
  const [visible, setVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [createValue, setCreateValue] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const activeIds = useMemo(() => new Set(selectedFilters), [selectedFilters])

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Lock body scroll while sheet is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    if (showCreateInput) createInputRef.current?.focus()
  }, [showCreateInput])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 250)
  }, [onClose])

  const togglePill = useCallback((pillId: string) => {
    onSelectionChange(
      selectedFilters.includes(pillId)
        ? selectedFilters.filter(f => f !== pillId)
        : [...selectedFilters, pillId],
    )
  }, [selectedFilters, onSelectionChange])

  const clearAll = useCallback(() => {
    onSelectionChange([])
    handleClose()
  }, [onSelectionChange, handleClose])

  // Split pills into sections
  const locationPills = useMemo(() =>
    allPills.filter(p => p.type === 'location').sort((a, b) => b.count - a.count),
    [allPills],
  )
  const categoryPills = useMemo(() =>
    allPills.filter(p => p.type === 'category').sort((a, b) => {
      if (a.count === 0 && b.count > 0) return 1
      if (a.count > 0 && b.count === 0) return -1
      return b.count - a.count
    }),
    [allPills],
  )
  const customPills = useMemo(() =>
    allPills.filter(p => p.type === 'custom').sort((a, b) => b.count - a.count),
    [allPills],
  )

  // Filter by search query
  const q = searchQuery.trim().toLowerCase()
  const filteredLocations = q ? locationPills.filter(p => p.label.toLowerCase().includes(q)) : locationPills
  const filteredCategories = q ? categoryPills.filter(p => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : categoryPills
  const filteredCustom = q ? customPills.filter(p => p.label.toLowerCase().includes(q)) : customPills

  const hasFilters = selectedFilters.length > 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-250 ease-out"
        style={{ backgroundColor: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)' }}
        onClick={handleClose}
        onTouchMove={(e) => e.preventDefault()}
        data-testid="filter-sheet-backdrop"
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 w-full max-w-lg mx-auto transition-transform duration-250 ease-out"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          maxHeight: '85dvh',
          background: 'var(--bg-base, #15181c)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="filter-sheet"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-subtle, #242a30)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 pt-1">
          <h2 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-primary, #e8eaed)',
            margin: 0,
          }}>
            Filters
          </h2>
          <button
            type="button"
            onClick={handleClose}
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--accent-primary, #B8441E)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 0',
            }}
            data-testid="filter-sheet-done"
          >
            Done
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pb-3">
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}>
            <Search
              className="w-3.5 h-3.5"
              style={{
                position: 'absolute',
                left: 14,
                color: 'var(--text-muted, #6f7781)',
                pointerEvents: 'none',
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search filters..."
              style={{
                width: '100%',
                background: 'var(--bg-elevated-1, #1c2126)',
                border: '1px solid var(--border-subtle, #242a30)',
                borderRadius: 9999,
                padding: '10px 14px 10px 36px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                color: 'var(--text-primary, #e8eaed)',
                outline: 'none',
              }}
              data-testid="filter-sheet-search"
            />
          </div>
        </div>

        {/* Scrollable content */}
        <div
          className="flex-1 overflow-y-auto px-4 pb-4"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {/* LOCATIONS */}
          {filteredLocations.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-2">
                <SectionHeader>Locations</SectionHeader>
                {/* City/Country toggle */}
                <div style={{
                  display: 'inline-flex',
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: '0.5px solid rgba(118,130,142,0.2)',
                  height: 22,
                }}>
                  <button
                    type="button"
                    onClick={() => onGroupModeChange('country')}
                    style={{
                      padding: '0 6px',
                      height: 22,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 10,
                      fontWeight: groupMode === 'country' ? 600 : 400,
                      background: groupMode === 'country' ? 'rgba(228,232,240,0.1)' : 'transparent',
                      color: groupMode === 'country' ? 'var(--text-primary, #e8eaed)' : 'var(--text-tertiary)',
                    }}
                    data-testid="filter-group-country"
                  >
                    Country
                  </button>
                  <button
                    type="button"
                    onClick={() => onGroupModeChange('city')}
                    style={{
                      padding: '0 6px',
                      height: 22,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 10,
                      fontWeight: groupMode === 'city' ? 600 : 400,
                      background: groupMode === 'city' ? 'rgba(228,232,240,0.1)' : 'transparent',
                      color: groupMode === 'city' ? 'var(--text-primary, #e8eaed)' : 'var(--text-tertiary)',
                    }}
                    data-testid="filter-group-city"
                  >
                    City
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {filteredLocations.map(pill => (
                  <SheetPill
                    key={pill.id}
                    pill={pill}
                    selected={activeIds.has(pill.id)}
                    onClick={() => togglePill(pill.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          {filteredLocations.length > 0 && filteredCategories.length > 0 && (
            <div style={{ height: 1, background: 'var(--border-subtle, #242a30)', margin: '4px 0 16px' }} />
          )}

          {/* CATEGORIES */}
          {filteredCategories.length > 0 && (
            <div className="mb-4">
              <SectionHeader>Categories</SectionHeader>
              <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                {filteredCategories.map(pill => {
                  // Get the specific category icon
                  const tagName = pill.id.replace('cat:', '')
                  const Icon = getCategoryIcon(tagName)
                  const iconNode = Icon ? <Icon className="w-3.5 h-3.5" /> : pill.icon
                  return (
                    <SheetPill
                      key={pill.id}
                      pill={{ ...pill, icon: iconNode }}
                      selected={activeIds.has(pill.id)}
                      onClick={() => togglePill(pill.id)}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Divider */}
          {filteredCategories.length > 0 && (filteredCustom.length > 0 || !q) && (
            <div style={{ height: 1, background: 'var(--border-subtle, #242a30)', margin: '4px 0 16px' }} />
          )}

          {/* MY TAGS */}
          {(filteredCustom.length > 0 || !q) && (
            <div className="mb-4">
              <SectionHeader>My Tags</SectionHeader>
              <div className="flex flex-wrap" style={{ gap: 6, marginTop: 8 }}>
                {filteredCustom.map(pill => (
                  <div key={pill.id} style={{ position: 'relative', display: 'inline-flex' }}>
                    <SheetPill
                      pill={pill}
                      selected={activeIds.has(pill.id)}
                      onClick={() => togglePill(pill.id)}
                    />
                    {/* Delete button */}
                    {onDeleteCustomTag && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(pill.label) }}
                        style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: 'var(--text-muted, #6f7781)',
                          color: 'var(--bg-base, #15181c)',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1,
                        }}
                        data-testid={`delete-tag-${pill.label}`}
                        aria-label={`Delete tag ${pill.label}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                ))}

                {/* Create tag button / input */}
                {showCreateInput ? (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    border: '1.5px dashed var(--border-subtle, #242a30)',
                    borderRadius: 9999,
                    padding: '5px 12px',
                    minWidth: 80,
                  }}>
                    <input
                      ref={createInputRef}
                      type="text"
                      value={createValue}
                      onChange={(e) => setCreateValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          // Tag creation: just a placeholder — tags only persist when assigned to items
                          if (createValue.trim()) {
                            setCreateValue('')
                            setShowCreateInput(false)
                          }
                        }
                        if (e.key === 'Escape') {
                          setShowCreateInput(false)
                          setCreateValue('')
                        }
                      }}
                      onBlur={() => {
                        if (!createValue.trim()) {
                          setShowCreateInput(false)
                        }
                      }}
                      placeholder="Tag name"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13,
                        color: 'var(--text-primary, #e8eaed)',
                        width: 80,
                      }}
                      data-testid="create-tag-input"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCreateInput(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      border: '1.5px dashed var(--border-subtle, #242a30)',
                      borderRadius: 9999,
                      padding: '6px 12px',
                      background: 'transparent',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      color: 'var(--text-muted, #6f7781)',
                      cursor: 'pointer',
                    }}
                    data-testid="create-tag-btn"
                  >
                    + Create tag
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Clear all — only when filters active */}
        {hasFilters && (
          <div style={{
            padding: '12px 16px 24px',
            borderTop: '1px solid var(--border-subtle, #242a30)',
          }}>
            <button
              type="button"
              onClick={clearAll}
              style={{
                width: '100%',
                textAlign: 'center',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 0',
              }}
              data-testid="filter-sheet-clear"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setConfirmDelete(null)}
          />
          <div
            className="fixed z-[70]"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--bg-elevated-1, #1c2126)',
              borderRadius: 14,
              padding: '20px 24px',
              maxWidth: 280,
              width: '85%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary, #e8eaed)',
              marginBottom: 8,
            }}>
              Delete tag &lsquo;{confirmDelete}&rsquo;?
            </p>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: 'var(--text-tertiary)',
              marginBottom: 16,
            }}>
              This will remove it from all saves.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px 14px',
                }}
                data-testid="cancel-delete-tag"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteCustomTag?.(confirmDelete)
                  // Remove from selected if present
                  const tagId = `tag:${confirmDelete}`
                  if (selectedFilters.includes(tagId)) {
                    onSelectionChange(selectedFilters.filter(f => f !== tagId))
                  }
                  setConfirmDelete(null)
                }}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#ffffff',
                  background: '#c0392b',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  padding: '8px 14px',
                }}
                data-testid="confirm-delete-tag"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: 'var(--text-muted, #6f7781)',
      margin: 0,
    }}>
      {children}
    </p>
  )
}

function SheetPill({ pill, selected, onClick }: { pill: FilterPill; selected: boolean; onClick: () => void }) {
  const muted = pill.count === 0 && !selected
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: selected ? 600 : 400,
        color: selected
          ? '#e8eaed'
          : muted
            ? 'var(--text-muted, #6f7781)'
            : 'var(--text-secondary, #b9c0c7)',
        background: selected
          ? 'var(--accent-primary, #B8441E)'
          : 'var(--bg-elevated-1, #1c2126)',
        border: selected
          ? '1px solid var(--accent-primary, #B8441E)'
          : '1px solid var(--border-subtle, #242a30)',
        borderRadius: 9999,
        padding: '6px 12px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'all 0.15s ease-out',
      }}
      data-testid={`sheet-pill-${pill.id}`}
      aria-pressed={selected}
    >
      {pill.icon}
      {pill.label}
      {pill.count > 0 && (
        <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginLeft: 2 }}>
          ({pill.count})
        </span>
      )}
    </button>
  )
}
