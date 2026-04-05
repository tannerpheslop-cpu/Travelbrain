import { useCallback, useMemo, useState } from 'react'
import { MapPin, Hash, SlidersHorizontal } from 'lucide-react'
import { SYSTEM_CATEGORIES, getCategoryIcon, LEGACY_CATEGORY_MAP } from '../lib/categories'
import FilterSheet from './FilterSheet'
import type { SavedItem } from '../types'

// ── Types ────────────────────────────────────────────────────────────────────

type GroupMode = 'country' | 'city'

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
  groupMode: GroupMode
  onGroupModeChange: (mode: GroupMode) => void
  /** Called when a custom tag is deleted from the More sheet */
  onDeleteCustomTag?: (tagName: string) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 6

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
function getVisiblePills(allPills: FilterPill[], activeIds: Set<string>): FilterPill[] {
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
  groupMode,
  onGroupModeChange,
  onDeleteCustomTag,
}: FilterBarProps) {
  const [showSheet, setShowSheet] = useState(false)

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

  // Check if any active filter is NOT in the visible bar (hidden in "More" sheet)
  const hasHiddenActiveFilters = useMemo(() => {
    const visibleIds = new Set(visiblePills.map(p => p.id))
    return selectedFilters.some(f => !visibleIds.has(f))
  }, [selectedFilters, visiblePills])

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

        {/* More button — always visible */}
        <button
          type="button"
          onClick={() => setShowSheet(true)}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: 'var(--bg-elevated-1, #1c2126)',
            border: '1px solid var(--border-subtle, #242a30)',
            borderRadius: 9999,
            padding: '6px 10px',
            color: 'var(--text-secondary, #b9c0c7)',
            cursor: 'pointer',
          }}
          data-testid="filter-more-btn"
          aria-label="More filters"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {hasHiddenActiveFilters && (
            <span
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent-primary, #B8441E)',
              }}
              data-testid="filter-more-dot"
            />
          )}
        </button>
      </div>

      {/* More sheet */}
      {showSheet && (
        <FilterSheet
          allPills={allPills}
          selectedFilters={selectedFilters}
          onSelectionChange={onSelectionChange}
          onClose={() => setShowSheet(false)}
          groupMode={groupMode}
          onGroupModeChange={onGroupModeChange}
          onDeleteCustomTag={onDeleteCustomTag}
        />
      )}
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
