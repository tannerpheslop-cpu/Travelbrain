/**
 * Backfill image_display for ALL existing saved_items.
 *
 * Usage:  npx tsx scripts/backfill-image-display.ts
 *
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars (reads from .env).
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env.local manually (no dotenv dependency needed)
const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    let val = trimmed.slice(eqIdx + 1)
    // Strip surrounding quotes
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

type ImageDisplay = 'featured' | 'thumbnail' | 'none'

function evaluateImageDisplay(item: {
  source_type: string
  image_url: string | null
  site_name: string | null
  category: string | null
}): ImageDisplay {
  if (!item.image_url) return 'none'

  if (item.source_type === 'manual' && item.image_url.includes('supabase')) {
    return 'thumbnail'
  }

  if (item.image_url.includes('unsplash.com')) {
    return 'thumbnail'
  }

  if (item.source_type === 'url' && item.site_name) {
    const sn = item.site_name.toLowerCase()
    if (sn.includes('tiktok') || sn.includes('instagram') || sn.includes('youtube')) {
      return 'thumbnail'
    }
  }

  if (item.source_type === 'url' && item.image_url) {
    return 'thumbnail'
  }

  if (item.source_type === 'screenshot') {
    return 'thumbnail'
  }

  return 'none'
}

async function main() {
  console.log('Backfilling image_display for all saved_items...\n')

  // Fetch all items (paginated in batches of 1000)
  let offset = 0
  const batchSize = 1000
  let totalUpdated = 0
  const counts = { featured: 0, thumbnail: 0, none: 0 }

  while (true) {
    const { data: items, error } = await supabase
      .from('saved_items')
      .select('id, title, source_type, image_url, site_name, category')
      .range(offset, offset + batchSize - 1)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching items:', error.message)
      process.exit(1)
    }

    if (!items || items.length === 0) break

    for (const item of items) {
      const display = evaluateImageDisplay({
        source_type: item.source_type,
        image_url: item.image_url,
        site_name: item.site_name,
        category: item.category,
      })

      const { error: updateErr } = await supabase
        .from('saved_items')
        .update({ image_display: display })
        .eq('id', item.id)

      if (updateErr) {
        console.error(`  Failed to update ${item.id}: ${updateErr.message}`)
        continue
      }

      console.log(`Updated item ${item.id}: ${item.title} → ${display}`)
      counts[display]++
      totalUpdated++
    }

    if (items.length < batchSize) break
    offset += batchSize
  }

  console.log(`\nBackfilled ${totalUpdated} items: ${counts.thumbnail} thumbnail, ${counts.none} none, ${counts.featured} featured`)
}

main()
