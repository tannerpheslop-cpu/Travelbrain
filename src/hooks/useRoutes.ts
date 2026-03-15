import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { TripRoute } from '../types'

export function useRoutes(tripId: string | undefined) {
  const [routes, setRoutes] = useState<TripRoute[]>([])

  const fetchRoutes = useCallback(async () => {
    if (!tripId) return []
    const { data } = await supabase
      .from('trip_routes')
      .select('*')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true })
    const fetched = (data ?? []) as TripRoute[]
    setRoutes(fetched)
    return fetched
  }, [tripId])

  /** Create a route from selected destination IDs */
  const createRoute = useCallback(async (name: string, destinationIds: string[], sortOrder: number) => {
    if (!tripId) return null
    const { data, error } = await supabase
      .from('trip_routes')
      .insert({ trip_id: tripId, name, sort_order: sortOrder })
      .select()
      .single()
    if (error || !data) return null
    const route = data as TripRoute

    // Update selected destinations to belong to this route
    await supabase
      .from('trip_destinations')
      .update({ route_id: route.id })
      .in('id', destinationIds)

    setRoutes((prev) => [...prev, route].sort((a, b) => a.sort_order - b.sort_order))
    return route
  }, [tripId])

  /** Ungroup a route — set route_id=null on children, delete route */
  const ungroupRoute = useCallback(async (routeId: string) => {
    // Clear route_id on destinations
    await supabase
      .from('trip_destinations')
      .update({ route_id: null })
      .eq('route_id', routeId)

    // Delete the route
    await supabase.from('trip_routes').delete().eq('id', routeId)

    setRoutes((prev) => prev.filter((r) => r.id !== routeId))
  }, [])

  /** Rename a route */
  const renameRoute = useCallback(async (routeId: string, newName: string) => {
    await supabase.from('trip_routes').update({ name: newName }).eq('id', routeId)
    setRoutes((prev) => prev.map((r) => r.id === routeId ? { ...r, name: newName } : r))
  }, [])

  /** Reorder routes (update sort_order for each) */
  const reorderRoutes = useCallback(async (orderedRoutes: TripRoute[]) => {
    setRoutes(orderedRoutes)
    const updates = orderedRoutes.map((r, i) => ({ id: r.id, sort_order: i }))
    for (const u of updates) {
      await supabase.from('trip_routes').update({ sort_order: u.sort_order }).eq('id', u.id)
    }
  }, [])

  return { routes, setRoutes, fetchRoutes, createRoute, ungroupRoute, renameRoute, reorderRoutes }
}
