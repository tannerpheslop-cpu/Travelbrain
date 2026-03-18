import type { TripStatus } from '../../types'

const config: Record<TripStatus, { label: string; classes: string }> = {
  planning:     { label: 'Planning', classes: 'text-accent bg-accent-med' },
  aspirational: { label: 'Someday',  classes: 'text-text-faint bg-bg-muted' },
  scheduled:    { label: 'Upcoming', classes: 'text-accent bg-accent-med' },
}

interface StatusBadgeProps {
  status: TripStatus
  className?: string
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const { label, classes } = config[status] ?? config.aspirational
  return (
    <span
      className={`inline-block px-2 py-[3px] rounded font-mono text-[9px] font-semibold tracking-[0.5px] uppercase leading-none ${classes} ${className}`}
    >
      {label}
    </span>
  )
}
