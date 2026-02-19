import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTrips } from '../hooks/useTrips'
import type { Trip } from '../types'

// Gradient options for cover image placeholders, cycled by trip index
const gradients = [
  'from-blue-400 to-indigo-600',
  'from-rose-400 to-pink-600',
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-600',
  'from-violet-400 to-purple-600',
  'from-cyan-400 to-sky-600',
]

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

// ─── Trip Card ───────────────────────────────────────────────────────────────

function TripCard({
  trip,
  index,
  onDelete,
}: {
  trip: Trip
  index: number
  onDelete: (id: string) => void
}) {
  const gradient = gradients[index % gradients.length]
  const isScheduled = trip.status === 'scheduled'
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen((o) => !o)
    setConfirming(false)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setConfirming(true)
  }

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen(false)
    setConfirming(false)
    onDelete(trip.id)
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setConfirming(false)
    setMenuOpen(false)
  }

  return (
    <div className="relative">
      <Link
        to={`/trip/${trip.id}`}
        className="block bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md active:opacity-90 transition-all"
      >
        {/* Cover image / gradient */}
        <div className={`h-32 bg-gradient-to-br ${gradient} relative`}>
          {trip.cover_image_url && (
            <img
              src={trip.cover_image_url}
              alt={trip.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {/* Status badge */}
          <div className="absolute top-3 right-3">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                isScheduled
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/80 text-gray-600'
              }`}
            >
              {isScheduled ? 'Scheduled' : 'Draft'}
            </span>
          </div>
        </div>

        {/* Card body */}
        <div className="px-4 py-3 pr-12">
          <h3 className="text-base font-semibold text-gray-900 truncate">{trip.title}</h3>
          {isScheduled && trip.start_date && trip.end_date ? (
            <p className="mt-0.5 text-sm text-gray-500">
              {formatDateRange(trip.start_date, trip.end_date)}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-gray-400">No dates yet</p>
          )}
        </div>
      </Link>

      {/* ··· menu button — sits outside the Link so clicks don't navigate */}
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
          {/* Click-away backdrop */}
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

// ─── Create Trip Modal ────────────────────────────────────────────────────────

interface CreateTripModalProps {
  onClose: () => void
  onCreated: (trip: Trip) => void
  createTrip: (input: { title: string; start_date?: string | null; end_date?: string | null }) => Promise<{ trip: Trip | null; error: string | null }>
}

function CreateTripModal({ onClose, onCreated, createTrip }: CreateTripModalProps) {
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (!title.trim()) {
      setValidationError('Trip name is required.')
      return
    }

    if ((startDate && !endDate) || (!startDate && endDate)) {
      setValidationError('Please provide both a start and end date, or leave both empty.')
      return
    }

    if (startDate && endDate && endDate < startDate) {
      setValidationError('End date must be after start date.')
      return
    }

    setSaving(true)
    const { trip, error } = await createTrip({
      title,
      start_date: startDate || null,
      end_date: endDate || null,
    })
    setSaving(false)

    if (error) {
      setValidationError(error)
      return
    }

    if (trip) {
      onCreated(trip)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Dim */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl px-5 pt-6 pb-8 shadow-xl">
        {/* Handle (mobile) */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5 sm:hidden" />

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">New Trip</h2>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Trip name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Trip name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Japan 2026"
              autoFocus
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Start date <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate || undefined}
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                End date <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
              />
            </div>
          </div>

          {/* Date hint */}
          {(startDate || endDate) && (
            <p className="text-xs text-blue-600 -mt-1">
              Dates set — trip will be created as <strong>Scheduled</strong>.
            </p>
          )}
          {!startDate && !endDate && (
            <p className="text-xs text-gray-400 -mt-1">
              No dates — trip will be created as <strong>Draft</strong>.
            </p>
          )}

          {/* Validation error */}
          {validationError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{validationError}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Creating…' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Trips Page ───────────────────────────────────────────────────────────────

export default function TripsPage() {
  const { trips, loading, createTrip, deleteTrip } = useTrips()
  const [showModal, setShowModal] = useState(false)

  const handleCreated = () => {
    setShowModal(false)
    // trips list is updated optimistically inside the hook
  }

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
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="h-32 bg-gray-200" />
              <div className="px-4 py-3 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-3 bg-gray-200 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && trips.length === 0 && (
        <div className="mt-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-gray-300"
            >
              <path
                fillRule="evenodd"
                d="M8.161 2.58a1.875 1.875 0 011.678 0l4.993 2.498c.106.052.23.052.336 0l3.869-1.935A1.875 1.875 0 0121.75 4.82v12.485c0 .71-.401 1.36-1.037 1.677l-4.875 2.437a1.875 1.875 0 01-1.676 0l-4.994-2.497a.375.375 0 00-.336 0l-3.868 1.934A1.875 1.875 0 012.25 19.18V6.695c0-.71.401-1.36 1.036-1.677l4.875-2.437zM9 6a.75.75 0 01.75.75V15a.75.75 0 01-1.5 0V6.75A.75.75 0 019 6zm6.75 3a.75.75 0 00-1.5 0v8.25a.75.75 0 001.5 0V9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <p className="mt-4 text-gray-500 font-medium">No trips yet</p>
          <p className="mt-1 text-sm text-gray-400">Tap <strong className="font-medium text-gray-500">New Trip</strong> above to get started</p>
        </div>
      )}

      {/* Trip Cards Grid */}
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
          onCreated={handleCreated}
          createTrip={createTrip}
        />
      )}
    </div>
  )
}
