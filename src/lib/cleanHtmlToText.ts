/**
 * HTML → plain text cleaning for article extraction.
 *
 * This is the canonical implementation used by both:
 *   - `supabase/functions/prepare-extraction/index.ts` (Edge Function, Deno runtime)
 *   - Vitest fixture tests (`src/lib/__tests__/cleanHtmlToText.fixtures.test.ts`)
 *
 * IMPORTANT: The Edge Function contains its own copy because Deno cannot import
 * from `src/`. If you change logic here, update the Edge Function copy too.
 * The fixture tests guard against drift by testing the same HTML inputs.
 */

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)) } catch { return '' }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)) } catch { return '' }
    })
}

/** Boilerplate class/id patterns to strip. */
export const BOILERPLATE_PATTERNS = [
  'comment', 'sidebar', 'widget', 'newsletter', 'subscribe', 'signup',
  'cookie', 'consent', 'popup', 'modal', 'advertisement', 'ad-', 'ad_',
  'sponsor', 'related-post', 'related_post', 'share', 'social',
  'author-bio', 'author_bio', 'disqus', 'footer-nav', 'menu-item',
  'breadcrumb', 'pagination', 'wp-block-group', 'printfriendly',
]

/**
 * Clean raw HTML to plain text suitable for LLM extraction.
 *
 * Key design decisions:
 * - `<article>` is NEVER in the boilerplate stripping tag list. It is the main
 *   content container across Squarespace, WordPress, Ghost, Substack, and most CMSes.
 * - `<header>`, `<footer>`, `<nav>`, `<aside>` are stripped entirely (non-content).
 * - Elements with boilerplate class/id patterns are stripped (comments, sidebars, etc.).
 */
export function cleanHtmlToText(html: string): string {
  let h = html

  // 1. Remove non-content elements
  h = h.replace(/<script[\s\S]*?<\/script>/gi, '')
  h = h.replace(/<style[\s\S]*?<\/style>/gi, '')
  h = h.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  h = h.replace(/<footer[\s\S]*?<\/footer>/gi, '')
  h = h.replace(/<header[\s\S]*?<\/header>/gi, '')
  h = h.replace(/<aside[\s\S]*?<\/aside>/gi, '')
  h = h.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
  h = h.replace(/<svg[\s\S]*?<\/svg>/gi, '')
  h = h.replace(/<form[\s\S]*?<\/form>/gi, '')
  h = h.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')

  // 2. Remove elements with boilerplate class/id patterns
  // NOTE: `article` is intentionally EXCLUDED from the tag list below — it's typically
  // the main content container and should never be stripped by boilerplate removal.
  // Squarespace, WordPress, and other CMSes put the article body inside <article>.
  for (const pattern of BOILERPLATE_PATTERNS) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(
      `<(div|section|aside|ul|ol|p|span)[^>]*(class|id)="[^"]*${escaped}[^"]*"[^>]*>[\\s\\S]*?<\\/\\1>`,
      'gi',
    )
    h = h.replace(regex, '')
  }

  // 3. Convert block elements to line breaks, strip remaining tags
  h = h.replace(/<\/(p|div|section|article|h[1-6]|li|tr|br\s*\/?)>/gi, '\n\n')
  h = h.replace(/<br\s*\/?>/gi, '\n')
  h = h.replace(/<[^>]*>/g, ' ')
  h = decodeHtml(h)

  // 4. Clean up whitespace
  h = h.replace(/[^\S\n]+/g, ' ')
  h = h.replace(/\n\s*\n/g, '\n\n')

  // 5. Remove boilerplate text patterns
  const lines = h.split('\n')
  const cleanLines = lines.filter(line => {
    const trimmed = line.trim().toLowerCase()
    if (!trimmed) return true // Keep blank lines

    // Skip newsletter/subscribe prompts
    if (/^(subscribe|sign up|enter your email|get our newsletter|join our|don't miss)/i.test(trimmed)) return false
    // Skip affiliate disclaimers
    if (/affiliate links?|contains? affiliate|sponsored post|disclosure:/i.test(trimmed)) return false
    // Skip cookie notices
    if (/^(we use cookies|we use your personal data|this site uses cookies)/i.test(trimmed)) return false
    // Skip social share prompts
    if (/^(pin for later|share on (facebook|twitter|pinterest)|follow us on|like us on)/i.test(trimmed)) return false
    // Skip bare URLs
    if (/^https?:\/\/\S+$/.test(trimmed) && trimmed.length < 200) return false
    // Skip very short lines that look like UI labels
    if (trimmed.length < 4 && !/^day/i.test(trimmed)) return false

    return true
  })

  return cleanLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
