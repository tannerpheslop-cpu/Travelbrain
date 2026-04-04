/**
 * React Query hooks for all Supabase data fetching.
 *
 * Each hook wraps a Supabase query with React Query's caching layer so that
 * page switches serve cached data instantly and background refetches keep it fresh.
 */
import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { deriveRouteLocation } from '../lib/deriveRouteLocation'
import { getInboxClusters } from '../lib/clusters'
import type { SavedItem, Trip, TripDestination, TripRoute, ItemTag, TagType, Route } from '../types'
import type { LocationSelection } from '../components/LocationAutocomplete'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TripWithDestinations extends Trip {
  trip_destinations: TripDestination[]
  companion_count?: number
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
  itemTags: (itemId: string) => ['item-tags', itemId] as const,
  allUserTags: (userId: string) => ['all-user-tags', userId] as const,
  userCustomTags: (userId: string) => ['user-custom-tags', userId] as const,
  routes: (userId: string) => ['routes', userId] as const,
}

// ── Standalone fetch functions (for prefetchQuery — no hooks) ────────────────

export async function fetchTrips(userId: string) {
  let result = await supabase
    .from('trips')
    .select('*, trip_destinations(*), companions(count)')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })

  if (result.error) {
    result = await supabase
      .from('trips')
      .select('*, trip_destinations(*), companions(count)')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
  }

  if (result.error) throw result.error

  return ((result.data ?? []) as Array<Record<string, unknown>>).map((t) => {
    const companions = t.companions as Array<{ count: number }> | undefined
    const companion_count = companions?.[0]?.count ?? 0
    const trip = t as unknown as TripWithDestinations
    return {
      ...trip,
      is_featured: trip.is_featured ?? false,
      is_favorited: trip.is_favorited ?? false,
      updated_at: trip.updated_at ?? trip.created_at,
      trip_destinations: (trip.trip_destinations ?? []).sort((a, b) => a.sort_order - b.sort_order),
      companion_count,
    }
  })
}

export async function fetchTrip(tripId: string, userId: string) {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .eq('owner_id', userId)
    .single()
  if (error) throw error
  return data as Trip
}

export async function fetchTripDestinations(tripId: string) {
  const { data, error } = await supabase
    .from('trip_destinations')
    .select('*, destination_items(count)')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return ((data as unknown as Array<TripDestination & { destination_items: { count: number }[] }>) ?? [])
    .map((d) => ({
      ...d,
      _count: d.destination_items?.[0]?.count ?? 0,
    })) as DestWithCount[]
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** All saved items for the current user (Horizon page). Excludes saves absorbed by Routes. */
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
        .is('route_id', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SavedItem[]
    },
    enabled: !!user,
  })
}

/** All saved items including those in Routes (for graph, counts, etc.) */
export function useAllSavedItems() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['all-saved-items', user?.id ?? ''],
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

/** All routes for the current user with their items. */
export function useRoutes() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['routes', user?.id ?? ''],
    queryFn: async () => {
      const { data: routes, error } = await supabase
        .from('routes')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (routes ?? []) as Route[]
    },
    enabled: !!user,
  })
}

/** Saves belonging to a specific Route. */
export function useRouteItems(routeId: string | null) {
  return useQuery({
    queryKey: ['route-items', routeId ?? ''],
    queryFn: async () => {
      if (!routeId) return []
      const { data, error } = await supabase
        .from('route_items')
        .select('saved_item_id, route_order, section_label, section_order, saved_items(*)')
        .eq('route_id', routeId)
        .order('section_order', { ascending: true })
        .order('route_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as Array<{ saved_item_id: string; route_order: number; section_label: string | null; section_order: number; saved_items: SavedItem }>
    },
    enabled: !!routeId,
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
    queryFn: () => fetchTrips(user!.id),
    enabled: !!user,
  })
}

/** A single trip by ID. */
export function useTripQuery(tripId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.trip(tripId ?? ''),
    queryFn: () => fetchTrip(tripId!, user!.id),
    enabled: !!user && !!tripId,
  })
}

/** Destinations for a trip, with item counts. */
export function useTripDestinations(tripId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tripDestinations(tripId ?? ''),
    queryFn: () => fetchTripDestinations(tripId!),
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
          .select('id, trip_id, user_id, role, invited_at, user:users(id, email, display_name, avatar_url)')
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

/**
 * Derives a map of item_id → number of distinct trips the item is linked to.
 * Consumes the same cache as useTripItemMappings() — no extra network request.
 */
export function useTripLinkCounts(): Map<string, number> {
  const { data: mappings = [] } = useTripItemMappings()
  return useMemo(() => {
    const perItem = new Map<string, Set<string>>()
    for (const { item_id, trip_id } of mappings) {
      let s = perItem.get(item_id)
      if (!s) { s = new Set(); perItem.set(item_id, s) }
      s.add(trip_id)
    }
    const counts = new Map<string, number>()
    for (const [itemId, tripSet] of perItem) {
      counts.set(itemId, tripSet.size)
    }
    return counts
  }, [mappings])
}

/** Fetch pending extraction counts per source entry. Returns Map<entryId, itemCount>. */
export function usePendingExtractionCounts(): Map<string, number> {
  const { user } = useAuth()
  const { data = [] } = useQuery({
    queryKey: ['pending-extraction-counts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('pending_extractions')
        .select('source_entry_id, extracted_items')
        .eq('user_id', user.id)
        .eq('status', 'pending')
      if (error) throw error
      return (data ?? []) as Array<{ source_entry_id: string; extracted_items: unknown[] }>
    },
    enabled: !!user,
  })
  return useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of data) {
      const items = Array.isArray(row.extracted_items) ? row.extracted_items : []
      counts.set(row.source_entry_id, items.length)
    }
    return counts
  }, [data])
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
      // Core payload — columns guaranteed to exist
      const corePayload: Record<string, unknown> = {
        trip_id: input.tripId,
        location_name: input.location.name,
        location_lat: input.location.lat,
        location_lng: input.location.lng,
        location_place_id: input.location.place_id,
        location_country: input.location.country ?? 'Unknown',
        location_country_code: input.location.country_code ?? 'XX',
        location_type: input.location.location_type,
        proximity_radius_km: input.location.proximity_radius_km,
        sort_order: input.sortOrder,
      }

      // Image fields (only if image was fetched)
      if (input.imageUrl) {
        corePayload.image_url = input.imageUrl
        corePayload.image_source = input.imageSource ?? null
        corePayload.image_credit_name = input.imageCreditName ?? null
        corePayload.image_credit_url = input.imageCreditUrl ?? null
      }

      // Extended fields (may not exist on older schemas)
      const extendedPayload: Record<string, unknown> = {
        ...corePayload,
        ...(input.location.name_en ? { location_name_en: input.location.name_en } : {}),
        ...(input.location.name_local ? { location_name_local: input.location.name_local } : {}),
      }

      // Try extended first, fall back to core if columns don't exist
      let { data, error } = await supabase
        .from('trip_destinations')
        .insert(extendedPayload)
        .select()
        .single()

      if (error) {
        console.warn('Destination insert with extended columns failed, retrying core:', error.message)
        const retry = await supabase
          .from('trip_destinations')
          .insert(corePayload)
          .select()
          .single()
        data = retry.data
        error = retry.error
      }

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
    onSettled: async (_data, _err, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItem(input.itemId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })

      // Re-derive route location when a route-member save's location changes
      const locationFields = ['location_name', 'location_country', 'location_country_code']
      const changedLocation = locationFields.some(f => f in input.updates)
      if (changedLocation) {
        const { data: item } = await supabase
          .from('saved_items')
          .select('route_id')
          .eq('id', input.itemId)
          .single()
        if (item?.route_id) {
          await deriveRouteLocation(item.route_id)
          queryClient.invalidateQueries({ queryKey: queryKeys.routes(user?.id ?? '') })
        }
      }
    },
  })
}

// ── Item Tags ─────────────────────────────────────────────────────────────────

/** Tags for a specific saved item. */
export function useItemTags(itemId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.itemTags(itemId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_tags')
        .select('*')
        .eq('item_id', itemId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ItemTag[]
    },
    enabled: !!itemId,
  })
}

/** All tags for a user (for autocomplete / tag management). */
export function useAllUserTags(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.allUserTags(userId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_tags')
        .select('*')
        .eq('user_id', userId!)
        .order('tag_name', { ascending: true })
      if (error) throw error
      return (data ?? []) as ItemTag[]
    },
    enabled: !!userId,
  })
}

/** Distinct custom tags for a user (for autocomplete suggestions). */
export function useUserCustomTags(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.userCustomTags(userId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_tags')
        .select('tag_name')
        .eq('user_id', userId!)
        .eq('tag_type', 'custom')
        .order('tag_name', { ascending: true })
      if (error) throw error
      // Deduplicate tag names
      const unique = [...new Set((data ?? []).map((t: { tag_name: string }) => t.tag_name))]
      return unique
    },
    enabled: !!userId,
  })
}

/** Add a tag to an item. */
export function useAddTag() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { itemId: string; tagName: string; tagType: TagType }) => {
      const { data, error } = await supabase
        .from('item_tags')
        .insert({
          item_id: input.itemId,
          tag_name: input.tagName,
          tag_type: input.tagType,
          user_id: user!.id,
        })
        .select()
        .single()
      if (error) throw error
      return data as ItemTag
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itemTags(input.itemId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.allUserTags(user?.id ?? '') })
      queryClient.invalidateQueries({ queryKey: queryKeys.userCustomTags(user?.id ?? '') })
    },
  })
}

/** Remove a tag from an item (by item_id + tag_name). */
export function useRemoveTag() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: { itemId: string; tagName: string }) => {
      const { error } = await supabase
        .from('item_tags')
        .delete()
        .eq('item_id', input.itemId)
        .eq('tag_name', input.tagName)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.itemTags(input.itemId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.allUserTags(user?.id ?? '') })
      queryClient.invalidateQueries({ queryKey: queryKeys.userCustomTags(user?.id ?? '') })
    },
  })
}

/**
 * Write tags for a newly created item (batch insert).
 * Used by save flows to write category + custom tags in one operation.
 * Silently ignores conflicts (duplicate tags).
 */
export async function writeItemTags(
  itemId: string,
  userId: string,
  tags: { tagName: string; tagType: TagType }[],
): Promise<void> {
  if (tags.length === 0) return
  const rows = tags.map((t) => ({
    item_id: itemId,
    tag_name: t.tagName,
    tag_type: t.tagType,
    user_id: userId,
  }))
  // Use upsert with onConflict to silently skip duplicates
  await supabase.from('item_tags').upsert(rows, { onConflict: 'item_id,tag_name' })
}
