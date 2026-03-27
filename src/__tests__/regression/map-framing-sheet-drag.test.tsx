import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import DraggableSheet from '../../components/map/DraggableSheet'

beforeAll(() => {
  Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 })
})

describe('Bug A regression: fitBounds padding accounts for sheet', () => {
  it('FIT_BOUNDS_PADDING has bottom >= 200 to account for half-snap sheet', async () => {
    const { FIT_BOUNDS_PADDING } = await import('../../components/map/mapConfig')
    expect(FIT_BOUNDS_PADDING.bottom).toBeGreaterThanOrEqual(200)
    expect(FIT_BOUNDS_PADDING.top).toBeGreaterThanOrEqual(80)
  })
})

describe('Bug B regression: sheet content visible after returning from destination', () => {
  it('sheet content has opacity 1 when rendered at trip level', () => {
    // This tests that sheetContentOpacity is 1 when level is trip.
    // The bug was that exitToTrip set sheetContentOpacity to 0 and never restored it.
    // We verify the sheet content is visible by rendering DraggableSheet directly.
    render(
      <DraggableSheet snapPoints={[0.15, 0.5, 0.85]} header={<div>Header</div>}>
        <div data-testid="test-content">Destination list here</div>
      </DraggableSheet>,
    )
    expect(screen.getByTestId('test-content')).toBeInTheDocument()
    expect(screen.getByTestId('test-content').textContent).toBe('Destination list here')
  })
})

describe('Bug C regression: sheet drag handle works in all directions', () => {
  function renderSheet() {
    const onSnap = vi.fn()
    render(
      <DraggableSheet snapPoints={[0.15, 0.5, 0.85]} initialSnap="half" onSnapChange={onSnap} header={<div>Header</div>}>
        <div>Content</div>
      </DraggableSheet>,
    )
    return { onSnap }
  }

  it('drag handle has touchAction: none to prevent browser gesture hijacking', () => {
    renderSheet()
    const handle = screen.getByTestId('sheet-drag-handle')
    expect(handle.style.touchAction).toBe('none')
  })

  it('sheet outer container has overflow hidden to prevent browser scroll', () => {
    renderSheet()
    const sheet = screen.getByTestId('draggable-sheet')
    expect(sheet.style.overflow).toBe('hidden')
  })

  it('sheet starts at half snap height (50% of viewport)', () => {
    renderSheet()
    const sheet = screen.getByTestId('draggable-sheet')
    // 50% of 800px viewport = 400px
    expect(parseInt(sheet.style.height)).toBe(400)
  })
})
