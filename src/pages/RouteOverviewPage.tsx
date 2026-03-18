import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useRoutes } from '../hooks/useRoutes'
import type { TripDestination, TripRoute } from '../types'
import DestinationCard from '../components/DestinationCard'
import DottedConnector from '../components/DottedConnector'
import LocationAutocomplete, { type LocationSelection } from '../components/LocationAutocomplete'
import { fetchPlacePhoto } from '../lib/googleMaps'
import { ArrowLeft, Plus, Pencil, Check, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Types ─────────────────────────────────────────────────────────────────────

type DestWithCount = TripDestination & { _count: number }

// ── Sortable destination wrapper ──────────────────────────────────────────────

function SortableDestCard({ dest, tripId, index }: { dest: DestWithCount; tripId: string; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dest.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.9 : 1,
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : undefined,
    scale: isDragging ? '1.02' : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DestinationCard
        destination={dest}
        itemCount={dest._count}
        tripId={tripId}
        index={index}
      />
    </div>
  )
}

// ── Route Overview Page ───────────────────────────────────────────────────────

export default function RouteOverviewPage() {
  const { id: tripId, routeId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [route, setRoute] = useState<TripRoute | null>(null)
  const [destinations, setDestinations] = useState<DestWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Editable route name
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Add destination to route
  const [showAddDest, setShowAddDest] = useState(false)
  const [addingDest, setAddingDest] = useState(false)
  const [addDestKey, setAddDestKey] = useState(0)

  const { renameRoute } = useRoutes(tripId)

  // ── DnD sensors ────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const destIds = useMemo(() => destinations.map(d => d.id), [destinations])

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user || !tripId || !routeId) return

    const load = async () => {
      // Fetch route
      const { data: routeData, error: routeErr } = await supabase
        .from('trip_routes')
        .select('*')
        .eq('id', routeId)
        .eq('trip_id', tripId)
        .single()

      if (routeErr || !routeData) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setRoute(routeData as TripRoute)
      setNameDraft(routeData.name)

      // Fetch destinations in this route with item counts
      const { data: destData } = await supabase
        .from('trip_destinations')
        .select('*, destination_items(count)')
        .eq('trip_id', tripId)
        .eq('route_id', routeId)
        .order('sort_order', { ascending: true })

      if (destData) {
        const mapped: DestWithCount[] = (destData as unknown as Array<TripDestination & { destination_items: Array<{ count: number }> }>)
          .map(d => ({
            ...d,
            _count: d.destination_items?.[0]?.count ?? 0,
          }))
        setDestinations(mapped)
      }
      setLoading(false)
    }

    load()
  }, [user, tripId, routeId])

  // ── Rename ─────────────────────────────────────────────────────────────────

  const startRename = useCallback(() => {
    if (route) setNameDraft(route.name)
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [route])

  const saveRename = useCallback(async () => {
    const trimmed = nameDraft.trim()
    if (!trimmed || !routeId || trimmed === route?.name) {
      setEditingName(false)
      return
    }
    await renameRoute(routeId, trimmed)
    setRoute(prev => prev ? { ...prev, name: trimmed } : prev)
    setEditingName(false)
  }, [nameDraft, routeId, route, renameRoute])

  // ── DnD handler ────────────────────────────────────────────────────────────

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = destinations.findIndex(d => d.id === active.id)
    const newIdx = destinations.findIndex(d => d.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return

    const reordered = arrayMove(destinations, oldIdx, newIdx)
    setDestinations(reordered)

    // Persist new sort_order
    for (let i = 0; i < reordered.length; i++) {
      await supabase
        .from('trip_destinations')
        .update({ sort_order: i })
        .eq('id', reordered[i].id)
    }
  }, [destinations])

  // ── Add destination to route ───────────────────────────────────────────────

  const handleAddDest = useCallback(async (loc: LocationSelection | null) => {
    if (!loc) return
    if (!tripId || !routeId) return
    setAddingDest(true)

    const nextOrder = destinations.length > 0
      ? Math.max(...destinations.map(d => d.sort_order)) + 1
      : 0

    let imageUrl: string | null = null
    if (loc.place_id && !loc.place_id.startsWith('country-')) {
      imageUrl = await fetchPlacePhoto(loc.place_id)
    }

    const { data, error } = await supabase
      .from('trip_destinations')
      .insert({
        trip_id: tripId,
        location_name: loc.name,
        location_lat: loc.lat,
        location_lng: loc.lng,
        location_place_id: loc.place_id,
        location_country: loc.country,
        location_country_code: loc.country_code,
        location_type: loc.location_type ?? 'city',
        proximity_radius_km: loc.proximity_radius_km ?? 50,
        sort_order: nextOrder,
        image_url: imageUrl,
        route_id: routeId,
        location_name_en: loc.name_en ?? null,
        location_name_local: loc.name_local ?? null,
      })
      .select('*, destination_items(count)')
      .single()

    if (!error && data) {
      const newDest: DestWithCount = {
        ...(data as unknown as TripDestination & { destination_items: Array<{ count: number }> }),
        _count: 0,
      }
      setDestinations(prev => [...prev, newDest])
    }

    setAddingDest(false)
    setShowAddDest(false)
    setAddDestKey(k => k + 1)
  }, [tripId, routeId, destinations])

  // ── Listen for global add-destination event ────────────────────────────────

  useEffect(() => {
    const handler = () => setShowAddDest(true)
    window.addEventListener('youji-add-destination', handler)
    return () => window.removeEventListener('youji-add-destination', handler)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (notFound || !route) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6">
        <p className="text-text-faint text-sm">Route not found.</p>
        <button type="button" onClick={() => navigate(-1)} className="text-accent text-sm font-semibold">Go back</button>
      </div>
    )
  }

  return (
    <div className="pb-32">
      {/* Back button */}
      <div className="px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={() => navigate(`/trip/${tripId}`)}
          className="flex items-center gap-1.5 text-accent text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to trip</span>
        </button>
      </div>

      {/* Route name */}
      <div className="px-4 pb-5">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingName(false) }}
              className="flex-1 text-2xl font-bold text-text-primary bg-transparent border-b-2 border-accent focus:outline-none py-1"
            />
            <button type="button" onClick={saveRename} className="p-1.5 rounded-full text-accent hover:bg-accent-light transition-colors">
              <Check className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => setEditingName(false)} className="p-1.5 rounded-full text-text-faint hover:bg-bg-pill transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startRename}
            className="flex items-center gap-2 group"
          >
            <h1 className="text-2xl font-bold text-text-primary">{route.name}</h1>
            <Pencil className="w-4 h-4 text-text-ghost group-hover:text-text-tertiary transition-colors" />
          </button>
        )}
        <p className="text-sm text-text-faint mt-1">
          {destinations.length} destination{destinations.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Destination list */}
      <div className="px-4">
        {destinations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-faint text-sm mb-4">No destinations in this route yet.</p>
            <button
              type="button"
              onClick={() => setShowAddDest(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-hover transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add destination
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={destIds} strategy={verticalListSortingStrategy}>
              {destinations.map((dest, i) => (
                <div key={dest.id}>
                  {i > 0 && <DottedConnector />}
                  <SortableDestCard dest={dest} tripId={tripId!} index={i} />
                </div>
              ))}
            </SortableContext>
          </DndContext>
        )}

        {/* Add destination to route */}
        {showAddDest ? (
          <div className="mt-4">
            <DottedConnector />
            <div className="bg-bg-card rounded-2xl border border-border-subtle shadow-sm p-4 mt-2">
              <p className="text-sm font-semibold text-text-secondary mb-3">Add destination to route</p>
              <LocationAutocomplete
                key={addDestKey}
                value=""
                onSelect={handleAddDest}
                placeholder="Search for a city or country…"
              />
              {addingDest && (
                <div className="flex items-center gap-2 mt-2 text-xs text-text-faint">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-accent border-t-transparent" />
                  Adding…
                </div>
              )}
              <button
                type="button"
                onClick={() => { setShowAddDest(false); setAddDestKey(k => k + 1) }}
                className="mt-3 text-sm text-text-faint hover:text-text-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : destinations.length > 0 ? (
          <div className="mt-4">
            <DottedConnector />
            <button
              type="button"
              onClick={() => setShowAddDest(true)}
              className="w-full mt-2 py-3 border-2 border-dashed border-border rounded-2xl text-sm text-text-faint font-medium hover:border-accent/50 hover:text-accent transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add destination to route
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
