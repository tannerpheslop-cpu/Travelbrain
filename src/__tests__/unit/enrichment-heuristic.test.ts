/**
 * Unit tests for the enrichment heuristic:
 * - Keyword extraction (EN + CN filler stripping)
 * - Confidence check (specific POI vs broad area)
 */
import { describe, it, expect } from 'vitest'

// ── Keyword extraction (mirrors Edge Function logic) ─────────────────────────

const EN_FILLER = new Set([
  'epic', 'best', 'amazing', 'ultimate', 'guide', 'top', 'vlog', 'trip', 'travel',
  'day', 'days', 'we', 'i', 'my', 'our', 'the', 'a', 'an', 'to', 'in', 'at', 'of',
  'for', 'how', 'what', 'why', 'watch', 'must', 'see', 'visit', 'try', 'go', 'went',
  'this', 'that', 'it', 'so', 'very', 'really', 'just', 'got', 'get', 'most', 'worst',
  'part', 'review', 'tour', 'exploring', 'explore', 'discovered', 'finding', 'found',
])

const CN_FILLER = new Set([
  '我們', '我', '你', '最', '的', '了', '這', '那', '只為了', '為了', '拍', '上', '去',
  '來', '很', '超', '真的', '終於', '竟然', '居然', '一定要', '好', '太', '又', '都',
  '就', '也', '還', '在', '是', '有', '沒', '不', '吧', '嗎', '呢', '啊', '吃',
])

function extractPlaceKeywords(title: string): string {
  let cleaned = title
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
    .replace(/^\d+[\.\)\-:\s]+/, '')
    .trim()

  const enWords = cleaned.split(/\s+/).filter(w => {
    const lower = w.toLowerCase().replace(/[^a-z]/g, '')
    return lower.length > 0 && !EN_FILLER.has(lower)
  })

  let cnCleaned = cleaned
  for (const filler of CN_FILLER) {
    cnCleaned = cnCleaned.split(filler).join('')
  }

  const enResult = enWords.join(' ').trim()
  const cnResult = cnCleaned.replace(/[，。！？、：；\s]+/g, ' ').trim()

  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(title)
  const result = hasCJK ? cnResult : enResult

  return result.length >= 2 ? result : ''
}

describe('extractPlaceKeywords', () => {
  it('strips English filler from travel title', () => {
    const result = extractPlaceKeywords('We Hiked to the Top of Mount Siguniang - EPIC 4 Day Trek')
    expect(result).toContain('Hiked')
    expect(result).toContain('Mount')
    expect(result).toContain('Siguniang')
    expect(result).not.toContain('EPIC')
    expect(result).not.toContain('the')
  })

  it('strips Chinese filler from travel title', () => {
    const result = extractPlaceKeywords('只為了拍台灣最美的桌布，我們爬上合歡山頂')
    expect(result).toContain('台灣')
    expect(result).toContain('合歡山')
    expect(result).not.toContain('只為了')
    expect(result).not.toContain('我們')
  })

  it('strips emoji', () => {
    const result = extractPlaceKeywords('Mount Fuji sunrise 🏔️🌅 amazing trek')
    expect(result).not.toMatch(/[🏔️🌅]/)
    expect(result).toContain('Mount')
    expect(result).toContain('Fuji')
  })

  it('strips leading numbers', () => {
    const result = extractPlaceKeywords('10 Best Restaurants in Tokyo')
    expect(result).not.toMatch(/^10/)
    expect(result).toContain('Restaurants')
    expect(result).toContain('Tokyo')
  })

  it('preserves place names through filler stripping', () => {
    expect(extractPlaceKeywords('Kinkaku-ji')).toBe('Kinkaku-ji')
    expect(extractPlaceKeywords('Din Tai Fung')).toBe('Din Tai Fung')
  })

  it('returns empty for titles with only filler words', () => {
    expect(extractPlaceKeywords('My Amazing Travel Vlog Day 3')).toBe('')
  })

  it('handles Japanese text', () => {
    const result = extractPlaceKeywords('東京タワーに行ってきた')
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain('東京タワー')
  })
})

// ── Confidence check (specific POI vs broad area) ────────────────────────────

function isSpecificPlace(types: string[]): boolean {
  const broadTypes = new Set([
    'locality', 'administrative_area_level_1', 'administrative_area_level_2',
    'administrative_area_level_3', 'country', 'continent', 'sublocality',
    'sublocality_level_1', 'neighborhood', 'postal_code', 'political',
    'geocode', 'route', 'colloquial_area',
  ])
  return types.some(t => !broadTypes.has(t))
}

// ── Title geography detection ────────────────────────────────────────────────

const GEO_KEYWORDS = new Set([
  'japan', 'taiwan', 'china', 'korea', 'thailand', 'vietnam', 'tokyo', 'osaka',
  'kyoto', 'taipei', 'beijing', 'shanghai', 'hong kong', 'bangkok', 'seoul',
  'paris', 'london', 'rome', 'bali', 'mountain', 'mount', 'lake', 'island',
  '台灣', '日本', '中國', '東京', '台北', '香港', '山', '湖', '島',
])

function titleContainsGeography(title: string): boolean {
  const lower = title.toLowerCase()
  for (const keyword of GEO_KEYWORDS) {
    if (lower.includes(keyword)) return true
  }
  return false
}

describe('titleContainsGeography', () => {
  it('detects English country name', () => {
    expect(titleContainsGeography('Amazing Food in Thailand')).toBe(true)
  })

  it('detects Chinese country name', () => {
    expect(titleContainsGeography('只為了拍台灣最美的桌布')).toBe(true)
  })

  it('detects Chinese geographic feature (山)', () => {
    expect(titleContainsGeography('我們爬上合歡山頂')).toBe(true)
  })

  it('detects English city name', () => {
    expect(titleContainsGeography('Best Ramen in Tokyo')).toBe(true)
  })

  it('detects "mountain" keyword', () => {
    expect(titleContainsGeography('Hiking Mount Siguniang')).toBe(true)
  })

  it('returns false for non-geographic titles', () => {
    expect(titleContainsGeography('My Morning Routine')).toBe(false)
    expect(titleContainsGeography('How to Pack Light')).toBe(false)
  })
})

describe('isSpecificPlace', () => {
  it('restaurant is specific', () => {
    expect(isSpecificPlace(['restaurant', 'food', 'point_of_interest', 'establishment'])).toBe(true)
  })

  it('tourist_attraction is specific', () => {
    expect(isSpecificPlace(['tourist_attraction', 'point_of_interest', 'establishment'])).toBe(true)
  })

  it('hotel is specific', () => {
    expect(isSpecificPlace(['lodging', 'point_of_interest', 'establishment'])).toBe(true)
  })

  it('park is specific', () => {
    expect(isSpecificPlace(['park', 'point_of_interest'])).toBe(true)
  })

  it('city (locality) is NOT specific', () => {
    expect(isSpecificPlace(['locality', 'political'])).toBe(false)
  })

  it('country is NOT specific', () => {
    expect(isSpecificPlace(['country', 'political'])).toBe(false)
  })

  it('administrative area is NOT specific', () => {
    expect(isSpecificPlace(['administrative_area_level_1', 'political'])).toBe(false)
  })

  it('neighborhood alone is NOT specific', () => {
    expect(isSpecificPlace(['neighborhood', 'political'])).toBe(false)
  })

  it('mixed: has both broad and specific → specific wins', () => {
    expect(isSpecificPlace(['restaurant', 'locality'])).toBe(true)
  })
})
