import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface SecondaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

export default function SecondaryButton({ children, className = '', ...props }: SecondaryButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 px-5 py-[9px] bg-bg-card text-text-secondary text-[13px] font-medium rounded-lg border border-border-input hover:bg-bg-muted active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      {children}
    </button>
  )
}
