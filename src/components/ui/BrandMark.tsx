export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`font-mono text-[11px] font-medium tracking-[3px] uppercase text-text-faint select-none ${className}`}
    >
      youji 游记
    </span>
  )
}
