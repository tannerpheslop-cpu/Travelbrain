/**
 * Utilities for reading and displaying item tags.
 *
 * During the transition from single `saved_items.category` to `item_tags`,
 * this module provides a unified way to get display tags for an item with
 * backwards compatibility: if an item has no item_tags rows, fall back to
 * the old category column.
 */
import type { Category } from '../types'

export const categoryLabel: Record<Category, string> = {
  restaurant: 'Food',
  activity: 'Activity',
  hotel: 'Stay',
  transit: 'Transit',
  general: 'General',
}

export const categoryFromLabel: Record<string, Category> = {
  'Food': 'restaurant',
  'Activity': 'activity',
  'Stay': 'hotel',
  'Transit': 'transit',
  'General': 'general',
}

/** The category labels shown as pills (excludes General) */
export const CATEGORY_TAG_LABELS = ['Food', 'Activity', 'Stay', 'Transit'] as const

/** All category values (excludes general) */
export const CATEGORY_VALUES: Category[] = ['restaurant', 'activity', 'hotel', 'transit']

/**
 * Check if a tag label is a category tag (vs custom tag).
 */
export function isCategoryTag(tagName: string): boolean {
  return tagName in categoryFromLabel || CATEGORY_VALUES.includes(tagName as Category)
}

/**
 * Normalize a tag name for display. Category values get mapped to labels.
 */
export function displayTagName(tagName: string): string {
  const cat = tagName as Category
  if (cat in categoryLabel && cat !== 'general') {
    return categoryLabel[cat]
  }
  return tagName
}

export interface DisplayTag {
  name: string       // display name (e.g. "Food", "Must Try")
  type: 'category' | 'custom'
  raw: string        // raw tag_name from DB (e.g. "restaurant", "Must Try")
}

/**
 * Get display tags for an item.
 *
 * If itemTags (from item_tags table) is provided and non-empty, use those.
 * Otherwise, fall back to the saved_items.category column.
 *
 * @param itemTags - Tags from the item_tags table (may be undefined during loading)
 * @param fallbackCategory - The old category column value
 * @param fallbackTags - The old tags array column value
 */
export function getItemDisplayTags(
  itemTags: Array<{ tag_name: string; tag_type: string }> | undefined,
  fallbackCategory: Category,
  fallbackTags?: string[] | null,
): DisplayTag[] {
  // If we have item_tags data, use it
  if (itemTags && itemTags.length > 0) {
    return itemTags.map((t) => ({
      name: displayTagName(t.tag_name),
      type: t.tag_type === 'category' ? 'category' : 'custom',
      raw: t.tag_name,
    }))
  }

  // Fallback to old columns
  const tags: DisplayTag[] = []

  if (fallbackCategory && fallbackCategory !== 'general') {
    tags.push({
      name: categoryLabel[fallbackCategory],
      type: 'category',
      raw: fallbackCategory,
    })
  }

  if (fallbackTags) {
    for (const t of fallbackTags) {
      tags.push({
        name: t,
        type: 'custom',
        raw: t,
      })
    }
  }

  return tags
}
