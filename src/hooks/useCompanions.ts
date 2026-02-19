import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = 'https://jauohzeyvmitsclnmxwg.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphdW9oemV5dm1pdHNjbG5teHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjg0NzYsImV4cCI6MjA4Njg0NDQ3Nn0.LXuEcSJrxT0-3FhLQ6_yVoD7L5TIPtkj2MKScZCHqWg'

export interface CompanionWithUser {
  id: string
  trip_id: string
  user_id: string
  role: 'companion'
  invited_at: string
  user: {
    id: string
    email: string
    display_name: string | null
  }
}

export interface PendingInvite {
  id: string
  trip_id: string
  email: string
  invited_at: string
}

/** Result returned from inviteByEmail */
export type InviteResult =
  | { ok: true; type: 'added' }   // existing user, added as companion
  | { ok: true; type: 'invited' } // no account yet, invite email sent
  | { ok: false; error: string }

export function useCompanions(tripId: string | undefined) {
  const [companions, setCompanions] = useState<CompanionWithUser[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCompanions = useCallback(async () => {
    if (!tripId) { setLoading(false); return }

    setLoading(true)
    const [companionsRes, pendingRes] = await Promise.all([
      supabase
        .from('companions')
        .select('id, trip_id, user_id, role, invited_at, user:users(id, email, display_name)')
        .eq('trip_id', tripId)
        .order('invited_at', { ascending: true }),
      supabase
        .from('pending_invites')
        .select('id, trip_id, email, invited_at')
        .eq('trip_id', tripId)
        .order('invited_at', { ascending: true }),
    ])

    if (!companionsRes.error && companionsRes.data) {
      setCompanions(companionsRes.data as unknown as CompanionWithUser[])
    }
    if (!pendingRes.error && pendingRes.data) {
      setPendingInvites(pendingRes.data as PendingInvite[])
    }
    setLoading(false)
  }, [tripId])

  useEffect(() => { fetchCompanions() }, [fetchCompanions])

  /**
   * Invites an email via the Edge Function.
   * - If they have an account: adds them as a companion immediately.
   * - If not: sends a Supabase invite email and stores a pending_invite row.
   */
  async function inviteByEmail(email: string): Promise<InviteResult> {
    if (!tripId) return { ok: false, error: 'No trip selected.' }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (!user || userError) return { ok: false, error: 'Not authenticated.' }

    // getSession gives us the access token; it's valid if getUser succeeded
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { ok: false, error: 'Not authenticated.' }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-companion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), trip_id: tripId }),
    })

    const json = await res.json() as { result?: string; user_id?: string; error?: string }
    console.log('[invite-companion] status:', res.status, 'body:', json)

    if (!res.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` }
    }

    // Refresh so the UI reflects whatever the function did
    await fetchCompanions()

    if (json.result === 'added') return { ok: true, type: 'added' }
    return { ok: true, type: 'invited' }
  }

  /**
   * Removes a confirmed companion by their companion row id.
   */
  async function removeCompanion(companionId: string): Promise<void> {
    await supabase.from('companions').delete().eq('id', companionId)
    setCompanions((prev) => prev.filter((c) => c.id !== companionId))
  }

  /**
   * Revokes a pending invite by its id.
   */
  async function removePendingInvite(inviteId: string): Promise<void> {
    await supabase.from('pending_invites').delete().eq('id', inviteId)
    setPendingInvites((prev) => prev.filter((p) => p.id !== inviteId))
  }

  return {
    companions,
    pendingInvites,
    loading,
    inviteByEmail,
    removeCompanion,
    removePendingInvite,
    refetch: fetchCompanions,
  }
}
