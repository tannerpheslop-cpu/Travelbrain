import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { addItemToTrip } from '../hooks/useTripItems'
import type { Trip } from '../types'

interface AddToTripSheetProps {
  itemId: string
  onClose: () => void
  onAlreadyAdded?: (tripTitle: string) => void
}

type SheetState = 'list' | 'added'

export default function AddToTripSheet({ itemId, onClose, onAlreadyAdded }: AddToTripSheetProps) {
  const { user } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [state, setState] = useState<SheetState>('list')
  const [confirmedTrip, setConfirmedTrip] = useState<string>('')

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

  const handleSelect = async (trip: Trip) => {
    if (addingId) return
    setAddingId(trip.id)
    const { error, alreadyAdded } = await addItemToTrip(trip.id, itemId)
    setAddingId(null)

    if (error) {
      // Surface error but stay open
      return
    }

    if (alreadyAdded) {
      onClose()
      onAlreadyAdded?.(trip.title)
      return
    }
    setConfirmedTrip(trip.title)
    setState('added')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add to Trip</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="pb-8">
          {state === 'added' && (
            <div className="flex flex-col items-center py-8 px-5 text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-green-600">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Added to {confirmedTrip}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {state === 'list' && (
            <>
              {loadingTrips && (
                <div className="px-5 py-4 space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="animate-pulse h-12 bg-gray-100 rounded-xl" />
                  ))}
                </div>
              )}

              {!loadingTrips && trips.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <p className="text-gray-500 font-medium">No trips yet</p>
                  <p className="mt-1 text-sm text-gray-400">Create a trip first from the Trips tab.</p>
                </div>
              )}

              {!loadingTrips && trips.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {trips.map((trip) => (
                    <li key={trip.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(trip)}
                        disabled={addingId === trip.id}
                        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left disabled:opacity-50"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{trip.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {trip.status === 'scheduled' ? 'Scheduled' : 'Draft'}
                          </p>
                        </div>
                        {addingId === trip.id ? (
                          <svg className="animate-spin w-4 h-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300">
                            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
