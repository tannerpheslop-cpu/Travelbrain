import { useCallback } from 'react'
import type {
  SuggestionTree,
  TreeContinentGroup,
  TreeCountryGroup,
  TreeCityGroup,
} from '../../lib/groupSavesByGeography'

// ── Types ────────────────────────────────────────────────────────────────────

export interface HierarchicalSuggestionListProps {
  tree: SuggestionTree
  onAddCity: (city: TreeCityGroup, countryCode: string, countryName: string) => void
  onAddCountry: (country: TreeCountryGroup) => void
  onAddContinent: (continent: TreeContinentGroup) => void
}

// ── Dashed circle with "+" ──────────────────────────────────────────────────

function DashedPlusCircle() {
  return (
    <div style={{
      width: 28,
      height: 28,
      borderRadius: '50%',
      border: '1.5px dashed var(--accent-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginRight: 12,
    }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <line x1="6" y1="1" x2="6" y2="11" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="1" y1="6" x2="11" y2="6" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}

// ── Suggestion row — matches confirmed destination row layout ────────────────

function SuggestionRow({
  cityName,
  countryName,
  saveCount,
  onClick,
  testId,
}: {
  cityName: string
  countryName?: string
  saveCount: number
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        padding: '12px 16px',
        background: 'none',
        border: 'none',
        borderBottomWidth: 0.5,
        borderBottomStyle: 'solid',
        borderBottomColor: 'rgba(118, 130, 142, 0.1)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <DashedPlusCircle />

      {/* Name + save count — same layout as confirmed rows */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {cityName}
          {countryName && (
            <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 13 }}>
              {' '}· {countryName}
            </span>
          )}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'var(--text-tertiary)',
          }}>
            {saveCount} save{saveCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </button>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HierarchicalSuggestionList({
  tree,
  onAddCity,
  onAddCountry: _onAddCountry,
}: HierarchicalSuggestionListProps) {
  // Flatten the tree into city-level suggestion rows
  const flatSuggestions = useCallback(() => {
    const rows: Array<{
      key: string
      cityName: string
      countryName: string
      countryCode: string
      saveCount: number
      city: TreeCityGroup
      country: TreeCountryGroup
    }> = []

    for (const continent of tree.continents) {
      for (const country of continent.countries) {
        for (const city of country.cities) {
          rows.push({
            key: `${country.countryCode}-${city.cityName}`,
            cityName: city.cityName,
            countryName: country.countryName,
            countryCode: country.countryCode,
            saveCount: city.saveCount,
            city,
            country,
          })
        }
      }
    }

    // Sort by save count descending
    rows.sort((a, b) => b.saveCount - a.saveCount)
    return rows
  }, [tree])

  const rows = flatSuggestions()

  if (rows.length === 0 && tree.unassignedCount === 0) {
    return (
      <div style={{
        padding: '20px 16px', textAlign: 'center',
        fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#b4b2a9',
      }}>
        Save travel inspiration to Horizon and suggestions will appear here.
      </div>
    )
  }

  return (
    <div data-testid="hierarchical-suggestions">
      {/* Section label */}
      {rows.length > 0 && (
        <div style={{
          padding: '14px 16px 6px',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-tertiary)',
        }}
        data-testid="suggestions-label"
        >
          From your Horizon
        </div>
      )}

      {/* Flat suggestion rows — same layout as confirmed destination rows */}
      {rows.map(row => (
        <SuggestionRow
          key={row.key}
          testId={`suggestion-${row.key}`}
          cityName={row.cityName}
          countryName={row.countryName}
          saveCount={row.saveCount}
          onClick={() => onAddCity(row.city, row.countryCode, row.countryName)}
        />
      ))}

      {/* Unassigned saves */}
      {tree.unassignedCount > 0 && (
        <div style={{
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#b4b2a9',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {tree.unassignedCount} save{tree.unassignedCount !== 1 ? 's' : ''} have no location
        </div>
      )}
    </div>
  )
}
