import { useRef, useState, useCallback, type ReactNode } from 'react'

const DELETE_THRESHOLD = 80 // px to reveal full delete button
const SNAP_BACK_MS = 200

interface SwipeToDeleteProps {
  children: ReactNode
  onDelete: () => void
  enabled?: boolean
}

/**
 * iOS-style swipe-left to reveal a red Delete button.
 * Wraps any card/row component. On mobile, swiping left reveals a
 * red "Delete" strip behind the card; releasing past the threshold
 * triggers onDelete. Otherwise, the card snaps back.
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

    // Only allow swiping left (negative dx)
    const clampedDx = Math.min(0, dx)
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
      setOffset(-300) // slide out
      setTimeout(() => {
        onDelete()
        setOffset(0)
        setSwiping(false)
        animatingRef.current = false
      }, SNAP_BACK_MS)
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

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-2xl">
      {/* Red delete strip behind the card */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end bg-red-500 rounded-2xl"
        style={{ width: Math.max(0, -offset) + 20 }}
      >
        <span className="text-white text-sm font-semibold pr-5 whitespace-nowrap">Delete</span>
      </div>

      {/* Sliding card */}
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
