import { useCallback, useMemo } from 'react'
import { MapPin, X, Hash } from 'lucide-react'
import { SYSTEM_CATEGORIES, getCategoryLabel, getCategoryIcon, LEGACY_CATEGORY_MAP } from '../lib/categories'
import type { SavedItem } from '../types'

type GroupMode = 'country' | 'city'

interface FilterBarProps {
  selectedFilters: string[]
  onSelectionChange: (filters: string[]) => void
  countryList: string[]
  customTags: string[]
  items: SavedItem[]
  groupMode: GroupMode
  onGroupModeChange: (mode: GroupMode) => void
}

export default function FilterBar({
  selectedFilters,
  onSelectionChange,
  countryList,
  customTags,
  items,
  groupMode,
  onGroupModeChange,
}: FilterBarProps) {
  const toggleFilter = useCallback((filter: string) => {
    onSelectionChange(
      selectedFilters.includes(filter)
        ? selectedFilters.filter(f => f !== filter)
        : [...selectedFilters, filter],
    )
  }, [selectedFilters, onSelectionChange])

  const clearAll = useCallback(() => {
    onSelectionChange([])
  }, [onSelectionChange])

  const hasFilters = selectedFilters.length > 0

  // Count items per category (for badge counts) — resolve legacy categories
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      const resolved = LEGACY_CATEGORY_MAP[item.category] ?? item.category
      const label = getCategoryLabel(resolved)
      map.set(label, (map.get(label) ?? 0) + 1)
    }
    return map
  }, [items])

  // Count items per country
  const countryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      if (item.location_country) {
        map.set(item.location_country, (map.get(item.location_country) ?? 0) + 1)
      }
    }
    return map
  }, [items])

  // Count items per custom tag (from item_tags via items' tags array)
  const customTagCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const tag of customTags) {
      // Count how many items have this custom tag — use the items array tags field
      map.set(tag, 0)
    }
    // Iterate items and check tags array
    for (const item of items) {
      if (item.tags && Array.isArray(item.tags)) {
        for (const t of item.tags) {
          if (map.has(t)) map.set(t, (map.get(t) ?? 0) + 1)
        }
      }
    }
    return map
  }, [items, customTags])

  // Sort location pills by count descending
  const sortedCountries = useMemo(() =>
    [...countryList].sort((a, b) => (countryCounts.get(b) ?? 0) - (countryCounts.get(a) ?? 0)),
    [countryList, countryCounts],
  )

  // Sort category pills by count descending (zero-count last)
  const sortedCategories = useMemo(() =>
    [...SYSTEM_CATEGORIES].sort((a, b) => {
      const ca = categoryCounts.get(a.label) ?? 0
      const cb = categoryCounts.get(b.label) ?? 0
      // Non-zero first, then by count desc
      if (ca === 0 && cb > 0) return 1
      if (ca > 0 && cb === 0) return -1
      return cb - ca
    }),
    [categoryCounts],
  )

  // Sort custom tags by count descending
  const sortedCustomTags = useMemo(() =>
    [...customTags].sort((a, b) => (customTagCounts.get(b) ?? 0) - (customTagCounts.get(a) ?? 0)),
    [customTags, customTagCounts],
  )

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
          padding: '8px 16px',
          alignItems: 'center',
          marginBottom: 8,
          touchAction: 'pan-x',
        }}
        data-testid="filter-bar"
      >
        {/* City/Country toggle */}
        <div
          style={{
            display: 'flex', borderRadius: 6, overflow: 'hidden', flexShrink: 0,
            height: 26, border: '0.5px solid rgba(118,130,142,0.2)',
          }}
        >
          <button
            type="button"
            onClick={() => onGroupModeChange('country')}
            style={{
              padding: '0 7px', height: 26, border: 'none', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: groupMode === 'country' ? 600 : 400,
              background: groupMode === 'country' ? 'rgba(228,232,240,0.1)' : 'transparent',
              color: groupMode === 'country' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
            aria-label="Group by country"
            data-testid="filter-group-country"
          >
            Country
          </button>
          <button
            type="button"
            onClick={() => onGroupModeChange('city')}
            style={{
              padding: '0 7px', height: 26, border: 'none', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: groupMode === 'city' ? 600 : 400,
              background: groupMode === 'city' ? 'rgba(228,232,240,0.1)' : 'transparent',
              color: groupMode === 'city' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
            aria-label="Group by city"
            data-testid="filter-group-city"
          >
            City
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />

        {/* Location pills — sorted by count desc */}
        {sortedCountries.map(country => {
          const isSelected = selectedFilters.includes(country)
          const count = countryCounts.get(country) ?? 0
          return (
            <Pill
              key={`loc-${country}`}
              label={country}
              icon={<MapPin className="w-3 h-3" />}
              count={count}
              selected={isSelected}
              onClick={() => toggleFilter(country)}
              testId={`filter-country-${country}`}
            />
          )
        })}

        {/* Divider between locations and categories (only if locations exist) */}
        {sortedCountries.length > 0 && (
          <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
        )}

        {/* Category pills — sorted by count desc, zero-count last + muted */}
        {sortedCategories.map(cat => {
          const isSelected = selectedFilters.includes(cat.label)
          const count = categoryCounts.get(cat.label) ?? 0
          const Icon = getCategoryIcon(cat.tagName)
          return (
            <Pill
              key={`cat-${cat.tagName}`}
              label={cat.label}
              icon={Icon ? <Icon className="w-3 h-3" /> : undefined}
              count={count}
              selected={isSelected}
              muted={count === 0}
              onClick={() => toggleFilter(cat.label)}
              testId={`filter-category-${cat.tagName}`}
            />
          )
        })}

        {/* Custom tag pills — sorted by count desc */}
        {sortedCustomTags.length > 0 && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
            {sortedCustomTags.map(tag => {
              const isSelected = selectedFilters.includes(tag)
              return (
                <Pill
                  key={`tag-${tag}`}
                  label={tag}
                  icon={<Hash className="w-3 h-3" />}
                  selected={isSelected}
                  onClick={() => toggleFilter(tag)}
                  testId={`filter-custom-${tag}`}
                />
              )
            })}
          </>
        )}

        {/* Clear all */}
        {hasFilters && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
            <button
              type="button"
              onClick={clearAll}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                color: 'var(--accent-primary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '3px 6px',
                whiteSpace: 'nowrap',
              }}
              data-testid="clear-all-filters"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          </>
        )}
      </div>
    </>
  )
}

// ── Pill sub-component ─────────────────────────────────────────────────────

interface PillProps {
  label: string
  icon?: React.ReactNode
  count?: number
  selected: boolean
  muted?: boolean
  onClick: () => void
  testId?: string
}

function Pill({ label, icon, count, selected, muted, onClick, testId }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontWeight: selected ? 600 : 400,
        color: selected
          ? 'var(--accent-primary)'
          : muted
            ? 'var(--text-muted)'
            : 'var(--text-tertiary)',
        background: selected ? 'var(--state-selected)' : 'transparent',
        border: selected
          ? '1px solid rgba(184, 68, 30, 0.3)'
          : '1px solid var(--border-subtle)',
        borderRadius: 999,
        padding: '3px 10px',
        height: 26,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'color 150ms, background 150ms, border-color 150ms',
      }}
      data-testid={testId}
    >
      {icon}
      {label}
      {count != null && count > 0 && (
        <span style={{
          fontSize: 9,
          fontWeight: 500,
          color: selected ? 'var(--accent-primary)' : 'var(--text-muted)',
          marginLeft: 2,
        }}>
          {count}
        </span>
      )}
    </button>
  )
}
