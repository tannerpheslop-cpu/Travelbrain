import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useRouteItems } from '../hooks/queries'
import { useToast } from '../components/Toast'
import { ConfirmDeleteModal } from '../components/ui'
import { optimizedImageUrl } from '../lib/optimizedImage'
import { ChevronLeft, MoreHorizontal, Trash2, Unlink } from 'lucide-react'
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

// ── Sortable item row ────────────────────────────────────────────────────────

function SortableItemRow({
  item,
  onRemove,
}: {
  item: SavedItem
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 0,
  }

  const thumbnail = item.image_url ?? item.places_photo_url

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '0.5px solid #f1efe8' }}
      {...attributes}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        style={{ cursor: 'grab', padding: '4px 2px', touchAction: 'none', color: '#b4b2a9' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
        </svg>
      </div>

      {/* Thumbnail */}
      {thumbnail ? (
        <img
          src={optimizedImageUrl(thumbnail, 'grid-thumbnail') ?? thumbnail}
          alt=""
          style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: 6, flexShrink: 0,
          background: '#f1efe8', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b4b2a9" strokeWidth="1.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
      )}

      {/* Content — tappable to open item detail */}
      <Link
        to={`/item/${item.id}`}
        style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}
      >
        <p style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
          color: '#1a1d27', margin: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title}
        </p>
        <p style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#888780',
          margin: '2px 0 0',
        }}>
          {item.category}{item.location_name ? ` · ${item.location_name.split(',')[0]}` : ''}
        </p>
      </Link>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        style={{
          flexShrink: 0, padding: 6, background: 'none', border: 'none',
          cursor: 'pointer', color: '#b4b2a9',
        }}
        aria-label="Remove from Route"
      >
        <Trash2 size={16} />
      </button>
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
  const [showMenu, setShowMenu] = useState(false)
  const [showUnmergeConfirm, setShowUnmergeConfirm] = useState(false)

  const { data: routeItemsData = [] } = useRouteItems(id ?? null)
  const routeItems = routeItemsData.map(ri => ri.saved_items)
  const [orderedIds, setOrderedIds] = useState<string[]>([])

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
      })
  }, [id, user])

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

  const handleSaveName = useCallback(async () => {
    if (!id || !route || !nameDraft.trim()) return
    setEditingName(false)
    if (nameDraft.trim() === route.name) return
    await supabase.from('routes').update({ name: nameDraft.trim() }).eq('id', id)
    setRoute({ ...route, name: nameDraft.trim() })
    queryClient.invalidateQueries({ queryKey: ['routes'] })
  }, [id, route, nameDraft, queryClient])

  // Sort items by orderedIds
  const sortedItems = orderedIds
    .map(itemId => routeItems.find(i => i.id === itemId))
    .filter(Boolean) as SavedItem[]

  if (loading) {
    return <div style={{ padding: 20, color: '#888780' }}>Loading...</div>
  }

  if (!route) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 20, fontWeight: 600, color: '#1a1d27' }}>
          Route not found
        </h2>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#888780', marginTop: 8 }}>
          This route may have been deleted.
        </p>
        <button
          type="button"
          onClick={() => navigate('/inbox')}
          style={{
            marginTop: 16, padding: '10px 20px',
            background: '#c45a2d', color: '#fff', border: 'none', borderRadius: 8,
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Back to Horizon
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 20px', paddingTop: 'calc(1rem + env(safe-area-inset-top))', paddingBottom: 100, maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => navigate('/inbox')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#888780', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}
        >
          <ChevronLeft size={18} /> Horizon
        </button>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888780', padding: 4 }}
          >
            <MoreHorizontal size={20} />
          </button>
          {showMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowMenu(false)} />
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
                background: '#fff', border: '0.5px solid #e8e6e1', borderRadius: 10,
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)', padding: '4px 0', minWidth: 180,
              }}>
                <button
                  type="button"
                  onClick={() => { setShowMenu(false); setShowUnmergeConfirm(true) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#c0392b', textAlign: 'left',
                  }}
                >
                  <Unlink size={15} /> Unmerge Route
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Route name (editable) */}
      {editingName ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={e => setNameDraft(e.target.value)}
          onBlur={handleSaveName}
          onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
          style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 600, color: '#1a1d27',
            background: 'transparent', border: 'none', borderBottom: '2px solid #c45a2d',
            outline: 'none', width: '100%', paddingBottom: 2, marginBottom: 4,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingName(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
            fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 600, color: '#1a1d27',
            marginBottom: 4,
          }}
        >
          {route.name}
        </button>
      )}

      {/* Metadata */}
      <p style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#888780',
        marginBottom: 16,
      }}>
        {route.item_count} place{route.item_count !== 1 ? 's' : ''}
        {route.location_scope ? ` · ${route.location_scope}` : ''}
      </p>

      {/* Source preview card */}
      {route.source_url && (
        <a
          href={route.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', marginBottom: 20,
            background: '#f5f3ef', borderRadius: 10,
            textDecoration: 'none', border: '0.5px solid #e8e6e1',
          }}
        >
          {route.source_thumbnail && (
            <img
              src={optimizedImageUrl(route.source_thumbnail, 'grid-thumbnail') ?? route.source_thumbnail}
              alt=""
              style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
              color: '#1a1d27', margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {route.source_title ?? 'Source article'}
            </p>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888780', margin: '2px 0 0',
            }}>
              {(() => { try { return new URL(route.source_url!).hostname.replace(/^www\./, '') } catch { return route.source_platform ?? 'web' } })()}
            </p>
          </div>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#c45a2d', flexShrink: 0 }}>Open</span>
        </a>
      )}

      {/* Item list (sortable) */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          {sortedItems.map(item => (
            <SortableItemRow
              key={item.id}
              item={item}
              onRemove={() => handleRemoveItem(item.id)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {sortedItems.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#888780' }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>No items in this Route</p>
        </div>
      )}

      {/* Unmerge confirmation */}
      {showUnmergeConfirm && (
        <ConfirmDeleteModal
          title="Unmerge Route?"
          description={`This will separate all ${route.item_count} items into individual saves on your Horizon.`}
          onCancel={() => setShowUnmergeConfirm(false)}
          loading={false}
          onConfirm={handleUnmerge}
        />
      )}
    </div>
  )
}
