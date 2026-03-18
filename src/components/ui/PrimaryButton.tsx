import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

export default function PrimaryButton({ children, className = '', ...props }: PrimaryButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 px-5 py-[9px] bg-accent text-white text-[13px] font-semibold rounded-lg shadow-[0_1px_4px_var(--color-accent-shadow)] hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      {children}
    </button>
  )
}
