/**
 * Seed script — populates Supabase with realistic test data.
 *
 * Usage:  npm run seed
 *
 * Reads VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_DEV_LOGIN_EMAIL,
 * and VITE_DEV_LOGIN_PASSWORD from .env.local (strips quotes).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

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
    // Strip surrounding quotes (single or double), but keep content with #
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
const DEV_EMAIL = env.VITE_DEV_LOGIN_EMAIL
const DEV_PASSWORD = env.VITE_DEV_LOGIN_PASSWORD

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !DEV_EMAIL || !DEV_PASSWORD) {
  console.error('Missing env vars. Ensure .env.local has VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_DEV_LOGIN_EMAIL, VITE_DEV_LOGIN_PASSWORD')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Authenticate ────────────────────────────────────────────────────────────
console.log(`Signing in as ${DEV_EMAIL}...`)
const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
  email: DEV_EMAIL,
  password: DEV_PASSWORD,
})
if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1) }
const userId = authData.user.id
console.log(`Authenticated. User ID: ${userId}`)

// ── Helper ──────────────────────────────────────────────────────────────────
async function q(table, op, data, opts) {
  let query
  if (op === 'delete') {
    query = supabase.from(table).delete()
    if (opts?.eq) for (const [k, v] of Object.entries(opts.eq)) query = query.eq(k, v)
    if (opts?.in) for (const [k, v] of Object.entries(opts.in)) query = query.in(k, v)
  } else if (op === 'insert') {
    query = supabase.from(table).insert(data).select()
  } else if (op === 'select') {
    query = supabase.from(table).select(data || '*')
    if (opts?.eq) for (const [k, v] of Object.entries(opts.eq)) query = query.eq(k, v)
  }
  const { data: result, error } = await query
  if (error) { console.error(`Error on ${table}.${op}:`, error.message); throw error }
  return result
}

// ── 1. Clear existing data (respect FK order) ──────────────────────────────
console.log('\nClearing existing test data...')

// Get user's trip IDs first
const existingTrips = await q('trips', 'select', 'id', { eq: { owner_id: userId } })
const tripIds = existingTrips.map(t => t.id)

if (tripIds.length > 0) {
  // Get destination IDs for these trips
  const existingDests = await q('trip_destinations', 'select', 'id', { in: { trip_id: tripIds } })
  const destIds = existingDests.map(d => d.id)

  if (destIds.length > 0) {
    await q('destination_items', 'delete', null, { in: { destination_id: destIds } })
    console.log('  Cleared destination_items')
  }
  await q('trip_general_items', 'delete', null, { in: { trip_id: tripIds } })
  console.log('  Cleared trip_general_items')
  await q('comments', 'delete', null, { in: { trip_id: tripIds } })
  console.log('  Cleared comments')
  await q('votes', 'delete', null, { in: { trip_id: tripIds } })
  console.log('  Cleared votes')
  await q('companions', 'delete', null, { in: { trip_id: tripIds } })
  console.log('  Cleared companions')
  await q('trip_destinations', 'delete', null, { in: { trip_id: tripIds } })
  console.log('  Cleared trip_destinations')
  await q('trips', 'delete', null, { eq: { owner_id: userId } })
  console.log('  Cleared trips')
}

await q('saved_items', 'delete', null, { eq: { user_id: userId } })
console.log('  Cleared saved_items')

// ── 2. Insert saved_items ───────────────────────────────────────────────────
console.log('\nInserting saved items...')

const savedItemsData = [
  // Japan (4)
  {
    user_id: userId, source_type: 'url', title: 'Hidden ramen spot in Shibuya',
    description: 'This tiny 8-seat ramen bar has been serving the same tonkotsu recipe for 40 years. The owner only makes 50 bowls a day.',
    source_url: 'https://www.tiktok.com/@tokyofoodie/video/123', site_name: 'TikTok',
    image_url: 'https://picsum.photos/400/300?random=1',
    category: 'restaurant', location_name: 'Shibuya, Tokyo, Japan',
    location_lat: 35.6580, location_lng: 139.7016, location_country: 'Japan', location_country_code: 'JP',
  },
  {
    user_id: userId, source_type: 'url', title: 'Fushimi Inari at sunrise — no crowds',
    description: 'Start at 5am to get the gates completely empty. The light through the torii is magical.',
    source_url: 'https://www.instagram.com/p/abc123', site_name: 'Instagram',
    image_url: 'https://picsum.photos/400/300?random=2',
    category: 'activity', location_name: 'Fushimi Inari, Kyoto, Japan',
    location_lat: 34.9671, location_lng: 135.7727, location_country: 'Japan', location_country_code: 'JP',
  },
  {
    user_id: userId, source_type: 'manual', title: 'Dotonbori street food walk',
    description: 'Takoyaki at Wanaka, gyoza at Chao Chao, finish with cheesecake at Rikuro. Budget about ¥3000.',
    category: 'restaurant', location_name: 'Dotonbori, Osaka, Japan',
    location_lat: 34.6687, location_lng: 135.5013, location_country: 'Japan', location_country_code: 'JP',
  },
  {
    user_id: userId, source_type: 'screenshot', title: 'Hiroshima Peace Memorial itinerary',
    description: 'Screenshot of a detailed one-day Hiroshima walking route covering the Peace Park, museum, and Itsukushima ferry.',
    image_url: 'https://picsum.photos/400/300?random=3',
    category: 'activity', location_name: 'Hiroshima, Japan',
    location_lat: 34.3853, location_lng: 132.4553, location_country: 'Japan', location_country_code: 'JP',
  },

  // China (4)
  {
    user_id: userId, source_type: 'url', title: 'Best viewpoints at the Great Wall — Mutianyu section',
    description: 'Skip Badaling. Mutianyu is less crowded and the cable car ride gives incredible views of the wall snaking through mountains.',
    source_url: 'https://www.youtube.com/watch?v=xyz789', site_name: 'YouTube',
    image_url: 'https://picsum.photos/400/300?random=4',
    category: 'activity', location_name: 'Mutianyu, Beijing, China',
    location_lat: 40.4319, location_lng: 116.5704, location_country: 'China', location_country_code: 'CN',
  },
  {
    user_id: userId, source_type: 'url', title: 'Chengdu hotpot guide — local favorites',
    description: 'Forget Haidilao. These three local spots have the real numbing Sichuan mala experience.',
    source_url: 'https://www.tiktok.com/@chengdueats/video/456', site_name: 'TikTok',
    image_url: 'https://picsum.photos/400/300?random=5',
    category: 'restaurant', location_name: 'Chengdu, Sichuan, China',
    location_lat: 30.5728, location_lng: 104.0668, location_country: 'China', location_country_code: 'CN',
  },
  {
    user_id: userId, source_type: 'manual', title: 'Shanghai Bund architecture walk',
    description: 'Self-guided walk along the Bund. Start at Waibaidu Bridge, end at the Meteorological Signal Tower. Best at sunset.',
    category: 'activity', location_name: 'The Bund, Shanghai, China',
    location_lat: 31.2400, location_lng: 121.4900, location_country: 'China', location_country_code: 'CN',
  },
  {
    user_id: userId, source_type: 'url', title: 'Giant Panda Research Base — morning visit tips',
    description: 'Go before 9am when the pandas are most active. The baby panda enclosure opens at 8:30.',
    source_url: 'https://www.instagram.com/p/panda456', site_name: 'Instagram',
    image_url: 'https://picsum.photos/400/300?random=6',
    category: 'activity', location_name: 'Chengdu, Sichuan, China',
    location_lat: 30.7340, location_lng: 104.1455, location_country: 'China', location_country_code: 'CN',
  },

  // Taiwan (3)
  {
    user_id: userId, source_type: 'url', title: 'Night market food guide — Taipei',
    description: 'Shilin Night Market top picks: pepper buns, stinky tofu, mango shaved ice, and oyster omelette.',
    source_url: 'https://www.tiktok.com/@taiwanfood/video/789', site_name: 'TikTok',
    image_url: 'https://picsum.photos/400/300?random=7',
    category: 'restaurant', location_name: 'Shilin, Taipei, Taiwan',
    location_lat: 25.0882, location_lng: 121.5244, location_country: 'Taiwan', location_country_code: 'TW',
  },
  {
    user_id: userId, source_type: 'manual', title: 'Jiufen Old Street day trip',
    description: 'Take the 1062 bus from Zhongxiao Fuxing. A-Mei Tea House has the best view. Go on a weekday to avoid crowds.',
    category: 'activity', location_name: 'Jiufen, New Taipei, Taiwan',
    location_lat: 25.1094, location_lng: 121.8445, location_country: 'Taiwan', location_country_code: 'TW',
  },
  {
    user_id: userId, source_type: 'url', title: 'Taipei 101 sunset viewing deck',
    description: 'The outdoor deck on floor 91 is way better than the indoor observatory. Book the sunset time slot.',
    source_url: 'https://www.youtube.com/watch?v=tp101', site_name: 'YouTube',
    image_url: 'https://picsum.photos/400/300?random=8',
    category: 'activity', location_name: 'Xinyi, Taipei, Taiwan',
    location_lat: 25.0340, location_lng: 121.5645, location_country: 'Taiwan', location_country_code: 'TW',
  },

  // Thailand (2)
  {
    user_id: userId, source_type: 'url', title: 'Chatuchak Weekend Market survival guide',
    description: '15,000 stalls. Start in Section 17 for vintage, Section 26 for art. Bring cash — most stalls are cash only.',
    source_url: 'https://www.instagram.com/p/bkk_market', site_name: 'Instagram',
    image_url: 'https://picsum.photos/400/300?random=9',
    category: 'activity', location_name: 'Chatuchak, Bangkok, Thailand',
    location_lat: 13.7999, location_lng: 100.5504, location_country: 'Thailand', location_country_code: 'TH',
  },
  {
    user_id: userId, source_type: 'url', title: 'Best pad thai in Bangkok — Thip Samai',
    description: 'The one wrapped in egg is legendary. Opens at 5pm, queue starts at 4:30.',
    source_url: 'https://www.tiktok.com/@bangkokfood/video/321', site_name: 'TikTok',
    image_url: 'https://picsum.photos/400/300?random=10',
    category: 'restaurant', location_name: 'Phra Nakhon, Bangkok, Thailand',
    location_lat: 13.7525, location_lng: 100.5025, location_country: 'Thailand', location_country_code: 'TH',
  },

  // No location (2)
  {
    user_id: userId, source_type: 'url', title: 'Ultimate Asia packing list for 3 weeks',
    description: 'Lightweight packing strategy for a multi-country Asia trip. One carry-on only.',
    source_url: 'https://packhacker.com/asia-packing', site_name: 'Pack Hacker',
    image_url: 'https://picsum.photos/400/300?random=11',
    category: 'general',
  },
  {
    user_id: userId, source_type: 'manual', title: 'Visa requirements — China, Taiwan, Thailand',
    description: 'China: 10-year tourist visa, apply 3 months before. Taiwan: visa-free 90 days for US. Thailand: visa-free 30 days.',
    category: 'general',
  },
]

const savedItems = await q('saved_items', 'insert', savedItemsData)
console.log(`  Inserted ${savedItems.length} saved items`)

// Index saved items by title for linking later
const itemByTitle = {}
for (const item of savedItems) itemByTitle[item.title] = item

// ── 3. Insert trips ─────────────────────────────────────────────────────────
console.log('\nInserting trips...')

const tripsData = [
  {
    owner_id: userId, title: 'Japan Circuit', status: 'scheduled',
    start_date: '2026-04-01', end_date: '2026-04-18',
    cover_image_url: 'https://picsum.photos/800/400?random=20',
  },
  {
    owner_id: userId, title: 'China Deep Dive', status: 'planning',
  },
  {
    owner_id: userId, title: 'Taiwan & Thailand', status: 'aspirational',
  },
  {
    owner_id: userId, title: 'Western Sichuan', status: 'scheduled',
    start_date: '2026-06-15', end_date: '2026-06-28',
  },
]

const trips = await q('trips', 'insert', tripsData)
console.log(`  Inserted ${trips.length} trips`)

const tripByTitle = {}
for (const t of trips) tripByTitle[t.title] = t

// ── 4. Insert trip_destinations ─────────────────────────────────────────────
console.log('\nInserting destinations...')

const destsData = [
  // Japan Circuit
  {
    trip_id: tripByTitle['Japan Circuit'].id, location_name: 'Tokyo, Japan',
    location_lat: 35.6762, location_lng: 139.6503, location_place_id: 'ChIJ51cu8IcbXWARiRtXIothAS4',
    location_country: 'Japan', location_country_code: 'JP', location_type: 'city',
    proximity_radius_km: 50, sort_order: 0,
    start_date: '2026-04-01', end_date: '2026-04-05',
    image_url: 'https://picsum.photos/400/300?random=30',
  },
  {
    trip_id: tripByTitle['Japan Circuit'].id, location_name: 'Kyoto, Japan',
    location_lat: 35.0116, location_lng: 135.7681, location_place_id: 'ChIJ5eCr2MUVAWART84qqT2cR4Y',
    location_country: 'Japan', location_country_code: 'JP', location_type: 'city',
    proximity_radius_km: 50, sort_order: 1,
    start_date: '2026-04-06', end_date: '2026-04-09',
    image_url: 'https://picsum.photos/400/300?random=31',
  },
  {
    trip_id: tripByTitle['Japan Circuit'].id, location_name: 'Osaka, Japan',
    location_lat: 34.6937, location_lng: 135.5023, location_place_id: 'ChIJ4eIGnCXmAGARGSMkr_IAACQ',
    location_country: 'Japan', location_country_code: 'JP', location_type: 'city',
    proximity_radius_km: 50, sort_order: 2,
    start_date: '2026-04-10', end_date: '2026-04-13',
    image_url: 'https://picsum.photos/400/300?random=32',
  },
  {
    trip_id: tripByTitle['Japan Circuit'].id, location_name: 'Hiroshima, Japan',
    location_lat: 34.3853, location_lng: 132.4553, location_place_id: 'ChIJA4UGSG_gWjURIL8C75mCzgg',
    location_country: 'Japan', location_country_code: 'JP', location_type: 'city',
    proximity_radius_km: 50, sort_order: 3,
    start_date: '2026-04-14', end_date: '2026-04-18',
    image_url: 'https://picsum.photos/400/300?random=33',
  },

  // China Deep Dive
  {
    trip_id: tripByTitle['China Deep Dive'].id, location_name: 'Shanghai, China',
    location_lat: 31.2304, location_lng: 121.4737, location_place_id: 'ChIJMzz1sUBJsjURoWTDI5bQBsQ',
    location_country: 'China', location_country_code: 'CN', location_type: 'city',
    proximity_radius_km: 50, sort_order: 0,
    image_url: 'https://picsum.photos/400/300?random=34',
  },
  {
    trip_id: tripByTitle['China Deep Dive'].id, location_name: 'Chengdu, China',
    location_lat: 30.5728, location_lng: 104.0668, location_place_id: 'ChIJh4IA5Z7fzDYRCeDnrAD3hhI',
    location_country: 'China', location_country_code: 'CN', location_type: 'city',
    proximity_radius_km: 50, sort_order: 1,
    image_url: 'https://picsum.photos/400/300?random=35',
  },

  // Taiwan & Thailand
  {
    trip_id: tripByTitle['Taiwan & Thailand'].id, location_name: 'Taipei, Taiwan',
    location_lat: 25.0330, location_lng: 121.5654, location_place_id: 'ChIJC9kpKCmpQjQRILQBMOFRBqg',
    location_country: 'Taiwan', location_country_code: 'TW', location_type: 'city',
    proximity_radius_km: 50, sort_order: 0,
    image_url: 'https://picsum.photos/400/300?random=36',
  },
  {
    trip_id: tripByTitle['Taiwan & Thailand'].id, location_name: 'Bangkok, Thailand',
    location_lat: 13.7563, location_lng: 100.5018, location_place_id: 'ChIJ82ENKDJgHTERIEjiXbIAAQE',
    location_country: 'Thailand', location_country_code: 'TH', location_type: 'city',
    proximity_radius_km: 50, sort_order: 1,
    image_url: 'https://picsum.photos/400/300?random=37',
  },

  // Western Sichuan
  {
    trip_id: tripByTitle['Western Sichuan'].id, location_name: 'Chengdu, China',
    location_lat: 30.5728, location_lng: 104.0668, location_place_id: 'ChIJh4IA5Z7fzDYRCeDnrAD3hhI',
    location_country: 'China', location_country_code: 'CN', location_type: 'city',
    proximity_radius_km: 50, sort_order: 0,
    start_date: '2026-06-15', end_date: '2026-06-17',
    image_url: 'https://picsum.photos/400/300?random=38',
  },
  {
    trip_id: tripByTitle['Western Sichuan'].id, location_name: 'Shangri-La, China',
    location_lat: 27.8333, location_lng: 99.7000, location_place_id: 'ChIJUxMKJR98oTYRBjyIm9SMAJE',
    location_country: 'China', location_country_code: 'CN', location_type: 'city',
    proximity_radius_km: 50, sort_order: 1,
    start_date: '2026-06-18', end_date: '2026-06-22',
    image_url: 'https://picsum.photos/400/300?random=39',
  },
  {
    trip_id: tripByTitle['Western Sichuan'].id, location_name: 'Litang, China',
    location_lat: 30.0000, location_lng: 100.2667, location_place_id: 'ChIJQbkAeCJUfzYRHPOkn_TXALM',
    location_country: 'China', location_country_code: 'CN', location_type: 'city',
    proximity_radius_km: 50, sort_order: 2,
    start_date: '2026-06-23', end_date: '2026-06-28',
    image_url: 'https://picsum.photos/400/300?random=40',
  },
]

const dests = await q('trip_destinations', 'insert', destsData)
console.log(`  Inserted ${dests.length} destinations`)

const destByName = {}
for (const d of dests) destByName[d.location_name + '|' + tripByTitle[Object.keys(tripByTitle).find(k => tripByTitle[k].id === d.trip_id)].title] = d

// Helper to find a dest
function findDest(locPartial, tripTitle) {
  return dests.find(d => d.location_name.includes(locPartial) && d.trip_id === tripByTitle[tripTitle].id)
}

// ── 5. Link saved items to destinations ─────────────────────────────────────
console.log('\nLinking items to destinations...')

const destItemsData = [
  // Japan Circuit
  { destination_id: findDest('Tokyo', 'Japan Circuit').id, item_id: itemByTitle['Hidden ramen spot in Shibuya'].id, sort_order: 0 },
  { destination_id: findDest('Kyoto', 'Japan Circuit').id, item_id: itemByTitle['Fushimi Inari at sunrise — no crowds'].id, sort_order: 0 },
  { destination_id: findDest('Osaka', 'Japan Circuit').id, item_id: itemByTitle['Dotonbori street food walk'].id, sort_order: 0 },
  { destination_id: findDest('Hiroshima', 'Japan Circuit').id, item_id: itemByTitle['Hiroshima Peace Memorial itinerary'].id, sort_order: 0 },

  // China Deep Dive
  { destination_id: findDest('Shanghai', 'China Deep Dive').id, item_id: itemByTitle['Shanghai Bund architecture walk'].id, sort_order: 0 },
  { destination_id: findDest('Chengdu', 'China Deep Dive').id, item_id: itemByTitle['Chengdu hotpot guide — local favorites'].id, sort_order: 0 },
  { destination_id: findDest('Chengdu', 'China Deep Dive').id, item_id: itemByTitle['Giant Panda Research Base — morning visit tips'].id, sort_order: 1 },
]

// Link general items to trips
const generalItemsData = [
  { trip_id: tripByTitle['Japan Circuit'].id, item_id: itemByTitle['Ultimate Asia packing list for 3 weeks'].id, sort_order: 0 },
  { trip_id: tripByTitle['Japan Circuit'].id, item_id: itemByTitle['Visa requirements — China, Taiwan, Thailand'].id, sort_order: 1 },
]

const destItems = await q('destination_items', 'insert', destItemsData)
console.log(`  Linked ${destItems.length} items to destinations`)

const generalItems = await q('trip_general_items', 'insert', generalItemsData)
console.log(`  Linked ${generalItems.length} general items to trips`)

// Items left UNLINKED: Beijing Great Wall, Taiwan items, Thailand items
console.log('  Left unlinked: Great Wall (Beijing), Taiwan items (3), Thailand items (2)')

// ── 6. Comments & votes on Japan Circuit ────────────────────────────────────
console.log('\nInserting comments and votes...')

const commentsData = [
  {
    trip_id: tripByTitle['Japan Circuit'].id,
    item_id: itemByTitle['Hidden ramen spot in Shibuya'].id,
    user_id: userId,
    body: 'We HAVE to go here on the first night. I saw this place on three different TikToks.',
  },
  {
    trip_id: tripByTitle['Japan Circuit'].id,
    item_id: itemByTitle['Fushimi Inari at sunrise — no crowds'].id,
    user_id: userId,
    body: 'Sunrise is at 5:45am in April. We should take the first train from Kyoto Station.',
  },
]

const comments = await q('comments', 'insert', commentsData)
console.log(`  Inserted ${comments.length} comments`)

const votesData = [
  { trip_id: tripByTitle['Japan Circuit'].id, item_id: itemByTitle['Hidden ramen spot in Shibuya'].id, user_id: userId },
  { trip_id: tripByTitle['Japan Circuit'].id, item_id: itemByTitle['Fushimi Inari at sunrise — no crowds'].id, user_id: userId },
  { trip_id: tripByTitle['Japan Circuit'].id, item_id: itemByTitle['Dotonbori street food walk'].id, user_id: userId },
]

const votes = await q('votes', 'insert', votesData)
console.log(`  Inserted ${votes.length} votes`)

// ── Done ────────────────────────────────────────────────────────────────────
console.log('\n✓ Seed complete!')
console.log(`  ${savedItems.length} saved items`)
console.log(`  ${trips.length} trips`)
console.log(`  ${dests.length} destinations`)
console.log(`  ${destItems.length} destination-item links`)
console.log(`  ${generalItems.length} general-item links`)
console.log(`  ${comments.length} comments`)
console.log(`  ${votes.length} votes`)
console.log(`  5 items left unlinked for Unassigned/Nearby testing`)
