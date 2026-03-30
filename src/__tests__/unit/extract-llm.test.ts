/**
 * Tests for LLM extraction utilities:
 * - Text preparation (HTML stripping, truncation)
 * - Response parsing (JSON extraction from LLM output)
 * - Item mapping and validation
 */
import { describe, it, expect } from 'vitest'

// ── Text preparation (mirrors prepareTextForLLM in Edge Function) ────────────

function prepareTextForLLM(html: string, maxChars = 12000): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
  text = text.replace(/<[^>]*>/g, ' ')
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  text = text.replace(/\s+/g, ' ').trim()
  if (text.length > maxChars) {
    const half = Math.floor(maxChars / 2)
    text = text.slice(0, half) + '\n\n[...]\n\n' + text.slice(-half)
  }
  return text
}

describe('prepareTextForLLM', () => {
  it('strips script tags', () => {
    const result = prepareTextForLLM('<p>Hello</p><script>alert("x")</script><p>World</p>')
    expect(result).toBe('Hello World')
  })

  it('strips style tags', () => {
    const result = prepareTextForLLM('<p>Hello</p><style>.x{color:red}</style>')
    expect(result).toBe('Hello')
  })

  it('strips nav, footer, header, aside', () => {
    const result = prepareTextForLLM('<nav>Menu</nav><main>Content</main><footer>Foot</footer>')
    expect(result).toBe('Content')
  })

  it('strips all HTML tags', () => {
    const result = prepareTextForLLM('<div class="x"><h2>Title</h2><p>Text</p></div>')
    expect(result).toBe('Title Text')
  })

  it('decodes HTML entities', () => {
    const result = prepareTextForLLM('<p>Tom &amp; Jerry &lt;3</p>')
    expect(result).toBe('Tom & Jerry <3')
  })

  it('collapses whitespace', () => {
    const result = prepareTextForLLM('<p>  Hello   World  </p>')
    expect(result).toBe('Hello World')
  })

  it('truncates long text with first/last halves', () => {
    const longText = '<p>' + 'A'.repeat(15000) + '</p>'
    const result = prepareTextForLLM(longText, 12000)
    expect(result.length).toBeLessThanOrEqual(12010) // allow for [...] marker
    expect(result).toContain('[...]')
  })

  it('does not truncate short text', () => {
    const result = prepareTextForLLM('<p>Short text</p>', 12000)
    expect(result).toBe('Short text')
    expect(result).not.toContain('[...]')
  })
})

// ── Response parsing (mirrors parseLLMResponse in Edge Function) ─────────────

interface ParsedItem {
  name: string
  category: string
  location_name: string | null
  description: string | null
}

function parseLLMResponse(responseText: string): ParsedItem[] {
  // Direct parse
  try {
    const parsed = JSON.parse(responseText)
    if (Array.isArray(parsed)) return mapItems(parsed)
  } catch { /* not pure JSON */ }

  // Extract JSON array from text
  const jsonMatch = responseText.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) return mapItems(parsed)
    } catch { /* malformed */ }
  }

  return []
}

function mapItems(items: unknown[]): ParsedItem[] {
  const validCategories = new Set(['restaurant', 'activity', 'hotel', 'transit', 'general'])
  return items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item => ({
      name: String(item.name || '').trim(),
      category: validCategories.has(String(item.category || '')) ? String(item.category) : 'general',
      location_name: item.location_name ? String(item.location_name).trim() : null,
      description: item.description ? String(item.description).slice(0, 200) : null,
    }))
    .filter(item => item.name.length >= 2)
}

describe('parseLLMResponse', () => {
  it('parses clean JSON array', () => {
    const json = JSON.stringify([
      { name: 'Forbidden City', category: 'activity', location_name: 'Beijing, China' },
      { name: 'Da Dong', category: 'restaurant', location_name: 'Beijing, China' },
    ])
    const result = parseLLMResponse(json)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Forbidden City')
    expect(result[1].category).toBe('restaurant')
  })

  it('extracts JSON from preamble text', () => {
    const response = `Here are the places I found:\n\n[{"name":"Temple of Heaven","category":"activity","location_name":"Beijing"}]`
    const result = parseLLMResponse(response)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Temple of Heaven')
  })

  it('returns empty array for non-JSON response', () => {
    const result = parseLLMResponse('I could not find any specific places in this article.')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for malformed JSON', () => {
    const result = parseLLMResponse('[{"name": "broken')
    expect(result).toHaveLength(0)
  })

  it('filters out items with empty names', () => {
    const json = JSON.stringify([
      { name: '', category: 'activity' },
      { name: 'Valid Place', category: 'activity' },
    ])
    const result = parseLLMResponse(json)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Valid Place')
  })

  it('defaults unknown categories to "general"', () => {
    const json = JSON.stringify([
      { name: 'Some Place', category: 'shopping' },
    ])
    const result = parseLLMResponse(json)
    expect(result[0].category).toBe('general')
  })

  it('handles location_name null gracefully', () => {
    const json = JSON.stringify([
      { name: 'A Place', category: 'activity', location_name: null },
    ])
    const result = parseLLMResponse(json)
    expect(result[0].location_name).toBeNull()
  })
})
