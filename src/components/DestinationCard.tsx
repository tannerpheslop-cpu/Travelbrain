import { useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Check } from 'lucide-react'
import type { TripDestination } from '../types'
import { shortName, shortLocalName } from './BilingualName'
import DestinationImage from './DestinationImage'

function shortDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

export interface DestinationCardProps {
  destination: TripDestination
  itemCount: number
  tripId: string
  index: number
  organizeMode?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
  onAddDates?: () => void
  onDatesTap?: () => void
  onLongPress?: () => void
}

export default function DestinationCard({
  destination, itemCount, tripId, index,
  organizeMode, isSelected, onToggleSelect,
  onAddDates, onDatesTap, onLongPress,
}: DestinationCardProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const longPressFired = useRef(false)

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (organizeMode || !onLongPress) return
    const touch = e.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      navigator.vibrate?.(50)
      onLongPress()
    }, 800)
  }, [organizeMode, onLongPress])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current || !longPressTimer.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStart.current.x
    const dy = touch.clientY - touchStart.current.y
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearLongPress()
  }, [clearLongPress])

  const handleTouchEnd = useCallback(() => { clearLongPress() }, [clearLongPress])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (longPressFired.current) {
      e.preventDefault()
      e.stopPropagation()
      longPressFired.current = false
    }
  }, [])
  const city = shortName(destination.location_name)
  const cityLocal = shortLocalName(destination.location_name_local)
  const hasDates = destination.start_date && destination.end_date

  const cardContent = (
    <div className="flex items-center gap-3.5 p-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative">
      {/* Organize mode checkbox */}
      {organizeMode && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect?.() }}
          className={`absolute -top-1.5 -left-1.5 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'
          }`}
        >
          {isSelected && <Check className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Thumbnail */}
      <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 flex-none">
        <DestinationImage
          destination={destination}
          index={index}
          className="w-full h-full"
          iconSize="w-6 h-6"
          alt={city}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-base font-semibold text-gray-900 truncate leading-snug">
          {city}
          {cityLocal && <span className="ml-1.5 font-normal text-gray-400 text-sm">{cityLocal}</span>}
        </p>
        {hasDates ? (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDatesTap?.() }}
            className="text-xs text-blue-600 font-medium mt-0.5 hover:text-blue-700 transition-colors"
          >
            {shortDateRange(destination.start_date!, destination.end_date!)}
          </button>
        ) : onAddDates ? (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddDates() }}
            className="text-xs text-blue-500 font-medium mt-0.5 hover:text-blue-700 transition-colors"
          >
            + Add Dates
          </button>
        ) : null}
        <div className="flex items-center gap-1 mt-1.5 text-gray-400">
          <MapPin className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">
            {itemCount} place{itemCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Chevron */}
      {!organizeMode && (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-300 shrink-0">
          <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      )}
    </div>
  )

  if (organizeMode) {
    return (
      <div onClick={onToggleSelect} className="cursor-pointer">
        {cardContent}
      </div>
    )
  }

  return (
    <Link
      to={`/trip/${tripId}/dest/${destination.id}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {cardContent}
    </Link>
  )
}
