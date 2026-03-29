/**
 * Unit tests for the enrichment cache logic.
 * Tests query hash generation and cache behavior patterns.
 */
import { describe, it, expect } from 'vitest'

// ── Query hash generation (mirrors Edge Function logic) ──────────────────────

async function generateQueryHash(placeName: string, lat: number | null, lng: number | null): Promise<string> {
  const normalized = placeName.toLowerCase().trim()
  const key = lat !== null && lng !== null
    ? `${normalized}|${lat.toFixed(2)}|${lng.toFixed(2)}`
    : normalized
  const encoded = new TextEncoder().encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

describe('Query hash generation', () => {
  it('normalizes case', async () => {
    const h1 = await generateQueryHash('Ramen Ichiran', null, null)
    const h2 = await generateQueryHash('ramen ichiran', null, null)
    expect(h1).toBe(h2)
  })

  it('trims whitespace', async () => {
    const h1 = await generateQueryHash('Ramen Ichiran', null, null)
    const h2 = await generateQueryHash('  Ramen Ichiran  ', null, null)
    expect(h1).toBe(h2)
  })

  it('includes coordinates when provided', async () => {
    const h1 = await generateQueryHash('Ramen Ichiran', 35.68, 139.69)
    const h2 = await generateQueryHash('Ramen Ichiran', null, null)
    expect(h1).not.toBe(h2)
  })

  it('rounds coordinates to 2 decimal places (~1km precision)', async () => {
    // 35.6812 rounds to 35.68, 35.6849 also rounds to 35.68
    const h1 = await generateQueryHash('Ichiran', 35.6812, 139.6934)
    const h2 = await generateQueryHash('Ichiran', 35.6849, 139.6901)
    expect(h1).toBe(h2) // Same within ~1km
  })

  it('different locations produce different hashes', async () => {
    const h1 = await generateQueryHash('Ichiran', 35.68, 139.69) // Tokyo
    const h2 = await generateQueryHash('Ichiran', 34.69, 135.50) // Osaka
    expect(h1).not.toBe(h2)
  })

  it('produces a 64-char hex string (SHA-256)', async () => {
    const hash = await generateQueryHash('test', null, null)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ── Cache behavior patterns ──────────────────────────────────────────────────

describe('Cache behavior', () => {
  it('same place from slightly different coords should cache hit', async () => {
    // User A saves from coords 35.6812, 139.6934
    // User B saves from coords 35.6823, 139.6945 (50m away)
    // Both round to 35.68, 139.69 → same hash → cache hit
    const h1 = await generateQueryHash('Ichiran Shibuya', 35.6812, 139.6934)
    const h2 = await generateQueryHash('Ichiran Shibuya', 35.6823, 139.6945)
    expect(h1).toBe(h2)
  })

  it('same place name without coords caches by name alone', async () => {
    const h1 = await generateQueryHash('Kinkaku-ji', null, null)
    const h2 = await generateQueryHash('Kinkaku-ji', null, null)
    expect(h1).toBe(h2)
  })

  it('different place names always miss', async () => {
    const h1 = await generateQueryHash('Kinkaku-ji', 35.04, 135.73)
    const h2 = await generateQueryHash('Fushimi Inari', 34.97, 135.77)
    expect(h1).not.toBe(h2)
  })
})
