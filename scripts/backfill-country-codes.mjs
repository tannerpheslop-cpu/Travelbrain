/**
 * Backfill script — resolves missing location_country_code for saved_items.
 *
 * Finds items where:
 *   1. location_country_code = '' (empty string) AND location_place_id is set
 *   2. location_country_code IS NULL AND location_place_id is set
 *
 * Uses Google Places Details REST API to resolve country + country_code
 * from address_components.
 *
 * Usage:  node scripts/backfill-country-codes.mjs
 *         node scripts/backfill-country-codes.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const DRY_RUN = process.argv.includes('--dry-run')

// ── Parse .env.local ────────────────────────────────────────────────────────
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
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1)
    }
    env[key] = val
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const GOOGLE_API_KEY = env.VITE_GOOGLE_PLACES_API_KEY
const DEV_EMAIL = env.VITE_DEV_LOGIN_EMAIL
const DEV_PASSWORD = env.VITE_DEV_LOGIN_PASSWORD

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GOOGLE_API_KEY || !DEV_EMAIL || !DEV_PASSWORD) {
  console.error('Missing env vars. Need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_PLACES_API_KEY, VITE_DEV_LOGIN_EMAIL, VITE_DEV_LOGIN_PASSWORD in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Google Places Details (REST) ────────────────────────────────────────────
async function getCountryFromPlaceId(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=address_components&key=${encodeURIComponent(GOOGLE_API_KEY)}`
  const resp = await fetch(url)
  if (!resp.ok) return null
  const data = await resp.json()
  if (data.status !== 'OK' || !data.result?.address_components) return null

  const cc = data.result.address_components.find(c => c.types.includes('country'))
  if (!cc) return null
  return { country: cc.long_name, countryCode: cc.short_name }
}

// ── Reverse Geocode (for items with lat/lng but no place_id) ────────────────
async function reverseGeocode(lat, lng) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(GOOGLE_API_KEY)}`
  const resp = await fetch(url)
  if (!resp.ok) return null
  const data = await resp.json()
  if (data.status !== 'OK' || !data.results?.length) return null

  const result = data.results[0]
  const cc = result.address_components?.find(c => c.types.includes('country'))
  if (!cc) return null
  return { country: cc.long_name, countryCode: cc.short_name }
}

// ── Country name → code mapping (fallback when APIs are unavailable) ────────
const COUNTRY_NAME_TO_CODE = {
  'Afghanistan': 'AF', 'Albania': 'AL', 'Algeria': 'DZ', 'Argentina': 'AR',
  'Armenia': 'AM', 'Australia': 'AU', 'Austria': 'AT', 'Azerbaijan': 'AZ',
  'Bangladesh': 'BD', 'Belgium': 'BE', 'Bolivia': 'BO', 'Brazil': 'BR',
  'Bulgaria': 'BG', 'Cambodia': 'KH', 'Canada': 'CA', 'Chile': 'CL',
  'China': 'CN', 'Colombia': 'CO', 'Costa Rica': 'CR', 'Croatia': 'HR',
  'Cuba': 'CU', 'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Denmark': 'DK',
  'Dominican Republic': 'DO', 'Ecuador': 'EC', 'Egypt': 'EG', 'Estonia': 'EE',
  'Ethiopia': 'ET', 'Finland': 'FI', 'France': 'FR', 'Georgia': 'GE',
  'Germany': 'DE', 'Ghana': 'GH', 'Greece': 'GR', 'Guatemala': 'GT',
  'Hong Kong': 'HK', 'Hungary': 'HU', 'Iceland': 'IS', 'India': 'IN',
  'Indonesia': 'ID', 'Iran': 'IR', 'Iraq': 'IQ', 'Ireland': 'IE',
  'Israel': 'IL', 'Italy': 'IT', 'Jamaica': 'JM', 'Japan': 'JP',
  'Jordan': 'JO', 'Kazakhstan': 'KZ', 'Kenya': 'KE', 'Laos': 'LA',
  'Latvia': 'LV', 'Lebanon': 'LB', 'Lithuania': 'LT', 'Luxembourg': 'LU',
  'Macau': 'MO', 'Malaysia': 'MY', 'Maldives': 'MV', 'Malta': 'MT',
  'Mexico': 'MX', 'Mongolia': 'MN', 'Morocco': 'MA', 'Myanmar': 'MM',
  'Nepal': 'NP', 'Netherlands': 'NL', 'New Zealand': 'NZ', 'Nigeria': 'NG',
  'North Korea': 'KP', 'Norway': 'NO', 'Oman': 'OM', 'Pakistan': 'PK',
  'Panama': 'PA', 'Paraguay': 'PY', 'Peru': 'PE', 'Philippines': 'PH',
  'Poland': 'PL', 'Portugal': 'PT', 'Qatar': 'QA', 'Romania': 'RO',
  'Russia': 'RU', 'Saudi Arabia': 'SA', 'Senegal': 'SN', 'Serbia': 'RS',
  'Singapore': 'SG', 'Slovakia': 'SK', 'Slovenia': 'SI', 'South Africa': 'ZA',
  'South Korea': 'KR', 'Spain': 'ES', 'Sri Lanka': 'LK', 'Sweden': 'SE',
  'Switzerland': 'CH', 'Taiwan': 'TW', 'Tanzania': 'TZ', 'Thailand': 'TH',
  'Tunisia': 'TN', 'Turkey': 'TR', 'Türkiye': 'TR',
  'Ukraine': 'UA', 'United Arab Emirates': 'AE', 'United Kingdom': 'GB',
  'United States': 'US', 'USA': 'US', 'Uruguay': 'UY', 'Uzbekistan': 'UZ',
  'Venezuela': 'VE', 'Vietnam': 'VN', 'Viet Nam': 'VN',
}

function countryNameToCode(name) {
  if (!name) return null
  return COUNTRY_NAME_TO_CODE[name] ?? COUNTRY_NAME_TO_CODE[name.trim()] ?? null
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (no changes will be made) ===' : '=== BACKFILL COUNTRY CODES ===')

  // Sign in
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  })
  if (authError) {
    console.error('Auth failed:', authError.message)
    process.exit(1)
  }

  // 1. Find items with empty string country_code and a place_id
  const { data: emptyCodeItems, error: e1 } = await supabase
    .from('saved_items')
    .select('id, title, location_place_id, location_country, location_country_code, location_lat, location_lng')
    .eq('location_country_code', '')
    .not('location_place_id', 'is', null)

  // 2. Find items with null country_code but having a place_id
  const { data: nullCodeWithPlaceId, error: e2 } = await supabase
    .from('saved_items')
    .select('id, title, location_place_id, location_country, location_country_code, location_lat, location_lng')
    .is('location_country_code', null)
    .not('location_place_id', 'is', null)

  // 3. Find items with null country_code and no place_id but having lat/lng
  const { data: nullCodeWithLatLng, error: e3 } = await supabase
    .from('saved_items')
    .select('id, title, location_place_id, location_country, location_country_code, location_lat, location_lng')
    .is('location_country_code', null)
    .is('location_place_id', null)
    .not('location_lat', 'is', null)

  if (e1 || e2 || e3) {
    console.error('Query errors:', e1, e2, e3)
    process.exit(1)
  }

  const placeIdItems = [...(emptyCodeItems ?? []), ...(nullCodeWithPlaceId ?? [])]
  const latLngItems = nullCodeWithLatLng ?? []

  console.log(`\nFound ${placeIdItems.length} items with place_id needing country code`)
  console.log(`Found ${latLngItems.length} items with lat/lng only needing reverse geocode`)
  console.log('')

  let updated = 0
  let failed = 0

  // Process items with place_id (try Place Details first, fall back to reverse geocode)
  for (const item of placeIdItems) {
    console.log(`  [place_id] "${item.title}" (${item.location_place_id})`)
    let result = await getCountryFromPlaceId(item.location_place_id)
    // Fall back to reverse geocode if Place Details failed (API key may be browser-restricted)
    // Fall back to reverse geocode if Place Details failed (API key may be browser-restricted)
    if (!result && item.location_lat && item.location_lng) {
      console.log(`    ↳ Place Details failed, trying reverse geocode...`)
      result = await reverseGeocode(item.location_lat, item.location_lng)
    }
    // Final fallback: derive code from existing location_country name
    if (!result && item.location_country) {
      const code = countryNameToCode(item.location_country)
      if (code) {
        console.log(`    ↳ Using country name mapping: ${item.location_country} → ${code}`)
        result = { country: item.location_country, countryCode: code }
      }
    }
    if (result) {
      console.log(`    → ${result.country} (${result.countryCode})`)
      if (!DRY_RUN) {
        const { error } = await supabase.from('saved_items').update({
          location_country: result.country,
          location_country_code: result.countryCode,
        }).eq('id', item.id)
        if (error) {
          console.log(`    ✗ Update failed:`, error.message)
          failed++
        } else {
          updated++
        }
      } else {
        updated++
      }
    } else {
      console.log(`    ✗ Could not resolve`)
      failed++
    }
    await sleep(200) // Rate limit
  }

  // Process items with lat/lng only
  for (const item of latLngItems) {
    console.log(`  [lat/lng] "${item.title}" (${item.location_lat}, ${item.location_lng})`)
    const result = await reverseGeocode(item.location_lat, item.location_lng)
    if (result) {
      console.log(`    → ${result.country} (${result.countryCode})`)
      if (!DRY_RUN) {
        const { error } = await supabase.from('saved_items').update({
          location_country: result.country,
          location_country_code: result.countryCode,
        }).eq('id', item.id)
        if (error) {
          console.log(`    ✗ Update failed:`, error.message)
          failed++
        } else {
          updated++
        }
      } else {
        updated++
      }
    } else {
      console.log(`    ✗ Could not resolve`)
      failed++
    }
    await sleep(200) // Rate limit
  }

  console.log(`\n=== SUMMARY ===`)
  console.log(`Total items processed: ${placeIdItems.length + latLngItems.length}`)
  console.log(`Updated: ${updated}`)
  console.log(`Failed: ${failed}`)
  if (DRY_RUN) console.log(`(Dry run — no actual changes made)`)
}

main().catch(console.error)
