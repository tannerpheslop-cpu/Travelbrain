import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import type { Trip, TripDestination } from '../types'
import type { LocationSelection } from '../components/LocationAutocomplete'

export interface TripWithDestinations extends Trip {
  trip_destinations: TripDestination[]
}

export function useTrips() {
  const { user, loading: authLoading } = useAuth()
  const [trips, setTrips] = useState<TripWithDestinations[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTrips = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('trips')
      .select('*, trip_destinations(*)')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })

    if (!fetchError) {
      const sorted = ((data as TripWithDestinations[]) ?? []).map((t) => ({
        ...t,
        trip_destinations: (t.trip_destinations ?? []).sort((a, b) => a.sort_order - b.sort_order),
      }))
      setTrips(sorted)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    fetchTrips()
  }, [authLoading, fetchTrips])

  const createTrip = useCallback(
    async (input: { title: string }): Promise<{ trip: TripWithDestinations | null; error: string | null }> => {
      if (!user) return { trip: null, error: 'Not authenticated' }

      const { data, error: insertError } = await supabase
        .from('trips')
        .insert({
          owner_id: user.id,
          title: input.title.trim(),
          status: 'aspirational',
        })
        .select()
        .single()

      if (insertError) return { trip: null, error: insertError.message }

      const newTrip: TripWithDestinations = { ...(data as Trip), trip_destinations: [] }
      trackEvent('trip_created', user.id, { trip_id: newTrip.id, status: newTrip.status })
      setTrips((prev) => [newTrip, ...prev])
      return { trip: newTrip, error: null }
    },
    [user],
  )

  const createDestination = useCallback(
    async (
      tripId: string,
      location: LocationSelection,
      sortOrder: number,
      imageUrl?: string,
    ): Promise<{ destination: TripDestination | null; error: string | null }> => {
      if (!user) return { destination: null, error: 'Not authenticated' }

      const { data, error: insertError } = await supabase
        .from('trip_destinations')
        .insert({
          trip_id: tripId,
          location_name: location.name,
          location_lat: location.lat,
          location_lng: location.lng,
          location_place_id: location.place_id,
          sort_order: sortOrder,
          ...(imageUrl ? { image_url: imageUrl } : {}),
        })
        .select()
        .single()

      if (insertError) return { destination: null, error: insertError.message }

      const dest = data as TripDestination
      trackEvent('destination_added', user.id, { trip_id: tripId, location_name: location.name })
      setTrips((prev) =>
        prev.map((t) =>
          t.id === tripId
            ? {
                ...t,
                trip_destinations: [...t.trip_destinations, dest].sort((a, b) => a.sort_order - b.sort_order),
              }
            : t,
        ),
      )
      return { destination: dest, error: null }
    },
    [user],
  )

  const deleteTrip = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      setTrips((prev) => prev.filter((t) => t.id !== id))

      const { error: deleteError } = await supabase.from('trips').delete().eq('id', id)
      if (deleteError) {
        fetchTrips()
        return { error: deleteError.message }
      }
      return { error: null }
    },
    [fetchTrips],
  )

  return { trips, loading, createTrip, createDestination, deleteTrip, refetch: fetchTrips }
}
