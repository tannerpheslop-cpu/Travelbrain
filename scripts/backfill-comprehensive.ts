/**
 * Comprehensive backfill script for saved_items and trip_destinations.
 *
 * 1. Re-evaluates image_display for every saved_item
 * 2. Cleans Unsplash URLs (strips render-time sizing params) in saved_items + trip_destinations
 * 3. Verifies image_url accessibility via HEAD requests
 * 4. Clears broken images and sets image_display = 'none'
 *
 * Usage:  npx tsx scripts/backfill-comprehensive.ts
 *
 * Requires TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local for auth (RLS).
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

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ── Evaluation logic (mirrors src/lib/evaluateImageDisplay.ts) ───────────────

type ImageDisplay = 'featured' | 'thumbnail' | 'none'

function evaluateImageDisplay(item: {
  image_url: string | null
  places_photo_url?: string | null
}): ImageDisplay {
  if (item.image_url && item.image_url.trim() !== '') return 'thumbnail'
  if (item.places_photo_url && item.places_photo_url.trim() !== '') return 'thumbnail'
  return 'none'
}

// ── Unsplash URL cleaning ────────────────────────────────────────────────────

const SIZING_PARAMS = ['w', 'h', 'q', 'fit', 'crop', 'auto']

function cleanUnsplashUrl(url: string): string | null {
  if (!url.includes('unsplash.com')) return null // not unsplash, no change
  try {
    const u = new URL(url)
    let changed = false
    for (const p of SIZING_PARAMS) {
      if (u.searchParams.has(p)) {
        u.searchParams.delete(p)
        changed = true
      }
    }
    return changed ? u.toString() : null // null means no change needed
  } catch {
    return null
  }
}

// ── HEAD request to verify URL accessibility ─────────────────────────────────

async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Comprehensive Image Backfill ===\n')

  // ── Authenticate ──────────────────────────────────────────────────────────
  const email = process.env.TEST_USER_EMAIL ?? process.env.VITE_DEV_LOGIN_EMAIL
  const password = process.env.TEST_USER_PASSWORD ?? process.env.VITE_DEV_LOGIN_PASSWORD
  if (email && password) {
    console.log(`Authenticating as ${email}...`)
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr) {
      console.error('Auth failed:', authErr.message)
      process.exit(1)
    }
    console.log('Authenticated successfully.\n')
  } else {
    console.log('No TEST_USER_EMAIL / TEST_USER_PASSWORD set — running without auth (may be limited by RLS).\n')
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Part 1: saved_items
  // ══════════════════════════════════════════════════════════════════════════

  console.log('─── Part 1: saved_items ───\n')

  let offset = 0
  const batchSize = 500
  let totalProcessed = 0
  let displayUpdated = 0
  let unsplashCleaned = 0
  let brokenFound = 0

  while (true) {
    const { data: items, error } = await supabase
      .from('saved_items')
      .select('id, title, source_type, image_url, places_photo_url, image_display, site_name, category')
      .range(offset, offset + batchSize - 1)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching items:', error.message)
      process.exit(1)
    }

    if (!items || items.length === 0) break

    for (const item of items) {
      totalProcessed++
      const updates: Record<string, unknown> = {}

      // ── Step 1: Clean Unsplash URL on image_url ───────────────────────
      let effectiveImageUrl = item.image_url
      if (item.image_url) {
        const cleaned = cleanUnsplashUrl(item.image_url)
        if (cleaned !== null) {
          updates.image_url = cleaned
          effectiveImageUrl = cleaned
          unsplashCleaned++
          console.log(`  [CLEAN] ${item.id}: stripped sizing params from image_url`)
        }
      }

      // ── Step 1b: Clean Unsplash URL on places_photo_url ───────────────
      if (item.places_photo_url) {
        const cleaned = cleanUnsplashUrl(item.places_photo_url)
        if (cleaned !== null) {
          updates.places_photo_url = cleaned
          unsplashCleaned++
          console.log(`  [CLEAN] ${item.id}: stripped sizing params from places_photo_url`)
        }
      }

      // ── Step 2: Re-evaluate image_display ─────────────────────────────
      const newDisplay = evaluateImageDisplay({
        image_url: effectiveImageUrl,
        places_photo_url: item.places_photo_url,
      })

      if (newDisplay !== item.image_display) {
        updates.image_display = newDisplay
        displayUpdated++
        console.log(`  [DISPLAY] ${item.id}: ${item.image_display ?? 'null'} → ${newDisplay} (${item.title})`)
      }

      // ── Step 3: Verify image accessibility ────────────────────────────
      if (effectiveImageUrl) {
        const accessible = await isUrlAccessible(effectiveImageUrl)
        if (!accessible) {
          updates.image_url = null
          updates.image_display = 'none'
          brokenFound++
          console.log(`  [BROKEN] Broken image cleared for: ${item.title} — URL: ${effectiveImageUrl}`)
        }
        // Rate limit: 100ms between HEAD requests
        await sleep(100)
      }

      // ── Apply updates if any ──────────────────────────────────────────
      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase
          .from('saved_items')
          .update(updates)
          .eq('id', item.id)

        if (updateErr) {
          console.error(`  [ERROR] Failed to update ${item.id}: ${updateErr.message}`)
        }
      }
    }

    console.log(`  ... processed ${offset + items.length} saved_items so far`)

    if (items.length < batchSize) break
    offset += batchSize
  }

  console.log(`
saved_items summary:
  Total processed:          ${totalProcessed}
  image_display updated:    ${displayUpdated}
  Unsplash URLs cleaned:    ${unsplashCleaned}
  Broken images cleared:    ${brokenFound}
`)

  // ══════════════════════════════════════════════════════════════════════════
  // Part 2: trip_destinations — clean Unsplash URLs + verify accessibility
  // ══════════════════════════════════════════════════════════════════════════

  console.log('─── Part 2: trip_destinations ───\n')

  let destOffset = 0
  let destProcessed = 0
  let destUnsplashCleaned = 0
  let destBrokenFound = 0

  while (true) {
    const { data: dests, error: destErr } = await supabase
      .from('trip_destinations')
      .select('id, location_name, image_url, image_source')
      .range(destOffset, destOffset + batchSize - 1)
      .order('created_at', { ascending: true })

    if (destErr) {
      console.error('Error fetching destinations:', destErr.message)
      break
    }

    if (!dests || dests.length === 0) break

    for (const dest of dests) {
      destProcessed++

      if (!dest.image_url) continue

      const updates: Record<string, unknown> = {}
      let effectiveUrl = dest.image_url

      // Clean Unsplash URL
      const cleaned = cleanUnsplashUrl(dest.image_url)
      if (cleaned !== null) {
        updates.image_url = cleaned
        effectiveUrl = cleaned
        destUnsplashCleaned++
        console.log(`  [CLEAN] dest ${dest.id}: stripped sizing params (${dest.location_name})`)
      }

      // Verify accessibility
      const accessible = await isUrlAccessible(effectiveUrl)
      if (!accessible) {
        updates.image_url = null
        // Don't clear image_source — it records provenance
        destBrokenFound++
        console.log(`  [BROKEN] Broken image cleared for destination: ${dest.location_name} — URL: ${effectiveUrl}`)
      }
      await sleep(100)

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase
          .from('trip_destinations')
          .update(updates)
          .eq('id', dest.id)

        if (updateErr) {
          console.error(`  [ERROR] Failed to update dest ${dest.id}: ${updateErr.message}`)
        }
      }
    }

    console.log(`  ... processed ${destOffset + dests.length} destinations so far`)

    if (dests.length < batchSize) break
    destOffset += batchSize
  }

  console.log(`
trip_destinations summary:
  Total processed:          ${destProcessed}
  Unsplash URLs cleaned:    ${destUnsplashCleaned}
  Broken images cleared:    ${destBrokenFound}
`)

  // ══════════════════════════════════════════════════════════════════════════
  // Part 3: trips — clean cover_image_url
  // ══════════════════════════════════════════════════════════════════════════

  console.log('─── Part 3: trips (cover_image_url) ───\n')

  let tripOffset = 0
  let tripProcessed = 0
  let tripUnsplashCleaned = 0
  let tripBrokenFound = 0

  while (true) {
    const { data: trips, error: tripErr } = await supabase
      .from('trips')
      .select('id, title, cover_image_url')
      .range(tripOffset, tripOffset + batchSize - 1)
      .order('created_at', { ascending: true })

    if (tripErr) {
      console.error('Error fetching trips:', tripErr.message)
      break
    }

    if (!trips || trips.length === 0) break

    for (const trip of trips) {
      tripProcessed++

      if (!trip.cover_image_url) continue

      const updates: Record<string, unknown> = {}
      let effectiveUrl = trip.cover_image_url

      const cleaned = cleanUnsplashUrl(trip.cover_image_url)
      if (cleaned !== null) {
        updates.cover_image_url = cleaned
        effectiveUrl = cleaned
        tripUnsplashCleaned++
        console.log(`  [CLEAN] trip ${trip.id}: stripped sizing params (${trip.title})`)
      }

      const accessible = await isUrlAccessible(effectiveUrl)
      if (!accessible) {
        updates.cover_image_url = null
        tripBrokenFound++
        console.log(`  [BROKEN] Broken cover image cleared for trip: ${trip.title} — URL: ${effectiveUrl}`)
      }
      await sleep(100)

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase
          .from('trips')
          .update(updates)
          .eq('id', trip.id)

        if (updateErr) {
          console.error(`  [ERROR] Failed to update trip ${trip.id}: ${updateErr.message}`)
        }
      }
    }

    console.log(`  ... processed ${tripOffset + trips.length} trips so far`)

    if (trips.length < batchSize) break
    tripOffset += batchSize
  }

  console.log(`
trips summary:
  Total processed:          ${tripProcessed}
  Unsplash URLs cleaned:    ${tripUnsplashCleaned}
  Broken covers cleared:    ${tripBrokenFound}

════════════════════════════════════════════════════════════════════════════════
GRAND TOTAL
  saved_items:    ${totalProcessed} processed, ${displayUpdated} display updated, ${unsplashCleaned} URLs cleaned, ${brokenFound} broken
  destinations:   ${destProcessed} processed, ${destUnsplashCleaned} URLs cleaned, ${destBrokenFound} broken
  trips:          ${tripProcessed} processed, ${tripUnsplashCleaned} URLs cleaned, ${tripBrokenFound} broken
════════════════════════════════════════════════════════════════════════════════
`)
}

main()
