interface SegmentedControlProps {
  options: string[]
  selected: string
  onChange: (option: string) => void
}

export default function SegmentedControl({ options, selected, onChange }: SegmentedControlProps) {
  return (
    <div
      data-testid="segmented-control"
      style={{
        display: 'flex',
        border: '0.5px solid var(--color-border-tertiary, #e0ddd7)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {options.map(option => {
        const isSelected = option === selected
        return (
          <button
            key={option}
            type="button"
            data-testid={`segment-${option}`}
            aria-pressed={isSelected}
            onClick={() => { if (!isSelected) onChange(option) }}
            style={{
              flex: 1,
              minHeight: 44,
              padding: '6px 0',
              border: 'none',
              cursor: isSelected ? 'default' : 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              background: isSelected ? 'var(--bg-canvas)' : 'transparent',
              color: isSelected ? 'var(--text-primary, #e8eaed)' : 'var(--color-text-secondary, #a8c4dc)',
              boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'background 150ms ease, color 150ms ease, box-shadow 150ms ease',
            }}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
