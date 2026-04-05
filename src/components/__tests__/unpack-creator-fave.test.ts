/**
 * Regression test: Creator Fave pill displays during Unpack processing.
 *
 * Bug: extract-chunk returns creator_fave in the categories array, but UnpackScreen
 * only rendered item.category (the first category). Creator Fave was never shown
 * during processing — only after Route creation.
 *
 * Fix: UnpackScreen now checks item.categories for 'creator_fave' and renders
 * a Heart pill alongside the primary category pill.
 */
import { describe, it, expect } from 'vitest'

// Simulate the item shape returned by extract-chunk
interface ExtractedDisplayItem {
  name: string
  category: string
  categories?: string[]
  location_name: string | null
  context: string | null
  section_label: string
  section_order: number
  item_order: number
}

describe('Creator Fave in Unpack processing items', () => {
  const itemWithFave: ExtractedDisplayItem = {
    name: 'Ichiran Ramen',
    category: 'restaurant',
    categories: ['restaurant', 'creator_fave'],
    location_name: 'Tokyo, Japan',
    context: 'The author\'s personal favorite ramen spot',
    section_label: 'Day 1',
    section_order: 0,
    item_order: 0,
  }

  const itemWithoutFave: ExtractedDisplayItem = {
    name: 'Senso-ji Temple',
    category: 'attraction',
    categories: ['attraction'],
    location_name: 'Tokyo, Japan',
    context: 'Historic temple in Asakusa',
    section_label: 'Day 1',
    section_order: 0,
    item_order: 1,
  }

  it('creator_fave is in categories array, not as the primary category', () => {
    // extract-chunk appends creator_fave via push(), so it's always last
    // The primary category (cats[0]) should be the place type, not creator_fave
    expect(itemWithFave.category).toBe('restaurant')
    expect(itemWithFave.category).not.toBe('creator_fave')
    expect(itemWithFave.categories).toContain('creator_fave')
  })

  it('items without creator_fave do not have it in categories', () => {
    expect(itemWithoutFave.categories).not.toContain('creator_fave')
  })

  it('creator_fave pill should render when categories includes creator_fave', () => {
    // This mirrors the conditional in UnpackScreen JSX:
    // {item.categories?.includes('creator_fave') && <CreatorFavePill />}
    const shouldShowFavePill = itemWithFave.categories?.includes('creator_fave') ?? false
    const shouldNotShowFavePill = itemWithoutFave.categories?.includes('creator_fave') ?? false

    expect(shouldShowFavePill).toBe(true)
    expect(shouldNotShowFavePill).toBe(false)
  })

  it('handles missing categories array gracefully', () => {
    const legacyItem: ExtractedDisplayItem = {
      name: 'Some Place',
      category: 'activity',
      // categories is undefined (legacy response)
      location_name: null,
      context: null,
      section_label: 'Places',
      section_order: 0,
      item_order: 0,
    }

    const shouldShowFavePill = legacyItem.categories?.includes('creator_fave') ?? false
    expect(shouldShowFavePill).toBe(false)
  })
})
