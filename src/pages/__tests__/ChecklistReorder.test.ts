/**
 * Regression tests for checklist item behavior.
 * Issue 10: Checking an item should NOT reorder the list.
 * Items stay in place with strikethrough — only reorder on drag.
 */
import { describe, it, expect } from 'vitest'
import type { TripNote } from '../../types'

// Replicate the sort logic from TripOverviewPage GeneralSection
function sortNotes(notes: TripNote[]): TripNote[] {
  return [...notes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

describe('Checklist reorder behavior', () => {
  const notes: TripNote[] = [
    { id: '1', text: 'Pack adapter', created_at: '', completed: false, sort_order: 0 },
    { id: '2', text: 'Check visa', created_at: '', completed: false, sort_order: 1 },
    { id: '3', text: 'Book hotel', created_at: '', completed: false, sort_order: 2 },
  ]

  it('maintains item order when an item is checked', () => {
    // User checks item 2 "Check visa"
    const updated = notes.map(n => n.id === '2' ? { ...n, completed: true } : n)
    const sorted = sortNotes(updated)

    // Item should stay at index 1, NOT move to the bottom
    expect(sorted[0].id).toBe('1')
    expect(sorted[1].id).toBe('2')
    expect(sorted[1].completed).toBe(true)
    expect(sorted[2].id).toBe('3')
  })

  it('does not separate checked and unchecked items', () => {
    // Previously: unchecked first, then checked. Now: maintain sort_order.
    const mixed: TripNote[] = [
      { id: '1', text: 'A', created_at: '', completed: true, sort_order: 0 },
      { id: '2', text: 'B', created_at: '', completed: false, sort_order: 1 },
      { id: '3', text: 'C', created_at: '', completed: true, sort_order: 2 },
      { id: '4', text: 'D', created_at: '', completed: false, sort_order: 3 },
    ]
    const sorted = sortNotes(mixed)

    // Order should be A, B, C, D — NOT B, D, A, C
    expect(sorted.map(n => n.text)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('sorts by sort_order regardless of completed state', () => {
    const notes: TripNote[] = [
      { id: '3', text: 'C', created_at: '', completed: false, sort_order: 2 },
      { id: '1', text: 'A', created_at: '', completed: true, sort_order: 0 },
      { id: '2', text: 'B', created_at: '', completed: false, sort_order: 1 },
    ]
    const sorted = sortNotes(notes)
    expect(sorted.map(n => n.id)).toEqual(['1', '2', '3'])
  })
})
