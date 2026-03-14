/**
 * Displays a location name with optional local-language subtitle.
 *
 * Usage:
 *   <BilingualName name="Tokyo, Japan" nameLocal="東京都, 日本" />
 *   <BilingualName name="Tokyo, Japan" nameLocal={null} />           // no subtitle
 *   <BilingualName name="Paris" nameLocal="Paris" />                 // deduped — no subtitle
 *
 * The component is intentionally inline (span-based) so it can be used
 * inside truncated flex rows, card titles, etc. without breaking layout.
 */

interface Props {
  /** English / primary display name */
  name: string
  /** Local-language name (null = not available or same as English) */
  nameLocal?: string | null
  /** Extra Tailwind classes applied to the wrapper span */
  className?: string
  /** Extra Tailwind classes for the local-language text */
  localClassName?: string
  /** When true, render local name on a separate line (block) instead of inline */
  block?: boolean
}

export default function BilingualName({
  name,
  nameLocal,
  className = '',
  localClassName = '',
  block = false,
}: Props) {
  // Don't show subtitle if it matches the English name or is empty
  const showLocal = nameLocal && nameLocal !== name

  if (!showLocal) {
    return <span className={className}>{name}</span>
  }

  if (block) {
    return (
      <span className={className}>
        {name}
        <span className={`block text-[0.8em] opacity-60 ${localClassName}`}>
          {nameLocal}
        </span>
      </span>
    )
  }

  return (
    <span className={className}>
      {name}
      <span className={`ml-1.5 text-[0.85em] opacity-50 ${localClassName}`}>
        {nameLocal}
      </span>
    </span>
  )
}

/**
 * Utility: extract the short (city-only) portion from a full location name.
 * e.g. "Tokyo, Japan" → "Tokyo", "Chengdu, Sichuan, China" → "Chengdu"
 */
export function shortName(locationName: string | null | undefined): string {
  if (!locationName) return ''
  return locationName.split(',')[0].trim()
}

/**
 * Utility: extract the short local name portion.
 * e.g. "東京都, 日本" → "東京都"
 */
export function shortLocalName(nameLocal: string | null | undefined): string | null {
  if (!nameLocal) return null
  return nameLocal.split(',')[0].trim() || null
}
