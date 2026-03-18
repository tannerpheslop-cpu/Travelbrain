interface RouteChainProps {
  destinations: string[]
  maxVisible?: number
  className?: string
}

export default function RouteChain({ destinations, maxVisible = 4, className = '' }: RouteChainProps) {
  if (destinations.length === 0) return null

  const visible = destinations.slice(0, maxVisible)
  const overflow = destinations.length - maxVisible

  return (
    <span className={`inline-flex flex-wrap items-center gap-y-0.5 ${className}`}>
      {visible.map((name, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && (
            <span className="font-mono text-[10px] text-text-mist mx-1.5">→</span>
          )}
          <span className="text-[13px] font-medium text-text-secondary">{name}</span>
        </span>
      ))}
      {overflow > 0 && (
        <span className="font-mono text-[10px] text-text-ghost ml-1.5">+{overflow}</span>
      )}
    </span>
  )
}
