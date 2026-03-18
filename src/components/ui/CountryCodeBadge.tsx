interface CountryCodeBadgeProps {
  code: string
  className?: string
  /** Light variant for use on dark backgrounds */
  light?: boolean
}

export default function CountryCodeBadge({ code, className = '', light = false }: CountryCodeBadgeProps) {
  if (!code || code.length < 2) return null
  return (
    <span
      className={`inline-block font-mono text-[11px] font-bold tracking-[1px] rounded px-1.5 py-[2px] leading-none ${
        light
          ? 'bg-white/20 text-white'
          : 'bg-bg-pill text-text-tertiary'
      } ${className}`}
    >
      {code.toUpperCase().slice(0, 2)}
    </span>
  )
}
