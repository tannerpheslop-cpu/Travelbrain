import type { HTMLAttributes, ReactNode } from 'react'

interface DashedCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export default function DashedCard({ children, className = '', ...props }: DashedCardProps) {
  return (
    <div
      {...props}
      className={`border-[1.5px] border-dashed border-border-dashed bg-transparent rounded-xl transition-all duration-150 ease-out hover:border-accent hover:bg-accent-light cursor-pointer ${className}`}
    >
      {children}
    </div>
  )
}
