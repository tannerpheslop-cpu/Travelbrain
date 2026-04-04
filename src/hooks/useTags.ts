/**
 * Tag hooks for the item_tags system.
 *
 * Re-exports the existing query hooks from queries.ts and adds
 * derived convenience hooks with structured return types.
 */
import { useMemo } from 'react'
import { useItemTags as useItemTagsRaw, useAllUserTags } from './queries'
import { isSystemCategory } from '../lib/categories'

// Re-export mutation hooks directly
export { useAddTag, useRemoveTag, writeItemTags } from './queries'

/**
 * Fetches all item_tags for a given item.
 * Returns { categories: string[], customTags: string[] }
 */
export function useItemTags(itemId: string | undefined) {
  const query = useItemTagsRaw(itemId)

  const structured = useMemo(() => {
    const tags = query.data ?? []
    const categories: string[] = []
    const customTags: string[] = []
    for (const tag of tags) {
      if (tag.tag_type === 'category' || isSystemCategory(tag.tag_name)) {
        categories.push(tag.tag_name)
      } else {
        customTags.push(tag.tag_name)
      }
    }
    return { categories, customTags }
  }, [query.data])

  return {
    ...query,
    categories: structured.categories,
    customTags: structured.customTags,
  }
}

/**
 * Fetches all distinct tag_names for a user, with counts.
 * Returns { categories: { tagName, count }[], customTags: { tagName, count }[] }
 */
export function useUserTags(userId: string | undefined) {
  const query = useAllUserTags(userId)

  const structured = useMemo(() => {
    const tags = query.data ?? []
    const catCounts = new Map<string, number>()
    const customCounts = new Map<string, number>()

    for (const tag of tags) {
      if (tag.tag_type === 'category' || isSystemCategory(tag.tag_name)) {
        catCounts.set(tag.tag_name, (catCounts.get(tag.tag_name) ?? 0) + 1)
      } else {
        customCounts.set(tag.tag_name, (customCounts.get(tag.tag_name) ?? 0) + 1)
      }
    }

    return {
      categories: [...catCounts.entries()].map(([tagName, count]) => ({ tagName, count })),
      customTags: [...customCounts.entries()].map(([tagName, count]) => ({ tagName, count })),
    }
  }, [query.data])

  return {
    ...query,
    categories: structured.categories,
    customTags: structured.customTags,
  }
}
