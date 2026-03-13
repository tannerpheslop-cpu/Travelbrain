import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Convenience helper: call an Edge Function with the anon key (no user JWT needed). */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Edge function error: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
