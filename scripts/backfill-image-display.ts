/**
 * Quick backfill: re-evaluate image_display for ALL saved_items.
 *
 * Simple rule: has image (image_url or places_photo_url) = 'thumbnail', else 'none'.
 *
 * Usage: npx tsx scripts/backfill-image-display.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Load .env.local ──────────────────────────────────────────────────────────

const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    let val = trimmed.slice(eqIdx + 1)
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!
const email = process.env.VITE_DEV_LOGIN_EMAIL!
const password = process.env.VITE_DEV_LOGIN_PASSWORD!

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  // Authenticate
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError) {
    console.error('Auth failed:', authError.message)
    process.exit(1)
  }
  console.log('Authenticated.\n')

  let offset = 0
  const batchSize = 100
  let totalProcessed = 0
  let thumbnailCount = 0
  let noneCount = 0
  let updated = 0

  while (true) {
    const { data: items, error } = await supabase
      .from('saved_items')
      .select('id, title, image_url, places_photo_url, image_display')
      .range(offset, offset + batchSize - 1)
      .order('created_at', { ascending: true })

    if (error) { console.error('Query error:', error); break }
    if (!items || items.length === 0) break

    for (const item of items) {
      totalProcessed++
      const hasImage = (item.image_url && item.image_url.trim() !== '') ||
                       (item.places_photo_url && item.places_photo_url.trim() !== '')
      const newDisplay = hasImage ? 'thumbnail' : 'none'

      // Log every item for diagnosis
      const imgSnippet = item.image_url ? item.image_url.slice(0, 80) : 'null'
      const placesSnippet = item.places_photo_url ? item.places_photo_url.slice(0, 80) : 'null'
      console.log(`[${(item.image_display ?? 'null').padEnd(9)}] → ${newDisplay.padEnd(9)} | img=${imgSnippet} | places=${placesSnippet} | "${item.title?.slice(0, 40)}"`)

      if (newDisplay !== item.image_display) {
        const { error: updateError } = await supabase
          .from('saved_items')
          .update({ image_display: newDisplay })
          .eq('id', item.id)

        if (!updateError) {
          updated++
          console.log(`Updated: "${item.title}" — image_url=${item.image_url ? 'yes' : 'null'}, places_photo=${item.places_photo_url ? 'yes' : 'null'} → ${newDisplay}`)
        }
      }

      if (newDisplay === 'thumbnail') thumbnailCount++
      else noneCount++
    }

    offset += batchSize
    if (items.length < batchSize) break
  }

  console.log(`
Summary:
  Total processed: ${totalProcessed}
  Updated:         ${updated}
  Thumbnail:       ${thumbnailCount}
  None:            ${noneCount}
`)
}

main().catch(console.error)
