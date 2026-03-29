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

  // Refs for persistent event listener closures (useEffect with empty deps)
  const snapPointsRef = useRef(snapPoints)
  snapPointsRef.current = snapPoints
  const finishDragRef = useRef<() => void>(() => {})


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

  // ── Native listener on content: force-kill any drag state ──
  // Native listeners fire BEFORE React's delegated handlers, so this
  // sets dragging=false before the sheet's React onTouchStart can read it.
  // This survives React re-renders because it's attached via useEffect with empty deps.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const killDrag = () => {
      dragging.current = false
      isDraggingSheet.current = false
    }
    el.addEventListener('touchstart', killDrag, { passive: true })
    el.addEventListener('mousedown', killDrag)
    return () => {
      el.removeEventListener('touchstart', killDrag)
      el.removeEventListener('mousedown', killDrag)
    }
  }, [])

  // ── Native preventDefault on handle/header touchmove ──
  const handleRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
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
  finishDragRef.current = finishDrag

  // ── React touch/mouse handlers on the outer sheet div ──
  // These check the target against handle/header before activating drag.
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (animating) {
        dragging.current = false
        isDraggingSheet.current = false
        return
      }
      const target = e.target as HTMLElement
      if (!target.closest('[data-drag-handle]') && !target.closest('[data-sheet-header]')) {
        dragging.current = false
        isDraggingSheet.current = false
        return
      }
      const touch = e.touches[0]
      dragging.current = true
      isDraggingSheet.current = true
      dragStartY.current = touch.clientY
      dragStartH.current = height
      dragTimestamps.current = [{ y: touch.clientY, t: Date.now() }]
    },
    [animating, height],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragging.current || !isDraggingSheet.current) return
      const touch = e.touches[0]
      const deltaY = dragStartY.current - touch.clientY
      dragTimestamps.current.push({ y: touch.clientY, t: Date.now() })
      if (dragTimestamps.current.length > 10) dragTimestamps.current.shift()
      const newH = dragStartH.current + deltaY
      const minH = snapFractionToHeight(snapPoints[0]) * 0.8
      const maxH = snapFractionToHeight(snapPoints[2]) * 1.05
      setHeight(Math.max(minH, Math.min(maxH, newH)))
    },
    [snapPoints],
  )

  const handleTouchEnd = useCallback(() => {
    if (!dragging.current) return
    finishDrag()
  }, [finishDrag])

  // ── Persistent document-level mouse move/up handlers ──
  // Instead of attaching/detaching per drag, keep one persistent pair that
  // checks dragging.current. This prevents stale listener accumulation.
  useEffect(() => {
    const onMove = (me: MouseEvent) => {
      if (!dragging.current || !isDraggingSheet.current) return
      const deltaY = dragStartY.current - me.clientY
      dragTimestamps.current.push({ y: me.clientY, t: Date.now() })
      if (dragTimestamps.current.length > 10) dragTimestamps.current.shift()
      const newH = dragStartH.current + deltaY
      const minH = snapFractionToHeight(snapPointsRef.current[0]) * 0.8
      const maxH = snapFractionToHeight(snapPointsRef.current[2]) * 1.05
      setHeight(Math.max(minH, Math.min(maxH, newH)))
    }
    const onUp = () => {
      if (!dragging.current) return
      finishDragRef.current()
      dragging.current = false
      isDraggingSheet.current = false
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

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
    },
    [animating, height],
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
        background: '#faf8f4',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        boxShadow: '0 -2px 20px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        overflow: 'hidden',
        pointerEvents: 'auto',
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
            background: '#d3d1c7',
          }}
        />
      </div>

      {/* Fixed header — also a drag zone */}
      <div ref={headerRef} data-sheet-header data-testid="sheet-header" style={{ flexShrink: 0, touchAction: 'none' }}>
        {header}
      </div>

      {/* Scrollable content — native listener ensures dragging.current is false
          for any touch starting in this area, preventing the sheet from moving. */}
      <div
        ref={contentRef}
        data-testid="sheet-content"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          overscrollBehaviorX: 'none',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
