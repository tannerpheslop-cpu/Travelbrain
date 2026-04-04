import { useCallback } from 'react'
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
  const categoryCounts = new Map<string, number>()
  for (const item of items) {
    const resolved = LEGACY_CATEGORY_MAP[item.category] ?? item.category
    const label = getCategoryLabel(resolved)
    categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1)
  }

  // Count items per country
  const countryCounts = new Map<string, number>()
  for (const item of items) {
    if (item.location_country) {
      countryCounts.set(item.location_country, (countryCounts.get(item.location_country) ?? 0) + 1)
    }
  }

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide mb-2"
      style={{ paddingBottom: 2 }}
      data-testid="filter-bar"
    >
      {/* City/Country toggle */}
      <div
        className="flex rounded-md overflow-hidden shrink-0"
        style={{ height: 26, border: '0.5px solid rgba(118,130,142,0.2)' }}
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

      {/* Location pills */}
      {countryList.map(country => {
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
      {countryList.length > 0 && (
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
      )}

      {/* Category pills */}
      {SYSTEM_CATEGORIES.map(cat => {
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
            onClick={() => toggleFilter(cat.label)}
            testId={`filter-category-${cat.tagName}`}
          />
        )
      })}

      {/* Custom tag pills */}
      {customTags.length > 0 && (
        <>
          <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
          {customTags.map(tag => {
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
            className="flex items-center gap-1 shrink-0"
            style={{
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
  )
}

// ── Pill sub-component ─────────────────────────────────────────────────────

interface PillProps {
  label: string
  icon?: React.ReactNode
  count?: number
  selected: boolean
  onClick: () => void
  testId?: string
}

function Pill({ label, icon, count, selected, onClick, testId }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 shrink-0 transition-colors"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontWeight: selected ? 600 : 400,
        color: selected ? 'var(--accent-primary)' : 'var(--text-tertiary)',
        background: selected ? 'var(--state-selected)' : 'transparent',
        border: selected
          ? '1px solid rgba(184, 68, 30, 0.3)'
          : '1px solid var(--border-subtle)',
        borderRadius: 999,
        padding: '3px 10px',
        height: 26,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
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
