interface CategoryPillProps {
  label: string
  dominant?: boolean
  className?: string
}

export default function CategoryPill({ label, dominant = false, className = '' }: CategoryPillProps) {
  return (
    <span
      className={`inline-block px-[6px] py-[2px] rounded-full font-mono text-[10px] font-medium leading-none whitespace-nowrap ${
        dominant
          ? 'bg-accent-light text-accent'
          : 'bg-bg-pill text-text-secondary'
      } ${className}`}
    >
      {label}
    </span>
  )
}
