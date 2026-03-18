/**
 * Backfill saved_items with Unsplash photos (replaces picsum placeholders).
 * Run: node scripts/backfill-unsplash-items.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  const raw = readFileSync(resolve(root, '.env.local'), 'utf-8')
  const env = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx)
    let val = trimmed.slice(eqIdx + 1)
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) val = val.slice(1, -1)
    env[key] = val
  }
  return env
}

const UNSPLASH_ACCESS_KEY = '9Doegj_QRdqRMkueINm_xND4XvKVZcCoLlekKKx5iMY'

async function fetchPhoto(query) {
  const params = new URLSearchParams({ query, orientation: 'landscape', per_page: '1' })
  const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.results || data.results.length === 0) return null
  return data.results[0].urls.regular
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

const env = loadEnv()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const { error: authErr } = await supabase.auth.signInWithPassword({
  email: env.VITE_DEV_LOGIN_EMAIL, password: env.VITE_DEV_LOGIN_PASSWORD,
})
if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1) }

// Get saved items that have images (picsum placeholders) or location data
const { data: items, error: fetchErr } = await supabase
  .from('saved_items')
  .select('id, title, image_url, location_name')
  .not('image_url', 'is', null)
  .order('created_at')

if (fetchErr) { console.error('Fetch error:', fetchErr.message); process.exit(1) }

console.log(`Found ${items.length} saved items with images to update\n`)

let updated = 0
let skipped = 0

for (const item of items) {
  // Build a search query from the title or location
  const query = item.location_name
    ? `${item.location_name.split(',')[0]} ${item.title.split('—')[0].trim()}`
    : item.title

  const url = await fetchPhoto(query)

  if (url) {
    const { error: updateErr } = await supabase
      .from('saved_items')
      .update({ image_url: url })
      .eq('id', item.id)

    if (updateErr) {
      console.log(`  ERROR ${item.title}: ${updateErr.message}`)
      skipped++
    } else {
      console.log(`  Updated: ${item.title}`)
      updated++
    }
  } else {
    console.log(`  Skipped: ${item.title} (no result)`)
    skipped++
  }

  await sleep(200)
}

console.log(`\n✓ Done. Updated ${updated} of ${items.length} saved items. ${skipped} skipped.`)
