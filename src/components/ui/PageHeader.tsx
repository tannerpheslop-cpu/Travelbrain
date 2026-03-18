import type { ReactNode } from 'react'
import BrandMark from './BrandMark'
import MetadataLine from './MetadataLine'

interface PageHeaderProps {
  title: string
  metadata?: string[]
  actions?: ReactNode
  /** Extra className on the outer wrapper */
  className?: string
}

export default function PageHeader({ title, metadata, actions, className = '' }: PageHeaderProps) {
  return (
    <header className={className}>
      <BrandMark className="mb-2 block" />
      <h1 className="text-[32px] font-bold leading-[1.2] tracking-[-0.5px] text-text-primary">
        {title}
      </h1>
      {metadata && metadata.length > 0 && (
        <div className="mt-1">
          <MetadataLine items={metadata} />
        </div>
      )}
      {actions && <div className="mt-5">{actions}</div>}
    </header>
  )
}
