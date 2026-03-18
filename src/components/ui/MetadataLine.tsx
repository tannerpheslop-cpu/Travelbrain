interface MetadataLineProps {
  items: string[]
  className?: string
}

export default function MetadataLine({ items, className = '' }: MetadataLineProps) {
  if (items.length === 0) return null
  return (
    <span className={`font-mono text-[11px] font-normal leading-[1.4] text-text-tertiary ${className}`}>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="text-text-mist mx-1">·</span>}
          {item}
        </span>
      ))}
    </span>
  )
}
