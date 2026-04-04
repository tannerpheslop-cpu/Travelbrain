const icons: Record<string, string> = {
  tiktok: '♫',
  instagram: '◎',
  url: '↗',
  manual: '✎',
  screenshot: '▣',
}

interface SourceIconProps {
  source: string
  size?: number
  className?: string
  /** Use dark backdrop for visibility over light images */
  overImage?: boolean
}

export default function SourceIcon({ source, size = 28, className = '', overImage }: SourceIconProps) {
  const char = icons[source.toLowerCase()] ?? icons.url
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[6px] font-mono text-sm select-none ${overImage ? '' : 'bg-bg-pill text-text-tertiary'} ${className}`}
      style={{
        width: size,
        height: size,
        ...(overImage ? { background: 'rgba(0, 0, 0, 0.5)', color: '#e8eaed' } : {}),
      }}
    >
      {char}
    </span>
  )
}
