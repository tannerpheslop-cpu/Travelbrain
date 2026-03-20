/**
 * React Query hooks for all Supabase data fetching.
 *
 * Each hook wraps a Supabase query with React Query's caching layer so that
 * page switches serve cached data instantly and background refetches keep it fresh.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { getInboxClusters } from '../lib/clusters'
import type { SavedItem, Trip, TripDestination, TripRoute } from '../types'
import type { LocationSelection } from '../components/LocationAutocomplete'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TripWithDestinations extends Trip {
  trip_destinations: TripDestination[]
}

export interface DestWithCount extends TripDestination {
  _count: number
}

export interface CompanionWithUser {
  id: string
  trip_id: string
  user_id: string
  role: 'companion'
  invited_at: string
  user: { id: string; email: string; display_name: string | null }
}

export interface PendingInvite {
  id: string
  trip_id: string
  email: string
  invited_at: string
}

// ── Query Keys ────────────────────────────────────────────────────────────────

export const queryKeys = {
  savedItems: (userId: string) => ['saved-items', userId] as const,
  savedItem: (itemId: string) => ['saved-item', itemId] as const,
  trips: (userId: string) => ['trips', userId] as const,
  trip: (tripId: string) => ['trip', tripId] as const,
  tripDestinations: (tripId: string) => ['trip-destinations', tripId] as const,
  tripRoutes: (tripId: string) => ['trip-routes', tripId] as const,
  tripGeneralItems: (tripId: string) => ['trip-general-items', tripId] as const,
  destinationItems: (destId: string) => ['destination-items', destId] as const,
  comments: (tripId: string, itemId: string) => ['comments', tripId, itemId] as const,
  companions: (tripId: string) => ['companions', tripId] as const,
  inboxClusters: (userId: string) => ['inbox-clusters', userId] as const,
  tripItemMappings: (userId: string) => ['trip-item-mappings', userId] as const,
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** All saved items for the current user (Horizon page). */
export function useSavedItems() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.savedItems(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SavedItem[]
    },
    enabled: !!user,
  })
}

/** A single saved item by ID. */
export function useSavedItem(itemId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.savedItem(itemId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_items')
        .select('*')
        .eq('id', itemId!)
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data as SavedItem
    },
    enabled: !!user && !!itemId,
  })
}

/** All trips with their destinations for the current user. */
export function useTripsQuery() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.trips(user?.id ?? ''),
    queryFn: async () => {
      // Try updated_at first (requires migration), fall back to created_at
      let result = await supabase
        .from('trips')
        .select('*, trip_destinations(*)')
        .eq('owner_id', user!.id)
        .order('updated_at', { ascending: false })

      if (result.error) {
        result = await supabase
          .from('trips')
          .select('*, trip_destinations(*)')
          .eq('owner_id', user!.id)
          .order('created_at', { ascending: false })
      }

      if (result.error) throw result.error

      return ((result.data as TripWithDestinations[]) ?? []).map((t) => ({
        ...t,
        is_featured: t.is_featured ?? false,
        is_favorited: t.is_favorited ?? false,
        updated_at: t.updated_at ?? t.created_at,
        trip_destinations: (t.trip_destinations ?? []).sort((a, b) => a.sort_order - b.sort_order),
      }))
    },
    enabled: !!user,
  })
}

/** A single trip by ID. */
export function useTripQuery(tripId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.trip(tripId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId!)
        .eq('owner_id', user!.id)
        .single()
      if (error) throw error
      return data as Trip
    },
    enabled: !!user && !!tripId,
  })
}

/** Destinations for a trip, with item counts. */
export function useTripDestinations(tripId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tripDestinations(tripId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_destinations')
        .select('*, destination_items(count)')
        .eq('trip_id', tripId!)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return ((data as unknown as Array<TripDestination & { destination_items: { count: number }[] }>) ?? [])
        .map((d) => ({
          ...d,
          _count: d.destination_items?.[0]?.count ?? 0,
        })) as DestWithCount[]
    },
    enabled: !!tripId,
  })
}

/** Routes for a trip. */
export function useTripRoutes(tripId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tripRoutes(tripId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_routes')
        .select('*')
        .eq('trip_id', tripId!)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as TripRoute[]
    },
    enabled: !!tripId,
  })
}

/** Companions and pending invites for a trip. */
export function useCompanionsQuery(tripId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.companions(tripId ?? ''),
    queryFn: async () => {
      const [companionsRes, pendingRes] = await Promise.all([
        supabase
          .from('companions')
          .select('id, trip_id, user_id, role, invited_at, user:users(id, email, display_name)')
          .eq('trip_id', tripId!)
          .order('invited_at', { ascending: true }),
        supabase
          .from('pending_invites')
          .select('id, trip_id, email, invited_at')
          .eq('trip_id', tripId!)
          .order('invited_at', { ascending: true }),
      ])
      return {
        companions: (companionsRes.data as unknown as CompanionWithUser[]) ?? [],
        pendingInvites: (pendingRes.data as PendingInvite[]) ?? [],
      }
    },
    enabled: !!tripId,
  })
}

/** Inbox geographic clusters for trip creation suggestions. */
export function useInboxClusters() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.inboxClusters(user?.id ?? ''),
    queryFn: () => getInboxClusters(user!.id),
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // clusters are heavier — cache 5 min
  })
}

/**
 * Trip-item assignment mappings for the Horizon's "Unplanned" filter.
 * Returns an array of { trip_id, item_id } for all user's trips.
 */
export function useTripItemMappings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.tripItemMappings(user?.id ?? ''),
    queryFn: async () => {
      // Fetch trips first
      const { data: tripsData } = await supabase
        .from('trips')
        .select('id')
        .eq('owner_id', user!.id)
      const tripIds = (tripsData ?? []).map((t: { id: string }) => t.id)
      if (tripIds.length === 0) return []

      const { data: destRows } = await supabase
        .from('trip_destinations')
        .select('id, trip_id')
        .in('trip_id', tripIds)
      const destMap = new Map(
        (destRows ?? []).map((d: { id: string; trip_id: string }) => [d.id, d.trip_id]),
      )
      const destIds = [...destMap.keys()]
      const [diRes, giRes] = await Promise.all([
        destIds.length > 0
          ? supabase.from('destination_items').select('item_id, destination_id').in('destination_id', destIds)
          : Promise.resolve({ data: [] as { item_id: string; destination_id: string }[] }),
        supabase.from('trip_general_items').select('item_id, trip_id').in('trip_id', tripIds),
      ])
      const combined: { trip_id: string; item_id: string }[] = [
        ...((diRes.data ?? []) as { item_id: string; destination_id: string }[])
          .map((di) => ({
            item_id: di.item_id,
            trip_id: destMap.get(di.destination_id) ?? '',
          }))
          .filter((x) => x.trip_id !== ''),
        ...((giRes.data ?? []) as { item_id: string; trip_id: string }[]).map((gi) => ({
          item_id: gi.item_id,
          trip_id: gi.trip_id,
        })),
      ]
      return combined
    },
    enabled: !!user,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Delete a saved item with cascading FK cleanup. */
export function useDeleteItem() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (itemId: string) => {
      await supabase.from('destination_items').delete().eq('item_id', itemId)
      await supabase.from('trip_general_items').delete().eq('item_id', itemId)
      await supabase.from('comments').delete().eq('item_id', itemId)
      await supabase.from('votes').delete().eq('item_id', itemId)
      const { error } = await supabase.from('saved_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onMutate: async (itemId) => {
      const key = queryKeys.savedItems(user?.id ?? '')
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<SavedItem[]>(key)
      queryClient.setQueryData<SavedItem[]>(key, (old) =>
        (old ?? []).filter((i) => i.id !== itemId),
      )
      return { previous }
    },
    onError: (_err, _itemId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.savedItems(user?.id ?? ''), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })
      queryClient.invalidateQueries({ queryKey: ['destination-items'] })
      queryClient.invalidateQueries({ queryKey: ['trip-general-items'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.tripItemMappings(user?.id ?? '') })
    },
  })
}

/** Create a new trip. */
export function useCreateTrip() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { title: string }) => {
      const { data, error } = await supabase
        .from('trips')
        .insert({
          owner_id: user!.id,
          title: input.title.trim(),
          status: 'aspirational',
        })
        .select()
        .single()
      if (error) throw error
      const raw = data as Trip
      const trip: TripWithDestinations = {
        ...raw,
        is_featured: raw.is_featured ?? false,
        is_favorited: raw.is_favorited ?? false,
        updated_at: raw.updated_at ?? raw.created_at,
        trip_destinations: [],
      }
      trackEvent('trip_created', user!.id, { trip_id: trip.id, status: trip.status })
      return trip
    },
    onSuccess: (trip) => {
      // Optimistically prepend to trips list
      queryClient.setQueryData<TripWithDestinations[]>(
        queryKeys.trips(user?.id ?? ''),
        (old) => [trip, ...(old ?? [])],
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips(user?.id ?? '') })
    },
  })
}

/** Create a destination on a trip. */
export function useCreateDestination() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      tripId: string
      location: LocationSelection
      sortOrder: number
      imageUrl?: string
      imageSource?: string
      imageCreditName?: string
      imageCreditUrl?: string
    }) => {
      const { data, error } = await supabase
        .from('trip_destinations')
        .insert({
          trip_id: input.tripId,
          location_name: input.location.name,
          location_lat: input.location.lat,
          location_lng: input.location.lng,
          location_place_id: input.location.place_id,
          location_country: input.location.country ?? 'Unknown',
          location_country_code: input.location.country_code ?? 'XX',
          location_type: input.location.location_type,
          proximity_radius_km: input.location.proximity_radius_km,
          location_name_en: input.location.name_en ?? null,
          location_name_local: input.location.name_local ?? null,
          sort_order: input.sortOrder,
          ...(input.imageUrl
            ? {
                image_url: input.imageUrl,
                image_source: input.imageSource ?? null,
                image_credit_name: input.imageCreditName ?? null,
                image_credit_url: input.imageCreditUrl ?? null,
              }
            : {}),
        })
        .select()
        .single()
      if (error) throw error
      trackEvent('destination_added', user?.id ?? null, {
        trip_id: input.tripId,
        location_name: input.location.name,
      })
      return data as TripDestination
    },
    onSuccess: (_dest, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips(user?.id ?? '') })
      queryClient.invalidateQueries({ queryKey: queryKeys.trip(input.tripId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.tripDestinations(input.tripId) })
    },
  })
}

/** Delete a trip with cascading FK cleanup. */
export function useDeleteTrip() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { tripId: string; destIds: string[] }) => {
      if (input.destIds.length > 0) {
        await supabase.from('destination_items').delete().in('destination_id', input.destIds)
      }
      await supabase.from('trip_general_items').delete().eq('trip_id', input.tripId)
      await supabase.from('comments').delete().eq('trip_id', input.tripId)
      await supabase.from('votes').delete().eq('trip_id', input.tripId)
      await supabase.from('companions').delete().eq('trip_id', input.tripId)
      await supabase.from('trip_destinations').delete().eq('trip_id', input.tripId)
      await supabase.from('trips').delete().eq('id', input.tripId)
    },
    onMutate: async (input) => {
      const key = queryKeys.trips(user?.id ?? '')
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TripWithDestinations[]>(key)
      queryClient.setQueryData<TripWithDestinations[]>(key, (old) =>
        (old ?? []).filter((t) => t.id !== input.tripId),
      )
      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.trips(user?.id ?? ''), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips(user?.id ?? '') })
    },
  })
}

/** Toggle trip favorited status with optimistic update. */
export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { tripId: string; favorite: boolean }) => {
      // Clear any existing favorited trip
      await supabase
        .from('trips')
        .update({ is_favorited: false })
        .eq('owner_id', user!.id)
        .eq('is_favorited', true)
      if (input.favorite) {
        await supabase
          .from('trips')
          .update({ is_favorited: true })
          .eq('id', input.tripId)
      }
    },
    onMutate: async (input) => {
      const key = queryKeys.trips(user?.id ?? '')
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TripWithDestinations[]>(key)
      queryClient.setQueryData<TripWithDestinations[]>(key, (old) =>
        (old ?? []).map((t) => ({
          ...t,
          is_favorited: input.favorite ? t.id === input.tripId : t.id === input.tripId ? false : t.is_favorited,
        })),
      )
      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.trips(user?.id ?? ''), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips(user?.id ?? '') })
    },
  })
}

/** Update a saved item (edit fields). */
export function useUpdateItem() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { itemId: string; updates: Partial<SavedItem> }) => {
      const { error } = await supabase
        .from('saved_items')
        .update(input.updates)
        .eq('id', input.itemId)
      if (error) throw error
      trackEvent('save_edited', user?.id ?? null, {
        item_id: input.itemId,
        fields_changed: Object.keys(input.updates),
      })
    },
    onSettled: (_data, _err, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItem(input.itemId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })
    },
  })
}
