import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PillSheet from '../PillSheet'
import type { PillGroup } from '../PillSheet'

// Suppress requestAnimationFrame for instant visibility in tests
vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 0 })

const categoryGroup: PillGroup = {
  title: 'Category',
  pills: ['Food', 'Activity', 'Stay'],
  type: 'category',
}

const countryGroup: PillGroup = {
  title: 'Country',
  pills: ['Japan', 'China', 'Thailand'],
  type: 'country',
}

const customGroup: PillGroup = {
  title: 'My Tags',
  pills: ['Bucket List', 'Date Night'],
  type: 'custom',
}

describe('PillSheet', () => {
  it('renders with grouped pills', () => {
    render(
      <PillSheet
        groups={[categoryGroup, countryGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // Group titles
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByText('Country')).toBeInTheDocument()

    // Pills
    expect(screen.getByTestId('pill-Food')).toBeInTheDocument()
    expect(screen.getByTestId('pill-Activity')).toBeInTheDocument()
    expect(screen.getByTestId('pill-Stay')).toBeInTheDocument()
    expect(screen.getByTestId('pill-Japan')).toBeInTheDocument()
    expect(screen.getByTestId('pill-China')).toBeInTheDocument()
    expect(screen.getByTestId('pill-Thailand')).toBeInTheDocument()
  })

  it('renders the sheet title', () => {
    render(
      <PillSheet
        groups={[categoryGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
        title="Tags"
      />,
    )
    expect(screen.getByText('Tags')).toBeInTheDocument()
  })

  it('renders default title "Filter" when none provided', () => {
    render(
      <PillSheet
        groups={[categoryGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Filter')).toBeInTheDocument()
  })

  it('renders subtitle text', () => {
    render(
      <PillSheet
        groups={[categoryGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Tap to select. Tap again to deselect.')).toBeInTheDocument()
  })

  it('highlights selected pills with aria-pressed', () => {
    render(
      <PillSheet
        groups={[categoryGroup]}
        selected={['Food']}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pill-Food')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('pill-Activity')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSelectionChange with added pill when tapping unselected pill', () => {
    const onChange = vi.fn()
    render(
      <PillSheet
        groups={[categoryGroup]}
        selected={[]}
        onSelectionChange={onChange}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('pill-Food'))
    expect(onChange).toHaveBeenCalledWith(['Food'])
  })

  it('calls onSelectionChange with pill removed when tapping selected pill', () => {
    const onChange = vi.fn()
    render(
      <PillSheet
        groups={[categoryGroup]}
        selected={['Food', 'Activity']}
        onSelectionChange={onChange}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('pill-Food'))
    expect(onChange).toHaveBeenCalledWith(['Activity'])
  })

  it('supports multi-selection across groups', () => {
    const onChange = vi.fn()
    render(
      <PillSheet
        groups={[categoryGroup, countryGroup]}
        selected={['Food', 'Japan']}
        onSelectionChange={onChange}
        onClose={vi.fn()}
      />,
    )

    // Both are highlighted
    expect(screen.getByTestId('pill-Food')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('pill-Japan')).toHaveAttribute('aria-pressed', 'true')

    // Adding a third
    fireEvent.click(screen.getByTestId('pill-China'))
    expect(onChange).toHaveBeenCalledWith(['Food', 'Japan', 'China'])
  })

  it('clears all selections when "Clear selection" is tapped', () => {
    const onChange = vi.fn()
    render(
      <PillSheet
        groups={[categoryGroup, countryGroup]}
        selected={['Food', 'Japan']}
        onSelectionChange={onChange}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('pill-sheet-clear'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('disables "Clear selection" when nothing is selected', () => {
    render(
      <PillSheet
        groups={[categoryGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByTestId('pill-sheet-clear')).toBeDisabled()
  })

  it('calls onClose when "Done" is tapped', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(
      <PillSheet
        groups={[categoryGroup]}
        selected={['Food']}
        onSelectionChange={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByTestId('pill-sheet-done'))
    vi.advanceTimersByTime(300)
    expect(onClose).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('calls onClose when backdrop is tapped', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(
      <PillSheet
        groups={[categoryGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByTestId('pill-sheet-backdrop'))
    vi.advanceTimersByTime(300)
    expect(onClose).toHaveBeenCalled()
    vi.useRealTimers()
  })

  // ── Custom tag tests ──────────────────────────────────────────────────────

  it('shows custom tag section and "+" button when allowCustom is true', () => {
    render(
      <PillSheet
        groups={[customGroup, categoryGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
        allowCustom
      />,
    )

    expect(screen.getByText('My Tags')).toBeInTheDocument()
    expect(screen.getByTestId('pill-Bucket List')).toBeInTheDocument()
    expect(screen.getByTestId('pill-Date Night')).toBeInTheDocument()
    expect(screen.getByTestId('add-custom-tag-btn')).toBeInTheDocument()
  })

  it('reveals input when "+" is tapped', () => {
    render(
      <PillSheet
        groups={[customGroup, categoryGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
        allowCustom
      />,
    )

    fireEvent.click(screen.getByTestId('add-custom-tag-btn'))
    expect(screen.getByTestId('custom-tag-input')).toBeInTheDocument()
  })

  it('creates a custom tag on Enter and calls onAddCustom + selects it', () => {
    const onAddCustom = vi.fn()
    const onChange = vi.fn()
    render(
      <PillSheet
        groups={[customGroup, categoryGroup]}
        selected={[]}
        onSelectionChange={onChange}
        onClose={vi.fn()}
        allowCustom
        onAddCustom={onAddCustom}
      />,
    )

    // Open input
    fireEvent.click(screen.getByTestId('add-custom-tag-btn'))
    const input = screen.getByTestId('custom-tag-input')

    // Type and submit
    fireEvent.change(input, { target: { value: 'Must Do' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onAddCustom).toHaveBeenCalledWith('Must Do')
    expect(onChange).toHaveBeenCalledWith(['Must Do'])
  })

  it('does not create empty custom tags', () => {
    const onAddCustom = vi.fn()
    render(
      <PillSheet
        groups={[customGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
        allowCustom
        onAddCustom={onAddCustom}
      />,
    )

    fireEvent.click(screen.getByTestId('add-custom-tag-btn'))
    const input = screen.getByTestId('custom-tag-input')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onAddCustom).not.toHaveBeenCalled()
  })

  it('hides input on Escape', () => {
    render(
      <PillSheet
        groups={[customGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
        allowCustom
      />,
    )

    fireEvent.click(screen.getByTestId('add-custom-tag-btn'))
    expect(screen.getByTestId('custom-tag-input')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByTestId('custom-tag-input'), { key: 'Escape' })
    expect(screen.queryByTestId('custom-tag-input')).not.toBeInTheDocument()
  })

  it('does not show "+" button when allowCustom is false', () => {
    render(
      <PillSheet
        groups={[categoryGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('add-custom-tag-btn')).not.toBeInTheDocument()
  })

  // ── BUG-1 regression: bottom sheet pattern ────────────────────────────────

  it('uses fixed-bottom pattern, not flex items-end wrapper (mobile touch targets)', () => {
    const { container } = render(
      <PillSheet
        groups={[categoryGroup]}
        selected={[]}
        onSelectionChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const sheet = screen.getByTestId('pill-sheet')
    const backdrop = screen.getByTestId('pill-sheet-backdrop')

    // Sheet and backdrop must be separate sibling elements, not nested in a flex wrapper.
    // The sheet must use fixed positioning pinned to bottom (inset-x-0 bottom-0).
    expect(sheet.classList.contains('fixed')).toBe(true)
    expect(sheet.classList.contains('bottom-0')).toBe(true)
    expect(sheet.classList.contains('inset-x-0')).toBe(true)

    // Backdrop must also be fixed, not absolute inside a flex parent.
    expect(backdrop.classList.contains('fixed')).toBe(true)
    expect(backdrop.classList.contains('inset-0')).toBe(true)

    // They must NOT be wrapped in a flex items-end container.
    // Both should be direct children of the React Fragment (i.e., the body).
    const parent = sheet.parentElement
    if (parent) {
      expect(parent.classList.contains('flex')).toBe(false)
      expect(parent.classList.contains('items-end')).toBe(false)
    }
  })
})
