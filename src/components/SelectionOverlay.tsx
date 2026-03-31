import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
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

const VALID_CATEGORIES: Category[] = [
  'restaurant', 'hotel', 'museum', 'temple', 'park', 'hike',
  'historical', 'shopping', 'nightlife', 'entertainment',
  'transport', 'spa', 'beach', 'other',
  // Legacy
  'activity', 'transit', 'general',
]

function normalizeCategory(cat: string): Category {
  if (VALID_CATEGORIES.includes(cat as Category)) return cat as Category
  return 'other'
}

const CATEGORY_PILLS: { value: Category; label: string }[] = [
  { value: 'restaurant', label: 'Food' },
  { value: 'hotel', label: 'Stay' },
  { value: 'museum', label: 'Museum' },
  { value: 'temple', label: 'Temple' },
  { value: 'park', label: 'Park' },
  { value: 'hike', label: 'Hike' },
  { value: 'historical', label: 'Historical' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'transport', label: 'Transport' },
  { value: 'spa', label: 'Spa' },
  { value: 'beach', label: 'Beach' },
  { value: 'other', label: 'Other' },
]

/** Auto-suggest a Route name from the items and source context. */
function suggestRouteName(
  items: Array<ExtractedItem & { likely_duplicate?: boolean }>,
  sourceTitle: string | null,
): string {
  // Collect cities and categories from selected items
  const cities = new Map<string, number>()
  const categories = new Map<string, number>()
  const countries = new Map<string, number>()

  for (const item of items) {
    if (item.location_name) {
      const parts = item.location_name.split(',').map(s => s.trim())
      if (parts.length >= 1) {
        const city = parts[0]
        cities.set(city, (cities.get(city) ?? 0) + 1)
      }
      if (parts.length >= 2) {
        const country = parts[parts.length - 1]
        countries.set(country, (countries.get(country) ?? 0) + 1)
      }
    }
    const cat = item.category
    if (cat && cat !== 'general') {
      categories.set(cat, (categories.get(cat) ?? 0) + 1)
    }
  }

  // All items share a city?
  if (cities.size === 1) {
    const city = [...cities.keys()][0]
    const topCat = [...categories.entries()].sort((a, b) => b[1] - a[1])[0]
    if (topCat && topCat[1] >= items.length * 0.5) {
      const catLabel = topCat[0] === 'restaurant' ? 'Restaurants'
        : topCat[0] === 'activity' ? 'Activities'
        : topCat[0] === 'hotel' ? 'Hotels'
        : ''
      if (catLabel) return `${city} ${catLabel}`
    }
    return `${city} Travel`
  }

  // Items span cities but share a country?
  if (countries.size === 1) {
    const country = [...countries.keys()][0]
    return `${country} Travel`
  }

  // Fallback: source article title
  if (sourceTitle) {
    return sourceTitle.length > 50 ? sourceTitle.slice(0, 47) + '...' : sourceTitle
  }

  return 'My Route'
}

const MAX_OVERLAY_ITEMS = 30

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
  const [saveMode, setSaveMode] = useState<'choose' | 'route-naming'>('choose')
  const [routeName, setRouteName] = useState('')
  const routeNameInputRef = useRef<HTMLInputElement>(null)

  // Cap at MAX_OVERLAY_ITEMS
  const cappedItems = useMemo(() => items.slice(0, MAX_OVERLAY_ITEMS), [items])

  // Selection state: pre-select all non-duplicates
  const [selected, setSelected] = useState<Set<number>>(() => {
    const s = new Set<number>()
    cappedItems.forEach((item, i) => {
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
    setSelected(new Set(cappedItems.map((_, i) => i)))
  }, [cappedItems])

  const deselectAll = useCallback(() => {
    setSelected(new Set())
  }, [])

  const toggleExpand = useCallback((index: number) => {
    setExpandedIndex(prev => prev === index ? null : index)
  }, [])

  const selectedCount = selected.size

  /** Build save rows from selected items. */
  const buildSaveRows = useCallback(() => {
    return cappedItems
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => selected.has(i))
      .map(({ item, i }) => {
        const display = getItemDisplay(item, i)
        const lat = display.location?.lat ?? item.latitude ?? null
        const lng = display.location?.lng ?? item.longitude ?? null
        const placeId = display.location?.place_id ?? item.place_id ?? null
        const hasPrecise = !!display.location || !!item.enriched

        return {
          user_id: userId,
          source_type: 'manual' as const,
          source_url: sourceUrl,
          title: display.name,
          category: display.category,
          location_name: display.location?.name ?? display.location_name ?? item.formatted_address ?? null,
          location_lat: lat,
          location_lng: lng,
          location_place_id: placeId,
          location_country: display.location?.country ?? null,
          location_country_code: display.location?.country_code ?? null,
          location_locked: !!display.location,
          location_precision: hasPrecise ? 'precise' as const : null,
          description: item.description,
          image_url: item.photo_url ?? null,
          image_display: item.photo_url ? 'thumbnail' as const : 'none' as const,
          has_pending_extraction: false,
          route_id: null as string | null,
        }
      })
  }, [cappedItems, selected, userId, sourceUrl, getItemDisplay])

  /** Derive source platform from URL. */
  const sourcePlatform = useMemo(() => {
    if (!sourceUrl) return null
    try {
      const h = new URL(sourceUrl).hostname.replace(/^www\./, '')
      if (h.includes('youtube') || h === 'youtu.be') return 'youtube'
      if (h.includes('instagram')) return 'instagram'
      if (h.includes('tiktok')) return 'tiktok'
      if (h.includes('pinterest')) return 'pinterest'
      if (h.includes('reddit')) return 'reddit'
      return 'web'
    } catch { return 'web' }
  }, [sourceUrl])

  /** Save as individual items (no Route). */
  const handleSaveIndividually = useCallback(async () => {
    if (selectedCount === 0 || saving) return
    setSaving(true)

    try {
      const rows = buildSaveRows()
      const { error } = await supabase.from('saved_items').insert(rows)
      if (error) {
        console.error('[SelectionOverlay] Insert failed:', error.message)
        setSaving(false)
        return
      }

      await supabase.from('pending_extractions').update({ status: 'reviewed' }).eq('id', extractionId)
      queryClient.invalidateQueries({ queryKey: ['saved-items'] })
      queryClient.invalidateQueries({ queryKey: ['pending-extraction-counts'] })

      toast(`Saved ${selectedCount} item${selectedCount !== 1 ? 's' : ''} to Horizon`)
      handleClose()
    } catch (err) {
      console.error('[SelectionOverlay] Save error:', (err as Error).message)
      setSaving(false)
    }
  }, [selectedCount, saving, buildSaveRows, extractionId, queryClient, toast, handleClose])

  /** Save as a Route. */
  const handleSaveAsRoute = useCallback(async () => {
    if (selectedCount === 0 || saving || !routeName.trim()) return
    setSaving(true)

    try {
      // 1. Create the Route
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .insert({
          user_id: userId,
          name: routeName.trim(),
          source_url: sourceUrl,
          source_title: sourceTitle,
          source_platform: sourcePlatform,
          item_count: selectedCount,
        })
        .select('id')
        .single()

      if (routeError || !route) {
        console.error('[SelectionOverlay] Route creation failed:', routeError?.message)
        setSaving(false)
        return
      }

      // 2. Create saved_items with route_id
      const rows = buildSaveRows().map(r => ({ ...r, route_id: route.id }))
      const { data: savedItems, error: itemsError } = await supabase
        .from('saved_items')
        .insert(rows)
        .select('id')

      if (itemsError || !savedItems) {
        console.error('[SelectionOverlay] Items insert failed:', itemsError?.message)
        setSaving(false)
        return
      }

      // 3. Create route_items junction entries
      const routeItems = savedItems.map((si: { id: string }, idx: number) => ({
        route_id: route.id,
        saved_item_id: si.id,
        route_order: idx + 1,
      }))
      await supabase.from('route_items').insert(routeItems)

      // 4. Mark extraction as reviewed
      await supabase.from('pending_extractions').update({ status: 'reviewed' }).eq('id', extractionId)

      queryClient.invalidateQueries({ queryKey: ['saved-items'] })
      queryClient.invalidateQueries({ queryKey: ['pending-extraction-counts'] })
      queryClient.invalidateQueries({ queryKey: ['routes'] })

      toast(`Saved Route with ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`)
      handleClose()
    } catch (err) {
      console.error('[SelectionOverlay] Route save error:', (err as Error).message)
      setSaving(false)
    }
  }, [selectedCount, saving, routeName, userId, sourceUrl, sourceTitle, sourcePlatform, buildSaveRows, extractionId, queryClient, toast, handleClose])

  /** Enter route naming mode. */
  const startRouteMode = useCallback(() => {
    const selectedItems = cappedItems.filter((_, i) => selected.has(i))
    setRouteName(suggestRouteName(selectedItems, sourceTitle))
    setSaveMode('route-naming')
    setTimeout(() => routeNameInputRef.current?.focus(), 100)
  }, [cappedItems, selected, sourceTitle])

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
            {selectedCount} of {cappedItems.length} selected
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
          {cappedItems.map((item, i) => {
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

                  {/* Thumbnail (from Places enrichment or placeholder) */}
                  {item.photo_url ? (
                    <img
                      src={item.photo_url}
                      alt=""
                      style={{
                        width: 36, height: 36, borderRadius: 6, objectFit: 'cover',
                        flexShrink: 0, background: '#f1efe8',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                      background: '#f1efe8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b4b2a9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </div>
                  )}

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
                    {item.description && !isExpanded && (
                      <p style={{
                        fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#b4b2a9',
                        margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', fontStyle: 'italic',
                      }}>
                        {item.description}
                      </p>
                    )}
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
          {saveMode === 'route-naming' ? (
            <>
              {/* Route name input */}
              <input
                ref={routeNameInputRef}
                type="text"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsRoute() }}
                placeholder="Route name"
                style={{
                  width: '100%', padding: '10px 14px', marginBottom: 10,
                  fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 500,
                  color: '#1a1d27', background: '#f1efe8',
                  border: '0.5px solid #e8e6e1', borderRadius: 8,
                  outline: 'none',
                }}
                data-testid="route-name-input"
              />
              <button
                type="button"
                data-testid="save-route-btn"
                onClick={handleSaveAsRoute}
                disabled={selectedCount === 0 || saving || !routeName.trim()}
                style={{
                  width: '100%', padding: '14px 0',
                  background: selectedCount > 0 && routeName.trim() ? '#c45a2d' : '#d3d1c7',
                  color: '#fff',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600,
                  border: 'none', borderRadius: 12,
                  cursor: selectedCount > 0 ? 'pointer' : 'default',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : `Save (${selectedCount} item${selectedCount !== 1 ? 's' : ''})`}
              </button>
              <button
                type="button"
                onClick={() => setSaveMode('choose')}
                style={{
                  display: 'block', width: '100%', marginTop: 8, padding: '8px 0',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888780',
                  textAlign: 'center',
                }}
              >
                Back
              </button>
            </>
          ) : (
            <>
              {/* Primary: Save as Route */}
              <button
                type="button"
                data-testid="save-as-route-btn"
                onClick={startRouteMode}
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
                {saving ? 'Saving...' : `Save as Route (${selectedCount} item${selectedCount !== 1 ? 's' : ''})`}
              </button>
              {/* Secondary: Save individually */}
              <button
                type="button"
                data-testid="save-individually-btn"
                onClick={handleSaveIndividually}
                disabled={selectedCount === 0 || saving}
                style={{
                  display: 'block', width: '100%', marginTop: 8, padding: '8px 0',
                  background: 'none', border: 'none',
                  cursor: selectedCount > 0 ? 'pointer' : 'default',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888780',
                  textAlign: 'center',
                }}
              >
                Save individually
              </button>
            </>
          )}
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
