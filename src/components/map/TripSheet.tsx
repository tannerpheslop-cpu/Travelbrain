import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'

// ── Types ────────────────────────────────────────────────────────────────────

type SnapLabel = 'peek' | 'half' | 'full'

export interface TripSheetProps {
  header: ReactNode
  children: ReactNode
  snapPoints?: [number, number, number]
  initialSnap?: SnapLabel
  onSnapChange?: (snap: SnapLabel) => void
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
}: TripSheetProps) {
  const onSnapRef = useRef(onSnapChange)
  onSnapRef.current = onSnapChange
  const lastLabelRef = useRef<SnapLabel>(initialSnap)

  const initialIdx = SNAP_LABELS.indexOf(initialSnap)
  const initialFraction = snapPoints[initialIdx >= 0 ? initialIdx : 1]
  const [snap, setSnap] = useState<number | string | null>(initialFraction)

  // Start closed, then open on next frame so Vaul runs its entrance animation
  const [isOpen, setIsOpen] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true))
  }, [])

  const handleSnapChange = useCallback(
    (val: number | string | null) => {
      setSnap(val)
      const label = fractionToLabel(val, snapPoints)
      if (label !== lastLabelRef.current) {
        lastLabelRef.current = label
        onSnapRef.current?.(label)
      }
    },
    [snapPoints],
  )

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => { if (!open) setIsOpen(true) /* prevent closing */ }}
      modal={false}
      snapPoints={snapPoints}
      activeSnapPoint={snap}
      setActiveSnapPoint={handleSnapChange}
      dismissible={false}
      noBodyStyles
    >
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 49,
            // Transparent — don't block map interaction.
            // Vaul needs an Overlay to properly initialize animations.
            background: 'transparent',
            pointerEvents: 'none',
          }}
        />
        <Drawer.Content
          data-testid="draggable-sheet"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px 16px 0 0',
            background: 'var(--color-bg-page)',
            boxShadow: '0 -2px 20px rgba(0,0,0,0.08)',
            zIndex: 50,
            overflow: 'hidden',
            outline: 'none',
          }}
        >
          {/* Required by Radix Dialog for accessibility — hidden visually */}
          <Drawer.Title asChild>
            <VisuallyHidden.Root>Sheet</VisuallyHidden.Root>
          </Drawer.Title>

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
      </Drawer.Portal>
    </Drawer.Root>
  )
}
