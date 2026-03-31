import { ChevronRight } from 'lucide-react'
import { MAP_COLORS } from './mapConfig'
import type { SavedItem } from '../../types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SheetItemRowProps {
  item: SavedItem
  selected?: boolean
  /** Called when user taps the row body — for selecting/highlighting on map */
  onSelect?: (itemId: string) => void
  /** Called when user taps the navigate chevron — for opening item detail */
  onNavigate?: (itemId: string) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isAccommodation(item: SavedItem): boolean {
  const cat = item.category?.toLowerCase() ?? ''
  return cat === 'hotel' || cat === 'hostel' || cat === 'accommodation'
}

function isPrecise(item: SavedItem): boolean {
  return item.location_precision === 'precise'
}

function getDistrict(item: SavedItem): string | null {
  if (!item.location_name) return null
  const parts = item.location_name.split(',')
  return parts.length > 1 ? parts[0].trim() : null
}

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: 'Restaurant', hotel: 'Hotel', museum: 'Museum',
  temple: 'Temple', park: 'Park', hike: 'Hike',
  historical: 'Historical', shopping: 'Shopping', nightlife: 'Nightlife',
  entertainment: 'Entertainment', transport: 'Transport', spa: 'Spa',
  beach: 'Beach', other: 'Other',
  // Legacy
  activity: 'Activity', transit: 'Transit', general: 'General',
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SheetItemRow({ item, selected = false, onSelect, onNavigate }: SheetItemRowProps) {
  const precise = isPrecise(item)
  const accommodation = isAccommodation(item)
  const dotColor = accommodation ? MAP_COLORS.accommodation : MAP_COLORS.accent
  const district = getDistrict(item)
  const categoryLabel = CATEGORY_LABELS[item.category] ?? 'General'

  return (
    <div
      data-testid={`sheet-item-${item.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        width: '100%',
        background: selected ? 'var(--color-accent-light)' : 'transparent',
        borderBottom: '1px solid var(--color-border-light, #f0eeea)',
        opacity: precise ? 1 : 0.6,
        transition: 'background 150ms ease',
      }}
    >
      {/* Main row body — tappable for selection */}
      <button
        type="button"
        data-testid={`sheet-item-body-${item.id}`}
        onClick={() => onSelect?.(item.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flex: 1,
          minWidth: 0,
          padding: '12px 0 12px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* Thumbnail */}
        <div
          style={{
            width: 44, height: 44, borderRadius: 8, overflow: 'hidden',
            flexShrink: 0, background: 'var(--color-bg-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {item.image_url ? (
            <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 18, color: 'var(--color-text-ghost)' }}>✎</span>
          )}
        </div>

        {/* Title + metadata */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
            color: 'var(--color-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.title}
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: precise ? 'var(--color-text-tertiary)' : MAP_COLORS.accent,
            marginTop: 2,
          }}>
            {precise ? `${categoryLabel}${district ? ` · ${district}` : ''}` : 'Needs location'}
          </div>
        </div>

        {/* Colored dot */}
        <div
          data-testid={`item-dot-${item.id}`}
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: precise ? dotColor : 'var(--color-text-ghost)',
            flexShrink: 0, marginRight: 4,
          }}
        />
      </button>

      {/* Navigate chevron — separate tap target for opening detail page */}
      {onNavigate && (
        <button
          type="button"
          data-testid={`sheet-item-nav-${item.id}`}
          onClick={(e) => { e.stopPropagation(); onNavigate(item.id) }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: '100%', minHeight: 44,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-ghost)', flexShrink: 0,
            paddingRight: 12,
          }}
          aria-label={`Open ${item.title}`}
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}
