import { useMemo } from 'react'

/**
 * Dynamic sunset progression background for the Horizon page.
 * Transitions from golden hour (0 saves) to full night (30+ saves).
 * See /docs/BRAND-IDENTITY.md Section 3.
 */

interface SunsetBackgroundProps {
  saveCount: number
}

// ── Stage definitions ────────────────────────────────────────────────────────

interface GradientStop { pos: number; color: string }
interface RadialConfig { centerYOffset: number; radiusFactor: number; color: string; opacity: number }

interface Stage {
  linearStops: GradientStop[]
  radial: RadialConfig
}

const STAGES: Stage[] = [
  // Stage 0: Golden hour — 0 saves
  {
    linearStops: [
      { pos: 0, color: '#1a1028' }, { pos: 30, color: '#3d1f3a' },
      { pos: 55, color: '#7a2e3a' }, { pos: 75, color: '#c4582d' },
      { pos: 90, color: '#d4863a' }, { pos: 100, color: '#e8a04a' },
    ],
    radial: { centerYOffset: 60, radiusFactor: 1.3, color: '#e8a04a', opacity: 0.25 },
  },
  // Stage 1: Sunset — 1-5 saves
  {
    linearStops: [
      { pos: 0, color: '#0e1424' }, { pos: 25, color: '#1f1a35' },
      { pos: 50, color: '#4a2040' }, { pos: 72, color: '#9a3833' },
      { pos: 88, color: '#c4682d' }, { pos: 100, color: '#d4863a' },
    ],
    radial: { centerYOffset: 60, radiusFactor: 1.3, color: '#d4863a', opacity: 0.20 },
  },
  // Stage 2: Dusk — 6-15 saves
  {
    linearStops: [
      { pos: 0, color: '#080c18' }, { pos: 20, color: '#0e1228' },
      { pos: 50, color: '#1f1530' }, { pos: 75, color: '#5a2535' },
      { pos: 92, color: '#8a4530' }, { pos: 100, color: '#a05a30' },
    ],
    radial: { centerYOffset: 60, radiusFactor: 1.3, color: '#a05a30', opacity: 0.15 },
  },
  // Stage 3: Early night — 16-30 saves
  {
    linearStops: [
      { pos: 0, color: '#080c18' }, { pos: 25, color: '#0b0f20' },
      { pos: 50, color: '#101428' }, { pos: 70, color: '#1a1530' },
      { pos: 82, color: '#2a1d33' }, { pos: 92, color: '#3d2535' },
      { pos: 100, color: '#4a2a35' },
    ],
    radial: { centerYOffset: 60, radiusFactor: 1.3, color: '#4a2a35', opacity: 0.10 },
  },
  // Stage 4: Full night — 30+ saves
  {
    linearStops: [
      { pos: 0, color: '#080c18' }, { pos: 40, color: '#090e1c' },
      { pos: 70, color: '#0b1020' }, { pos: 90, color: '#0e1326' },
      { pos: 100, color: '#141828' },
    ],
    // City glow: compact, round, copper
    radial: { centerYOffset: 20, radiusFactor: 0.5, color: '#c45a2d', opacity: 0.15 },
  },
]

// Stage thresholds: [0, 1, 6, 16, 30]
const THRESHOLDS = [0, 1, 6, 16, 30]

// ── Color interpolation ─────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ── Compute the interpolated gradient for a given save count ─────────────────

function getStageAndProgress(saveCount: number): { stageIdx: number; t: number } {
  if (saveCount <= 0) return { stageIdx: 0, t: 0 }
  if (saveCount >= 30) return { stageIdx: 4, t: 0 }

  for (let i = THRESHOLDS.length - 1; i >= 1; i--) {
    if (saveCount >= THRESHOLDS[i]) {
      const rangeStart = THRESHOLDS[i]
      const rangeEnd = i < THRESHOLDS.length - 1 ? THRESHOLDS[i + 1] : 30
      const t = Math.min(1, (saveCount - rangeStart) / (rangeEnd - rangeStart))
      return { stageIdx: i, t }
    }
  }

  // Between 0 and 1
  return { stageIdx: 0, t: saveCount }
}

function computeGradient(saveCount: number): { linearGradient: string; radialGradient: string } {
  const { stageIdx, t } = getStageAndProgress(saveCount)

  const from = STAGES[stageIdx]
  const to = stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : from

  // Interpolate linear stops
  // Normalize stop count: use the longer array's positions, interpolate colors
  const maxStops = Math.max(from.linearStops.length, to.linearStops.length)
  const linearParts: string[] = []
  for (let i = 0; i < maxStops; i++) {
    const fromStop = from.linearStops[Math.min(i, from.linearStops.length - 1)]
    const toStop = to.linearStops[Math.min(i, to.linearStops.length - 1)]
    const color = lerpColor(fromStop.color, toStop.color, t)
    const pos = lerp(fromStop.pos, toStop.pos, t)
    linearParts.push(`${color} ${pos.toFixed(1)}%`)
  }
  const linearGradient = `linear-gradient(to bottom, ${linearParts.join(', ')})`

  // Interpolate radial
  const radFrom = from.radial
  const radTo = to.radial
  const centerYOff = lerp(radFrom.centerYOffset, radTo.centerYOffset, t)
  const radiusFactor = lerp(radFrom.radiusFactor, radTo.radiusFactor, t)
  const radColor = lerpColor(radFrom.color, radTo.color, t)
  const radOpacity = lerp(radFrom.opacity, radTo.opacity, t)

  // Build radial gradient
  // The radial is centered below the bottom edge with a large radius
  const opHex = Math.round(radOpacity * 255).toString(16).padStart(2, '0')
  const op60 = Math.round(radOpacity * 0.6 * 255).toString(16).padStart(2, '0')
  const op20 = Math.round(radOpacity * 0.2 * 255).toString(16).padStart(2, '0')
  // radiusFactor controls how much of the viewport the radial covers
  // At 1.3 (sunset), it's a huge spread. At 0.5 (city glow), it's compact.
  const radiusPct = Math.round(radiusFactor * 100)
  const radialGradient = `radial-gradient(${radiusPct}% ${radiusPct}% at 50% calc(100% + ${centerYOff}px), ${radColor}${opHex} 0%, ${radColor}${op60} 35%, ${radColor}${op20} 70%, transparent 100%)`

  return { linearGradient, radialGradient }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SunsetBackground({ saveCount }: SunsetBackgroundProps) {
  const { linearGradient, radialGradient } = useMemo(
    () => computeGradient(saveCount),
    [saveCount],
  )

  return (
    <div
      data-testid="sunset-background"
      style={{
        position: 'fixed',
        // Extend beyond the viewport edges to cover Dynamic Island / safe area
        top: 'calc(-1 * env(safe-area-inset-top, 0px))',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background: '#080c18', // deep-bg fills everything, gradient overlays the top
      }}
    >
      {/* Gradient container — extends into safe area at top, overlaps sheet by 4px at bottom */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'calc(50vh + 4px)', overflow: 'hidden' }}>
        {/* Layer 1: Linear gradient */}
        <div
          data-testid="sunset-layer-1"
          style={{
            position: 'absolute',
            inset: 0,
            background: linearGradient,
          }}
        />
        {/* Layer 2: Radial overlay */}
        <div
          data-testid="sunset-layer-2"
          style={{
            position: 'absolute',
            inset: 0,
            background: radialGradient,
          }}
        />
      </div>
    </div>
  )
}

// Export for testing
export { computeGradient, getStageAndProgress }
