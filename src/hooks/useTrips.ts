import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Trip } from '../types'

interface CreateTripInput {
  title: string
  start_date?: string | null
  end_date?: string | null
}

export function useTrips() {
  const { user, loading: authLoading } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  // Stay in loading state while auth is resolving, so we never show skeletons
  // for a user-less fetch that exits early.
  const [loading, setLoading] = useState(true)

  const fetchTrips = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('trips')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })

    if (!fetchError) {
      setTrips((data as Trip[]) ?? [])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    // Don't attempt fetch until auth has resolved
    if (authLoading) return
    fetchTrips()
  }, [authLoading, fetchTrips])

  const createTrip = useCallback(
    async (input: CreateTripInput): Promise<{ trip: Trip | null; error: string | null }> => {
      if (!user) return { trip: null, error: 'Not authenticated' }

      const hasDates = input.start_date && input.end_date
      const status = hasDates ? 'scheduled' : 'draft'

      const { data, error: insertError } = await supabase
        .from('trips')
        .insert({
          owner_id: user.id,
          title: input.title.trim(),
          status,
          start_date: input.start_date ?? null,
          end_date: input.end_date ?? null,
        })
        .select()
        .single()

      if (insertError) {
        return { trip: null, error: insertError.message }
      }

      const newTrip = data as Trip
      setTrips((prev) => [newTrip, ...prev])
      return { trip: newTrip, error: null }
    },
    [user]
  )

  return { trips, loading, createTrip, refetch: fetchTrips }
}
