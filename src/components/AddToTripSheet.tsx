import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import type { Trip, TripDestination } from '../types'

interface AddToTripSheetProps {
  itemId: string
  onClose: () => void
  onAdded?: (tripTitle: string) => void
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

export default function AddToTripSheet({ itemId, onClose, onAdded }: AddToTripSheetProps) {
  const { user } = useAuth()

  // Level 1 state
  const [trips, setTrips] = useState<Trip[]>([])
  const [loadingTrips, setLoadingTrips] = useState(true)

  // Level 2 state
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [destinations, setDestinations] = useState<TripDestination[]>([])
  const [loadingDests, setLoadingDests] = useState(false)

  // Which row is in-flight ('general' | destination.id)
  const [addingId, setAddingId] = useState<string | null>(null)

  const bodyRef = useRef<HTMLDivElement>(null)

  // ── Fetch trips on mount ──────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    supabase
      .from('trips')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTrips((data as Trip[]) ?? [])
        setLoadingTrips(false)
      })
  }, [user])

  // ── Fetch destinations when a trip is selected ────────────────────────────

  useEffect(() => {
    if (!selectedTrip) return
    setLoadingDests(true)
    setDestinations([])
    bodyRef.current?.scrollTo({ top: 0 })
    supabase
      .from('trip_destinations')
      .select('*')
      .eq('trip_id', selectedTrip.id)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setDestinations((data as TripDestination[]) ?? [])
        setLoadingDests(false)
      })
  }, [selectedTrip])

  // ── Add to trip general ───────────────────────────────────────────────────

  const handleAddGeneral = async () => {
    if (!selectedTrip || addingId) return
    setAddingId('general')

    const { data: existing } = await supabase
      .from('trip_general_items')
      .select('id')
      .eq('trip_id', selectedTrip.id)
      .eq('item_id', itemId)
      .maybeSingle()

    if (!existing) {
      const { data: maxRow } = await supabase
        .from('trip_general_items')
        .select('sort_order')
        .eq('trip_id', selectedTrip.id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      await supabase.from('trip_general_items').insert({
        trip_id: selectedTrip.id,
        item_id: itemId,
        sort_order: maxRow ? (maxRow.sort_order ?? 0) + 1 : 0,
      })
      trackEvent('item_added_to_trip_general', user?.id ?? null, {
        trip_id: selectedTrip.id,
        item_id: itemId,
      })
    }

    setAddingId(null)
    onClose()
    onAdded?.(selectedTrip.title)
  }

  // ── Add to a specific destination ─────────────────────────────────────────

  const handleAddToDestination = async (dest: TripDestination) => {
    if (addingId) return
    setAddingId(dest.id)

    const { data: existing } = await supabase
      .from('destination_items')
      .select('id')
      .eq('destination_id', dest.id)
      .eq('item_id', itemId)
      .maybeSingle()

    if (!existing) {
      const { data: maxRow } = await supabase
        .from('destination_items')
        .select('sort_order')
        .eq('destination_id', dest.id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      await supabase.from('destination_items').insert({
        destination_id: dest.id,
        item_id: itemId,
        day_index: null,
        sort_order: maxRow ? (maxRow.sort_order ?? 0) + 1 : 0,
      })
      trackEvent('item_added_to_destination', user?.id ?? null, {
        destination_id: dest.id,
        item_id: itemId,
        trip_id: selectedTrip?.id,
      })

      // Status progression: aspirational → planning
      if (selectedTrip) {
        supabase
          .from('trips')
          .update({ status: 'planning' })
          .eq('id', selectedTrip.id)
          .eq('status', 'aspirational')
          .then(() => {/* DB trigger is authoritative */})
          .catch(() => {/* no-op */})
      }
    }

    setAddingId(null)
    onClose()
    onAdded?.(selectedTrip!.title)
  }

  const Spinner = () => (
    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 shrink-0">
          {selectedTrip && (
            <button
              type="button"
              onClick={() => { setSelectedTrip(null); setAddingId(null) }}
              className="p-1 -ml-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
              aria-label="Back to trips"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <h2 className="flex-1 text-base font-semibold text-gray-900 truncate">
            {selectedTrip ? selectedTrip.title : 'Add to Trip'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="overflow-y-auto flex-1 pb-6">

          {/* ── Level 1: pick a trip ────────────────────────────────────────── */}
          {!selectedTrip && (
            <>
              {loadingTrips && (
                <div className="px-5 py-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse h-14 bg-gray-100 rounded-xl" />
                  ))}
                </div>
              )}
              {!loadingTrips && trips.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-gray-500 font-medium">No trips yet</p>
                  <p className="mt-1 text-sm text-gray-400">Create a trip from the Trips tab first.</p>
                </div>
              )}
              {!loadingTrips && trips.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {trips.map((trip) => (
                    <li key={trip.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedTrip(trip)}
                        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{trip.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5 capitalize">{trip.status}</p>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0 ml-2">
                          <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* ── Level 2: general + destinations ────────────────────────────── */}
          {selectedTrip && (
            <div className="pt-2">
              {/* Add to General */}
              <button
                type="button"
                onClick={handleAddGeneral}
                disabled={!!addingId}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left disabled:opacity-60"
              >
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-violet-600">
                    <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v11.75A2.75 2.75 0 0016.75 18h-12A2.75 2.75 0 012 15.25V3.5zm3.75 7a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5zm0 3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5zM5 5.75A.75.75 0 015.75 5h4.5a.75.75 0 01.75.75v2.5a.75.75 0 01-.75.75h-4.5A.75.75 0 015 8.25v-2.5z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Trip General</p>
                  <p className="text-xs text-gray-400 mt-0.5">Visa guides, packing lists, travel notes…</p>
                </div>
                {addingId === 'general' ? (
                  <Spinner />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-violet-400 shrink-0">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 px-5 py-2">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 font-medium shrink-0">or add to a destination</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Destinations */}
              {loadingDests ? (
                <div className="px-5 py-3 space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="animate-pulse h-14 bg-gray-100 rounded-xl" />
                  ))}
                </div>
              ) : destinations.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-sm text-gray-400">No destinations in this trip yet</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {destinations.map((dest) => {
                    const cityName = dest.location_name.split(',')[0].trim()
                    return (
                      <li key={dest.id}>
                        <button
                          type="button"
                          onClick={() => handleAddToDestination(dest)}
                          disabled={!!addingId}
                          className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left disabled:opacity-60"
                        >
                          {dest.image_url ? (
                            <img src={dest.image_url} alt={cityName} className="w-10 h-10 rounded-xl object-cover bg-gray-100 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-blue-400">
                                <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{cityName}</p>
                            {dest.start_date && dest.end_date && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {new Date(dest.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {' – '}
                                {new Date(dest.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </p>
                            )}
                          </div>
                          {addingId === dest.id ? (
                            <Spinner />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0">
                              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
