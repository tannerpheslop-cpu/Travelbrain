import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SegmentedControl from '../../components/SegmentedControl'

describe('SegmentedControl', () => {
  it('renders all options', () => {
    render(<SegmentedControl options={['City', 'Country', 'Continent']} selected="Country" onChange={vi.fn()} />)
    expect(screen.getByTestId('segment-City')).toBeInTheDocument()
    expect(screen.getByTestId('segment-Country')).toBeInTheDocument()
    expect(screen.getByTestId('segment-Continent')).toBeInTheDocument()
  })

  it('selected option has aria-pressed true', () => {
    render(<SegmentedControl options={['A', 'B', 'C']} selected="B" onChange={vi.fn()} />)
    expect(screen.getByTestId('segment-A')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('segment-B')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('segment-C')).toHaveAttribute('aria-pressed', 'false')
  })

  it('tapping unselected option calls onChange', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={['A', 'B']} selected="A" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('segment-B'))
    expect(onChange).toHaveBeenCalledWith('B')
  })

  it('tapping already-selected option does NOT call onChange', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={['A', 'B']} selected="A" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('segment-A'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
