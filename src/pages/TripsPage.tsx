import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTripsQuery, useCreateTrip, queryKeys, fetchTrip, fetchTripDestinations, type TripWithDestinations } from '../hooks/queries'
import { useAuth } from '../lib/auth'
import { selectFeaturedTrip } from '../utils/featuredTrip'
import { Plus } from 'lucide-react'
import { DashedCard } from '../components/ui'
import { optimizedImageUrl } from '../lib/optimizedImage'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get the primary two-letter country code for a trip from its first destination */
function getTripCountryCode(trip: TripWithDestinations): string | null {
  const code = trip.trip_destinations?.[0]?.location_country_code
  return code ?? null
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

// ── Status label helper ──────────────────────────────────────────────────────

function statusLabel(status: string): string {
  switch (status) {
    case 'scheduled': return 'UPCOMING'
    case 'planning': return 'PLANNING'
    case 'aspirational': return 'SOMEDAY'
    default: return status.toUpperCase()
  }
}

// ── Create Trip Sheet (single step) ──────────────────────────────────────────

interface CreateTripSheetProps {
  onClose: () => void
  onCreated: (tripId: string) => void
  createTrip: (input: { title: string }) => Promise<{ trip: any | null; error: string | null }>
}

function CreateTripSheet({ onClose, onCreated, createTrip }: CreateTripSheetProps) {
  const [title, setTitle] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => titleInputRef.current?.focus(), 200)
    return () => clearTimeout(timer)
  }, [])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 250)
  }, [onClose])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const { trip, error } = await createTrip({ title: title.trim() })
      if (error || !trip) {
        console.error('Failed to create trip:', error)
        setSaving(false)
        return
      }
      onCreated(trip.id)
    } catch (err) {
      console.error('Failed to create trip:', err)
      setSaving(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 transition-opacity duration-250"
        style={{ background: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)' }}
        onClick={handleClose}
      />
      <div
        data-testid="create-trip-sheet"
        className="fixed inset-x-0 bottom-0 z-50"
        style={{
          background: 'var(--color-bg-card)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border-input)' }} />
        </div>
        <form onSubmit={handleCreate} style={{ padding: '8px 16px 24px' }}>
          <h2 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 16, fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 12,
          }}>New Trip</h2>
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Trip name, e.g. Japan 2026"
            style={{
              width: '100%', padding: '12px 14px',
              border: '1px solid var(--color-border-input)',
              borderRadius: 12, fontSize: 16,
              fontFamily: "'DM Sans', sans-serif",
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg-page)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!title.trim() || saving}
            data-testid="create-trip-btn"
            style={{
              width: '100%', marginTop: 12,
              padding: '14px 0',
              borderRadius: 12, border: 'none',
              background: title.trim() ? 'var(--color-accent)' : 'var(--color-bg-muted)',
              color: title.trim() ? '#ffffff' : 'var(--color-text-tertiary)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14, fontWeight: 600,
              cursor: title.trim() ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.7 : 1,
              transition: 'background 150ms ease, color 150ms ease',
            }}
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </form>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DISPLAY COMPONENTS — Rebuilt from spec
// ══════════════════════════════════════════════════════════════════════════════

// ── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({ trip }: { trip: TripWithDestinations }) {
  const dests = trip.trip_destinations ?? []
  const imageDest = dests.find(d => d.image_url)
  const coverImage = imageDest?.image_url ?? trip.cover_image_url ?? null
  const isUnsplash = imageDest?.image_source === 'unsplash'
  const countryCode = getTripCountryCode(trip)
  const destNames = dests.map(d => shortDestName(d.location_name))
  const hasBgImage = !!coverImage

  // Hero card with bg image
  return (
    <Link to={`/trip/${trip.id}`} className="block" style={{ marginBottom: 28 }}>
      <div style={{
        borderRadius: 16, overflow: 'hidden', position: 'relative', height: 220,
        cursor: 'pointer', background: hasBgImage ? '#1a1a1a' : '#f8f7f4',
      }}>
        {/* Background image */}
        {hasBgImage && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundImage: `url(${optimizedImageUrl(coverImage, 'hero-card') ?? coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center',
          }} />
        )}
        {/* Gradient overlay */}
        {hasBgImage && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.72) 100%)',
            zIndex: 1,
          }} />
        )}
        {/* Watermark 01 */}
        <div style={{
          position: 'absolute', top: -12, right: 12,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 100, fontWeight: 800,
          color: hasBgImage ? 'rgba(255,255,255,0.12)' : '#f0eeea',
          lineHeight: 1, pointerEvents: 'none', zIndex: 2,
        }}>01</div>
        {/* Country code badge */}
        {countryCode && (
          <div style={{
            position: 'absolute', top: 14, left: 14, zIndex: 2,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: 1,
            color: hasBgImage ? 'white' : '#9e9b94',
            background: hasBgImage ? 'rgba(255,255,255,0.18)' : '#f0eeea',
            borderRadius: 4, padding: '3px 8px',
          }}>{countryCode}</div>
        )}
        {/* Content at bottom */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, zIndex: 2 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
            letterSpacing: 1, textTransform: 'uppercase' as const,
            color: '#c45a2d', marginBottom: 4,
          }}>Up next</div>
          <div style={{
            fontSize: 24, fontWeight: 700, letterSpacing: -0.3,
            color: hasBgImage ? 'white' : '#2a2a28',
          }}>{trip.title}</div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: hasBgImage ? 'rgba(255,255,255,0.65)' : '#9e9b94', marginTop: 5,
          }}>
            {dests.length} destination{dests.length !== 1 ? 's' : ''}
            {trip.start_date && trip.end_date && (
              <><span style={{ color: hasBgImage ? 'rgba(255,255,255,0.35)' : '#d5d2cb', margin: '0 6px' }}>·</span>{formatDateRange(trip.start_date, trip.end_date)}</>
            )}
          </div>
          {/* Route chain */}
          {destNames.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap' as const }}>
              {destNames.slice(0, 4).map((name, i) => (
                <span key={i}>
                  {i > 0 && <span style={{ margin: '0 5px', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: hasBgImage ? 'rgba(255,255,255,0.35)' : '#d5d2cb' }}>→</span>}
                  <span style={{ fontSize: 12, fontWeight: 500, color: hasBgImage ? 'rgba(255,255,255,0.85)' : '#6b6860' }}>{name}</span>
                </span>
              ))}
              {destNames.length > 4 && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: hasBgImage ? 'rgba(255,255,255,0.35)' : '#c5c2bb', marginLeft: 6 }}>+{destNames.length - 4}</span>}
            </div>
          )}
          {/* Status badge */}
          <div style={{ marginTop: 10 }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
              letterSpacing: 0.5, textTransform: 'uppercase' as const, padding: '3px 8px', borderRadius: 4,
              background: hasBgImage ? 'rgba(255,255,255,0.15)' : 'rgba(196,90,45,0.13)',
              color: hasBgImage ? 'white' : '#c45a2d',
            }}>{statusLabel(trip.status)}</span>
            {trip.is_favorited && (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600,
                letterSpacing: 0.5, textTransform: 'uppercase' as const, padding: '3px 8px', borderRadius: 4,
                background: hasBgImage ? 'rgba(255,255,255,0.15)' : 'rgba(196,90,45,0.13)',
                color: hasBgImage ? 'white' : '#c45a2d', marginLeft: 6,
              }}>PINNED</span>
            )}
          </div>
        </div>
        {/* Photographer credit (Unsplash only) */}
        {hasBgImage && isUnsplash && imageDest?.image_credit_name && (
          <a
            href={`${imageDest.image_credit_url ?? '#'}?utm_source=youji&utm_medium=referral`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 8, right: 12, zIndex: 2,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 400,
              color: 'rgba(255,255,255,0.25)', textDecoration: 'none', transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
          >Photo: {imageDest.image_credit_name}</a>
        )}
      </div>
    </Link>
  )
}

// ── Carousel Card (white, NO background image) ──────────────────────────────

function CarouselCard({ trip, globalNum }: { trip: TripWithDestinations; globalNum: number }) {
  const dests = trip.trip_destinations ?? []
  const num = String(globalNum).padStart(2, '0')
  const countryCodes = [...new Set(dests.map(d => d.location_country_code).filter(Boolean))] as string[]
  const destNames = dests.map(d => shortDestName(d.location_name))
  const visibleNames = destNames.slice(0, 4)
  const overflow = destNames.length - 4

  return (
    <Link
      to={`/trip/${trip.id}`}
      className="group"
      style={{ width: 260, flexShrink: 0, borderRadius: 12, overflow: 'hidden', background: '#ffffff', border: '1px solid #e8e6e1', cursor: 'pointer', transition: 'all 0.15s ease', display: 'block', alignSelf: 'start' }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.border = '1px solid rgba(196,90,45,0.25)'; el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.05)'; el.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.border = '1px solid #e8e6e1'; el.style.boxShadow = 'none'; el.style.transform = 'none' }}
    >
      {/* Top content */}
      <div style={{ padding: '16px 16px 12px', position: 'relative', overflow: 'hidden', minHeight: 100 }}>
        {/* Watermark */}
        <div className="group-hover:!text-[rgba(196,90,45,0.13)]" style={{
          position: 'absolute', top: -6, right: 6,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 56, fontWeight: 800,
          color: '#f0eeea', lineHeight: 1, pointerEvents: 'none', transition: 'color 0.15s ease',
        }}>{num}</div>
        {/* Country badges */}
        {countryCodes.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, position: 'relative' }}>
            {countryCodes.map(code => (
              <span key={code} style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: 1,
                color: '#9e9b94', background: '#f0eeea', borderRadius: 3, padding: '2px 6px',
              }}>{code}</span>
            ))}
          </div>
        )}
        {/* Trip name */}
        <div className="group-hover:!text-[#c45a2d]" style={{
          fontSize: 16, fontWeight: 700, letterSpacing: -0.2, position: 'relative',
          whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
          color: '#2a2a28', transition: 'color 0.15s ease',
        }}>{trip.title}</div>
        {/* Route chain */}
        {destNames.length > 0 && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9e9b94',
            marginTop: 6, position: 'relative', whiteSpace: 'nowrap' as const,
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {visibleNames.map((name, i) => (
              <span key={i}>{i > 0 && <span style={{ color: '#d5d2cb', margin: '0 3px' }}>→</span>}{name}</span>
            ))}
            {overflow > 0 && <span style={{ color: '#c5c2bb', marginLeft: 4 }}>+{overflow}</span>}
          </div>
        )}
        {/* Date range */}
        {trip.start_date && trip.end_date && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#b5b2ab',
            marginTop: 4, position: 'relative',
          }}>{formatDateRange(trip.start_date, trip.end_date)}</div>
        )}
      </div>
      {/* Bottom bar */}
      <div style={{
        padding: '8px 16px', borderTop: '1px solid #f0eeea', background: '#faf9f7',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9e9b94' }}>
          {dests.length} dest · {dests.length} saves
        </span>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {(trip.companion_count ?? 0) > 0 && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
              color: '#9e9b94', display: 'inline-flex', alignItems: 'center', gap: 2,
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 11, height: 11 }}>
                <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
              </svg>
              {trip.companion_count}
            </span>
          )}
          {trip.is_favorited && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 500,
              padding: '2px 5px', borderRadius: 3, background: '#c45a2d22', color: '#c45a2d',
            }}>PINNED</span>
          )}
          {[...new Set(dests.map(d => d.location_type ?? 'city'))].slice(0, 2).map(cat => (
            <span key={cat} style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 500,
              padding: '2px 5px', borderRadius: 3, background: '#eeece8', color: '#9e9b94',
            }}>{cat}</span>
          ))}
        </div>
      </div>
    </Link>
  )
}

// ── Phase Carousel Section ───────────────────────────────────────────────────

const phaseConfig: Record<string, { title: string; description: string }> = {
  scheduled:    { title: 'Upcoming',  description: 'Dates set and ready to go' },
  planning:     { title: 'Planning',  description: 'Actively building these trips' },
  aspirational: { title: 'Someday',   description: 'Ideas for future adventures' },
}

function PhaseCarousel({ phaseKey, trips, startNum, onNewTrip }: {
  phaseKey: string; trips: TripWithDestinations[]; startNum: number; onNewTrip: () => void
}) {
  if (trips.length === 0) return null
  const config = phaseConfig[phaseKey] ?? { title: phaseKey, description: '' }
  return (
    <div style={{ marginTop: 28 }}>
      {/* Section header */}
      <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{config.title}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9e9b94', marginTop: 3 }}>{config.description}</div>
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#b5b2ab' }}>{trips.length}</span>
      </div>
      {/* Scroll container */}
      <div className="scrollbar-hide" style={{
        display: 'flex', gap: 14, overflowX: 'auto', padding: '0 20px 4px',
        scrollbarWidth: 'none' as const, WebkitOverflowScrolling: 'touch' as const,
      }}>
        {trips.map((trip, i) => (
          <CarouselCard key={trip.id} trip={trip} globalNum={startNum + i} />
        ))}
        {/* Dashed "New trip" */}
        <div
          onClick={onNewTrip}
          style={{
            width: 180, flexShrink: 0, borderRadius: 12, border: '1.5px dashed #d5d2cb',
            display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', gap: 3, minHeight: 140, transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = '#c45a2d'; el.style.background = 'rgba(196,90,45,0.06)' }}
          onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = '#d5d2cb'; el.style.background = 'transparent' }}
        >
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: '#d5d2cb', fontWeight: 300 }}>+</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#b5b2ab' }}>New trip</span>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function TripsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: trips = [], isLoading: loading } = useTripsQuery()
  const createTripMutation = useCreateTrip()
  const [showModal, setShowModal] = useState(false)
  const navigate = useNavigate()

  const createTrip = useCallback(
    async (input: { title: string }): Promise<{ trip: TripWithDestinations | null; error: string | null }> => {
      try {
        const trip = await createTripMutation.mutateAsync(input)
        return { trip, error: null }
      } catch (err) {
        return { trip: null, error: (err as Error).message }
      }
    },
    [createTripMutation],
  )

  useEffect(() => {
    const handler = () => setShowModal(true)
    window.addEventListener('youji-create-trip', handler)
    return () => window.removeEventListener('youji-create-trip', handler)
  }, [])

  const featuredTrip = useMemo(() => selectFeaturedTrip(trips), [trips])
  const remainingTrips = useMemo(() => trips.filter(t => t.id !== featuredTrip?.id), [trips, featuredTrip])

  // Group by phase for carousels
  const grouped = useMemo(() => ({
    scheduled: remainingTrips.filter(t => t.status === 'scheduled'),
    planning: remainingTrips.filter(t => t.status === 'planning'),
    aspirational: remainingTrips.filter(t => t.status === 'aspirational'),
  }), [remainingTrips])

  // Preload destination images for all trips (hero covers + destination card thumbnails)
  useEffect(() => {
    if (loading) return
    for (const trip of trips) {
      const url = trip.trip_destinations?.find(d => d.image_url)?.image_url ?? trip.cover_image_url
      if (url) { const img = new Image(); img.src = optimizedImageUrl(url, 'hero-card') ?? url }
    }
    // Also preload first 4 destination card thumbnails across all trips
    const allDestImages = trips.flatMap(t => t.trip_destinations ?? []).filter(d => d.image_url).slice(0, 4)
    for (const dest of allDestImages) {
      const img = new Image()
      img.src = optimizedImageUrl(dest.image_url!, 'destination-card') ?? dest.image_url!
    }
  }, [trips, loading])

  // Prefetch trip detail + destinations for the first 4 trips (hero + top carousel)
  useEffect(() => {
    if (loading || !user) return
    trips.slice(0, 4).forEach((trip) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.trip(trip.id),
        queryFn: () => fetchTrip(trip.id, user.id),
      })
      queryClient.prefetchQuery({
        queryKey: queryKeys.tripDestinations(trip.id),
        queryFn: () => fetchTripDestinations(trip.id),
      })
    })
  }, [trips, loading, user, queryClient])

  const totalCountries = useMemo(() => {
    const codes = new Set<string>()
    trips.forEach(t => t.trip_destinations?.forEach(d => { if (d.location_country_code) codes.add(d.location_country_code) }))
    return codes.size
  }, [trips])
  const totalDests = useMemo(() => trips.reduce((s, t) => s + (t.trip_destinations?.length ?? 0), 0), [trips])
  // Global numbering: hero=01, then sequential across all carousels
  let globalNum = 2 // hero is 01
  const scheduledStart = globalNum; globalNum += grouped.scheduled.length
  const planningStart = globalNum; globalNum += grouped.planning.length
  const aspirationalStart = globalNum

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 96, background: '#faf9f7' }}>
      {/* ── Header ── */}
      <div style={{ padding: '28px 20px 0' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: 3, textTransform: 'uppercase' as const, color: '#b5b2ab', marginBottom: 4 }}>
          youji 游记
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, margin: 0, color: '#2a2a28' }}>Trips</h1>
        {trips.length > 0 && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9e9b94', marginTop: 5, display: 'flex', gap: 10 }}>
            <span>{trips.length} trips</span>
            <span style={{ color: '#d5d2cb' }}>·</span>
            <span>{totalCountries} countries</span>
            <span style={{ color: '#d5d2cb' }}>·</span>
            <span>{totalDests} destinations</span>
          </div>
        )}
        <button
          onClick={() => setShowModal(true)}
          style={{
            marginTop: 14, padding: '9px 20px', fontSize: 13, fontWeight: 600,
            border: 'none', borderRadius: 8, background: '#c45a2d', color: 'white',
            fontFamily: "'DM Sans', sans-serif", boxShadow: '0 1px 4px rgba(196,90,45,0.25)',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Plus size={14} /> New trip
        </button>
        <div style={{ height: 1, background: '#e8e6e1', margin: '18px 0 20px' }} />
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: '0 20px' }}>
          <div style={{ height: 160, borderRadius: 16, background: '#f5f3f0' }} className="animate-pulse" />
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && trips.length === 0 && (
        <div style={{ padding: '0 20px' }} onClick={() => setShowModal(true)}>
          <DashedCard className="flex flex-col items-center justify-center py-20 px-6 cursor-pointer text-center">
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, color: '#b5b2ab', opacity: 0.25, display: 'block', marginBottom: 12 }}>↗</span>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#6b6860' }}>Plan your first trip</p>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#c5c2bb', marginTop: 6, maxWidth: 280 }}>
              Create a trip to start organizing your destinations and saves
            </p>
          </DashedCard>
        </div>
      )}

      {/* ── Content ── */}
      {!loading && trips.length > 0 && (
        <>
          {/* Hero card */}
          {featuredTrip && (
            <div style={{ padding: '0 20px' }}>
              <HeroCard trip={featuredTrip} />
            </div>
          )}

          {/* Phase carousels */}
          <PhaseCarousel phaseKey="scheduled" trips={grouped.scheduled} startNum={scheduledStart} onNewTrip={() => setShowModal(true)} />
          <PhaseCarousel phaseKey="planning" trips={grouped.planning} startNum={planningStart} onNewTrip={() => setShowModal(true)} />
          <PhaseCarousel phaseKey="aspirational" trips={grouped.aspirational} startNum={aspirationalStart} onNewTrip={() => setShowModal(true)} />
        </>
      )}

      {/* Create Trip Sheet */}
      {showModal && (
        <CreateTripSheet
          onClose={() => setShowModal(false)}
          onCreated={(tripId) => { setShowModal(false); navigate(`/trip/${tripId}?new=true`) }}
          createTrip={createTrip}
        />
      )}
    </div>
  )
}
