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
}

export default function SourceIcon({ source, size = 28, className = '' }: SourceIconProps) {
  const char = icons[source.toLowerCase()] ?? icons.url
  return (
    <span
      className={`inline-flex items-center justify-center bg-bg-pill text-text-tertiary rounded-[6px] font-mono text-sm select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {char}
    </span>
  )
}
