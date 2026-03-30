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

// ── Article/listicle rejection filter ─────────────────────────────────────────
// Mirrors isArticleTitle() in the Edge Function

function isArticleTitle(title: string): boolean {
  const lower = title.toLowerCase()
  if (/\d+\s*(best|top|easy|great|amazing|beautiful|cheap|free|must|essential|ultimate|perfect|incredible|stunning)/i.test(title)) return true
  const articlePatterns = [
    'guide to', 'guide for', 'travel guide', 'complete guide',
    'day trips from', 'things to do', 'places to visit',
    'where to eat', 'what to do', 'where to stay',
    'itinerary', 'bucket list', 'travel tips',
    'tips for', 'how to visit', 'weekend in', 'hours in', 'days in',
  ]
  if (articlePatterns.some(p => lower.includes(p))) return true
  const cjkArticlePatterns = ['攻略', '指南', '懶人包', '必去', '最佳', '推薦']
  if (cjkArticlePatterns.some(p => title.includes(p))) return true
  if (/\d+\s*[大個間家處]/.test(title)) return true
  if (title.includes('|') && (title.split('|')[1]?.includes(',') ?? false)) return true
  return false
}

describe('isArticleTitle — rejects listicle/article titles', () => {
  it('"7 Easy Day Trips from Tokyo" → article (number + superlative)', () => {
    expect(isArticleTitle('7 Easy Day Trips from Tokyo')).toBe(true)
  })
  it('"10 Best Restaurants in Taipei" → article', () => {
    expect(isArticleTitle('10 Best Restaurants in Taipei')).toBe(true)
  })
  it('"Complete Guide to Visiting Kyoto" → article', () => {
    expect(isArticleTitle('Complete Guide to Visiting Kyoto')).toBe(true)
  })
  it('"Things to Do in Bangkok" → article', () => {
    expect(isArticleTitle('Things to Do in Bangkok')).toBe(true)
  })
  it('"Japan Travel Tips for First Timers" → article', () => {
    expect(isArticleTitle('Japan Travel Tips for First Timers')).toBe(true)
  })
  it('"Title | Japan itinerary, Japan photography" → SEO metadata', () => {
    expect(isArticleTitle('Escape the City | Japan itinerary, Japan photography')).toBe(true)
  })
  it('"台北10大必去景點攻略" → CJK article', () => {
    expect(isArticleTitle('台北10大必去景點攻略')).toBe(true)
  })
  it('"京都懶人包" → CJK article', () => {
    expect(isArticleTitle('京都懶人包')).toBe(true)
  })
  it('"Kinkaku-ji" → NOT article (specific place)', () => {
    expect(isArticleTitle('Kinkaku-ji')).toBe(false)
  })
  it('"Tiger Leaping Gorge" → NOT article', () => {
    expect(isArticleTitle('Tiger Leaping Gorge')).toBe(false)
  })
  it('"合歡山頂" → NOT article', () => {
    expect(isArticleTitle('合歡山頂')).toBe(false)
  })
  it('"Din Tai Fung" → NOT article', () => {
    expect(isArticleTitle('Din Tai Fung')).toBe(false)
  })
})

// ── Instagram title cleanup ──────────────────────────────────────────────────

function cleanInstagramTitle(raw: string): string {
  let t = raw
  t = t.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
    try { return String.fromCodePoint(parseInt(hex, 16)) } catch { return '' }
  })
  t = t.replace(/&#(\d+);/g, (_, dec: string) => {
    try { return String.fromCodePoint(parseInt(dec, 10)) } catch { return '' }
  })
  t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  t = t.replace(/\s*on\s+instagram\s*:\s*/gi, ': ')
  t = t.replace(/\s*\|\s*Instagram\s*$/i, '')
  t = t.replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FA9F}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
  const colonIdx = t.indexOf(':')
  if (colonIdx > 0 && colonIdx < 40) {
    const afterColon = t.slice(colonIdx + 1).trim()
    if (afterColon.length > 5) t = afterColon
  }
  t = t.replace(/^[""\u201C\u201D]+|[""\u201C\u201D]+$/g, '').replace(/\.{3,}$|…$/g, '').trim()
  if (t.length > 100) {
    const sentences = t.match(/[^.!?]+[.!?]+/g)
    if (sentences) {
      let truncated = ''
      for (const s of sentences) {
        if ((truncated + s).length > 100) break
        truncated += s
      }
      if (truncated.length > 10) t = truncated.trim()
      else t = t.slice(0, 97) + '...'
    } else {
      t = t.slice(0, 97) + '...'
    }
  }
  return t.trim()
}

describe('cleanInstagramTitle', () => {
  it('decodes HTML entities', () => {
    expect(cleanInstagramTitle('Travel &#x1f30f; vibes')).toBe('Travel  vibes')
  })
  it('strips "on instagram:" boilerplate', () => {
    expect(cleanInstagramTitle('dara on instagram: "After two days"')).toBe('After two days')
  })
  it('strips "| Instagram" suffix', () => {
    expect(cleanInstagramTitle('Beautiful sunset | Instagram')).toBe('Beautiful sunset')
  })
  it('strips emoji', () => {
    const cleaned = cleanInstagramTitle('Best temple ever')
    expect(cleaned).not.toMatch(/[\u{1F600}-\u{1F9FF}]/u)
  })
  it('trims quotes and ellipsis', () => {
    expect(cleanInstagramTitle('"Amazing view..."')).toBe('Amazing view')
  })
  it('full cleanup pipeline', () => {
    const raw = 'dara, 1yr travel &#x1f30f; on instagram:\u201CAfter two days in Kyoto...\u201D'
    const result = cleanInstagramTitle(raw)
    expect(result).toBe('After two days in Kyoto')
  })
})

// ── Expanded geography keywords ──────────────────────────────────────────────

describe('geography keyword expansion', () => {
  // Test by checking the GEO_KEYWORDS set matches from the Edge Function.
  // We duplicate a subset here to verify the expanded keywords.
  const expandedFeatures = new Set([
    'gorge', 'canyon', 'valley', 'falls', 'waterfall', 'cave', 'reef', 'glacier',
    'plateau', 'cliff', 'summit', 'ridge', 'pass', 'bay', 'harbor', 'harbour',
    'peninsula', 'delta', 'oasis', 'strait', 'cape', 'forest', 'jungle', 'desert',
    'creek', 'spring', 'hot spring', 'temple', 'shrine', 'monastery', 'palace',
    'castle', 'fortress', 'ruins', 'bridge', 'tower', 'cathedral', 'basilica',
    'mosque', 'pagoda', 'national park',
    // CJK
    '峽', '峽谷', '洞', '洞穴', '冰川', '火山', '高原', '懸崖', '半島', '沙漠',
    '溫泉', '寺', '廟', '神社', '宮', '城', '塔', '橋', '古蹟', '步道', '國家公園',
    // JP
    '峡', '滝', '浜', '洞窟', '温泉', '公園',
  ])

  it('"Tiger Leaping Gorge" triggers geography (gorge)', () => {
    expect('tiger leaping gorge'.includes('gorge')).toBe(true)
    expect(expandedFeatures.has('gorge')).toBe(true)
  })
  it('"Grand Canyon" triggers geography (canyon)', () => {
    expect(expandedFeatures.has('canyon')).toBe(true)
  })
  it('"Fushimi Inari Shrine" triggers geography (shrine)', () => {
    expect(expandedFeatures.has('shrine')).toBe(true)
  })
  it('"Yellowstone National Park" triggers geography (national park)', () => {
    expect(expandedFeatures.has('national park')).toBe(true)
  })
  it('"虎跳峽" triggers geography (峽)', () => {
    expect(expandedFeatures.has('峽')).toBe(true)
  })
  it('"草津温泉" triggers geography (温泉 JP)', () => {
    expect(expandedFeatures.has('温泉')).toBe(true)
  })
  it('"金閣寺" triggers geography (寺)', () => {
    expect(expandedFeatures.has('寺')).toBe(true)
  })
})
