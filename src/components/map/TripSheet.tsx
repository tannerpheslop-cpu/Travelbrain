import { useRef, useCallback, type ReactNode } from 'react'
import { Drawer } from 'vaul'

// ── Types ────────────────────────────────────────────────────────────────────

type SnapLabel = 'peek' | 'half' | 'full'

interface TripSheetProps {
  header: ReactNode
  children: ReactNode
  snapPoints?: [number, number, number]
  initialSnap?: SnapLabel
  onSnapChange?: (snap: SnapLabel) => void
  /** Ref to the container element the sheet should render inside */
  container?: React.RefObject<HTMLDivElement | null>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SNAP_LABELS: SnapLabel[] = ['peek', 'half', 'full']

function fractionToLabel(val: number | string | null, points: [number, number, number]): SnapLabel {
  if (val == null) return 'half'
  const n = typeof val === 'string' ? parseFloat(val) : val
  let closest = 0
  let minDist = Infinity
  for (let i = 0; i < points.length; i++) {
    const dist = Math.abs(n - points[i])
    if (dist < minDist) {
      minDist = dist
      closest = i
    }
  }
  return SNAP_LABELS[closest]
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TripSheet({
  header,
  children,
  snapPoints = [0.15, 0.5, 0.85],
  initialSnap = 'half',
  onSnapChange,
  container,
}: TripSheetProps) {
  const onSnapRef = useRef(onSnapChange)
  onSnapRef.current = onSnapChange
  const lastLabelRef = useRef<SnapLabel>(initialSnap)

  const handleSnapChange = useCallback(
    (val: number | string | null) => {
      const label = fractionToLabel(val, snapPoints)
      if (label !== lastLabelRef.current) {
        lastLabelRef.current = label
        onSnapRef.current?.(label)
      }
    },
    [snapPoints],
  )

  const initialIdx = SNAP_LABELS.indexOf(initialSnap)
  const initialFraction = snapPoints[initialIdx >= 0 ? initialIdx : 1]

  return (
    <Drawer.Root
      open
      modal={false}
      snapPoints={snapPoints}
      activeSnapPoint={initialFraction}
      setActiveSnapPoint={handleSnapChange}
      dismissible={false}
      handleOnly={false}
      noBodyStyles
    >
      {container?.current ? (
        <Drawer.Portal container={container.current}>
          <SheetContent header={header}>{children}</SheetContent>
        </Drawer.Portal>
      ) : (
        <SheetContent header={header}>{children}</SheetContent>
      )}
    </Drawer.Root>
  )
}

// ── Inner content (shared between portal and non-portal) ─────────────────────

function SheetContent({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <Drawer.Content
      data-testid="draggable-sheet"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px 16px 0 0',
        background: 'var(--color-bg-page)',
        boxShadow: '0 -2px 20px rgba(0,0,0,0.08)',
        zIndex: 20,
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      {/* Drag handle */}
      <Drawer.Handle
        data-testid="sheet-drag-handle"
        style={{ padding: '8px 0 4px' }}
      />

      {/* Header — draggable by default (not marked with data-vaul-no-drag) */}
      <div data-testid="sheet-header" style={{ flexShrink: 0, padding: '4px 16px 8px' }}>
        {header}
      </div>

      {/* Content — scrollable, NOT draggable */}
      <div
        data-vaul-no-drag
        data-testid="sheet-content"
        style={{
          flex: 1,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
    </Drawer.Content>
  )
}
