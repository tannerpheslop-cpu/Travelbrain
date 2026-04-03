import { useMemo } from 'react'

/**
 * Dynamic sunset progression background for the Horizon page.
 * Transitions from golden hour (0 saves) to full night (30+ saves).
 * See /docs/DESIGN-SYSTEM-V2.md Section 5.
 *
 * Two-layer model:
 *   Layer 1 — CSS linear-gradient top → bottom (95% of the work)
 *   Layer 2 — Radial overlay below the bottom edge (horizon curve / city glow)
 */

interface SunsetBackgroundProps {
  saveCount: number
}

// ── Stage definitions ────────────────────────────────────────────────────────

interface GradientStop { pos: number; color: string }
interface RadialStop   { pct: number; opacity: number }

interface RadialConfig {
  centerYOffset: number  // px below bottom edge
  radiusFactor: number   // radius = height * radiusFactor → CSS: (factor*100)%
  color: string          // hex — interpolated between stages
  stops: RadialStop[]    // per-stop opacities per design spec
}

interface Stage {
  linearStops: GradientStop[]
  radial: RadialConfig
}

const STAGES: Stage[] = [
  // Stage 0: Golden hour — 0 saves
  {
    linearStops: [
      { pos: 0,   color: '#1a1020' },
      { pos: 30,  color: '#3a1f38' },
      { pos: 55,  color: '#78303a' },
      { pos: 75,  color: '#b8441e' },
      { pos: 90,  color: '#c96830' },
      { pos: 100, color: '#d4823c' },
    ],
    radial: {
      centerYOffset: 60, radiusFactor: 1.3, color: '#d4823c',
      stops: [
        { pct: 0,   opacity: 0.25 },
        { pct: 35,  opacity: 0.15 },
        { pct: 70,  opacity: 0.05 },
        { pct: 100, opacity: 0    },
      ],
    },
  },

  // Stage 1: Sunset — 1–5 saves
  {
    linearStops: [
      { pos: 0,   color: '#121417' },
      { pos: 25,  color: '#1a1830' },
      { pos: 50,  color: '#3d1f38' },
      { pos: 72,  color: '#8a3530' },
      { pos: 88,  color: '#b8441e' },
      { pos: 100, color: '#c96830' },
    ],
    radial: {
      centerYOffset: 60, radiusFactor: 1.3, color: '#c96830',
      stops: [
        { pct: 0,   opacity: 0.20 },
        { pct: 35,  opacity: 0.10 },
        { pct: 70,  opacity: 0.03 },
        { pct: 100, opacity: 0    },
      ],
    },
  },

  // Stage 2: Dusk — 6–15 saves
  {
    linearStops: [
      { pos: 0,   color: '#121417' },
      { pos: 20,  color: '#141820' },
      { pos: 50,  color: '#1a1830' },
      { pos: 75,  color: '#4a2230' },
      { pos: 92,  color: '#7a3820' },
      { pos: 100, color: '#8a4220' },
    ],
    radial: {
      centerYOffset: 60, radiusFactor: 1.3, color: '#8a4220',
      stops: [
        { pct: 0,   opacity: 0.15 },
        { pct: 35,  opacity: 0.07 },
        { pct: 70,  opacity: 0.02 },
        { pct: 100, opacity: 0    },
      ],
    },
  },

  // Stage 3: Early night — 16–30 saves
  {
    linearStops: [
      { pos: 0,   color: '#121417' },
      { pos: 25,  color: '#131518' },
      { pos: 50,  color: '#15181e' },
      { pos: 70,  color: '#181820' },
      { pos: 82,  color: '#1e1a22' },
      { pos: 92,  color: '#261820' },
      { pos: 100, color: '#2c1c22' },
    ],
    radial: {
      centerYOffset: 60, radiusFactor: 1.3, color: '#2c1c22',
      stops: [
        { pct: 0,   opacity: 0.10 },
        { pct: 35,  opacity: 0.05 },
        { pct: 70,  opacity: 0    },
        { pct: 100, opacity: 0    },
      ],
    },
  },

  // Stage 4: Full night — 30+ saves
  // Layer 2 becomes the city glow: compact, round, orange accent, NOT spreading
  {
    linearStops: [
      { pos: 0,   color: '#121417' },
      { pos: 40,  color: '#131518' },
      { pos: 70,  color: '#14171b' },
      { pos: 90,  color: '#15181c' },
      { pos: 100, color: '#15181c' },
    ],
    radial: {
      centerYOffset: 20, radiusFactor: 0.5, color: '#B8441E',
      stops: [
        { pct: 0,   opacity: 0.15 },
        { pct: 30,  opacity: 0.09 },
        { pct: 60,  opacity: 0.04 },
        { pct: 100, opacity: 0    },
      ],
    },
  },
]

// Stage thresholds: save counts at which each stage begins
const THRESHOLDS = [0, 1, 6, 16, 30]

// ── Color interpolation ──────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('')
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ── Stage / progress lookup ──────────────────────────────────────────────────

function getStageAndProgress(saveCount: number): { stageIdx: number; t: number } {
  if (saveCount <= 0) return { stageIdx: 0, t: 0 }
  if (saveCount >= 30) return { stageIdx: 4, t: 0 }

  for (let i = THRESHOLDS.length - 1; i >= 1; i--) {
    if (saveCount >= THRESHOLDS[i]) {
      const rangeStart = THRESHOLDS[i]
      const rangeEnd   = THRESHOLDS[i + 1] ?? 30
      const t = Math.min(1, (saveCount - rangeStart) / (rangeEnd - rangeStart))
      return { stageIdx: i, t }
    }
  }

  // Between 0 and 1 saves
  return { stageIdx: 0, t: saveCount }
}

// ── Gradient computation ─────────────────────────────────────────────────────

function computeGradient(saveCount: number): { linearGradient: string; radialGradient: string } {
  const { stageIdx, t } = getStageAndProgress(saveCount)

  const from = STAGES[stageIdx]
  const to   = stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : from

  // ── Layer 1: linear gradient ─────────────────────────────────────────────
  const maxStops = Math.max(from.linearStops.length, to.linearStops.length)
  const linearParts: string[] = []
  for (let i = 0; i < maxStops; i++) {
    const fs = from.linearStops[Math.min(i, from.linearStops.length - 1)]
    const ts = to.linearStops[Math.min(i, to.linearStops.length - 1)]
    const color = lerpColor(fs.color, ts.color, t)
    const pos   = lerp(fs.pos, ts.pos, t)
    linearParts.push(`${color} ${pos.toFixed(1)}%`)
  }
  const linearGradient = `linear-gradient(to bottom, ${linearParts.join(', ')})`

  // ── Layer 2: radial gradient ─────────────────────────────────────────────
  const radFrom = from.radial
  const radTo   = to.radial

  const centerYOff  = lerp(radFrom.centerYOffset, radTo.centerYOffset, t)
  const radiusFactor = lerp(radFrom.radiusFactor, radTo.radiusFactor, t)
  const radColor    = lerpColor(radFrom.color, radTo.color, t)

  // Interpolate per-stop opacities and positions
  const numStops = Math.max(radFrom.stops.length, radTo.stops.length)
  const interpStops: RadialStop[] = []
  for (let i = 0; i < numStops; i++) {
    const fs = radFrom.stops[Math.min(i, radFrom.stops.length - 1)]
    const ts = radTo.stops[Math.min(i, radTo.stops.length - 1)]
    interpStops.push({
      pct:     lerp(fs.pct,     ts.pct,     t),
      opacity: lerp(fs.opacity, ts.opacity, t),
    })
  }

  // Build rgba() stop strings
  const [r, g, b] = hexToRgb(radColor)
  const radiusPct = Math.round(radiusFactor * 100)
  const stopStrings = interpStops.map(s => {
    if (s.opacity < 0.002) return `transparent ${s.pct.toFixed(1)}%`
    return `rgba(${r}, ${g}, ${b}, ${s.opacity.toFixed(3)}) ${s.pct.toFixed(1)}%`
  })
  const radialGradient = `radial-gradient(${radiusPct}% ${radiusPct}% at 50% calc(100% + ${centerYOff.toFixed(1)}px), ${stopStrings.join(', ')})`

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
        background: 'var(--bg-canvas)',
      }}
    >
      {/* Gradient container — upper half of viewport, overlaps sheet by 4px */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'calc(50vh + 4px)', overflow: 'hidden' }}>
        {/* Layer 1: Linear gradient */}
        <div
          data-testid="sunset-layer-1"
          style={{ position: 'absolute', inset: 0, background: linearGradient }}
        />
        {/* Layer 2: Radial overlay (horizon curve) / city glow (Stage 4) */}
        <div
          data-testid="sunset-layer-2"
          style={{ position: 'absolute', inset: 0, background: radialGradient }}
        />
      </div>
    </div>
  )
}

// Export for testing
export { computeGradient, getStageAndProgress }
