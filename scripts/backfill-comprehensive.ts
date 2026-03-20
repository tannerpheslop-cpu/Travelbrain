/**
 * Comprehensive backfill script for ALL users' saved_items.
 *
 * 1. Re-evaluates image_display for every item
 * 2. Cleans Unsplash URLs (strips render-time sizing params)
 * 3. Verifies image_url accessibility via HEAD requests
 *
 * Usage:  npx tsx scripts/backfill-comprehensive.ts
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
  source_type: string
  image_url: string | null
  site_name: string | null
  category: string | null
}): ImageDisplay {
  if (!item.image_url) return 'none'
  if (item.source_type === 'manual' && item.image_url.includes('supabase')) return 'thumbnail'
  if (item.image_url.includes('unsplash.com')) return 'thumbnail'
  if (item.source_type === 'url' && item.site_name) {
    const sn = item.site_name.toLowerCase()
    if (sn.includes('tiktok') || sn.includes('instagram') || sn.includes('youtube')) return 'thumbnail'
  }
  if (item.source_type === 'url' && item.image_url) return 'thumbnail'
  if (item.source_type === 'screenshot') return 'thumbnail'
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

  let offset = 0
  const batchSize = 500
  let totalProcessed = 0
  let displayUpdated = 0
  let unsplashCleaned = 0
  let brokenFound = 0

  while (true) {
    const { data: items, error } = await supabase
      .from('saved_items')
      .select('id, title, source_type, image_url, image_display, site_name, category')
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

      // ── Step 1: Clean Unsplash URL ──────────────────────────────────────
      let effectiveImageUrl = item.image_url
      if (item.image_url) {
        const cleaned = cleanUnsplashUrl(item.image_url)
        if (cleaned !== null) {
          updates.image_url = cleaned
          effectiveImageUrl = cleaned
          unsplashCleaned++
          console.log(`  [CLEAN] ${item.id}: stripped sizing params from Unsplash URL`)
        }
      }

      // ── Step 2: Re-evaluate image_display ───────────────────────────────
      const newDisplay = evaluateImageDisplay({
        source_type: item.source_type,
        image_url: effectiveImageUrl,
        site_name: item.site_name,
        category: item.category,
      })

      if (newDisplay !== item.image_display) {
        updates.image_display = newDisplay
        displayUpdated++
        console.log(`  [DISPLAY] ${item.id}: ${item.image_display ?? 'null'} → ${newDisplay} (${item.title})`)
      }

      // ── Step 3: Verify image accessibility ──────────────────────────────
      if (effectiveImageUrl) {
        const accessible = await isUrlAccessible(effectiveImageUrl)
        if (!accessible) {
          updates.image_url = null
          updates.image_display = 'none'
          brokenFound++
          console.log(`  [BROKEN] ${item.id}: ${item.title} — URL: ${effectiveImageUrl}`)
        }
        // Rate limit: 100ms between HEAD requests
        await sleep(100)
      }

      // ── Apply updates if any ────────────────────────────────────────────
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

    console.log(`  ... processed ${offset + items.length} items so far`)

    if (items.length < batchSize) break
    offset += batchSize
  }

  console.log(`
Backfill complete:
- Total items processed: ${totalProcessed}
- image_display updated: ${displayUpdated}
- Unsplash URLs cleaned: ${unsplashCleaned}
- Broken images found and cleared: ${brokenFound}
`)
}

main()
