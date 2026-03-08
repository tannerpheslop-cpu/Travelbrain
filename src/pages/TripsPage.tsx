import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTrips, type TripWithDestinations } from '../hooks/useTrips'
import LocationAutocomplete, { type LocationSelection } from '../components/LocationAutocomplete'
import { fetchPlacePhoto } from '../lib/googleMaps'
import type { TripStatus } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const gradients = [
  'from-blue-400 to-indigo-600',
  'from-rose-400 to-pink-600',
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-600',
  'from-violet-400 to-purple-600',
  'from-cyan-400 to-sky-600',
]

const statusConfig: Record<TripStatus, { label: string; classes: string }> = {
  aspirational: { label: 'Aspirational', classes: 'bg-white/90 text-gray-600' },
  planning:     { label: 'Planning',     classes: 'bg-blue-500 text-white' },
  scheduled:    { label: 'Scheduled',    classes: 'bg-emerald-500 text-white' },
}

/** Keep only the first segment of a Google Places name, e.g. "Chengdu, Sichuan, China" → "Chengdu" */
function shortDestName(locationName: string): string {
  return locationName.split(',')[0].trim()
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

// ── Trip Card ─────────────────────────────────────────────────────────────────

function TripCard({
  trip,
  index,
  onDelete,
}: {
  trip: TripWithDestinations
  index: number
  onDelete: (id: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [coverImgFailed, setCoverImgFailed] = useState(false)

  const gradient = gradients[index % gradients.length]
  const status = statusConfig[trip.status]
  const dests = trip.trip_destinations ?? []

  // Cover: first destination image → trip cover_image_url → gradient
  const coverImage = !coverImgFailed
    ? (dests.find((d) => d.image_url)?.image_url ?? trip.cover_image_url ?? null)
    : null

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setMenuOpen((o) => !o); setConfirming(false)
  }
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); setConfirming(true)
  }
  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setMenuOpen(false); setConfirming(false); onDelete(trip.id)
  }
  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setConfirming(false); setMenuOpen(false)
  }

  return (
    <div className="relative">
      <Link
        to={`/trip/${trip.id}`}
        className="block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
      >
        {/* Cover image / gradient */}
        <div className={`h-36 bg-gradient-to-br ${gradient} relative overflow-hidden`}>
          {coverImage && (
            <img
              src={coverImage}
              alt={trip.title}
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setCoverImgFailed(true)}
            />
          )}
          {/* Subtle bottom scrim for legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
          {/* Status badge */}
          <div className="absolute top-3 right-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm ${status.classes}`}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Card body */}
        <div className="px-4 pt-3 pb-3 pr-12">
          <h3 className="text-base font-semibold text-gray-900 truncate">{trip.title}</h3>

          {/* Destination chips */}
          {dests.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {dests.slice(0, 5).map((d) => (
                <span
                  key={d.id}
                  className="px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium"
                >
                  {shortDestName(d.location_name)}
                </span>
              ))}
              {dests.length > 5 && (
                <span className="px-2.5 py-0.5 bg-gray-100 text-gray-400 rounded-full text-xs">
                  +{dests.length - 5}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-gray-400">No destinations yet</p>
          )}

          {/* Date range (scheduled only) */}
          {trip.status === 'scheduled' && trip.start_date && trip.end_date && (
            <p className="mt-1.5 text-xs text-gray-500">{formatDateRange(trip.start_date, trip.end_date)}</p>
          )}
        </div>
      </Link>

      {/* ··· menu button */}
      <button
        type="button"
        onClick={handleMenuClick}
        className="absolute bottom-3 right-3 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label="Trip options"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
        </svg>
      </button>

      {/* Dropdown */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirming(false) }}
          />
          <div className="absolute bottom-10 right-3 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
            {!confirming ? (
              <button
                type="button"
                onClick={handleDeleteClick}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
                Delete trip
              </button>
            ) : (
              <div className="px-4 py-3">
                <p className="text-xs font-medium text-gray-700 mb-2">Delete this trip?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancelDelete}
                    className="flex-1 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="flex-1 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Create Trip Modal (2-step) ────────────────────────────────────────────────

type CreateStep = 'name' | 'destinations'

interface CreateTripModalProps {
  onClose: () => void
  onCreated: () => void
  createTrip: (input: { title: string }) => Promise<{ trip: TripWithDestinations | null; error: string | null }>
  createDestination: (tripId: string, location: LocationSelection, sortOrder: number, imageUrl?: string) => Promise<{ destination: unknown; error: string | null }>
}

function CreateTripModal({ onClose, onCreated, createTrip, createDestination }: CreateTripModalProps) {
  const [step, setStep] = useState<CreateStep>('name')
  const [title, setTitle] = useState('')
  const [destinations, setDestinations] = useState<LocationSelection[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Incrementing key forces LocationAutocomplete to remount (and clear) after each selection
  const [autocompleteKey, setAutocompleteKey] = useState(0)

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Trip name is required.'); return }
    setError(null)
    setStep('destinations')
  }

  const handleLocationSelect = (loc: LocationSelection | null) => {
    if (!loc) return
    if (destinations.some((d) => d.place_id === loc.place_id)) return
    setDestinations((prev) => [...prev, loc])
    setAutocompleteKey((k) => k + 1)
  }

  const removeDestination = (placeId: string) => {
    setDestinations((prev) => prev.filter((d) => d.place_id !== placeId))
  }

  const handleCreate = async () => {
    setSaving(true)
    setError(null)

    // Run trip creation and all photo fetches in parallel for speed
    const [tripResult, photoUrls] = await Promise.all([
      createTrip({ title }),
      Promise.all(destinations.map((d) => fetchPlacePhoto(d.place_id).catch(() => null))),
    ])

    const { trip, error: tripError } = tripResult
    if (tripError || !trip) {
      setError(tripError ?? 'Failed to create trip.')
      setSaving(false)
      return
    }

    // Insert all destinations in parallel with their photos
    await Promise.all(
      destinations.map((d, i) =>
        createDestination(trip.id, d, i, photoUrls[i] ?? undefined),
      ),
    )
    onCreated()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            {step === 'destinations' && (
              <button
                type="button"
                onClick={() => setStep('name')}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Back"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            <h2 className="text-base font-semibold text-gray-900">
              {step === 'name' ? 'New Trip' : title}
            </h2>
          </div>
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

        <div className="px-5 py-5">
          {/* ── Step 1: Name ── */}
          {step === 'name' && (
            <form onSubmit={handleNextStep} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Trip name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setError(null) }}
                  placeholder="e.g. China 2026"
                  autoFocus
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={!title.trim()}
                className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next: Add Destinations
              </button>
            </form>
          )}

          {/* ── Step 2: Destinations ── */}
          {step === 'destinations' && (
            <div className="space-y-4">
              <LocationAutocomplete
                key={autocompleteKey}
                value=""
                onSelect={handleLocationSelect}
                label="Add a destination"
                optional={false}
                placeholder="e.g. Beijing, Tokyo, Paris"
              />

              {/* Added destinations list */}
              {destinations.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {destinations.length} destination{destinations.length !== 1 ? 's' : ''} added
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {destinations.map((d) => (
                      <div
                        key={d.place_id}
                        className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-blue-50 border border-blue-200 rounded-full"
                      >
                        <span className="text-sm font-medium text-blue-800">{shortDestName(d.name)}</span>
                        <button
                          type="button"
                          onClick={() => removeDestination(d.place_id)}
                          className="text-blue-400 hover:text-blue-700 transition-colors"
                          aria-label={`Remove ${d.name}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving
                    ? 'Creating…'
                    : destinations.length === 0
                    ? 'Create Trip'
                    : `Create Trip with ${destinations.length} destination${destinations.length !== 1 ? 's' : ''}`}
                </button>
                {destinations.length === 0 && (
                  <p className="text-center text-xs text-gray-400">
                    You can add destinations later from the trip page
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Trips Page ────────────────────────────────────────────────────────────────

export default function TripsPage() {
  const { trips, loading, createTrip, createDestination, deleteTrip } = useTrips()
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trips</h1>
          <p className="mt-1 text-sm text-gray-500">Your trip library</p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          New Trip
        </button>
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="mt-5 space-y-4">
          {['from-blue-300 to-indigo-400', 'from-rose-300 to-pink-400'].map((g, i) => (
            <div key={i} className="animate-pulse bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className={`h-36 bg-gradient-to-br ${g} opacity-60`} />
              <div className="px-4 py-3 space-y-2.5">
                <div className="h-4 bg-gray-200 rounded-full w-2/5" />
                <div className="flex gap-2">
                  <div className="h-5 bg-gray-100 rounded-full w-16" />
                  <div className="h-5 bg-gray-100 rounded-full w-14" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && trips.length === 0 && (
        <div className="mt-20 text-center px-6">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-blue-300"
            >
              <path
                fillRule="evenodd"
                d="M8.161 2.58a1.875 1.875 0 011.678 0l4.993 2.498c.106.052.23.052.336 0l3.869-1.935A1.875 1.875 0 0121.75 4.82v12.485c0 .71-.401 1.36-1.037 1.677l-4.875 2.437a1.875 1.875 0 01-1.676 0l-4.994-2.497a.375.375 0 00-.336 0l-3.868 1.934A1.875 1.875 0 012.25 19.18V6.695c0-.71.401-1.36 1.036-1.677l4.875-2.437zM9 6a.75.75 0 01.75.75V15a.75.75 0 01-1.5 0V6.75A.75.75 0 019 6zm6.75 3a.75.75 0 00-1.5 0v8.25a.75.75 0 001.5 0V9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <p className="mt-4 text-gray-800 font-semibold">No trips yet</p>
          <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">
            Start planning your next adventure — tap <strong className="font-medium text-gray-500">New Trip</strong> to create one.
          </p>
        </div>
      )}

      {/* Trip Cards */}
      {!loading && trips.length > 0 && (
        <div className="mt-5 space-y-4">
          {trips.map((trip, index) => (
            <TripCard key={trip.id} trip={trip} index={index} onDelete={deleteTrip} />
          ))}
        </div>
      )}

      {/* Create Trip Modal */}
      {showModal && (
        <CreateTripModal
          onClose={() => setShowModal(false)}
          onCreated={() => setShowModal(false)}
          createTrip={createTrip}
          createDestination={createDestination}
        />
      )}
    </div>
  )
}
