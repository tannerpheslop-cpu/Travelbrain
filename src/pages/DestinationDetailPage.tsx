import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { TripDestination } from '../types'
import { ArrowLeft, MapPin, Construction } from 'lucide-react'
import { shortName, shortLocalName } from '../components/BilingualName'

export default function DestinationDetailPage() {
  const { id: tripId, destId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [destination, setDestination] = useState<TripDestination | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !tripId || !destId) return
    supabase
      .from('trip_destinations')
      .select('*')
      .eq('id', destId)
      .eq('trip_id', tripId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setDestination(data as TripDestination)
        setLoading(false)
      })
  }, [user, tripId, destId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (!destination) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6">
        <p className="text-gray-400 text-sm">Destination not found.</p>
        <button type="button" onClick={() => navigate(-1)} className="text-blue-600 text-sm font-semibold">Go back</button>
      </div>
    )
  }

  const city = shortName(destination.location_name)
  const cityLocal = shortLocalName(destination.location_name_local)

  return (
    <div className="pb-32">
      {/* Back button */}
      <div className="px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={() => navigate(`/trip/${tripId}`)}
          className="flex items-center gap-1.5 text-blue-600 text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to trip</span>
        </button>
      </div>

      {/* Hero image */}
      {destination.image_url ? (
        <div className="mx-4 h-48 rounded-2xl overflow-hidden mb-4">
          <img src={destination.image_url} alt={city} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="mx-4 h-48 rounded-2xl overflow-hidden mb-4 bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center">
          <MapPin className="w-12 h-12 text-white/50" />
        </div>
      )}

      {/* Name */}
      <div className="px-4 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {city}
          {cityLocal && <span className="ml-2 font-normal text-gray-400 text-lg">{cityLocal}</span>}
        </h1>
        {destination.location_country && (
          <p className="text-sm text-gray-400 mt-1">{destination.location_country}</p>
        )}
      </div>

      {/* Placeholder */}
      <div className="mx-4 bg-gray-50 rounded-2xl p-8 text-center">
        <Construction className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-base font-semibold text-gray-500 mb-1">Coming in next update</p>
        <p className="text-sm text-gray-400 leading-relaxed">
          Activities, day-by-day itinerary, and nearby suggestions will live here.
        </p>
      </div>
    </div>
  )
}
