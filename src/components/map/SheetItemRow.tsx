import { MAP_COLORS } from './mapConfig'
import type { SavedItem } from '../../types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SheetItemRowProps {
  item: SavedItem
  selected?: boolean
  onSelect?: (itemId: string) => void
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
  // location_name is often "City, Country" or "District, City, Country"
  const parts = item.location_name.split(',')
  return parts.length > 1 ? parts[0].trim() : null
}

// ── Category label ──
const CATEGORY_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  activity: 'Activity',
  hotel: 'Hotel',
  transit: 'Transit',
  general: 'General',
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SheetItemRow({ item, selected = false, onSelect }: SheetItemRowProps) {
  const precise = isPrecise(item)
  const accommodation = isAccommodation(item)
  const dotColor = accommodation ? MAP_COLORS.accommodation : MAP_COLORS.accent
  const district = getDistrict(item)
  const categoryLabel = CATEGORY_LABELS[item.category] ?? 'General'

  return (
    <button
      type="button"
      data-testid={`sheet-item-${item.id}`}
      onClick={() => onSelect?.(item.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 16px',
        background: selected ? 'var(--color-accent-light)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--color-border-light, #f0eeea)',
        cursor: 'pointer',
        textAlign: 'left',
        opacity: precise ? 1 : 0.6,
        transition: 'background 150ms ease',
      }}
    >
      {/* Thumbnail or placeholder */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'var(--color-bg-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: 18, color: 'var(--color-text-ghost)' }}>✎</span>
        )}
      </div>

      {/* Title + metadata */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: precise ? 'var(--color-text-tertiary)' : MAP_COLORS.accent,
            marginTop: 2,
          }}
        >
          {precise
            ? `${categoryLabel}${district ? ` · ${district}` : ''}`
            : 'Needs location'}
        </div>
      </div>

      {/* Colored dot */}
      <div
        data-testid={`item-dot-${item.id}`}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: precise ? dotColor : 'var(--color-text-ghost)',
          flexShrink: 0,
        }}
      />
    </button>
  )
}
