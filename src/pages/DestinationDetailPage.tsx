import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { shortLocalName } from '../components/BilingualName'
import DestinationMapView from '../components/map/DestinationMapView'
import type { TripDestination, SavedItem } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface LinkedItem {
  id: string
  destination_id: string
  item_id: string
  day_index: number | null
  sort_order: number
  saved_item: SavedItem
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DestinationDetailPage() {
  const { id: tripId, destId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const itemBackTo = `/trip/${tripId}/dest/${destId}`

  const [destination, setDestination] = useState<TripDestination | null>(null)
  const [tripTitle, setTripTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>([])

  // ── Data fetching ──
  useEffect(() => {
    if (!user || !tripId || !destId) return
    const load = async () => {
      const [destRes, tripRes, itemsRes] = await Promise.all([
        supabase.from('trip_destinations').select('*').eq('id', destId).eq('trip_id', tripId).single(),
        supabase.from('trips').select('owner_id, title').eq('id', tripId).single(),
        supabase.from('destination_items').select('*, saved_item:saved_items(*)').eq('destination_id', destId).order('sort_order'),
      ])
      if (destRes.error || !destRes.data) { setNotFound(true); setLoading(false); return }
      setDestination(destRes.data as TripDestination)
      setTripTitle((tripRes.data as { title: string } | null)?.title ?? '')
      setLinkedItems((itemsRes.data ?? []) as LinkedItem[])
      setLoading(false)
    }
    load()
  }, [user, tripId, destId])

  // ── Derived ──
  const allSavedItems = linkedItems.map(li => li.saved_item)
  const cityLocal = destination ? shortLocalName(destination.location_name_local) : null

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Not found ──
  if (notFound || !destination) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <p className="text-text-tertiary text-sm font-medium mb-4">Destination not found</p>
        <button
          onClick={() => navigate(tripId ? `/trip/${tripId}` : '/trips')}
          className="text-accent text-sm font-medium"
        >
          Back to trip
        </button>
      </div>
    )
  }

  // ── Render ──
  return (
    <DestinationMapView
      destination={destination}
      items={allSavedItems}
      tripTitle={tripTitle}
      chapterNumber={(destination.sort_order ?? 0) + 1}
      onBack={() => navigate(`/trip/${tripId}`)}
      onItemSelect={(itemId) => navigate(`/item/${itemId}?backTo=${encodeURIComponent(itemBackTo)}`)}
      onLocationUpdated={() => {
        if (user && destId) {
          supabase.from('destination_items').select('*, saved_item:saved_items(*)').eq('destination_id', destId).order('sort_order')
            .then(({ data }) => { if (data) setLinkedItems(data as LinkedItem[]) })
        }
      }}
      onAddItems={() => navigate(`/inbox`)}
      bilingualName={cityLocal}
    />
  )
}
