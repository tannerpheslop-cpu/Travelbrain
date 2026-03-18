import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface FilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  children: ReactNode
}

export default function FilterPill({ active = false, children, className = '', ...props }: FilterPillProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1.5 px-3.5 py-[5px] rounded-md font-mono text-xs whitespace-nowrap transition-all ${
        active
          ? 'bg-accent-light border-[1.5px] border-accent text-accent font-semibold'
          : 'bg-transparent border border-border-input text-text-secondary font-normal hover:border-text-ghost'
      } ${className}`}
    >
      {children}
    </button>
  )
}
