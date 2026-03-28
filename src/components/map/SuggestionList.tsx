import { useState } from 'react'
import { MapPin, Plus } from 'lucide-react'
import SegmentedControl from '../SegmentedControl'
import { expandGroupToDestinations, type SuggestionGroup } from '../../lib/groupSavesByGeography'

// ── Flag emoji from country code ─────────────────────────────────────────────

function flagEmoji(code: string | undefined): string {
  if (!code || code.length !== 2) return '🌍'
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65),
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SuggestionListProps {
  groups: SuggestionGroup[]
  granularity: 'city' | 'country' | 'continent'
  onGranularityChange: (g: 'city' | 'country' | 'continent') => void
  onAddDestination: (group: SuggestionGroup) => void
  onAddAll: (group: SuggestionGroup) => void
  unassignedCount: number
}

const VISIBLE_LIMIT = 5

// ── Component ────────────────────────────────────────────────────────────────

export default function SuggestionList({
  groups,
  granularity,
  onGranularityChange,
  onAddDestination,
  onAddAll,
  unassignedCount,
}: SuggestionListProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmGroupId, setConfirmGroupId] = useState<string | null>(null)

  const visibleGroups = expanded ? groups : groups.slice(0, VISIBLE_LIMIT)
  const hiddenCount = groups.length - VISIBLE_LIMIT

  const handleAdd = (group: SuggestionGroup) => {
    if (group.saveCount > 0 && granularity === 'city') {
      // City-level with saves → show confirmation
      setConfirmGroupId(group.id)
    } else if (group.saveCount > 0 && granularity !== 'city') {
      // Country/continent level → show confirmation too
      setConfirmGroupId(group.id)
    } else {
      // No saves → add immediately
      onAddDestination(group)
    }
  }

  return (
    <div data-testid="suggestion-list" style={{ padding: '0 0 8px' }}>
      {/* Segmented control */}
      <div style={{ padding: '0 16px 12px' }}>
        <SegmentedControl
          options={['City', 'Country', 'Continent']}
          selected={granularity === 'city' ? 'City' : granularity === 'country' ? 'Country' : 'Continent'}
          onChange={opt => {
            const g = opt === 'City' ? 'city' : opt === 'Country' ? 'country' : 'continent'
            onGranularityChange(g)
            setExpanded(false)
            setConfirmGroupId(null)
          }}
        />
      </div>

      {/* Suggestion rows */}
      {visibleGroups.length === 0 && (
        <div style={{
          padding: '20px 16px',
          textAlign: 'center',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          color: 'var(--color-text-tertiary)',
        }}>
          No suggestions — save some places to your Horizon first
        </div>
      )}

      {visibleGroups.map(group => (
        <SuggestionRow
          key={group.id}
          group={group}
          granularity={granularity}
          showConfirmation={confirmGroupId === group.id}
          onTapPlus={() => handleAdd(group)}
          onAddDestination={() => {
            onAddDestination(group)
            setConfirmGroupId(null)
          }}
          onAddAll={() => {
            onAddAll(group)
            setConfirmGroupId(null)
          }}
        />
      ))}

      {/* Expandable */}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          data-testid="suggestion-expand"
          onClick={() => setExpanded(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-accent)',
          }}
        >
          <span style={{ fontSize: 11 }}>›</span>
          More suggestions ({hiddenCount})
        </button>
      )}

      {/* Unassigned saves */}
      {unassignedCount > 0 && (
        <div
          data-testid="unassigned-saves"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderTop: '1px solid var(--color-border-light, #f0eeea)',
            marginTop: 4,
          }}
        >
          <MapPin size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
          }}>
            {unassignedCount} save{unassignedCount !== 1 ? 's' : ''} have no location
          </span>
        </div>
      )}
    </div>
  )
}

// ── Suggestion row ───────────────────────────────────────────────────────────

function SuggestionRow({
  group,
  granularity,
  showConfirmation,
  onTapPlus,
  onAddDestination,
  onAddAll,
}: {
  group: SuggestionGroup
  granularity: string
  showConfirmation: boolean
  onTapPlus: () => void
  onAddDestination: () => void
  onAddAll: () => void
}) {
  const flag = granularity === 'continent' ? '🌍' : flagEmoji(group.countryCode)

  return (
    <div data-testid={`suggestion-row-${group.id}`}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 10 }}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{flag}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--color-text-primary)',
          }}>
            {group.label}
          </span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            marginLeft: 6,
          }}>
            · {group.saveCount} save{group.saveCount !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          type="button"
          data-testid={`suggestion-add-${group.id}`}
          onClick={e => { e.stopPropagation(); onTapPlus() }}
          style={{
            width: 32, height: 32, minWidth: 32, borderRadius: '50%', border: 'none',
            background: 'var(--color-accent)', color: '#ffffff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Inline confirmation */}
      {showConfirmation && (() => {
        const expanded = expandGroupToDestinations(group)
        const isMulti = expanded.length > 1
        const MAX_CITY_NAMES = 4
        const cityNames = expanded.map(d => d.name)
        const shownNames = cityNames.slice(0, MAX_CITY_NAMES)
        const moreCount = cityNames.length - MAX_CITY_NAMES

        return (
        <div
          data-testid={`suggestion-confirm-${group.id}`}
          style={{
            margin: '0 16px 8px',
            padding: '12px 14px',
            background: 'var(--color-bg-muted)',
            borderRadius: 12,
          }}
        >
          {isMulti ? (
            <>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>
                {group.label} — {expanded.length} destinations
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 10px', lineHeight: 1.4 }}>
                {shownNames.map((n, i) => (
                  <span key={n}>{n} ({expanded[i].saves.length}){i < shownNames.length - 1 ? ', ' : ''}</span>
                ))}
                {moreCount > 0 && <span> + {moreCount} more</span>}
              </p>
            </>
          ) : (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
              {group.saveCount} save{group.saveCount !== 1 ? 's' : ''} match this destination
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              data-testid={`confirm-add-dest-${group.id}`}
              onClick={onAddDestination}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 8,
                border: '1px solid var(--color-border-input)',
                background: 'var(--color-bg-card)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              {isMulti ? 'Add destinations' : 'Add destination'}
            </button>
            <button
              type="button"
              data-testid={`confirm-add-all-${group.id}`}
              onClick={onAddAll}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 8,
                border: 'none',
                background: 'var(--color-accent)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Add all {group.saveCount}
            </button>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
