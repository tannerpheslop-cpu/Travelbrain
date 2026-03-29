import { useState, useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { useQueryClient } from '@tanstack/react-query'
import LocationAutocomplete, { type LocationSelection } from './LocationAutocomplete'
import type { ExtractedItem, Category } from '../types'

// ── Types ────────────────────────────────────────────────────────────────────

interface SelectionOverlayProps {
  extractionId: string
  sourceTitle: string | null
  sourceUrl: string
  contentType: 'listicle' | 'itinerary' | 'guide'
  items: Array<ExtractedItem & { likely_duplicate?: boolean }>
  userId: string
  onClose: () => void
}

interface ItemEdit {
  name: string
  category: Category
  location_name: string | null
  location?: LocationSelection | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

const VALID_CATEGORIES: Category[] = ['restaurant', 'activity', 'hotel', 'transit', 'general']

function normalizeCategory(cat: string): Category {
  if (VALID_CATEGORIES.includes(cat as Category)) return cat as Category
  return 'general'
}

const CATEGORY_PILLS: { value: Category; label: string }[] = [
  { value: 'restaurant', label: 'Food' },
  { value: 'activity', label: 'Activity' },
  { value: 'hotel', label: 'Stay' },
  { value: 'transit', label: 'Transit' },
  { value: 'general', label: 'General' },
]

// ── Component ────────────────────────────────────────────────────────────────

export default function SelectionOverlay({
  extractionId,
  sourceTitle,
  sourceUrl,
  contentType,
  items,
  userId,
  onClose,
}: SelectionOverlayProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [visible, setVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  // Selection state: pre-select all non-duplicates
  const [selected, setSelected] = useState<Set<number>>(() => {
    const s = new Set<number>()
    items.forEach((item, i) => {
      if (!item.likely_duplicate) s.add(i)
    })
    return s
  })

  // Edits map: index → edited fields (only populated for items the user has edited)
  const [edits, setEdits] = useState<Map<number, ItemEdit>>(new Map())

  /** Get the display values for an item (original + any edits) */
  const getItemDisplay = useCallback((item: ExtractedItem, index: number): ItemEdit => {
    const edit = edits.get(index)
    return {
      name: edit?.name ?? item.name,
      category: edit?.category ?? normalizeCategory(item.category),
      location_name: edit?.location_name ?? item.location_name,
      location: edit?.location ?? null,
    }
  }, [edits])

  /** Update a specific field for an item */
  const updateEdit = useCallback((index: number, field: Partial<ItemEdit>) => {
    setEdits(prev => {
      const next = new Map(prev)
      const existing = next.get(index) ?? {
        name: items[index].name,
        category: normalizeCategory(items[index].category),
        location_name: items[index].location_name,
      }
      next.set(index, { ...existing, ...field })
      return next
    })
  }, [items])

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 300)
  }, [onClose])

  const toggleItem = useCallback((index: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((_, i) => i)))
  }, [items])

  const deselectAll = useCallback(() => {
    setSelected(new Set())
  }, [])

  const toggleExpand = useCallback((index: number) => {
    setExpandedIndex(prev => prev === index ? null : index)
  }, [])

  const selectedCount = selected.size

  const handleSave = useCallback(async () => {
    if (selectedCount === 0 || saving) return
    setSaving(true)

    try {
      const rows = items
        .map((item, i) => ({ item, i }))
        .filter(({ i }) => selected.has(i))
        .map(({ item, i }) => {
          const display = getItemDisplay(item, i)
          return {
            user_id: userId,
            source_type: 'manual' as const,
            source_url: sourceUrl,
            title: display.name,
            category: display.category,
            location_name: display.location?.name ?? display.location_name,
            location_lat: display.location?.lat ?? null,
            location_lng: display.location?.lng ?? null,
            location_place_id: display.location?.place_id ?? null,
            location_country: display.location?.country ?? null,
            location_country_code: display.location?.country_code ?? null,
            location_locked: !!display.location,
            location_precision: display.location ? 'precise' as const : null,
            description: item.description,
            image_display: 'none' as const,
            has_pending_extraction: false,
          }
        })

      const { error } = await supabase.from('saved_items').insert(rows)
      if (error) {
        console.error('[SelectionOverlay] Insert failed:', error.message)
        setSaving(false)
        return
      }

      await supabase
        .from('pending_extractions')
        .update({ status: 'reviewed' })
        .eq('id', extractionId)

      queryClient.invalidateQueries({ queryKey: ['saved-items'] })
      queryClient.invalidateQueries({ queryKey: ['pending-extraction-counts'] })

      toast(`Saved ${selectedCount} item${selectedCount !== 1 ? 's' : ''} to Horizon`)
      handleClose()
    } catch (err) {
      console.error('[SelectionOverlay] Save error:', (err as Error).message)
      setSaving(false)
    }
  }, [items, selected, selectedCount, saving, userId, sourceUrl, extractionId, queryClient, toast, handleClose, getItemDisplay])

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.4)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 300ms ease',
        }}
        onClick={handleClose}
      />

      {/* Overlay panel */}
      <div
        data-testid="selection-overlay"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61,
          background: '#faf8f4', borderRadius: '16px 16px 0 0',
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 16px 8px', borderBottom: '0.5px solid #e8e6e1', flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, color: '#1a1d27' }}>
            {selectedCount} of {items.length} selected
          </span>
          <button type="button" onClick={handleClose} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 8, background: '#f1efe8',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={16} style={{ color: '#888780' }} />
          </button>
        </div>

        {/* Source info + select controls */}
        <div style={{ padding: '8px 16px 4px', flexShrink: 0 }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888780', margin: '0 0 8px' }}>
            From: {sourceTitle ?? 'Article'} · {extractDomain(sourceUrl)}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={selectAll} style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              color: '#c45a2d', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>Select all</button>
            <button type="button" onClick={deselectAll} style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              color: '#c45a2d', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>Deselect all</button>
          </div>
        </div>

        {/* Item list (scrollable) */}
        <div style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          overscrollBehavior: 'contain', padding: '4px 0',
        }}>
          {items.map((item, i) => {
            const isSelected = selected.has(i)
            const isDuplicate = item.likely_duplicate
            const isExpanded = expandedIndex === i
            const display = getItemDisplay(item, i)

            return (
              <div
                key={i}
                data-testid={`extraction-item-${i}`}
                style={{
                  borderBottom: '0.5px solid #f1efe8',
                  borderTop: isExpanded ? '0.5px solid #e8e6e1' : 'none',
                  background: isExpanded ? '#f5f3ef' : 'transparent',
                  transition: 'background 200ms ease',
                }}
              >
                {/* Collapsed row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: isExpanded ? '10px 16px 6px' : '10px 16px',
                  opacity: isDuplicate && !isSelected ? 0.5 : 1,
                }}>
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleItem(i) }}
                    style={{
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                      border: isSelected ? 'none' : '1.5px solid #d3d1c7',
                      background: isSelected ? '#c45a2d' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', padding: 0,
                    }}
                  >
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  {/* Content (tappable to expand) */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(i)}
                    style={{
                      flex: 1, minWidth: 0, background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left', padding: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {contentType === 'itinerary' && (
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#c45a2d' }}>
                          {item.source_order}.
                        </span>
                      )}
                      <p style={{
                        fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
                        color: '#1a1d27', margin: 0, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {display.name}
                      </p>
                      {isDuplicate && (
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 500, color: '#888780', flexShrink: 0 }}>
                          Already saved
                        </span>
                      )}
                    </div>
                    <p style={{
                      fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888780',
                      margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {display.category}{display.location_name ? ` · ${display.location_name}` : ''}
                    </p>
                  </button>
                </div>

                {/* Expanded editing area */}
                <div style={{
                  maxHeight: isExpanded ? 300 : 0,
                  overflow: 'hidden',
                  opacity: isExpanded ? 1 : 0,
                  transition: 'max-height 200ms ease, opacity 200ms ease',
                }}>
                  {isExpanded && (
                    <ExpandedEditor
                      display={display}
                      onNameChange={(name) => updateEdit(i, { name })}
                      onCategoryChange={(category) => updateEdit(i, { category })}
                      onLocationChange={(loc) => {
                        if (loc) updateEdit(i, { location_name: loc.name, location: loc })
                      }}
                      onDone={() => setExpandedIndex(null)}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom save bar */}
        <div style={{
          padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          borderTop: '0.5px solid #e8e6e1', flexShrink: 0,
        }}>
          <button
            type="button"
            data-testid="save-selected-btn"
            onClick={handleSave}
            disabled={selectedCount === 0 || saving}
            style={{
              width: '100%', padding: '14px 0',
              background: selectedCount > 0 ? '#c45a2d' : '#d3d1c7', color: '#fff',
              fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600,
              border: 'none', borderRadius: 12,
              cursor: selectedCount > 0 ? 'pointer' : 'default',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : `Save ${selectedCount} item${selectedCount !== 1 ? 's' : ''} to Horizon`}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Expanded editor sub-component ────────────────────────────────────────────

function ExpandedEditor({
  display,
  onNameChange,
  onCategoryChange,
  onLocationChange,
  onDone,
}: {
  display: ItemEdit
  onNameChange: (name: string) => void
  onCategoryChange: (cat: Category) => void
  onLocationChange: (loc: LocationSelection | null) => void
  onDone: () => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{ padding: '4px 16px 12px 48px' }}>
      {/* Name input */}
      <input
        ref={nameRef}
        type="text"
        value={display.name}
        onChange={e => onNameChange(e.target.value)}
        style={{
          width: '100%', fontSize: 16, fontWeight: 500, padding: '8px 10px',
          border: '1px solid #e8e6e1', borderRadius: 8, background: '#fff',
          fontFamily: "'DM Sans', sans-serif", color: '#1a1d27',
          outline: 'none', boxSizing: 'border-box',
        }}
        onFocus={e => e.target.style.borderColor = '#c45a2d'}
        onBlur={e => e.target.style.borderColor = '#e8e6e1'}
      />

      {/* Category pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {CATEGORY_PILLS.map(pill => (
          <button
            key={pill.value}
            type="button"
            onClick={() => onCategoryChange(pill.value)}
            style={{
              padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
              border: display.category === pill.value ? 'none' : '1px solid #d3d1c7',
              background: display.category === pill.value ? 'rgba(196,90,45,0.1)' : 'transparent',
              color: display.category === pill.value ? '#c45a2d' : '#888780',
            }}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Location autocomplete */}
      <div style={{ marginTop: 8 }}>
        <LocationAutocomplete
          value={display.location_name ?? ''}
          onSelect={onLocationChange}
          placeholder="Search location..."
          label=""
        />
      </div>

      {/* Done button */}
      <div style={{ marginTop: 8, textAlign: 'right' }}>
        <button
          type="button"
          onClick={onDone}
          style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
            color: '#c45a2d', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
