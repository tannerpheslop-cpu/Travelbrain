interface Props {
  height?: number
  longer?: boolean // longer connector between country groups
  className?: string
}

/**
 * Illustrated dotted pathway connector between destination/route cards.
 * Uses a subtle wavy SVG path for a hand-drawn, graphite-style feel.
 */
export default function DottedConnector({ height = 28, longer = false, className = '' }: Props) {
  const h = longer ? height * 1.5 : height
  return (
    <div className={`flex justify-center ${className}`} aria-hidden>
      <svg width="24" height={h} viewBox={`0 0 24 ${h}`} fill="none">
        <path
          d={`M12 0 Q14 ${h * 0.3} 11 ${h * 0.5} Q13 ${h * 0.7} 12 ${h}`}
          stroke="var(--color-border-dashed)"
          strokeWidth="1.5"
          strokeDasharray="3 4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  )
}
