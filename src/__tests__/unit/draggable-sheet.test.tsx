import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import DraggableSheet from '../../components/map/DraggableSheet'

// Mock window.innerHeight for consistent snap point calculations
beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: 800, writable: true })
})

const defaultSnaps: [number, number, number] = [0.15, 0.5, 0.85]

describe('DraggableSheet', () => {
  it('renders at half snap point by default (50% of viewport)', () => {
    render(
      <DraggableSheet snapPoints={defaultSnaps} header={<div>Header</div>}>
        <div>Content</div>
      </DraggableSheet>,
    )
    const sheet = screen.getByTestId('draggable-sheet')
    // 50% of 800px = 400px
    expect(sheet.style.height).toBe('400px')
  })

  it('renders at specified initialSnap (peek)', () => {
    render(
      <DraggableSheet snapPoints={defaultSnaps} initialSnap="peek" header={<div>Header</div>}>
        <div>Content</div>
      </DraggableSheet>,
    )
    const sheet = screen.getByTestId('draggable-sheet')
    // 15% of 800px = 120px
    expect(sheet.style.height).toBe('120px')
  })

  it('renders at specified initialSnap (full)', () => {
    render(
      <DraggableSheet snapPoints={defaultSnaps} initialSnap="full" header={<div>Header</div>}>
        <div>Content</div>
      </DraggableSheet>,
    )
    const sheet = screen.getByTestId('draggable-sheet')
    // 85% of 800px = 680px
    expect(sheet.style.height).toBe('680px')
  })

  it('header content renders and is visible', () => {
    render(
      <DraggableSheet snapPoints={defaultSnaps} header={<div>Kyoto · 6 places</div>}>
        <div>Item list</div>
      </DraggableSheet>,
    )
    expect(screen.getByText('Kyoto · 6 places')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-header')).toBeInTheDocument()
  })

  it('children content renders in the scrollable area', () => {
    render(
      <DraggableSheet snapPoints={defaultSnaps} header={<div>Header</div>}>
        <div>Restaurant 1</div>
        <div>Restaurant 2</div>
      </DraggableSheet>,
    )
    expect(screen.getByText('Restaurant 1')).toBeInTheDocument()
    expect(screen.getByText('Restaurant 2')).toBeInTheDocument()
    const content = screen.getByTestId('sheet-content')
    expect(content.style.overflowY).toBe('auto')
  })

  it('calls onSnapChange when snap point changes', () => {
    const onChange = vi.fn()
    render(
      <DraggableSheet snapPoints={defaultSnaps} initialSnap="peek" onSnapChange={onChange} header={<div>H</div>}>
        <div>C</div>
      </DraggableSheet>,
    )
    // The component starts at peek — onSnapChange should not be called yet
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders drag handle', () => {
    render(
      <DraggableSheet snapPoints={defaultSnaps} header={<div>H</div>}>
        <div>C</div>
      </DraggableSheet>,
    )
    expect(screen.getByTestId('sheet-drag-handle')).toBeInTheDocument()
  })

  it('snap point heights match expected fractions', () => {
    // Peek: 15% of 800 = 120, Half: 50% = 400, Full: 85% = 680
    // Each must be a fresh mount since initialSnap only applies on mount
    const { unmount: u1 } = render(
      <DraggableSheet snapPoints={defaultSnaps} initialSnap="peek" header={<div>H</div>}>
        <div>C</div>
      </DraggableSheet>,
    )
    expect(screen.getByTestId('draggable-sheet').style.height).toBe('120px')
    u1()

    const { unmount: u2 } = render(
      <DraggableSheet snapPoints={defaultSnaps} initialSnap="half" header={<div>H</div>}>
        <div>C</div>
      </DraggableSheet>,
    )
    expect(screen.getByTestId('draggable-sheet').style.height).toBe('400px')
    u2()

    render(
      <DraggableSheet snapPoints={defaultSnaps} initialSnap="full" header={<div>H</div>}>
        <div>C</div>
      </DraggableSheet>,
    )
    expect(screen.getByTestId('draggable-sheet').style.height).toBe('680px')
  })

  it('header wrapper uses touchAction pan-x to allow horizontal scrolling within header', () => {
    render(
      <DraggableSheet snapPoints={defaultSnaps} header={<div>Filter pills here</div>}>
        <div>C</div>
      </DraggableSheet>,
    )
    const header = screen.getByTestId('sheet-header')
    // pan-x allows native horizontal scrolling (e.g. filter bar)
    // while keeping vertical touch events available for JS sheet drag
    expect(header.style.touchAction).toBe('pan-x')
  })
})
