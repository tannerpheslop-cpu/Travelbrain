import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useRouteItems, useAllUserTags } from '../hooks/queries'
import { useToast } from '../components/Toast'
import { ConfirmDeleteModal } from '../components/ui'
import { optimizedImageUrl } from '../lib/optimizedImage'
import { enrichRouteItems } from '../lib/enrichPhotoOnly'
import { ChevronLeft, ChevronRight, MoreHorizontal, MapPin, Check, Heart } from 'lucide-react'
import { getCategoryIcon as getCategoryIconFromLib, getCategoryLabel, LEGACY_CATEGORY_MAP } from '../lib/categories'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Route, SavedItem } from '../types'

// ── Category placeholder ─────────────────────────────────────────────────────

function CategoryPlaceholder({ category }: { category: string }) {
  const resolved = LEGACY_CATEGORY_MAP[category] ?? category
  const Icon = getCategoryIconFromLib(resolved) ?? MapPin
  return (
    <div style={{
      width: 56, height: 56, borderRadius: 8, flexShrink: 0,
      background: 'var(--bg-elevated-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={22} color="var(--text-secondary)" />
    </div>
  )
}

// ── Sortable item row ────────────────────────────────────────────────────────

function SortableItemRow({
  item,
  onRemove: _onRemove,
  enrichedPhoto,
  editMode,
  selected,
  onToggleSelect,
  isCreatorFave,
}: {
  item: SavedItem
  onRemove: () => void
  enrichedPhoto?: string | null
  editMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  isCreatorFave?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 0,
  }

  const thumbnail = enrichedPhoto ?? item.image_url ?? item.places_photo_url

  const categoryLabel = getCategoryLabel(LEGACY_CATEGORY_MAP[item.category] ?? item.category)
  const locationShort = item.location_name?.split(',')[0]

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, display: 'flex', alignItems: 'center', gap: 12, padding: 12, minHeight: 72, background: 'var(--bg-elevated-1)', borderRadius: 8, cursor: editMode ? 'pointer' : undefined }}
      {...attributes}
      onClick={editMode ? onToggleSelect : undefined}
    >
      {/* Drag handle (hidden in edit mode) / Checkbox (shown in edit mode) */}
      {editMode ? (
        <div
          style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: selected ? 'none' : '1.5px solid var(--border-strong, #38414a)',
            background: selected ? 'var(--accent-primary, #B8441E)' : 'transparent',
            transition: 'all 0.15s ease-out',
          }}
          data-testid={`edit-checkbox-${item.id}`}
        >
          {selected && <Check size={14} color="#e8eaed" strokeWidth={2.5} />}
        </div>
      ) : (
        <div
          {...listeners}
          style={{ cursor: 'grab', padding: '4px 2px', touchAction: 'none', color: 'var(--text-tertiary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>
      )}

      {/* Thumbnail */}
      {thumbnail ? (
        <img
          src={optimizedImageUrl(thumbnail, 'grid-thumbnail') ?? thumbnail}
          alt=""
          style={{
            width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0,
            background: 'var(--bg-elevated-1)',
            animation: enrichedPhoto ? 'fadeIn 300ms ease' : 'none',
          }}
        />
      ) : (
        <div style={{ width: 56, height: 56, flexShrink: 0 }}>
          <CategoryPlaceholder category={item.category} />
        </div>
      )}

      {/* Content — tappable to open item detail (disabled in edit mode) */}
      {editMode ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
            color: 'var(--text-primary)', margin: 0,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {item.title}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            {locationShort && (
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text-secondary)' }}>
                {locationShort}
              </span>
            )}
            {locationShort && (isCreatorFave || (item.category && item.category !== 'general')) && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>·</span>
            )}
            {isCreatorFave ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--bg-elevated-2)', padding: '1px 6px', borderRadius: 9999, lineHeight: 1 }}>
                <Heart size={9} fill="currentColor" /> Fave
              </span>
            ) : item.category && item.category !== 'general' ? (
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {categoryLabel}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <Link
          to={`/item/${item.id}`}
          style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}
        >
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
            color: 'var(--text-primary)', margin: 0,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {item.title}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            {locationShort && (
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text-secondary)' }}>
                {locationShort}
              </span>
            )}
            {locationShort && (isCreatorFave || (item.category && item.category !== 'general')) && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>·</span>
            )}
            {isCreatorFave ? (
              <span data-testid="creator-fave-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--bg-elevated-2)', padding: '1px 6px', borderRadius: 9999, lineHeight: 1 }}>
                <Heart size={9} fill="currentColor" /> Fave
              </span>
            ) : item.category && item.category !== 'general' ? (
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {categoryLabel}
              </span>
            ) : null}
          </div>
        </Link>
      )}

      {/* Chevron (hidden in edit mode) */}
      {!editMode && <ChevronRight size={14} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RouteDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [route, setRoute] = useState<Route | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showUnmergeConfirm, setShowUnmergeConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [enrichedPhotos, setEnrichedPhotos] = useState<Map<string, string | null>>(new Map())
  const enrichStarted = useRef(false)

  const { data: routeItemsData = [] } = useRouteItems(id ?? null)
  const routeItems = routeItemsData.map(ri => ri.saved_items)
  const [orderedIds, setOrderedIds] = useState<string[]>([])

  // Fetch item_tags to detect creator_fave items
  const { data: allUserTags = [] } = useAllUserTags(user?.id)
  const creatorFaveIds = useMemo(() => {
    const set = new Set<string>()
    for (const tag of allUserTags) {
      if (tag.tag_name === 'creator_fave') set.add(tag.item_id)
    }
    return set
  }, [allUserTags])

  // Sync ordered IDs when route items change
  useEffect(() => {
    if (routeItemsData.length > 0) {
      setOrderedIds(routeItemsData.map(ri => ri.saved_items.id))
    }
  }, [routeItemsData])

  // Fetch route data
  useEffect(() => {
    if (!id || !user) return
    supabase
      .from('routes')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setLoading(false)
          return
        }
        setRoute(data as Route)
        setNameDraft(data.name)
        setLoading(false)
        // Mark as viewed for Recently Added graduation
        if (!data.first_viewed_at) {
          void supabase.from('routes').update({ first_viewed_at: new Date().toISOString() }).eq('id', data.id)
        }
      })
  }, [id, user])

  // ── Lazy photo enrichment ──
  useEffect(() => {
    if (!user || routeItems.length === 0 || enrichStarted.current) return
    const unenriched = routeItems.filter(i => !i.image_url && !i.places_photo_url)
    if (unenriched.length === 0) return

    enrichStarted.current = true
    enrichRouteItems(
      unenriched.map(i => ({ id: i.id, title: i.title, location_name: i.location_name, image_url: i.image_url })),
      user.id,
      (itemId, photoUrl) => {
        setEnrichedPhotos(prev => new Map(prev).set(itemId, photoUrl))
      },
    ).then(count => {
      if (count > 0) console.log(`[route-detail] Enriched ${count} items with photos`)
    })
  }, [user, routeItems])

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !id) return

    const oldIndex = orderedIds.indexOf(active.id as string)
    const newIndex = orderedIds.indexOf(over.id as string)
    const newOrder = arrayMove(orderedIds, oldIndex, newIndex)
    setOrderedIds(newOrder)

    // Update route_order in database
    for (let i = 0; i < newOrder.length; i++) {
      await supabase
        .from('route_items')
        .update({ route_order: i + 1 })
        .eq('route_id', id)
        .eq('saved_item_id', newOrder[i])
    }
  }, [orderedIds, id])

  const handleRemoveItem = useCallback(async (itemId: string) => {
    if (!id || !route) return

    // Remove from route_items
    await supabase.from('route_items').delete().eq('route_id', id).eq('saved_item_id', itemId)
    // Clear route_id on the save
    await supabase.from('saved_items').update({ route_id: null }).eq('id', itemId)
    // Update item_count
    const newCount = (route.item_count ?? 1) - 1
    if (newCount <= 0) {
      // Delete the Route
      await supabase.from('routes').delete().eq('id', id)
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      queryClient.invalidateQueries({ queryKey: ['saved-items'] })
      toast('Route deleted — items saved to Horizon')
      navigate('/inbox')
      return
    }
    await supabase.from('routes').update({ item_count: newCount }).eq('id', id)
    setRoute({ ...route, item_count: newCount })
    setOrderedIds(prev => prev.filter(i => i !== itemId))
    queryClient.invalidateQueries({ queryKey: ['route-items', id] })
    queryClient.invalidateQueries({ queryKey: ['saved-items'] })
    toast('Removed from Route')
  }, [id, route, queryClient, toast, navigate])

  const handleUnmerge = useCallback(async () => {
    if (!id) return
    // Clear route_id on all saves
    await supabase.from('saved_items').update({ route_id: null }).match({ route_id: id })
    // Delete route_items
    await supabase.from('route_items').delete().eq('route_id', id)
    // Delete route
    await supabase.from('routes').delete().eq('id', id)

    queryClient.invalidateQueries({ queryKey: ['routes'] })
    queryClient.invalidateQueries({ queryKey: ['saved-items'] })
    toast(`Separated ${route?.item_count ?? 0} items into individual saves`)
    navigate('/inbox')
  }, [id, route, queryClient, toast, navigate])

  const handleDeleteGroup = useCallback(async () => {
    if (!id) return
    // Delete all saved_items in this Route
    const itemIds = routeItems.map(i => i.id)
    if (itemIds.length > 0) {
      await supabase.from('saved_items').delete().in('id', itemIds)
    }
    // Delete route_items + route (cascade handles route_items)
    await supabase.from('routes').delete().eq('id', id)

    queryClient.invalidateQueries({ queryKey: ['routes'] })
    queryClient.invalidateQueries({ queryKey: ['saved-items'] })
    queryClient.invalidateQueries({ queryKey: ['all-saved-items'] })
    toast(`Deleted group and ${itemIds.length} items`)
    navigate('/inbox')
  }, [id, routeItems, queryClient, toast, navigate])

  const handleSaveName = useCallback(async () => {
    if (!id || !route || !nameDraft.trim()) return
    setEditingName(false)
    if (nameDraft.trim() === route.name) return
    await supabase.from('routes').update({ name: nameDraft.trim() }).eq('id', id)
    setRoute({ ...route, name: nameDraft.trim() })
    queryClient.invalidateQueries({ queryKey: ['routes'] })
  }, [id, route, nameDraft, queryClient])

  // ── Edit mode helpers ──

  const exitEditMode = useCallback(() => {
    setEditMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelect = useCallback((itemId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [])

  /** Remove selected items from Route (keep as standalone saves) */
  const handleBulkRemove = useCallback(async () => {
    if (!id || !route || selectedIds.size === 0) return
    const ids = [...selectedIds]
    // Remove from route_items
    for (const itemId of ids) {
      await supabase.from('route_items').delete().eq('route_id', id).eq('saved_item_id', itemId)
      await supabase.from('saved_items').update({ route_id: null }).eq('id', itemId)
    }
    const newCount = (route.item_count ?? routeItems.length) - ids.length
    if (newCount <= 0) {
      await supabase.from('routes').delete().eq('id', id)
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      queryClient.invalidateQueries({ queryKey: ['saved-items'] })
      toast('Route deleted — items saved to Horizon')
      navigate('/inbox')
      return
    }
    await supabase.from('routes').update({ item_count: newCount }).eq('id', id)
    setRoute({ ...route, item_count: newCount })
    setOrderedIds(prev => prev.filter(i => !selectedIds.has(i)))
    queryClient.invalidateQueries({ queryKey: ['route-items', id] })
    queryClient.invalidateQueries({ queryKey: ['saved-items'] })
    toast(`Removed ${ids.length} item${ids.length > 1 ? 's' : ''} from group`)
    exitEditMode()
  }, [id, route, selectedIds, routeItems.length, queryClient, toast, navigate, exitEditMode])

  /** Permanently delete selected items */
  const handleBulkDelete = useCallback(async () => {
    if (!id || !route || selectedIds.size === 0) return
    const ids = [...selectedIds]
    // Delete saved_items
    await supabase.from('saved_items').delete().in('id', ids)
    // Remove from route_items
    await supabase.from('route_items').delete().eq('route_id', id).in('saved_item_id', ids)
    const newCount = (route.item_count ?? routeItems.length) - ids.length
    if (newCount <= 0) {
      await supabase.from('routes').delete().eq('id', id)
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      queryClient.invalidateQueries({ queryKey: ['saved-items'] })
      queryClient.invalidateQueries({ queryKey: ['all-saved-items'] })
      toast(`Deleted ${ids.length} item${ids.length > 1 ? 's' : ''}`)
      navigate('/inbox')
      return
    }
    await supabase.from('routes').update({ item_count: newCount }).eq('id', id)
    setRoute({ ...route, item_count: newCount })
    setOrderedIds(prev => prev.filter(i => !selectedIds.has(i)))
    queryClient.invalidateQueries({ queryKey: ['route-items', id] })
    queryClient.invalidateQueries({ queryKey: ['saved-items'] })
    queryClient.invalidateQueries({ queryKey: ['all-saved-items'] })
    toast(`Deleted ${ids.length} item${ids.length > 1 ? 's' : ''}`)
    exitEditMode()
  }, [id, route, selectedIds, routeItems.length, queryClient, toast, navigate, exitEditMode])

  // Sort items by orderedIds
  const sortedItems = orderedIds
    .map(itemId => routeItems.find(i => i.id === itemId))
    .filter(Boolean) as SavedItem[]

  // Group items by section (from route_items metadata)
  const sectionGroups = useMemo(() => {
    const groups: Array<{ label: string; order: number; items: SavedItem[] }> = []
    const sectionMap = new Map<string, { label: string; order: number; items: SavedItem[] }>()

    for (const ri of routeItemsData) {
      const label = ri.section_label ?? 'Places'
      const order = ri.section_order ?? 0
      if (!sectionMap.has(label)) {
        const group = { label, order, items: [] as SavedItem[] }
        sectionMap.set(label, group)
        groups.push(group)
      }
      sectionMap.get(label)!.items.push(ri.saved_items)
    }

    // Sort groups by section_order
    groups.sort((a, b) => a.order - b.order)
    return groups
  }, [routeItemsData])

  const hasSections = sectionGroups.length > 1 || (sectionGroups.length === 1 && sectionGroups[0].label !== 'Places')

  if (loading) {
    return (
      <div data-testid="route-detail-page" style={{ background: 'var(--bg-base)', minHeight: '100vh', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="animate-pulse" style={{ padding: '16px 16px 100px' }}>
          <div style={{ height: 20, width: 56, background: 'var(--bg-elevated-1)', borderRadius: 8, marginBottom: 24 }} />
          <div style={{ height: 60, background: 'var(--bg-elevated-1)', borderRadius: 8, marginBottom: 16 }} />
          <div style={{ height: 24, background: 'var(--bg-elevated-1)', borderRadius: 8, width: '60%', marginBottom: 8 }} />
          <div style={{ height: 14, background: 'var(--bg-elevated-1)', borderRadius: 8, width: '30%' }} />
        </div>
      </div>
    )
  }

  if (!route) {
    return (
      <div data-testid="route-detail-page" style={{ background: 'var(--bg-base)', minHeight: '100vh', padding: 40, textAlign: 'center', paddingTop: 'calc(2rem + env(safe-area-inset-top))' }}>
        <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 500, color: 'var(--text-primary)' }}>
          Route not found
        </h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>
          This route may have been deleted.
        </p>
        <button
          type="button"
          onClick={() => navigate('/inbox')}
          style={{
            marginTop: 16, padding: '12px 20px',
            background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8,
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Back to Horizon
        </button>
      </div>
    )
  }

  return (
    <div data-testid="route-detail-page" style={{ background: 'var(--bg-base)', minHeight: '100vh', padding: '0 16px', paddingTop: 'calc(1rem + env(safe-area-inset-top))', paddingBottom: 100, maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => navigate('/inbox')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}
        >
          <ChevronLeft size={18} /> Horizon
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {editMode && selectedIds.size > 0 && (
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              color: 'var(--text-secondary)',
            }}
            data-testid="edit-selection-count"
            >
              {selectedIds.size} selected
            </span>
          )}
          <button
            type="button"
            onClick={() => editMode ? exitEditMode() : setEditMode(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
              color: editMode ? 'var(--accent-primary, #B8441E)' : 'var(--text-tertiary)',
            }}
            data-testid="edit-mode-toggle"
          >
            {editMode ? 'Done' : <MoreHorizontal size={20} />}
          </button>
        </div>
      </div>

      {/* Source preview card at top */}
      {route.source_url && (
        <a
          href={route.source_url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="route-source-card"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: 10, marginBottom: 16,
            background: 'var(--bg-elevated-1)', borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          {route.source_thumbnail && (
            <img
              src={optimizedImageUrl(route.source_thumbnail, 'grid-thumbnail') ?? route.source_thumbnail}
              alt=""
              style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500,
              color: 'var(--text-primary)', margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {route.source_title ?? 'Source article'}
            </p>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: 'var(--text-tertiary)', margin: '2px 0 0',
            }}>
              {(() => { try { return new URL(route.source_url!).hostname.replace(/^www\./, '') } catch { return route.source_platform ?? 'web' } })()}
            </p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 12, height: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
            <path d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" />
          </svg>
        </a>
      )}

      {/* Route name (editable) */}
      {editingName ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={e => setNameDraft(e.target.value)}
          onBlur={handleSaveName}
          onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
          style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 500, color: 'var(--text-primary)',
            background: 'transparent', border: 'none', borderBottom: '2px solid var(--accent-primary)',
            outline: 'none', width: '100%', paddingBottom: 2, marginBottom: 4,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingName(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
            fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 500, color: 'var(--text-primary)',
            marginBottom: 4,
          }}
        >
          {route.name}
        </button>
      )}

      {/* Metadata */}
      <p style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-tertiary)',
        marginBottom: 16,
      }}>
        {route.item_count} place{route.item_count !== 1 ? 's' : ''}
        {route.location_scope ? ` · ${route.location_scope}` : ''}
      </p>

      {/* Item list (with section headers if available) */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          {hasSections ? (
            /* Grouped by section */
            sectionGroups.map(group => (
              <div key={group.label}>
                <div data-testid="section-header" style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--text-secondary)', paddingBottom: 6, marginTop: 16, marginBottom: 8,
                  borderBottom: '0.5px solid rgba(118, 130, 142, 0.1)',
                }}>
                  {group.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.items.map(item => (
                    <SortableItemRow
                      key={item.id}
                      item={item}
                      onRemove={() => handleRemoveItem(item.id)}
                      enrichedPhoto={enrichedPhotos.get(item.id)}
                      editMode={editMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                      isCreatorFave={creatorFaveIds.has(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            /* Flat list */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedItems.map(item => (
                <SortableItemRow
                  key={item.id}
                  item={item}
                  onRemove={() => handleRemoveItem(item.id)}
                  enrichedPhoto={enrichedPhotos.get(item.id)}
                  editMode={editMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  isCreatorFave={creatorFaveIds.has(item.id)}
                />
              ))}
            </div>
          )}
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {sortedItems.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No items in this Route</p>
        </div>
      )}

      {/* Edit mode action bar */}
      {editMode && (
        <div
          style={{
            position: 'fixed',
            bottom: 64,
            left: 0,
            right: 0,
            zIndex: 30,
            background: 'var(--bg-elevated-1, #1c2126)',
            borderTop: '1px solid var(--border-subtle, #242a30)',
            padding: '12px 16px',
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
          }}
          data-testid="edit-action-bar"
        >
          {/* Remove from group */}
          <button
            type="button"
            onClick={handleBulkRemove}
            disabled={selectedIds.size === 0}
            style={{
              background: selectedIds.size > 0 ? 'var(--bg-elevated-2, #21262c)' : 'var(--disabled-bg, #1b1f24)',
              color: selectedIds.size > 0 ? 'var(--text-secondary, #b9c0c7)' : 'var(--disabled-text, #626a74)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 9999,
              padding: '8px 16px',
              border: 'none',
              cursor: selectedIds.size > 0 ? 'pointer' : 'default',
            }}
            data-testid="edit-remove-btn"
          >
            Remove
          </button>

          {/* Delete selected */}
          <button
            type="button"
            onClick={() => { if (selectedIds.size > 0) setShowDeleteConfirm(true) }}
            disabled={selectedIds.size === 0}
            style={{
              background: selectedIds.size > 0 ? 'var(--color-error, #c44a3d)' : 'var(--disabled-bg, #1b1f24)',
              color: selectedIds.size > 0 ? '#e8eaed' : 'var(--disabled-text, #626a74)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 9999,
              padding: '8px 16px',
              border: 'none',
              cursor: selectedIds.size > 0 ? 'pointer' : 'default',
            }}
            data-testid="edit-delete-btn"
          >
            Delete
          </button>

          {/* Break apart */}
          <button
            type="button"
            onClick={() => setShowUnmergeConfirm(true)}
            style={{
              background: 'transparent',
              color: 'var(--text-tertiary, #8d96a0)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 9999,
              padding: '8px 16px',
              border: '1px solid var(--border-default, #2c333a)',
              cursor: 'pointer',
            }}
            data-testid="edit-breakapart-btn"
          >
            Break apart
          </button>
        </div>
      )}

      {/* Break apart confirmation */}
      {showUnmergeConfirm && (
        <ConfirmDeleteModal
          title="Break apart?"
          description={`This will separate all ${route?.item_count ?? sortedItems.length} places into individual saves on your Horizon. Nothing will be deleted.`}
          confirmLabel="Break apart"
          onCancel={() => setShowUnmergeConfirm(false)}
          loading={false}
          onConfirm={handleUnmerge}
        />
      )}

      {/* Delete confirmation (bulk or group) */}
      {showDeleteConfirm && (
        <ConfirmDeleteModal
          title={editMode && selectedIds.size > 0
            ? `Delete ${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''}?`
            : 'Delete group?'
          }
          description={editMode && selectedIds.size > 0
            ? 'This cannot be undone.'
            : `This will permanently delete this group and all ${route?.item_count ?? sortedItems.length} items inside it. This cannot be undone.`
          }
          onCancel={() => setShowDeleteConfirm(false)}
          loading={false}
          onConfirm={editMode && selectedIds.size > 0 ? handleBulkDelete : handleDeleteGroup}
        />
      )}
    </div>
  )
}
