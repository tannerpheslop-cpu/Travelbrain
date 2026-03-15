import { useRef, useState, useCallback, type ReactNode } from 'react'

const DELETE_BUTTON_WIDTH = 72 // px — width of the delete button
const REVEAL_THRESHOLD = 30   // px swiped to snap open on release
const MAX_SWIPE = 80          // px — max the card can slide left
const SNAP_BACK_MS = 200

interface SwipeToDeleteProps {
  children: ReactNode
  onDelete: () => void
  enabled?: boolean
}

/**
 * iOS-style swipe-left to reveal a red Delete button.
 * Two-step delete: swipe to reveal, then tap the button to confirm.
 * Tapping elsewhere or swiping back closes the button.
 */
export default function SwipeToDelete({ children, onDelete, enabled = true }: SwipeToDeleteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const currentXRef = useRef(0)
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const lockedRef = useRef<'horizontal' | 'vertical' | null>(null)
  const animatingRef = useRef(false)

  const snapClose = useCallback(() => {
    animatingRef.current = true
    setOffset(0)
    setSwiping(false)
    setRevealed(false)
    setTimeout(() => { animatingRef.current = false }, SNAP_BACK_MS)
  }, [])

  const snapOpen = useCallback(() => {
    animatingRef.current = true
    setOffset(-DELETE_BUTTON_WIDTH)
    setSwiping(false)
    setRevealed(true)
    setTimeout(() => { animatingRef.current = false }, SNAP_BACK_MS)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || animatingRef.current) return
    const touch = e.touches[0]
    startXRef.current = touch.clientX
    startYRef.current = touch.clientY
    currentXRef.current = touch.clientX
    lockedRef.current = null

    // If already revealed and user taps the card area, close it
    if (revealed) {
      // We'll handle this in touchEnd based on movement
    }
  }, [enabled, revealed])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || animatingRef.current) return
    const touch = e.touches[0]

    // Calculate dx from the visual starting point
    const baseOffset = revealed ? -DELETE_BUTTON_WIDTH : 0
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

    // Clamp the total offset between -MAX_SWIPE and 0
    const newOffset = Math.max(-MAX_SWIPE, Math.min(0, baseOffset + dx))
    currentXRef.current = touch.clientX
    setOffset(newOffset)
    if (Math.abs(newOffset) > 5) setSwiping(true)
  }, [enabled, revealed])

  const handleTouchEnd = useCallback(() => {
    if (!enabled || lockedRef.current === 'vertical') {
      lockedRef.current = null
      return
    }

    const dx = currentXRef.current - startXRef.current
    const absDx = Math.abs(dx)

    // If no significant movement, treat as a tap
    if (absDx < 5) {
      if (revealed) {
        // Tap on the card while revealed → close
        snapClose()
      }
      lockedRef.current = null
      setSwiping(false)
      return
    }

    if (revealed) {
      // Already open — swiping right closes, swiping further left stays open
      if (dx > 20) {
        snapClose()
      } else {
        snapOpen()
      }
    } else {
      // Was closed — snap open if past threshold, otherwise snap back
      if (offset < -REVEAL_THRESHOLD) {
        snapOpen()
      } else {
        snapClose()
      }
    }

    lockedRef.current = null
  }, [enabled, offset, revealed, snapClose, snapOpen])

  const handleDeleteClick = useCallback(() => {
    snapClose()
    onDelete()
  }, [onDelete, snapClose])

  if (!enabled) return <>{children}</>

  const showButton = offset !== 0 || revealed

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-xl">
      {/* Red delete button behind the card */}
      {showButton && (
        <button
          type="button"
          onClick={handleDeleteClick}
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 active:bg-red-600 transition-colors"
          style={{ width: DELETE_BUTTON_WIDTH }}
          aria-label="Delete"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
          </svg>
        </button>
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
