interface RouteChainProps {
  destinations: string[]
  maxVisible?: number
  /** Prevent wrapping — truncate with ellipsis when container is too narrow */
  truncate?: boolean
  className?: string
}

export default function RouteChain({ destinations, maxVisible = 4, truncate = false, className = '' }: RouteChainProps) {
  if (destinations.length === 0) return null

  const visible = destinations.slice(0, maxVisible)
  const overflow = destinations.length - maxVisible

  return (
    <span className={`inline-flex items-center gap-y-0.5 ${truncate ? 'overflow-hidden whitespace-nowrap' : 'flex-wrap'} ${className}`}>
      {visible.map((name, i) => (
        <span key={i} className="inline-flex items-center min-w-0">
          {i > 0 && (
            <span className="font-mono text-[10px] text-text-mist mx-1.5 shrink-0">→</span>
          )}
          <span className={`text-[13px] font-medium text-text-secondary ${truncate ? 'truncate' : ''}`}>{name}</span>
        </span>
      ))}
      {overflow > 0 && (
        <span className="font-mono text-[10px] text-text-ghost ml-1.5 shrink-0">+{overflow}</span>
      )}
    </span>
  )
}
