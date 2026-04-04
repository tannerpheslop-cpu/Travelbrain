interface CategoryPillProps {
  label: string
  /** @deprecated dominant prop is no longer used — all category pills are monochrome */
  dominant?: boolean
  className?: string
}

export default function CategoryPill({ label, className = '' }: CategoryPillProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: 9999,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 11,
        color: 'var(--text-secondary)',
        background: 'var(--bg-elevated-2)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
      className={className}
    >
      {label}
    </span>
  )
}
