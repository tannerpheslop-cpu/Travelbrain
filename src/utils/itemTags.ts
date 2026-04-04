/**
 * Utilities for reading and displaying item tags.
 *
 * During the transition from single `saved_items.category` to `item_tags`,
 * this module provides a unified way to get display tags for an item with
 * backwards compatibility: if an item has no item_tags rows, fall back to
 * the old category column.
 */
import type { Category } from '../types'
import { SYSTEM_CATEGORIES, getCategoryLabel, isSystemCategory, LEGACY_CATEGORY_MAP } from '../lib/categories'

/**
 * Map ANY category value (system or legacy) to a display label.
 * System categories use their canonical label; legacy values are mapped
 * through LEGACY_CATEGORY_MAP first, then labelled.
 */
export const categoryLabel: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  // System categories
  for (const cat of SYSTEM_CATEGORIES) {
    map[cat.tagName] = cat.label
  }
  // Legacy values map to their system equivalent's label
  for (const [legacy, system] of Object.entries(LEGACY_CATEGORY_MAP)) {
    if (!(legacy in map)) {
      map[legacy] = getCategoryLabel(system)
    }
  }
  // Fallback legacy values with no mapping
  map['other'] = 'Other'
  map['general'] = 'General'
  return map
})()

/**
 * Reverse map: display label → canonical system tag name.
 */
export const categoryFromLabel: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const cat of SYSTEM_CATEGORIES) {
    map[cat.label] = cat.tagName
  }
  // Keep legacy label → value entries that don't collide
  map['Other'] = 'other'
  map['General'] = 'general'
  return map
})()

/** The category labels shown as filter pills (12 system categories) */
export const CATEGORY_TAG_LABELS = SYSTEM_CATEGORIES.map(c => c.label)

/** All current system category tag names */
export const CATEGORY_VALUES = SYSTEM_CATEGORIES.map(c => c.tagName)

/**
 * Check if a tag label is a category tag (vs custom tag).
 */
export function isCategoryTag(tagName: string): boolean {
  return isSystemCategory(tagName) || tagName in LEGACY_CATEGORY_MAP || tagName in categoryFromLabel
}

/**
 * Normalize a tag name for display. Category values get mapped to labels.
 */
export function displayTagName(tagName: string): string {
  // System category
  if (isSystemCategory(tagName)) return getCategoryLabel(tagName)
  // Legacy category → map to system label
  const mapped = LEGACY_CATEGORY_MAP[tagName]
  if (mapped) return getCategoryLabel(mapped)
  // Skip generic fallbacks
  if (tagName === 'general' || tagName === 'other') return tagName
  return tagName
}

export interface DisplayTag {
  name: string       // display name (e.g. "Restaurant", "Must Try")
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

  if (fallbackCategory && fallbackCategory !== 'general' && fallbackCategory !== 'other') {
    tags.push({
      name: categoryLabel[fallbackCategory] ?? fallbackCategory,
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
