import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { onItemAddedToDestination } from '../../lib/triggerPrecisionUpgrade'
import type { SavedItem } from '../../types'

interface AddItemsSheetProps {
  destinationId: string
  destinationName: string
  linkedItemIds: Set<string>
  onClose: () => void
  onItemAdded: () => void
}

export default function AddItemsSheet({
  destinationId,
  destinationName,
  linkedItemIds,
  onClose,
  onItemAdded,
}: AddItemsSheetProps) {
  const { user } = useAuth()
  const [items, setItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<string | null>(null)

  // Fetch user's Horizon items
  useEffect(() => {
    if (!user) return
    const fetch = async () => {
      const { data } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(100)
      setItems((data ?? []) as SavedItem[])
      setLoading(false)
    }
    fetch()
  }, [user])

  // Filter: exclude already-linked items, apply search
  const filtered = items.filter(i => {
    if (linkedItemIds.has(i.id)) return false
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleAdd = useCallback(async (item: SavedItem) => {
    setAdding(item.id)
    try {
      // Get max sort_order
      const { data: maxRow } = await supabase
        .from('destination_items')
        .select('sort_order')
        .eq('destination_id', destinationId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      await supabase.from('destination_items').insert({
        destination_id: destinationId,
        item_id: item.id,
        day_index: null,
        sort_order: maxRow ? (maxRow.sort_order ?? 0) + 1 : 0,
      })

      // Fire auto-precision upgrade
      onItemAddedToDestination(item.id).catch(() => {})

      onItemAdded()
    } catch (err) {
      console.error('[add-items] Failed to add item:', err)
    } finally {
      setAdding(null)
    }
  }, [destinationId, onItemAdded])

  // ── Animation state ──
  const [phase, setPhase] = useState<'entering' | 'open' | 'exiting'>('entering')
  const [dragY, setDragY] = useState(0)
  const dragStartRef = useRef(0)
  const sheetElRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Small delay ensures browser paints initial translateY(100%) before transitioning
    const t = setTimeout(() => setPhase('open'), 30)
    return () => clearTimeout(t)
  }, [])

  const handleClose = useCallback(() => {
    setPhase('exiting')
    setTimeout(onClose, 250)
  }, [onClose])

  // ── Drag-to-dismiss on the handle ──
  const handleDragStart = useCallback((e: React.TouchEvent) => {
    dragStartRef.current = e.touches[0].clientY
    setDragY(0)
  }, [])

  const handleDragMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - dragStartRef.current
    if (delta > 0) setDragY(delta) // only allow downward drag
  }, [])

  const handleDragEnd = useCallback(() => {
    const sheetH = sheetElRef.current?.offsetHeight ?? 600
    if (dragY > sheetH * 0.3) {
      handleClose()
    } else {
      setDragY(0)
    }
  }, [dragY, handleClose])

  const translateY = phase === 'entering' ? '100%' : phase === 'exiting' ? '100%' : `${dragY}px`

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(0,0,0,0.4)',
          opacity: phase === 'entering' || phase === 'exiting' ? 0 : 1,
          transition: 'opacity 250ms ease',
        }}
        onClick={handleClose}
      />
      <div
        ref={sheetElRef}
        className="fixed inset-x-0 bottom-0 z-50"
        data-testid="add-items-sheet"
        style={{
          maxHeight: '85dvh',
          background: 'var(--color-bg-card)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          display: 'flex',
          flexDirection: 'column',
          transform: `translateY(${translateY})`,
          transition: dragY > 0 ? 'none' : 'transform 300ms cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle — draggable for dismiss */}
        <div
          className="flex justify-center pt-3 pb-1"
          style={{ touchAction: 'none', cursor: 'grab' }}
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border-input)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <div>
            <h3 style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 600,
              color: 'var(--text-primary)', margin: 0,
            }}>
              Add to {destinationName}
            </h3>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--text-tertiary)', margin: '2px 0 0',
            }}>
              from your Horizon
            </p>
          </div>
          <button type="button" onClick={handleClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-tertiary)', padding: 4,
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10,
            border: '1.5px solid var(--color-border-input)',
            background: 'var(--color-bg-page)',
          }}>
            <Search size={14} style={{ color: 'var(--color-text-ghost)', flexShrink: 0 }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search your saves..."
              data-testid="add-items-search"
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontFamily: "'DM Sans', sans-serif", fontSize: 14,
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Item list */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {loading ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              {search ? 'No matching saves' : 'All your saves are already added'}
            </div>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                type="button"
                data-testid={`add-item-${item.id}`}
                onClick={() => handleAdd(item)}
                disabled={adding === item.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '10px 16px', background: 'none', border: 'none',
                  borderBottom: '1px solid var(--color-border-light, #f0eeea)',
                  cursor: 'pointer', textAlign: 'left',
                  opacity: adding === item.id ? 0.5 : 1,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
                  flexShrink: 0, background: 'var(--color-bg-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.image_url ? (
                    <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 16, color: 'var(--color-text-ghost)' }}>✎</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
                    color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.title}
                  </div>
                  {item.location_name && (
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                      color: 'var(--text-tertiary)', marginTop: 1,
                    }}>
                      {item.location_name.split(',')[0]}
                    </div>
                  )}
                </div>
                <span style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
                  color: 'var(--color-accent)', flexShrink: 0,
                }}>
                  {adding === item.id ? '...' : '+ Add'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}
