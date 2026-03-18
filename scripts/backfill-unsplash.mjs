/**
 * Backfill existing trip_destinations with Unsplash photos.
 * Run once: node scripts/backfill-unsplash.mjs
 * Safe to re-run — skips user_upload images.
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

async function fetchDestinationPhoto(locationName) {
  const query = locationName.split(',')[0].trim()
  if (!query) return null
  const params = new URLSearchParams({ query: `${query} travel`, orientation: 'landscape', per_page: '1' })
  const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.results || data.results.length === 0) return null
  return data.results[0].urls.regular
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Main ────────────────────────────────────────────────────────────────────

const env = loadEnv()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

// Auth
const { error: authErr } = await supabase.auth.signInWithPassword({
  email: env.VITE_DEV_LOGIN_EMAIL, password: env.VITE_DEV_LOGIN_PASSWORD,
})
if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1) }

// Fetch all destinations
const { data: dests, error: fetchErr } = await supabase
  .from('trip_destinations')
  .select('id, location_name, image_url')
  .order('sort_order')

if (fetchErr) { console.error('Fetch error:', fetchErr.message); process.exit(1) }

console.log(`Found ${dests.length} destinations to process (excluding user_upload)\n`)

let updated = 0
let skipped = 0

for (const dest of dests) {
  const url = await fetchDestinationPhoto(dest.location_name)

  if (url) {
    const { error: updateErr } = await supabase
      .from('trip_destinations')
      .update({ image_url: url })
      .eq('id', dest.id)

    if (updateErr) {
      console.log(`  ERROR ${dest.location_name}: ${updateErr.message}`)
      skipped++
    } else {
      console.log(`  Updated ${dest.location_name}`)
      updated++
    }
  } else {
    console.log(`  Skipped ${dest.location_name}: no Unsplash result`)
    skipped++
  }

  await sleep(200) // Respect rate limits
}

console.log(`\n✓ Done. Updated ${updated} of ${dests.length} destinations with Unsplash photos. ${skipped} skipped.`)
