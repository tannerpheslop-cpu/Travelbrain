import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env.local')
  const content = fs.readFileSync(envPath, 'utf-8')
  const vars: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    let val = trimmed.slice(eqIdx + 1)
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1)
    }
    vars[key] = val
  }
  return vars
}

let _client: ReturnType<typeof createClient> | null = null
let _authPromise: Promise<void> | null = null

function getSupabase() {
  if (_client) return _client
  const env = loadEnv()
  _client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  return _client
}

/**
 * Ensure test user auth is initialized. Returns the authenticated Supabase client.
 */
export async function ensureAuth() {
  const sb = getSupabase()
  if (!_authPromise) {
    const env = loadEnv()
    _authPromise = sb.auth.signInWithPassword({
      email: env.VITE_DEV_LOGIN_EMAIL,
      password: env.VITE_DEV_LOGIN_PASSWORD,
    }).then(({ error }) => {
      if (error) throw new Error(`Test auth failed: ${error.message}`)
    })
  }
  await _authPromise
  return sb
}

/**
 * Delete a trip and all related data by trip ID.
 */
export async function deleteTrip(tripId: string) {
  const sb = await ensureAuth()

  const { data: dests } = await sb.from('trip_destinations').select('id').eq('trip_id', tripId)
  const destIds = (dests ?? []).map((d: { id: string }) => d.id)
  if (destIds.length > 0) {
    await sb.from('destination_items').delete().in('destination_id', destIds)
  }
  await sb.from('trip_general_items').delete().eq('trip_id', tripId)
  await sb.from('comments').delete().eq('trip_id', tripId)
  await sb.from('votes').delete().eq('trip_id', tripId)
  await sb.from('companions').delete().eq('trip_id', tripId)
  await sb.from('trip_destinations').delete().eq('trip_id', tripId)
  await sb.from('trips').delete().eq('id', tripId)
}
