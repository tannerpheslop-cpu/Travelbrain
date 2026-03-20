/**
 * Detect if text is a URL and normalize it.
 * Returns the URL (with https:// prepended if needed) or null.
 */
export function detectUrl(text: string): string | null {
  const trimmed = text.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w-]+\.(com|org|net|io|co|me|tv|app|dev|xyz|info)(\/\S*)?$/i.test(trimmed)) return `https://${trimmed}`
  return null
}
