import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hoverable?: boolean
}

export default function Card({ children, hoverable = true, className = '', ...props }: CardProps) {
  return (
    <div
      {...props}
      className={`bg-bg-card border border-border rounded-xl transition-all duration-150 ease-out ${
        hoverable
          ? 'hover:border-accent/25 hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:-translate-y-0.5'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}
