import { useState, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import LocationAutocomplete, { type LocationSelection } from '../LocationAutocomplete'

interface AddDestinationSheetProps {
  onSelect: (location: LocationSelection) => void
  onClose: () => void
  suggestions?: Array<{
    key: string
    label: string
    countryCode: string
    itemCount: number
    loc: LocationSelection
  }>
}

export default function AddDestinationSheet({
  onSelect,
  onClose,
  suggestions,
}: AddDestinationSheetProps) {
  const [visible, setVisible] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 250)
  }, [onClose])

  const handleSelect = useCallback(
    (loc: LocationSelection | null) => {
      if (!loc) return
      console.log('[AddDestinationSheet] onSelect fired:', loc.name)
      onSelectRef.current(loc)
      handleClose()
    },
    [handleClose],
  )

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="add-dest-sheet-backdrop"
        className="fixed inset-0 z-40 transition-opacity duration-250"
        style={{ background: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)' }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        data-testid="add-dest-sheet"
        className="fixed inset-x-0 bottom-0 z-50"
        style={{
          maxHeight: '85dvh',
          background: 'var(--color-bg-card)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          display: 'flex',
          flexDirection: 'column',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border-input)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 12px' }}>
          <h3 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            margin: 0,
          }}>
            Add Destination
          </h3>
          <button type="button" onClick={handleClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', padding: 4,
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Autocomplete */}
        <div style={{ padding: '0 16px 16px' }}>
          <LocationAutocomplete
            value=""
            onSelect={handleSelect}
            placeholder="Search for a city or country..."
            placesTypes={['(regions)']}
            clearOnSelect
          />
        </div>

        {/* Suggestions */}
        {suggestions && suggestions.length > 0 && (
          <div style={{ padding: '0 16px 20px', overflowY: 'auto' }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 8,
            }}>
              Suggested from your saves
            </p>
            {suggestions.map(s => (
              <button
                key={s.key}
                type="button"
                data-testid={`dest-suggestion-${s.countryCode}`}
                onClick={() => {
                  console.log('[AddDestinationSheet] suggestion selected:', s.label)
                  onSelectRef.current(s.loc)
                  handleClose()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--color-bg-muted)',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  marginBottom: 6,
                  textAlign: 'left',
                }}
              >
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--color-text-tertiary)',
                  background: 'var(--color-bg-page)',
                  padding: '2px 5px',
                  borderRadius: 4,
                }}>
                  {s.countryCode}
                </span>
                <span style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                  flex: 1,
                }}>
                  {s.label}
                </span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                }}>
                  · {s.itemCount}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
