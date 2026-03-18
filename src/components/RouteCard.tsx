import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, MapPin } from 'lucide-react'
import type { TripRoute, TripDestination } from '../types'
import DestinationImage from './DestinationImage'

function shortDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

export interface RouteCardProps {
  route: TripRoute
  destinations: Array<TripDestination & { itemCount: number }>
  tripId: string
  organizeMode?: boolean
  onUngroup?: () => void
  onRename?: (newName: string) => void
}

export default function RouteCard({
  route, destinations, tripId,
  organizeMode, onUngroup, onRename,
}: RouteCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(route.name)

  const stopCount = destinations.length
  const totalItems = destinations.reduce((sum, d) => sum + d.itemCount, 0)
  const firstImageDest = destinations.find((d) => d.image_url || d.location_place_id)

  // Date range from earliest start to latest end
  const dates = destinations.filter((d) => d.start_date && d.end_date)
  const startDate = dates.length > 0 ? dates.reduce((min, d) => d.start_date! < min ? d.start_date! : min, dates[0].start_date!) : null
  const endDate = dates.length > 0 ? dates.reduce((max, d) => d.end_date! > max ? d.end_date! : max, dates[0].end_date!) : null

  const handleRenameSubmit = () => {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== route.name) onRename?.(trimmed)
    setRenaming(false)
    setMenuOpen(false)
  }

  const cardContent = (
    <div className="relative p-3 bg-bg-card rounded-2xl border border-border-subtle shadow-sm hover:shadow-md transition-shadow">
      {/* Stacked-card effect */}
      <div className="absolute inset-x-1 -bottom-1 h-2 bg-bg-card rounded-b-2xl border border-border-subtle border-t-0 -z-10" />

      <div className="flex items-center gap-3.5">
        {/* Thumbnail */}
        <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 flex-none relative">
          {firstImageDest ? (
            <DestinationImage
              destination={firstImageDest}
              index={0}
              className="w-full h-full"
              iconSize="w-6 h-6"
              alt={route.name}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-stone-600 to-stone-800 flex items-center justify-center">
              <Layers className="w-6 h-6 text-white/70" />
            </div>
          )}
          {/* Route badge overlay */}
          <div className="absolute bottom-1 left-1 bg-white/90 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-1">
            <Layers className="w-3 h-3 text-text-tertiary" />
            <span className="text-[10px] font-semibold text-text-secondary">{stopCount} stops</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 py-0.5">
          <p className="text-base font-semibold text-text-primary truncate leading-snug">{route.name}</p>
          {startDate && endDate && (
            <p className="text-xs text-accent font-medium mt-0.5">{shortDateRange(startDate, endDate)}</p>
          )}
          <div className="flex items-center gap-1 mt-1.5 text-text-faint">
            <MapPin className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{totalItems} place{totalItems !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Menu or organize actions */}
        {organizeMode ? (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUngroup?.() }}
            className="px-3 py-1.5 text-xs font-semibold text-error border border-error/25 rounded-xl hover:bg-error-bg transition-colors shrink-0"
          >
            Ungroup
          </button>
        ) : (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((o) => !o) }}
              className="p-2 text-text-ghost hover:text-text-tertiary transition-colors"
              aria-label="Route options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false) }} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[140px]">
                  {renaming ? (
                    <div className="p-2">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') { setRenaming(false); setMenuOpen(false) } }}
                        className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                        autoFocus
                      />
                      <button type="button" onClick={handleRenameSubmit}
                        className="w-full mt-1.5 px-2 py-1.5 text-xs font-semibold text-accent hover:bg-accent-light rounded-lg transition-colors">
                        Save
                      </button>
                    </div>
                  ) : (
                    <>
                      <button type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRenaming(true) }}
                        className="w-full px-3 py-2.5 text-sm text-text-secondary hover:bg-bg-muted text-left transition-colors">
                        Rename
                      </button>
                      <button type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onUngroup?.() }}
                        className="w-full px-3 py-2.5 text-sm text-error hover:bg-error-bg text-left transition-colors">
                        Ungroup route
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )

  if (organizeMode) {
    return <div>{cardContent}</div>
  }

  return (
    <Link to={`/trip/${tripId}/route/${route.id}`} onClick={(e) => { if (menuOpen) e.preventDefault() }}>
      {cardContent}
    </Link>
  )
}
