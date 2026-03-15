import { useRef, useState, useCallback, type ReactNode } from 'react'

const DELETE_BUTTON_WIDTH = 72 // px — width of the delete button
const DELETE_THRESHOLD = 50   // px swiped to trigger delete on release
const MAX_SWIPE = 80          // px — max the card can slide left
const SNAP_BACK_MS = 200

interface SwipeToDeleteProps {
  children: ReactNode
  onDelete: () => void
  enabled?: boolean
}

/**
 * iOS-style swipe-left to reveal a compact red Delete button.
 * The card slides left on rails (capped at MAX_SWIPE px) to reveal
 * a small delete button. Releasing past the threshold triggers onDelete.
 */
export default function SwipeToDelete({ children, onDelete, enabled = true }: SwipeToDeleteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const currentXRef = useRef(0)
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const lockedRef = useRef<'horizontal' | 'vertical' | null>(null)
  const animatingRef = useRef(false)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || animatingRef.current) return
    const touch = e.touches[0]
    startXRef.current = touch.clientX
    startYRef.current = touch.clientY
    currentXRef.current = touch.clientX
    lockedRef.current = null
  }, [enabled])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || animatingRef.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - startXRef.current
    const dy = touch.clientY - startYRef.current

    // Determine swipe direction lock on first significant movement
    if (!lockedRef.current) {
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      if (absDx < 5 && absDy < 5) return // ignore tiny moves
      lockedRef.current = absDx > absDy ? 'horizontal' : 'vertical'
    }

    if (lockedRef.current === 'vertical') return

    // Only allow swiping left, capped at MAX_SWIPE
    const clampedDx = Math.max(-MAX_SWIPE, Math.min(0, dx))
    currentXRef.current = touch.clientX
    setOffset(clampedDx)
    if (clampedDx < -5) setSwiping(true)
  }, [enabled])

  const handleTouchEnd = useCallback(() => {
    if (!enabled || lockedRef.current === 'vertical') {
      lockedRef.current = null
      return
    }

    if (offset < -DELETE_THRESHOLD) {
      // Swipe past threshold — trigger delete
      animatingRef.current = true
      setOffset(0)
      setSwiping(false)
      onDelete()
      setTimeout(() => { animatingRef.current = false }, SNAP_BACK_MS)
    } else {
      // Snap back
      animatingRef.current = true
      setOffset(0)
      setSwiping(false)
      setTimeout(() => { animatingRef.current = false }, SNAP_BACK_MS)
    }
    lockedRef.current = null
  }, [enabled, offset, onDelete])

  if (!enabled) return <>{children}</>

  const absOffset = Math.abs(offset)

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-xl">
      {/* Red delete button behind the card — only visible when swiping */}
      {absOffset > 0 && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500"
          style={{ width: DELETE_BUTTON_WIDTH }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {/* Sliding card — stays on rails */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping ? 'none' : `transform ${SNAP_BACK_MS}ms ease-out`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
