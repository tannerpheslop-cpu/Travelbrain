import { supabase, supabaseUrl } from './supabase'
import type { SavedItem, ExtractedItem } from '../types'

/**
 * Fire-and-forget: calls the extract-multi-items Edge Function for a URL save.
 * If the extraction finds 2+ items, stores them in pending_extractions and
 * flags the source entry. Does NOT block the save flow.
 *
 * Only call this for source_type === 'url' entries.
 */
export async function triggerMultiItemExtraction(
  savedItem: SavedItem,
  userId: string,
  existingTitles: string[],
): Promise<void> {
  if (!savedItem.source_url) return

  try {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

    // Call the Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/extract-multi-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ url: savedItem.source_url }),
    })

    if (!response.ok) {
      console.error('[extract-multi-items] HTTP error:', response.status)
      return
    }

    const result = await response.json()
    console.log(`[extract-multi-items] Result: success=${result.success} items=${result.items?.length ?? 0} reason=${result.reason ?? 'none'}`)

    if (!result.success || !result.items || result.items.length < 2) {
      console.log('[extract-multi-items] Skipping — not enough items')
      return
    }

    // Duplicate detection: flag items whose names closely match existing entries
    const normalizedExisting = new Set(
      existingTitles.map(t => t.toLowerCase().trim()),
    )

    const itemsWithDuplicateFlag: Array<ExtractedItem & { likely_duplicate: boolean }> =
      result.items.map((item: ExtractedItem) => ({
        ...item,
        likely_duplicate: normalizedExisting.has(item.name.toLowerCase().trim()),
      }))

    // Store in pending_extractions
    const { error: insertError } = await supabase
      .from('pending_extractions')
      .insert({
        user_id: userId,
        source_entry_id: savedItem.id,
        source_url: savedItem.source_url,
        extracted_items: itemsWithDuplicateFlag,
        content_type: result.content_type ?? 'listicle',
        status: 'pending',
      })

    if (insertError) {
      console.error('[extract-multi-items] Failed to store extraction:', insertError.message)
      return
    }
    console.log(`[extract-multi-items] Stored ${itemsWithDuplicateFlag.length} items in pending_extractions`)

    // Flag the source entry
    const { error: flagError } = await supabase
      .from('saved_items')
      .update({ has_pending_extraction: true })
      .eq('id', savedItem.id)

    if (flagError) {
      console.error('[extract-multi-items] Failed to set has_pending_extraction:', flagError.message)
    } else {
      console.log('[extract-multi-items] Set has_pending_extraction=true on', savedItem.id)
    }

  } catch (err) {
    console.error('[extract-multi-items] Extraction failed:', (err as Error).message)
    // Never throw — this is fire-and-forget
  }
}
