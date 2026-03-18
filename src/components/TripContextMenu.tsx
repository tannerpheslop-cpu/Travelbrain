import { useState, useEffect, useRef, useCallback } from 'react'

interface TripContextMenuProps {
  isPinned: boolean
  onPin: () => void
  onDelete: () => void
  children: React.ReactNode
}

/**
 * Wraps children with long-press (mobile, 500ms) and right-click (desktop)
 * context menu for trip cards. Shows "Pin to top" / "Unpin" and "Delete trip".
 */
export default function TripContextMenu({ isPinned, onPin, onDelete, children }: TripContextMenuProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on scroll
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('scroll', close, { passive: true })
    return () => window.removeEventListener('scroll', close)
  }, [menu])

  const clampToViewport = useCallback((x: number, y: number) => {
    const menuW = 180, menuH = 100
    const cx = Math.min(x, window.innerWidth - menuW - 8)
    const cy = Math.min(y, window.innerHeight - menuH - 8)
    return { x: Math.max(8, cx), y: Math.max(8, cy) }
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenu(clampToViewport(e.clientX, e.clientY))
  }, [clampToViewport])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    const x = touch.clientX, y = touch.clientY
    longPressTimer.current = setTimeout(() => {
      setMenu(clampToViewport(x, y))
    }, 500)
  }, [clampToViewport])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }, [])

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }, [])

  return (
    <>
      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        {children}
      </div>

      {menu && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          {/* Menu */}
          <div
            style={{
              position: 'fixed', left: menu.x, top: menu.y, zIndex: 50,
              background: '#ffffff', border: '1px solid #e8e6e1', borderRadius: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)', padding: '6px 0', minWidth: 180,
            }}
          >
            <button
              type="button"
              onClick={() => { setMenu(null); onPin() }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px',
                fontSize: 14, color: '#2a2a28', cursor: 'pointer', border: 'none',
                background: 'transparent', fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f3f0')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >{isPinned ? 'Unpin' : 'Pin to top'}</button>
            <button
              type="button"
              onClick={() => { setMenu(null); onDelete() }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px',
                fontSize: 14, color: '#c0392b', cursor: 'pointer', border: 'none',
                background: 'transparent', fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fdf0ef')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >Delete trip</button>
          </div>
        </>
      )}
    </>
  )
}
