import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { ok: false, error: 'Not authenticated.' }

    const supabaseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl
    const res = await fetch(`${supabaseUrl}/functions/v1/invite-companion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), trip_id: tripId }),
    })

    const json = await res.json() as { result?: string; user_id?: string; error?: string }

    if (!res.ok) {
      return { ok: false, error: json.error ?? 'Something went wrong.' }
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
