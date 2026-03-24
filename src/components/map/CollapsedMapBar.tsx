import { MAP_COLORS, MAP_SIZES } from './mapConfig'

interface CollapsedMapBarProps {
  destinationCount: number
  onExpand: () => void
}

/**
 * Thin bar shown when the trip map is collapsed.
 * Displays small copper dots (one per destination) connected by thin line segments.
 * Tapping anywhere expands the full map.
 */
export default function CollapsedMapBar({ destinationCount, onExpand }: CollapsedMapBarProps) {
  if (destinationCount === 0) return null

  const dotRadius = 3
  const barHeight = MAP_SIZES.collapsedHeight
  const padding = 24
  const svgWidth = 300 // nominal width, SVG scales via viewBox

  // Distribute dots evenly across the bar
  const usableWidth = svgWidth - padding * 2
  const spacing = destinationCount > 1 ? usableWidth / (destinationCount - 1) : 0
  const cy = barHeight / 2

  const dots = Array.from({ length: destinationCount }, (_, i) => ({
    cx: padding + (destinationCount > 1 ? i * spacing : usableWidth / 2),
    cy,
  }))

  return (
    <button
      data-testid="collapsed-map-bar"
      onClick={onExpand}
      type="button"
      style={{
        width: '100%',
        height: barHeight,
        borderRadius: 12,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-muted)',
        padding: 0,
        transition: 'background 150ms ease',
      }}
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${barHeight}`}
        style={{ width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Connecting lines */}
        {dots.map((dot, i) =>
          i < dots.length - 1 ? (
            <line
              key={`line-${i}`}
              x1={dot.cx}
              y1={dot.cy}
              x2={dots[i + 1].cx}
              y2={dots[i + 1].cy}
              stroke={MAP_COLORS.accent}
              strokeWidth={1}
              strokeOpacity={0.3}
            />
          ) : null,
        )}
        {/* Destination dots */}
        {dots.map((dot, i) => (
          <circle
            key={`dot-${i}`}
            cx={dot.cx}
            cy={dot.cy}
            r={dotRadius}
            fill={MAP_COLORS.accent}
            data-testid={`collapsed-dot-${i + 1}`}
          />
        ))}
      </svg>
    </button>
  )
}
