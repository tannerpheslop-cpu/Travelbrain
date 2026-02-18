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
  const { user } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTrips = useCallback(async () => {
    if (!user) return

    const { data, error: fetchError } = await supabase
      .from('trips')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setTrips((data as Trip[]) ?? [])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchTrips()
  }, [fetchTrips])

  const createTrip = useCallback(
    async (input: CreateTripInput): Promise<Trip | null> => {
      if (!user) return null

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
        setError(insertError.message)
        return null
      }

      const newTrip = data as Trip
      setTrips((prev) => [newTrip, ...prev])
      return newTrip
    },
    [user]
  )

  return { trips, loading, error, createTrip, refetch: fetchTrips }
}
