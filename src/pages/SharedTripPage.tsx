import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, supabaseUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import SavedItemImage from '../components/SavedItemImage'
import { RenderedMarkdown } from '../components/MarkdownNotes'
import { BrandMark, CategoryPill, CountryCodeBadge, MetadataLine, PrimaryButton, SecondaryButton } from '../components/ui'
import type { Trip, TripDestination, SavedItem } from '../types'

// ── Local types ────────────────────────────────────────────────────────────────

interface SharedDestItem {
  id: string
  destination_id: string
  item_id: string
  day_index: number | null
  sort_order: number
  saved_item: SavedItem
}

interface SharedGeneralItem {
  id: string
  trip_id: string
  item_id: string
  sort_order: number
  saved_item: SavedItem
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

function formatDestDayLabel(startDate: string, dayIndex: number): string {
  const d = new Date(startDate + 'T00:00:00')
  d.setDate(d.getDate() + dayIndex - 1)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function shortName(locationName: string): string {
  return locationName.split(',')[0].trim()
}

function dayCount(start: string, end: string): number {
  const ms = new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()
  return Math.round(ms / 86400000) + 1
}

// ── Item Card ─────────────────────────────────────────────────────────────────

function SharedItemCard({ item }: { item: SavedItem }) {
  return (
    <div className="flex gap-3 py-3 border-b border-border-subtle last:border-b-0">
      <SavedItemImage item={item} size="md" className="rounded-lg" readOnly />
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-[13px] font-medium text-text-primary leading-snug truncate">{item.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <CategoryPill label={item.category.charAt(0).toUpperCase() + item.category.slice(1)} dominant={item.category === 'hotel'} />
          {item.location_name && (
            <span className="font-mono text-[10px] text-text-faint">
              {shortName(item.location_name)}
            </span>
          )}
        </div>
        {item.notes && (
          <div className="mt-1 text-xs text-text-tertiary line-clamp-2">
            <RenderedMarkdown text={item.notes} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Destination Row (for share card numbered list) ───────────────────────────

function DestRow({
  dest,
  index,
  itemCount,
  showDates,
}: {
  dest: TripDestination
  index: number
  itemCount: number
  showDates: boolean
}) {
  const num = String(index + 1).padStart(2, '0')

  return (
    <div className="flex gap-3 py-3 border-b border-border-subtle last:border-b-0">
      {/* Numbered marker */}
      <span className="font-mono text-[13px] font-extrabold text-accent leading-none mt-0.5 w-6 text-right shrink-0">
        {num}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {dest.location_country_code && <CountryCodeBadge code={dest.location_country_code} />}
          <span className="text-[14px] font-semibold text-text-primary truncate">
            {shortName(dest.location_name)}
          </span>
          {dest.location_name_local && (
            <span className="text-[12px] text-text-faint truncate">
              {dest.location_name_local.split(',')[0].trim()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {showDates && dest.start_date && dest.end_date && (
            <span className="font-mono text-[10px] text-text-tertiary">
              {formatDateRange(dest.start_date, dest.end_date)}
            </span>
          )}
          {itemCount > 0 && (
            <span className="font-mono text-[10px] text-text-faint">
              {itemCount} {itemCount === 1 ? 'place' : 'places'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Full Destination Section ─────────────────────────────────────────────────

function FullDestSection({
  dest,
  items,
  index,
}: {
  dest: TripDestination
  items: SharedDestItem[]
  index: number
}) {
  const hasSchedule = !!(dest.start_date && dest.end_date)
  const num = String(index + 1).padStart(2, '0')

  // Group by day_index
  const byDay = new Map<number | null, SharedDestItem[]>()
  for (const item of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!byDay.has(item.day_index)) byDay.set(item.day_index, [])
    byDay.get(item.day_index)!.push(item)
  }
  const assignedDays = Array.from(byDay.keys())
    .filter((k): k is number => k !== null)
    .sort((a, b) => a - b)
  const unassigned = byDay.get(null) ?? []

  return (
    <section className="mt-6">
      {/* Destination header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center font-mono text-[11px] font-bold shrink-0">
          {num}
        </span>
        <div>
          <p className="text-[16px] font-bold text-text-primary leading-snug">
            {shortName(dest.location_name)}
            {dest.location_name_local && (
              <span className="ml-1.5 font-normal text-text-faint text-[13px]">
                {dest.location_name_local.split(',')[0].trim()}
              </span>
            )}
          </p>
          {hasSchedule && (
            <p className="font-mono text-[10px] text-text-tertiary mt-0.5">
              {formatDateRange(dest.start_date!, dest.end_date!)}
            </p>
          )}
        </div>
      </div>

      {dest.notes && (
        <div className="mb-3 pl-11 text-sm text-text-secondary">
          <RenderedMarkdown text={dest.notes} />
        </div>
      )}

      {items.length === 0 ? (
        <p className="pl-11 text-[12px] text-text-ghost font-mono">No places saved yet</p>
      ) : (
        <div className="pl-11 space-y-4">
          {assignedDays.map((dayIdx) => {
            const dayItems = byDay.get(dayIdx) ?? []
            return (
              <div key={dayIdx}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[11px] font-bold text-text-primary">Day {dayIdx}</span>
                  {hasSchedule && (
                    <span className="font-mono text-[10px] text-text-faint">
                      {formatDestDayLabel(dest.start_date!, dayIdx)}
                    </span>
                  )}
                </div>
                <div className="bg-bg-card rounded-xl border border-border px-3 overflow-hidden">
                  {dayItems.map((di) => (
                    <SharedItemCard key={di.id} item={di.saved_item} />
                  ))}
                </div>
              </div>
            )
          })}

          {unassigned.length > 0 && (
            <div>
              {assignedDays.length > 0 && (
                <span className="font-mono text-[10px] font-medium text-text-faint uppercase tracking-[1px] block mb-1">
                  Unplanned
                </span>
              )}
              <div className="bg-bg-card rounded-xl border border-border px-3 overflow-hidden">
                {unassigned.map((di) => (
                  <SharedItemCard key={di.id} item={di.saved_item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Share Card ────────────────────────────────────────────────────────────────

function ShareCard({
  trip,
  destinations,
  destItems,
  generalItems,
  showDates,
  showItems,
  onAdopt,
  adoptLoading,
}: {
  trip: Trip
  destinations: TripDestination[]
  destItems: SharedDestItem[]
  generalItems: SharedGeneralItem[]
  showDates: boolean
  showItems: boolean
  onAdopt: () => void
  adoptLoading: boolean
}) {
  const destCount = destinations.length
  const totalItems = destItems.length + generalItems.length
  const countries = new Set(destinations.map((d) => d.location_country).filter(Boolean))
  const firstCountryCode = destinations[0]?.location_country_code

  // Metadata items
  const meta: string[] = []
  if (firstCountryCode) meta.push(`[${firstCountryCode.toUpperCase()}] ${countries.size === 1 ? [...countries][0] : `${countries.size} countries`}`)
  meta.push(`${destCount} destination${destCount !== 1 ? 's' : ''}`)
  if (showDates && trip.start_date && trip.end_date) {
    meta.push(`${dayCount(trip.start_date, trip.end_date)} days`)
  }
  if (showItems && totalItems > 0) meta.push(`${totalItems} place${totalItems !== 1 ? 's' : ''}`)

  return (
    <div className="bg-bg-card rounded-2xl border border-border shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden">
      {/* Shared by section */}
      <div className="px-6 pt-6 pb-4 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-bg-muted flex items-center justify-center text-[16px] font-semibold text-text-tertiary shrink-0">
            {trip.title.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[1px] text-text-faint">Shared trip</p>
          </div>
        </div>
      </div>

      {/* Trip name + metadata */}
      <div className="px-6 pt-5 pb-4">
        <h1 className="text-[24px] font-bold leading-[1.2] tracking-[-0.3px] text-text-primary">
          {trip.title}
        </h1>
        <div className="mt-2">
          <MetadataLine items={meta} />
        </div>
        {showDates && trip.start_date && trip.end_date && (
          <p className="mt-1 font-mono text-[11px] text-text-tertiary">
            {formatDateRange(trip.start_date, trip.end_date)}
          </p>
        )}
      </div>

      {/* Destination list */}
      {destCount > 0 && (
        <div className="px-6">
          <div className="border-t border-border-subtle pt-3">
            {!showItems ? (
              /* City-only / city-dates: numbered compact list */
              <div>
                {destinations.map((dest, i) => (
                  <DestRow
                    key={dest.id}
                    dest={dest}
                    index={i}
                    itemCount={destItems.filter((di) => di.destination_id === dest.id).length}
                    showDates={showDates}
                  />
                ))}
              </div>
            ) : (
              /* Full itinerary: expanded destination sections */
              <div>
                {destinations.map((dest, i) => (
                  <FullDestSection
                    key={dest.id}
                    dest={dest}
                    items={destItems.filter((di) => di.destination_id === dest.id)}
                    index={i}
                  />
                ))}

                {generalItems.length > 0 && (
                  <section className="mt-6">
                    <span className="font-mono text-[10px] font-medium uppercase tracking-[1px] text-text-faint block mb-2">
                      General
                    </span>
                    <div className="bg-bg-card rounded-xl border border-border px-3 overflow-hidden">
                      {generalItems.map((gi) => (
                        <SharedItemCard key={gi.id} item={gi.saved_item} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {destCount === 0 && (
        <div className="px-6 py-8 text-center">
          <p className="font-mono text-xs text-text-ghost">No destinations added yet</p>
        </div>
      )}

      {/* CTAs */}
      <div className="px-6 py-5 mt-2 flex gap-3">
        <PrimaryButton onClick={onAdopt} disabled={adoptLoading} className="flex-1">
          {adoptLoading ? 'Copying…' : 'Fork this trip'}
        </PrimaryButton>
        <SecondaryButton className="flex-1" disabled>
          Comment
        </SecondaryButton>
      </div>

      {/* Footer: brand mark + tagline */}
      <div className="px-6 py-4 border-t border-border-subtle bg-bg-tinted text-center">
        <BrandMark className="block mb-1" />
        <p className="font-mono text-[10px] text-text-ghost">Plan together, explore together.</p>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SharedTripSkeleton() {
  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-5">
      <div className="w-full max-w-[600px] bg-bg-card rounded-2xl border border-border shadow-lg animate-pulse p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-bg-muted" />
          <div className="h-3 bg-bg-pill-dark rounded-full w-24" />
        </div>
        <div className="h-7 bg-bg-pill-dark rounded-full w-3/5" />
        <div className="h-3 bg-bg-muted rounded-full w-2/5" />
        <div className="space-y-3 pt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SharedTripPage() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [destinations, setDestinations] = useState<TripDestination[]>([])
  const [destItems, setDestItems] = useState<SharedDestItem[]>([])
  const [generalItems, setGeneralItems] = useState<SharedGeneralItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [adoptLoading, setAdoptLoading] = useState(false)
  const [adoptError, setAdoptError] = useState<string | null>(null)

  // ── Data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shareToken) { setNotFound(true); setLoading(false); return }

    const load = async () => {
      const { data: tripData, error: tripErr } = await supabase
        .from('trips')
        .select('*')
        .eq('share_token', shareToken)
        .single()

      if (tripErr || !tripData) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const fetchedTrip = tripData as Trip
      setTrip(fetchedTrip)
      trackEvent('share_link_opened', null, {
        trip_id: fetchedTrip.id,
        share_privacy: fetchedTrip.share_privacy,
        share_token: shareToken,
      })

      const { data: destsData } = await supabase
        .from('trip_destinations')
        .select('*')
        .eq('trip_id', fetchedTrip.id)
        .order('sort_order')

      const fetchedDests = (destsData ?? []) as TripDestination[]
      setDestinations(fetchedDests)

      if (fetchedTrip.share_privacy === 'full') {
        const destIds = fetchedDests.map((d) => d.id)
        const [diRes, giRes] = await Promise.all([
          destIds.length > 0
            ? supabase
                .from('destination_items')
                .select('id, destination_id, item_id, day_index, sort_order, saved_item:saved_items(*)')
                .in('destination_id', destIds)
            : Promise.resolve({ data: [] }),
          supabase
            .from('trip_general_items')
            .select('id, trip_id, item_id, sort_order, saved_item:saved_items(*)')
            .eq('trip_id', fetchedTrip.id)
            .order('sort_order'),
        ])
        if (diRes.data) setDestItems(diRes.data as unknown as SharedDestItem[])
        if (giRes.data) setGeneralItems(giRes.data as unknown as SharedGeneralItem[])
      }

      setLoading(false)
    }

    load()
  }, [shareToken])

  // ── Adopt handler ──────────────────────────────────────────────────────────
  const handleAdopt = async () => {
    if (!user) {
      navigate(`/login?redirect=/s/${shareToken}`)
      return
    }

    setAdoptLoading(true)
    setAdoptError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${supabaseUrl}/functions/v1/adopt-trip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ share_token: shareToken }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const { trip_id } = await res.json() as { trip_id: string }
      trackEvent('trip_adopted', user.id, {
        original_trip_id: trip?.id,
        new_trip_id: trip_id,
        share_token: shareToken,
      })
      navigate(`/trip/${trip_id}`)
    } catch (err) {
      console.error('Adopt error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setAdoptError(msg === 'You already own this trip' ? 'This is your own trip!' : 'Something went wrong. Please try again.')
      setAdoptLoading(false)
    }
  }

  // ── Loading / not found ────────────────────────────────────────────────────
  if (loading) return <SharedTripSkeleton />

  if (notFound || !trip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-bg-page text-center">
        <span className="font-mono text-[32px] text-text-faint opacity-25 block mb-4">--</span>
        <h1 className="text-[24px] font-bold text-text-primary">Trip not found</h1>
        <p className="mt-2 text-sm text-text-faint max-w-xs leading-relaxed">
          This share link is invalid or has expired.
        </p>
        <PrimaryButton onClick={() => navigate('/')} className="mt-5">
          Go to Youji
        </PrimaryButton>
      </div>
    )
  }

  const privacy = trip.share_privacy ?? 'full'
  const showDates = privacy === 'city_dates' || privacy === 'full'
  const showItems = privacy === 'full'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-page flex flex-col items-center px-5 py-10">
      {/* Share card — centered, max 600px */}
      <div className="w-full max-w-[600px]">
        <ShareCard
          trip={trip}
          destinations={destinations}
          destItems={destItems}
          generalItems={generalItems}
          showDates={showDates}
          showItems={showItems}
          onAdopt={handleAdopt}
          adoptLoading={adoptLoading}
        />
      </div>

      {/* Below card: subtle CTA for non-users */}
      {!user && (
        <div className="mt-8 text-center">
          <p className="text-sm text-text-faint">Don't have an account?</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-2 text-[13px] font-medium text-accent hover:underline"
          >
            Start planning for free →
          </button>
        </div>
      )}

      {/* Error toast */}
      {adoptError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="flex items-center gap-2 px-5 py-3 bg-error text-white rounded-full text-sm font-medium shadow-xl whitespace-nowrap">
            {adoptError}
          </div>
        </div>
      )}
    </div>
  )
}
