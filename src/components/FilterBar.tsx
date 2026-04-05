import { useCallback, useMemo } from 'react'
import { MapPin, Hash } from 'lucide-react'
import { SYSTEM_CATEGORIES, getCategoryIcon, LEGACY_CATEGORY_MAP } from '../lib/categories'
import type { SavedItem } from '../types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FilterPill {
  id: string           // e.g. 'cat:restaurant', 'loc:JP', 'tag:Bucket List'
  label: string        // Display label
  type: 'category' | 'location' | 'custom'
  count: number
  icon?: React.ReactNode
}

interface FilterBarProps {
  selectedFilters: string[]      // Typed IDs: 'cat:X', 'loc:XX', 'tag:X'
  onSelectionChange: (filters: string[]) => void
  countryList: { code: string; name: string }[]
  customTags: string[]
  items: SavedItem[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const MAX_VISIBLE = 6

/** Build the unified pill list from all sources */
export function buildAllPills(
  items: SavedItem[],
  countryList: { code: string; name: string }[],
  customTags: string[],
): FilterPill[] {
  const pills: FilterPill[] = []

  // Category pills — count from resolved item.category (tagName level)
  const categoryCounts = new Map<string, number>()
  for (const item of items) {
    const resolved = LEGACY_CATEGORY_MAP[item.category] ?? item.category
    categoryCounts.set(resolved, (categoryCounts.get(resolved) ?? 0) + 1)
  }
  for (const cat of SYSTEM_CATEGORIES) {
    const Icon = getCategoryIcon(cat.tagName)
    pills.push({
      id: `cat:${cat.tagName}`,
      label: cat.label,
      type: 'category',
      count: categoryCounts.get(cat.tagName) ?? 0,
      icon: Icon ? <Icon className="w-3.5 h-3.5" /> : undefined,
    })
  }

  // Location pills — count from items
  const countryCounts = new Map<string, number>()
  for (const item of items) {
    if (item.location_country_code) {
      countryCounts.set(item.location_country_code, (countryCounts.get(item.location_country_code) ?? 0) + 1)
    }
  }
  for (const { code, name } of countryList) {
    pills.push({
      id: `loc:${code}`,
      label: name,
      type: 'location',
      count: countryCounts.get(code) ?? 0,
      icon: <MapPin className="w-3.5 h-3.5" />,
    })
  }

  // Custom tag pills
  const tagCounts = new Map<string, number>()
  for (const tag of customTags) tagCounts.set(tag, 0)
  for (const item of items) {
    if (item.tags && Array.isArray(item.tags)) {
      for (const t of item.tags) {
        if (tagCounts.has(t)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
      }
    }
  }
  for (const tag of customTags) {
    pills.push({
      id: `tag:${tag}`,
      label: tag,
      type: 'custom',
      count: tagCounts.get(tag) ?? 0,
      icon: <Hash className="w-3.5 h-3.5" />,
    })
  }

  return pills
}

/** Pick the visible pills: active first, then top by count */
export function getVisiblePills(allPills: FilterPill[], activeIds: Set<string>): FilterPill[] {
  const activePills = allPills.filter(p => activeIds.has(p.id))
  const remainingSlots = MAX_VISIBLE - activePills.length
  if (remainingSlots <= 0) return activePills

  const inactivePills = allPills
    .filter(p => !activeIds.has(p.id) && p.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, remainingSlots)

  return [...activePills, ...inactivePills]
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FilterBar({
  selectedFilters,
  onSelectionChange,
  countryList,
  customTags,
  items,
}: FilterBarProps) {
  const activeIds = useMemo(() => new Set(selectedFilters), [selectedFilters])

  const allPills = useMemo(
    () => buildAllPills(items, countryList, customTags),
    [items, countryList, customTags],
  )

  const visiblePills = useMemo(
    () => getVisiblePills(allPills, activeIds),
    [allPills, activeIds],
  )

  const toggleFilter = useCallback((pillId: string) => {
    onSelectionChange(
      selectedFilters.includes(pillId)
        ? selectedFilters.filter(f => f !== pillId)
        : [...selectedFilters, pillId],
    )
  }, [selectedFilters, onSelectionChange])

  return (
    <>
      <style>{`
        .filter-bar::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        className="filter-bar"
        onTouchStart={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          gap: 6,
          padding: '8px 0',
          alignItems: 'center',
          marginBottom: 8,
          touchAction: 'pan-x',
        }}
        data-testid="filter-bar"
      >
        {visiblePills.map(pill => {
          const isSelected = activeIds.has(pill.id)
          return (
            <Pill
              key={pill.id}
              pill={pill}
              selected={isSelected}
              onClick={() => toggleFilter(pill.id)}
            />
          )
        })}
      </div>
    </>
  )
}

// ── Pill sub-component ─────────────────────────────────────────────────────

interface PillProps {
  pill: FilterPill
  selected: boolean
  onClick: () => void
}

function Pill({ pill, selected, onClick }: PillProps) {
  const muted = pill.count === 0 && !selected
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: selected ? 600 : 400,
        color: selected
          ? '#e8eaed'
          : muted
            ? 'var(--text-muted, #6f7781)'
            : 'var(--text-secondary, #b9c0c7)',
        background: selected
          ? 'var(--accent-primary, #B8441E)'
          : 'var(--bg-elevated-1, #1c2126)',
        border: selected
          ? '1px solid var(--accent-primary, #B8441E)'
          : '1px solid var(--border-subtle, #242a30)',
        borderRadius: 9999,
        padding: '6px 12px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'all 0.2s ease-out',
      }}
      data-testid={`filter-pill-${pill.id}`}
    >
      {pill.icon}
      {pill.label}
      {pill.count > 0 && (
        <span style={{
          fontSize: 11,
          fontWeight: 500,
          opacity: 0.7,
          marginLeft: 2,
        }}>
          {pill.count}
        </span>
      )}
    </button>
  )
}
