import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type SnapLabel = 'peek' | 'half' | 'full'

export interface DraggableSheetProps {
  /** [peek, half, full] as viewport fractions, e.g. [0.15, 0.5, 0.85] */
  snapPoints: [number, number, number]
  /** Which snap point to open at. Default: 'half' */
  initialSnap?: SnapLabel
  /** Fires when the sheet settles on a new snap point */
  onSnapChange?: (snap: SnapLabel) => void
  /** Fixed header (does not scroll) */
  header: ReactNode
  /** Scrollable content area */
  children: ReactNode
}

// ── Constants ────────────────────────────────────────────────────────────────

const SNAP_LABELS: SnapLabel[] = ['peek', 'half', 'full']
/** Velocity threshold (px/ms) for fast-swipe detection */
const SWIPE_VELOCITY = 0.5
/** Spring animation duration */
const SPRING_MS = 300
const SPRING_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)'

// ── Helpers ──────────────────────────────────────────────────────────────────

function snapFractionToHeight(fraction: number): number {
  return Math.round(window.innerHeight * fraction)
}

function nearestSnap(
  currentH: number,
  points: [number, number, number],
): { index: number; label: SnapLabel } {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < 3; i++) {
    const h = snapFractionToHeight(points[i])
    const d = Math.abs(currentH - h)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return { index: best, label: SNAP_LABELS[best] }
}

function labelIndex(label: SnapLabel): number {
  return SNAP_LABELS.indexOf(label)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DraggableSheet({
  snapPoints,
  initialSnap = 'half',
  onSnapChange,
  header,
  children,
}: DraggableSheetProps) {
  const [currentSnap, setCurrentSnap] = useState<SnapLabel>(initialSnap)
  const [height, setHeight] = useState(() => snapFractionToHeight(snapPoints[labelIndex(initialSnap)]))
  const [animating, setAnimating] = useState(false)

  const sheetRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartH = useRef(0)
  const dragTimestamps = useRef<Array<{ y: number; t: number }>>([])
  const isDraggingSheet = useRef(false)

  const onSnapChangeRef = useRef(onSnapChange)
  onSnapChangeRef.current = onSnapChange

  // Update height when window resizes
  useEffect(() => {
    const handler = () => {
      setHeight(snapFractionToHeight(snapPoints[labelIndex(currentSnap)]))
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [currentSnap, snapPoints])

  // ── iOS Safari body scroll lock ──
  // position: fixed on body is the only reliable way to prevent iOS from
  // chaining scroll events from inner containers to the page body.
  useEffect(() => {
    const scrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  // Attach non-passive touchmove listeners on drag handle AND header to ensure
  // preventDefault works. React synthetic events may be passive.
  const handleRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const lastTouchYRef = useRef(0)

  useEffect(() => {
    const nativeTouchMove = (e: TouchEvent) => {
      if (isDraggingSheet.current) e.preventDefault()
    }
    const handle = handleRef.current
    const header = headerRef.current
    if (handle) handle.addEventListener('touchmove', nativeTouchMove, { passive: false })
    if (header) header.addEventListener('touchmove', nativeTouchMove, { passive: false })
    return () => {
      if (handle) handle.removeEventListener('touchmove', nativeTouchMove)
      if (header) header.removeEventListener('touchmove', nativeTouchMove)
    }
  }, [])

  // ── Prevent scroll chaining at content boundaries (iOS Safari) ──
  // When content hits top/bottom scroll boundary, prevent the touch from
  // propagating to the body (which iOS would interpret as page scroll).
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const onTouchStart = (e: TouchEvent) => {
      lastTouchYRef.current = e.touches[0].clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      if (isDraggingSheet.current) return // Sheet is being dragged, not scrolled
      const { scrollTop, scrollHeight, clientHeight } = content
      const touchY = e.touches[0].clientY
      const isScrollingUp = touchY > lastTouchYRef.current   // finger moves down = scroll up
      const isScrollingDown = touchY < lastTouchYRef.current  // finger moves up = scroll down
      const isAtTop = scrollTop <= 0
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1

      if (isAtTop && isScrollingUp) e.preventDefault()
      if (isAtBottom && isScrollingDown) e.preventDefault()

      lastTouchYRef.current = touchY
    }

    content.addEventListener('touchstart', onTouchStart, { passive: true })
    content.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      content.removeEventListener('touchstart', onTouchStart)
      content.removeEventListener('touchmove', onTouchMove)
    }
  }, [])

  // ── Snap to a specific point with animation ──
  const snapTo = useCallback(
    (label: SnapLabel) => {
      const targetH = snapFractionToHeight(snapPoints[labelIndex(label)])
      setAnimating(true)
      setHeight(targetH)
      setCurrentSnap(label)

      if (label !== currentSnap) {
        onSnapChangeRef.current?.(label)
      }

      setTimeout(() => setAnimating(false), SPRING_MS)
    },
    [snapPoints, currentSnap],
  )

  // ── Compute velocity from recent touch positions ──
  const getVelocity = useCallback((): number => {
    const pts = dragTimestamps.current
    if (pts.length < 2) return 0
    const last = pts[pts.length - 1]
    // Look back ~80ms for a stable velocity reading
    let ref = pts[0]
    for (let i = pts.length - 2; i >= 0; i--) {
      if (last.t - pts[i].t >= 60) {
        ref = pts[i]
        break
      }
    }
    const dt = last.t - ref.t
    if (dt === 0) return 0
    return (ref.y - last.y) / dt // positive = dragging up (expanding)
  }, [])

  // ── Handle drag end → decide snap target ──
  const finishDrag = useCallback(() => {
    dragging.current = false
    isDraggingSheet.current = false
    dragTimestamps.current = []

    const velocity = getVelocity()
    const idx = labelIndex(currentSnap)

    // Fast swipe: jump one step in swipe direction
    if (Math.abs(velocity) > SWIPE_VELOCITY) {
      if (velocity > 0 && idx < 2) {
        snapTo(SNAP_LABELS[idx + 1])
        return
      }
      if (velocity < 0 && idx > 0) {
        snapTo(SNAP_LABELS[idx - 1])
        return
      }
    }

    // Slow drag: snap to nearest
    const { label } = nearestSnap(height, snapPoints)
    snapTo(label)
  }, [currentSnap, height, snapPoints, snapTo, getVelocity])

  // ── Touch event handlers ──
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (animating) return
      const touch = e.touches[0]
      dragging.current = true
      dragStartY.current = touch.clientY
      dragStartH.current = height
      dragTimestamps.current = [{ y: touch.clientY, t: Date.now() }]

      // Determine if we should drag the sheet or let content scroll:
      // If the touch started on the drag handle or header area, always drag the sheet.
      const target = e.target as HTMLElement
      if (target.closest('[data-drag-handle]') || target.closest('[data-sheet-header]')) {
        isDraggingSheet.current = true
        // Prevent browser from interpreting this as a scroll/gesture
        e.preventDefault()
        return
      }

      // If content is scrolled to top, we might drag the sheet on down-swipe.
      // We'll decide in touchmove based on direction + scroll position.
      isDraggingSheet.current = false
    },
    [animating, height],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragging.current) return
      const touch = e.touches[0]
      const deltaY = dragStartY.current - touch.clientY // positive = finger moved up
      dragTimestamps.current.push({ y: touch.clientY, t: Date.now() })
      // Keep only last 10 points
      if (dragTimestamps.current.length > 10) dragTimestamps.current.shift()

      // If we haven't committed to dragging the sheet yet, check scroll state
      if (!isDraggingSheet.current) {
        const content = contentRef.current
        if (!content) return

        // Finger moving down (deltaY < 0) and content scrolled to top → drag sheet
        if (deltaY < 0 && content.scrollTop <= 0) {
          isDraggingSheet.current = true
          dragStartY.current = touch.clientY
          dragStartH.current = height
        } else {
          // Let the content scroll naturally
          return
        }
      }

      // We're dragging the sheet
      e.preventDefault()
      const newH = dragStartH.current + deltaY
      const minH = snapFractionToHeight(snapPoints[0]) * 0.8
      const maxH = snapFractionToHeight(snapPoints[2]) * 1.05
      setHeight(Math.max(minH, Math.min(maxH, newH)))
    },
    [height, snapPoints],
  )

  const handleTouchEnd = useCallback(() => {
    if (!dragging.current) return
    finishDrag()
  }, [finishDrag])

  // ── Mouse fallback (for desktop testing) ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (animating) return
      const target = e.target as HTMLElement
      if (!target.closest('[data-drag-handle]') && !target.closest('[data-sheet-header]')) return

      dragging.current = true
      isDraggingSheet.current = true
      dragStartY.current = e.clientY
      dragStartH.current = height
      dragTimestamps.current = [{ y: e.clientY, t: Date.now() }]

      const onMove = (me: MouseEvent) => {
        if (!dragging.current) return
        const deltaY = dragStartY.current - me.clientY
        dragTimestamps.current.push({ y: me.clientY, t: Date.now() })
        if (dragTimestamps.current.length > 10) dragTimestamps.current.shift()
        const newH = dragStartH.current + deltaY
        const minH = snapFractionToHeight(snapPoints[0]) * 0.8
        const maxH = snapFractionToHeight(snapPoints[2]) * 1.05
        setHeight(Math.max(minH, Math.min(maxH, newH)))
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        if (!dragging.current) return
        finishDrag()
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [animating, height, snapPoints, finishDrag],
  )

  return (
    <div
      ref={sheetRef}
      data-testid="draggable-sheet"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height,
        background: 'var(--color-bg-page)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        boxShadow: '0 -2px 20px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        touchAction: 'none',
        ...(animating
          ? { transition: `height ${SPRING_MS}ms ${SPRING_EASING}` }
          : {}),
      }}
    >
      {/* Drag handle */}
      <div
        ref={handleRef}
        data-drag-handle
        data-testid="sheet-drag-handle"
        style={{
          display: 'flex',
          justifyContent: 'center',
          paddingTop: 8,
          paddingBottom: 4,
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'var(--color-border-secondary, #d5d2cb)',
          }}
        />
      </div>

      {/* Fixed header — also a drag zone */}
      <div ref={headerRef} data-sheet-header data-testid="sheet-header" style={{ flexShrink: 0, touchAction: 'none' }}>
        {header}
      </div>

      {/* Scrollable content */}
      <div
        ref={contentRef}
        data-testid="sheet-content"
        style={{
          flex: 1,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
