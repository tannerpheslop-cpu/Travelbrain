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

export function useCompanions(tripId: string | undefined) {
  const [companions, setCompanions] = useState<CompanionWithUser[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCompanions = useCallback(async () => {
    if (!tripId) { setLoading(false); return }

    setLoading(true)
    const { data, error } = await supabase
      .from('companions')
      .select('id, trip_id, user_id, role, invited_at, user:users(id, email, display_name)')
      .eq('trip_id', tripId)
      .order('invited_at', { ascending: true })

    if (!error && data) {
      setCompanions(data as unknown as CompanionWithUser[])
    }
    setLoading(false)
  }, [tripId])

  useEffect(() => { fetchCompanions() }, [fetchCompanions])

  /**
   * Looks up a user by email. Returns the user row if found, null otherwise.
   */
  async function lookupUserByEmail(email: string): Promise<{ id: string; email: string; display_name: string | null } | null> {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, display_name')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (error || !data) return null
    return data as { id: string; email: string; display_name: string | null }
  }

  /**
   * Invites a user (by their user_id) as a companion. Returns an error string or null on success.
   */
  async function inviteCompanion(userId: string): Promise<string | null> {
    if (!tripId) return 'No trip selected.'

    const { error } = await supabase
      .from('companions')
      .insert({ trip_id: tripId, user_id: userId, role: 'companion' })

    if (error) {
      if (error.code === '23505') return 'This person is already a companion on this trip.'
      return error.message
    }

    await fetchCompanions()
    return null
  }

  /**
   * Removes a companion row by its id.
   */
  async function removeCompanion(companionId: string): Promise<void> {
    await supabase.from('companions').delete().eq('id', companionId)
    setCompanions((prev) => prev.filter((c) => c.id !== companionId))
  }

  return { companions, loading, lookupUserByEmail, inviteCompanion, removeCompanion, refetch: fetchCompanions }
}
