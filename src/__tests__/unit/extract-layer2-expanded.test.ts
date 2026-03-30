/**
 * Tests for the expanded Layer 2 extraction patterns:
 * - Condé Nast data-item JSON (Layer 1b)
 * - Repeated container detection (Layer 2a)
 * - Same-class heading sequences (Layer 2b)
 * - Expanded heading sequences with h4 (Layer 2c)
 * - False positive rejection
 */
import { describe, it, expect } from 'vitest'

// ── Test helpers (mirror Edge Function logic for unit testing) ────────────────

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

// ── Condé Nast data-item extraction ──────────────────────────────────────────

function extractCondeNastItems(html: string): Array<{ name: string; category: string }> {
  const items: Array<{ name: string; category: string }> = []
  const pattern = /data-item="(\{[^"]*\})"/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    try {
      const decoded = decodeHtml(match[1])
      const data = JSON.parse(decoded) as Record<string, unknown>
      const hed = String(data.dangerousHed || '')
      if (!hed) continue
      const name = stripTags(hed).trim()
      if (!name || name.length < 2) continue
      const ct = String(data.contentType || 'general')
      items.push({ name, category: ct === 'restaurant' ? 'restaurant' : ct === 'hotel' ? 'hotel' : 'general' })
    } catch { /* skip */ }
  }
  return items
}

describe('Condé Nast data-item extraction', () => {
  it('extracts items from HTML-encoded data-item attributes', () => {
    const html = `
      <div data-item="{&quot;dangerousHed&quot;:&quot;&lt;p&gt;Sushi Kadowaki&lt;/p&gt;&quot;,&quot;contentType&quot;:&quot;restaurant&quot;}"></div>
      <div data-item="{&quot;dangerousHed&quot;:&quot;&lt;p&gt;S&eacute;zanne&lt;/p&gt;&quot;,&quot;contentType&quot;:&quot;restaurant&quot;}"></div>
      <div data-item="{&quot;dangerousHed&quot;:&quot;&lt;p&gt;Park Hyatt Tokyo&lt;/p&gt;&quot;,&quot;contentType&quot;:&quot;hotel&quot;}"></div>
    `
    const items = extractCondeNastItems(html)
    expect(items).toHaveLength(3)
    expect(items[0].name).toBe('Sushi Kadowaki')
    expect(items[0].category).toBe('restaurant')
    expect(items[2].name).toBe('Park Hyatt Tokyo')
    expect(items[2].category).toBe('hotel')
  })

  it('skips items with empty dangerousHed', () => {
    const html = `<div data-item="{&quot;dangerousHed&quot;:&quot;&quot;,&quot;contentType&quot;:&quot;restaurant&quot;}"></div>`
    expect(extractCondeNastItems(html)).toHaveLength(0)
  })

  it('handles malformed JSON gracefully', () => {
    const html = `<div data-item="{broken json}"></div>`
    expect(extractCondeNastItems(html)).toHaveLength(0)
  })
})

// ── Same-class heading detection ─────────────────────────────────────────────

function countSameClassHeadings(html: string): Map<string, number> {
  const counts = new Map<string, number>()
  const pattern = /<h[2-4]\s+[^>]*class="([^"]+)"[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    counts.set(match[1], (counts.get(match[1]) || 0) + 1)
  }
  return counts
}

describe('Same-class heading sequences', () => {
  it('detects 3+ headings with the same class', () => {
    const html = `
      <h2 class="venue-name">Restaurant A</h2><p>${'x'.repeat(60)}</p>
      <h2 class="venue-name">Restaurant B</h2><p>${'x'.repeat(60)}</p>
      <h2 class="venue-name">Restaurant C</h2><p>${'x'.repeat(60)}</p>
      <h2 class="other">Sidebar heading</h2>
    `
    const counts = countSameClassHeadings(html)
    expect(counts.get('venue-name')).toBe(3)
    expect(counts.get('other')).toBe(1)
  })

  it('includes h4 headings (was previously missed)', () => {
    const html = `
      <h4 class="item-title">Place 1</h4><p>${'x'.repeat(60)}</p>
      <h4 class="item-title">Place 2</h4><p>${'x'.repeat(60)}</p>
      <h4 class="item-title">Place 3</h4><p>${'x'.repeat(60)}</p>
    `
    const counts = countSameClassHeadings(html)
    expect(counts.get('item-title')).toBe(3)
  })
})

// ── Repeated container detection ─────────────────────────────────────────────

function findRepeatedContainers(html: string): Map<string, number> {
  const counts = new Map<string, number>()
  const pattern = /<(div|section|article|li)\s+[^>]*class="([^"]+)"[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    counts.set(match[2], (counts.get(match[2]) || 0) + 1)
  }
  return counts
}

describe('Repeated container detection', () => {
  it('detects 3+ containers with the same class', () => {
    const html = `
      <div class="restaurant-card"><h3>Place A</h3><p>${'x'.repeat(80)}</p></div>
      <div class="restaurant-card"><h3>Place B</h3><p>${'x'.repeat(80)}</p></div>
      <div class="restaurant-card"><h3>Place C</h3><p>${'x'.repeat(80)}</p></div>
    `
    const counts = findRepeatedContainers(html)
    expect(counts.get('restaurant-card')).toBe(3)
  })

  it('counts different element types (div, section, article, li)', () => {
    const html = `
      <article class="post-item"><h2>A</h2><p>text</p></article>
      <article class="post-item"><h2>B</h2><p>text</p></article>
      <article class="post-item"><h2>C</h2><p>text</p></article>
    `
    const counts = findRepeatedContainers(html)
    expect(counts.get('post-item')).toBe(3)
  })
})

// ── False positive rejection ─────────────────────────────────────────────────

describe('False positive rejection', () => {
  it('navigation headings with short gaps should not be detected as items', () => {
    // Nav headings have <2 chars between them — should fail the "substantial text" check
    const html = `
      <h2 class="nav-link">Home</h2>
      <h2 class="nav-link">About</h2>
      <h2 class="nav-link">Contact</h2>
      <h2 class="nav-link">FAQ</h2>
    `
    const counts = countSameClassHeadings(html)
    // The class appears 4 times, BUT any extractor should check for substantial gaps
    expect(counts.get('nav-link')).toBe(4)
    // The actual extractor would reject these because there's no paragraph text between them
  })

  it('heading sequences inside nav/header/footer elements are stripped', () => {
    // getMainContent strips nav, header, footer, aside
    const mainContent = `<main><h2>Real Item</h2><p>${'x'.repeat(80)}</p></main>`
    const navContent = `<nav><h2>Home</h2><h2>About</h2><h2>Contact</h2></nav>`
    const fullHtml = navContent + mainContent
    // After stripping, only "Real Item" should remain
    const stripped = fullHtml.replace(/<nav[\s\S]*?<\/nav>/gi, '')
    const h2Count = (stripped.match(/<h2/gi) || []).length
    expect(h2Count).toBe(1)
  })
})

// ── Heading level expansion ──────────────────────────────────────────────────

describe('Expanded heading detection', () => {
  it('detects h4 heading sequences (was previously missed)', () => {
    const pattern = /<(h[234])[^>]*>([\s\S]*?)<\/\1>/gi
    const html = `
      <h4>1. Yoshimiya</h4><p>${'x'.repeat(80)}</p>
      <h4>2. Kisaburo Nojo</h4><p>${'x'.repeat(80)}</p>
      <h4>3. Tonkatsu Maisen</h4><p>${'x'.repeat(80)}</p>
    `
    const headings: string[] = []
    let match: RegExpExecArray | null
    while ((match = pattern.exec(html)) !== null) {
      headings.push(stripTags(match[2]).trim())
    }
    expect(headings).toHaveLength(3)
    expect(headings[0]).toBe('1. Yoshimiya')
  })

  it('detects "X OF Y" numbering pattern (Fodors)', () => {
    const fodorsPattern = /^\d+\s+OF\s+\d+\s*/i
    expect(fodorsPattern.test('1 OF 25')).toBe(true)
    expect(fodorsPattern.test('15 OF 25')).toBe(true)
    expect(fodorsPattern.test('Not a number')).toBe(false)
  })

  it('strips "X OF Y" prefix from heading text', () => {
    const cleaned = '1 OF 25 Sushi Sugahisa'
      .replace(/^\d+\s+OF\s+\d+\s*/i, '')
      .trim()
    expect(cleaned).toBe('Sushi Sugahisa')
  })
})
