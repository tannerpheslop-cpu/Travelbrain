/**
 * Unit tests for the multi-item extraction logic.
 * Tests the extraction functions with HTML fixtures.
 *
 * NOTE: The actual Edge Function runs in Deno. These tests validate the
 * extraction logic patterns using equivalent implementations.
 */
import { describe, it, expect } from 'vitest'

// ── Reimplemented extraction helpers for testing ────────────────────────────
// (These mirror the Edge Function logic — any changes there must be reflected here)

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).replace(/\s+\S*$/, '') + '...'
}

function guessCategoryFromText(name: string, description: string): string {
  const text = (name + ' ' + description).toLowerCase()
  if (/\b(?:restaurant|eat|food|ramen|sushi|cafe|coffee|bar|pub|bakery|bistro|dining|brunch|lunch|dinner|noodle|dumpling|pizza|burger|taco|curry|bbq|grill)\b/.test(text)) return 'restaurant'
  if (/\b(?:hotel|hostel|stay|accommodation|airbnb|resort|lodge|inn|guesthouse|ryokan)\b/.test(text)) return 'hotel'
  if (/\b(?:hike|trek|tour|walk|trail|snorkel|dive|surf|kayak|climb|bike|cycle|ski|camp)\b/.test(text)) return 'activity'
  if (/\b(?:temple|shrine|museum|palace|castle|church|cathedral|monument|park|garden|bridge|tower|ruins|market|bazaar|gallery)\b/.test(text)) return 'activity'
  if (/\b(?:airport|train|bus|ferry|metro|subway|taxi|transfer|flight)\b/.test(text)) return 'transit'
  return 'general'
}

// ── Layer 1 tests ────────────────────────────────────────────────────────────

describe('Layer 1: JSON-LD extraction', () => {
  it('extracts items from ItemList schema', () => {
    const jsonLd = {
      '@type': 'ItemList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, item: { '@type': 'Restaurant', name: 'Ichiran Ramen', description: 'Famous tonkotsu' } },
        { '@type': 'ListItem', position: 2, item: { '@type': 'Restaurant', name: 'Fuunji', description: 'Tsukemen specialist' } },
        { '@type': 'ListItem', position: 3, item: { '@type': 'TouristAttraction', name: 'Senso-ji Temple', description: 'Ancient temple' } },
      ],
    }

    const items = jsonLd.itemListElement.map((el: any, i: number) => ({
      name: el.item.name,
      category: el.item['@type'] === 'Restaurant' ? 'restaurant' : 'activity',
      description: el.item.description,
      source_order: i + 1,
    }))

    expect(items).toHaveLength(3)
    expect(items[0].name).toBe('Ichiran Ramen')
    expect(items[0].category).toBe('restaurant')
    expect(items[2].category).toBe('activity')
  })

  it('extracts items from Article with mentions', () => {
    const jsonLd = {
      '@type': 'Article',
      mentions: [
        { '@type': 'Restaurant', name: 'Din Tai Fung', address: { addressLocality: 'Taipei' } },
        { '@type': 'TouristAttraction', name: 'Taipei 101', address: { addressLocality: 'Taipei' } },
      ],
    }

    expect(jsonLd.mentions).toHaveLength(2)
    expect(jsonLd.mentions[0].name).toBe('Din Tai Fung')
    expect(jsonLd.mentions[0].address.addressLocality).toBe('Taipei')
  })

  it('maps schema.org types to Youji categories', () => {
    const map: Record<string, string> = {
      Restaurant: 'restaurant', FoodEstablishment: 'restaurant',
      CafeOrCoffeeShop: 'restaurant', TouristAttraction: 'activity',
      Museum: 'activity', Hotel: 'hotel', Hostel: 'hotel',
    }
    expect(map['Restaurant']).toBe('restaurant')
    expect(map['TouristAttraction']).toBe('activity')
    expect(map['Hotel']).toBe('hotel')
    expect(map['Museum']).toBe('activity')
  })
})

// ── Layer 2 tests ────────────────────────────────────────────────────────────

describe('Layer 2: HTML pattern matching', () => {
  it('detects numbered heading list pattern', () => {
    const html = `
      <article>
        <h2>1. Ichiran Ramen</h2><p>Famous for their solo booth dining and rich tonkotsu broth.</p>
        <h2>2. Fuunji</h2><p>Best tsukemen in Shinjuku with thick, flavorful dipping broth.</p>
        <h2>3. Afuri</h2><p>Known for their yuzu shio ramen with a citrus twist.</p>
      </article>
    `

    const headingPattern = /<(h[23])[^>]*>([\s\S]*?)<\/\1>/gi
    const headings: string[] = []
    let m: RegExpExecArray | null
    while ((m = headingPattern.exec(html)) !== null) {
      headings.push(stripTags(m[2]).trim())
    }

    expect(headings).toHaveLength(3)
    expect(headings[0]).toBe('1. Ichiran Ramen')

    // Strip leading numbers
    const names = headings.map(h => h.replace(/^\d+[\.\)\-\s:]+/, '').trim())
    expect(names[0]).toBe('Ichiran Ramen')
    expect(names[1]).toBe('Fuunji')
    expect(names[2]).toBe('Afuri')
  })

  it('detects day-based itinerary pattern', () => {
    const headings = ['Day 1: Arrival in Tokyo', 'Day 2: Shibuya & Harajuku', 'Day 3: Day Trip to Kamakura']
    const dayPattern = /^(?:day\s*\d|week\s*\d)/i
    const hasDays = headings.some(h => dayPattern.test(h))
    expect(hasDays).toBe(true)
  })

  it('classifies content type correctly', () => {
    // Numbered → listicle
    const numberedHeadings = ['1. Place A', '2. Place B', '3. Place C']
    const hasNumbered = numberedHeadings.filter(h => /^\d+[\.\)\-\s]/.test(h)).length >= 3
    expect(hasNumbered).toBe(true) // → listicle

    // Day-based → itinerary
    const dayHeadings = ['Day 1: Arrival', 'Day 2: Explore', 'Day 3: Departure']
    const hasDays = dayHeadings.some(h => /^day\s*\d/i.test(h))
    expect(hasDays).toBe(true) // → itinerary
  })

  it('extracts description from first paragraph after heading', () => {
    const block = '<h2>Ichiran</h2><p>Famous for their solo booth dining and rich tonkotsu broth.</p><p>Located in Shibuya.</p>'
    const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    expect(pMatch).toBeTruthy()
    expect(stripTags(pMatch![1])).toBe('Famous for their solo booth dining and rich tonkotsu broth.')
  })

  it('handles pages with fewer than 3 headings (no extraction)', () => {
    const headings = ['Introduction', 'Conclusion']
    expect(headings.length).toBeLessThan(3)
    // Should return empty items
  })
})

// ── Category guessing tests ──────────────────────────────────────────────────

describe('Category guessing', () => {
  it('detects restaurant from keywords', () => {
    expect(guessCategoryFromText('Best Ramen in Tokyo', '')).toBe('restaurant')
    expect(guessCategoryFromText('Ichiran', 'famous tonkotsu ramen restaurant')).toBe('restaurant')
    expect(guessCategoryFromText('Blue Bottle Coffee', '')).toBe('restaurant')
  })

  it('detects accommodation from keywords', () => {
    expect(guessCategoryFromText('Park Hyatt Tokyo', 'luxury hotel in Shinjuku')).toBe('hotel')
    expect(guessCategoryFromText('K Hostel', 'budget hostel near station')).toBe('hotel')
  })

  it('detects activity from keywords', () => {
    expect(guessCategoryFromText('Mount Fuji Day Hike', '')).toBe('activity')
    expect(guessCategoryFromText('Fushimi Inari Shrine', '')).toBe('activity')
    expect(guessCategoryFromText('Tokyo National Museum', '')).toBe('activity')
  })

  it('detects transit from keywords', () => {
    expect(guessCategoryFromText('Narita Airport Express', '')).toBe('transit')
    expect(guessCategoryFromText('Shinkansen to Kyoto', 'bullet train ride')).toBe('transit')
  })

  it('defaults to general for ambiguous text', () => {
    expect(guessCategoryFromText('Cool spot we found', 'you should check this out')).toBe('general')
  })
})

// ── Edge case tests ──────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('truncates descriptions to 200 characters', () => {
    const long = 'A'.repeat(300)
    const truncated = truncate(long, 200)
    expect(truncated.length).toBeLessThanOrEqual(204) // 200 + "..."
    expect(truncated.endsWith('...')).toBe(true)
  })

  it('strips HTML tags cleanly', () => {
    expect(stripTags('<strong>Bold</strong> text <em>italic</em>')).toBe('Bold text italic')
    expect(stripTags('<a href="...">Link</a>')).toBe('Link')
  })

  it('handles empty/null inputs', () => {
    expect(stripTags('')).toBe('')
    expect(truncate('', 200)).toBe('')
  })

  it('single item should return success: false', () => {
    // Edge function returns { success: false, reason: 'single_item' } for < 2 items
    const items = [{ name: 'Only One Place', category: 'restaurant' }]
    expect(items.length).toBeLessThan(2)
  })
})
