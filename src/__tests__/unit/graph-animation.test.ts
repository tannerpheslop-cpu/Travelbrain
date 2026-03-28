import { describe, it, expect } from 'vitest'
import {
  sortNodesByDistanceFromCenter,
  computeStaggerDelay,
  computeFadeOpacity,
} from '../../components/horizon/TravelGraph'
import type { GraphNode } from '../../components/horizon/useGraphData'
import { GRAPH } from '../../components/horizon/graphConstants'

function makeNode(id: string, x: number, y: number): GraphNode {
  return { id, title: id, city: null, countryCode: null, categories: [], isClaimedByTrip: false, x, y }
}

describe('Graph animation', () => {
  describe('sortNodesByDistanceFromCenter', () => {
    it('sorts nodes closest to center first', () => {
      const nodes = [
        makeNode('far', 200, 200),
        makeNode('close', 101, 101),
        makeNode('mid', 150, 150),
      ]
      const sorted = sortNodesByDistanceFromCenter(nodes, 100, 100)
      expect(sorted).toEqual(['close', 'mid', 'far'])
    })

    it('handles single node', () => {
      const nodes = [makeNode('only', 50, 50)]
      const sorted = sortNodesByDistanceFromCenter(nodes, 100, 100)
      expect(sorted).toEqual(['only'])
    })

    it('handles empty array', () => {
      expect(sortNodesByDistanceFromCenter([], 100, 100)).toEqual([])
    })
  })

  describe('computeStaggerDelay', () => {
    it('first node (index 0) has 0 delay', () => {
      expect(computeStaggerDelay(0, 10)).toBe(0)
    })

    it('delays increase with sort index', () => {
      const d1 = computeStaggerDelay(1, 10)
      const d5 = computeStaggerDelay(5, 10)
      const d9 = computeStaggerDelay(9, 10)
      expect(d5).toBeGreaterThan(d1)
      expect(d9).toBeGreaterThan(d5)
    })

    it('all delays capped at FADE_STAGGER_CAP', () => {
      const delay = computeStaggerDelay(100, 10) // index > total
      expect(delay).toBeLessThanOrEqual(GRAPH.FADE_STAGGER_CAP)
    })

    it('last node has delay near FADE_STAGGER_CAP', () => {
      const delay = computeStaggerDelay(9, 10)
      expect(delay).toBeCloseTo(GRAPH.FADE_STAGGER_CAP * 0.9, 0)
    })
  })

  describe('computeFadeOpacity', () => {
    it('returns 0 before stagger delay', () => {
      expect(computeFadeOpacity(100, 500, 400)).toBe(0)
    })

    it('returns partial during fade', () => {
      // elapsed=700, delay=500, duration=400 → (700-500)/400 = 0.5
      expect(computeFadeOpacity(700, 500, 400)).toBe(0.5)
    })

    it('returns 1 after fade completes', () => {
      // elapsed=1000, delay=500, duration=400 → (1000-500)/400 = 1.25 → clamped to 1
      expect(computeFadeOpacity(1000, 500, 400)).toBe(1)
    })

    it('returns 0 at exactly the delay start', () => {
      expect(computeFadeOpacity(500, 500, 400)).toBe(0)
    })
  })
})
