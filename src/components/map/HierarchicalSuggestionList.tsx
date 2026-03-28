import { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, Plus, MapPin } from 'lucide-react'
import { MAP_COLORS } from './mapConfig'
import type {
  SuggestionTree,
  TreeContinentGroup,
  TreeCountryGroup,
  TreeCityGroup,
} from '../../lib/groupSavesByGeography'
import { countrySubtitle, continentSubtitle } from '../../lib/groupSavesByGeography'

// ── Country code badge (no emojis) ───────────────────────────────────────────

function CountryBadge({ code }: { code: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 26, height: 18, borderRadius: 4,
      background: 'var(--color-surface-elevated)', flexShrink: 0,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
      color: 'var(--color-night-text-secondary)', letterSpacing: 0.5,
    }}>
      {code}
    </span>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface HierarchicalSuggestionListProps {
  tree: SuggestionTree
  onAddCity: (city: TreeCityGroup, countryCode: string, countryName: string) => void
  onAddCountry: (country: TreeCountryGroup) => void
  onAddContinent: (continent: TreeContinentGroup) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HierarchicalSuggestionList({
  tree,
  onAddCity,
  onAddCountry,
  onAddContinent,
}: HierarchicalSuggestionListProps) {
  // Expand/collapse state
  const [expandedContinents, setExpandedContinents] = useState<Set<string>>(
    () => new Set(tree.continents.map(c => c.name)), // All continents expanded by default
  )
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(() => {
    // Countries with 1-2 cities expanded, 3+ collapsed
    const expanded = new Set<string>()
    for (const cont of tree.continents) {
      for (const country of cont.countries) {
        if (country.cities.length <= 2) expanded.add(country.countryCode)
      }
    }
    return expanded
  })

  const toggleContinent = useCallback((name: string) => {
    setExpandedContinents(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const toggleCountry = useCallback((code: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }, [])

  if (tree.continents.length === 0 && tree.unassignedCount === 0) {
    return (
      <div style={{
        padding: '20px 16px', textAlign: 'center',
        fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--color-night-text-tertiary)',
      }}>
        Save travel inspiration to Horizon and suggestions will appear here.
      </div>
    )
  }

  return (
    <div data-testid="hierarchical-suggestions">
      {tree.continents.map(continent => (
        <div key={continent.name} data-testid={`continent-${continent.name}`}>
          {/* Continent header */}
          <button
            type="button"
            onClick={() => toggleContinent(continent.name)}
            data-testid={`continent-toggle-${continent.name}`}
            style={{
              display: 'flex', alignItems: 'center', width: '100%',
              padding: '10px 16px', gap: 8,
              background: 'var(--color-surface-elevated)', border: 'none', cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {expandedContinents.has(continent.name)
              ? <ChevronDown size={14} style={{ color: 'var(--color-night-text-tertiary)', flexShrink: 0 }} />
              : <ChevronRight size={14} style={{ color: 'var(--color-night-text-tertiary)', flexShrink: 0 }} />
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--color-night-text-primary)' }}>
                {continent.name}
              </span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--color-night-text-tertiary)', marginLeft: 6 }}>
                · {continent.totalSaves} save{continent.totalSaves !== 1 ? 's' : ''}
              </span>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--color-night-text-tertiary)', marginTop: 1 }}>
                {continentSubtitle(continent)}
              </div>
            </div>
            <button
              type="button"
              data-testid={`continent-add-${continent.name}`}
              onClick={e => { e.stopPropagation(); onAddContinent(continent) }}
              style={{
                padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                color: MAP_COLORS.accent, background: 'var(--color-accent-light)',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              Add all
            </button>
          </button>

          {/* Countries (visible when continent expanded) */}
          {expandedContinents.has(continent.name) && continent.countries.map(country => (
            <div key={country.countryCode} data-testid={`country-${country.countryCode}`}>
              {/* Country row */}
              <button
                type="button"
                onClick={() => toggleCountry(country.countryCode)}
                data-testid={`country-toggle-${country.countryCode}`}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%',
                  padding: '8px 16px 8px 28px', gap: 8,
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: '0.5px solid var(--color-surface-elevated)',
                  textAlign: 'left',
                }}
              >
                {expandedCountries.has(country.countryCode)
                  ? <ChevronDown size={12} style={{ color: 'var(--color-night-text-tertiary)', flexShrink: 0 }} />
                  : <ChevronRight size={12} style={{ color: 'var(--color-night-text-tertiary)', flexShrink: 0 }} />
                }
                <CountryBadge code={country.countryCode} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--color-night-text-primary)' }}>
                    {country.countryName}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--color-night-text-tertiary)', marginLeft: 6 }}>
                    · {country.totalSaves} save{country.totalSaves !== 1 ? 's' : ''}
                  </span>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: 'var(--color-night-text-tertiary)', marginTop: 1 }}>
                    {countrySubtitle(country)}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid={`country-add-${country.countryCode}`}
                  onClick={e => { e.stopPropagation(); onAddCountry(country) }}
                  style={{
                    width: 28, height: 28, minWidth: 28, borderRadius: '50%', border: 'none',
                    background: MAP_COLORS.accent, color: '#ffffff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <Plus size={14} />
                </button>
              </button>

              {/* Cities (visible when country expanded) */}
              {expandedCountries.has(country.countryCode) && country.cities.map(city => (
                <div
                  key={city.cityName}
                  data-testid={`city-${city.cityName}`}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '7px 16px 7px 56px', gap: 8,
                    borderBottom: '0.5px solid var(--color-surface-elevated)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--color-night-text-primary)' }}>
                      {city.cityName}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--color-night-text-tertiary)', marginLeft: 6 }}>
                      · {city.saveCount} save{city.saveCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid={`city-add-${city.cityName}`}
                    onClick={() => onAddCity(city, country.countryCode, country.countryName)}
                    style={{
                      width: 26, height: 26, minWidth: 26, borderRadius: '50%', border: 'none',
                      background: MAP_COLORS.accent, color: '#ffffff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {/* Unassigned saves */}
      {tree.unassignedCount > 0 && (
        <div
          data-testid="unassigned-saves"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderTop: '0.5px solid var(--color-surface-elevated)', marginTop: 4,
          }}
        >
          <MapPin size={14} style={{ color: 'var(--color-night-text-tertiary)', flexShrink: 0 }} />
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--color-night-text-tertiary)' }}>
            {tree.unassignedCount} save{tree.unassignedCount !== 1 ? 's' : ''} have no location
          </span>
        </div>
      )}
    </div>
  )
}
