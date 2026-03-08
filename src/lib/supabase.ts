import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://jauohzeyvmitsclnmxwg.supabase.co'
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphdW9oemV5dm1pdHNjbG5teHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjg0NzYsImV4cCI6MjA4Njg0NDQ3Nn0.LXuEcSJrxT0-3FhLQ6_yVoD7L5TIPtkj2MKScZCHqWg'

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
