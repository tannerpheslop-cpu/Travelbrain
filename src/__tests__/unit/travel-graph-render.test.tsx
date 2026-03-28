import { describe, it, expect, vi, beforeAll } from 'vitest'
// render/screen available if we add component-level tests later

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
})

import { getNodeRadius, getNodeState, NODE_COLORS, EDGE_STYLES } from '../../components/horizon/TravelGraph'
import type { GraphNode } from '../../components/horizon/useGraphData'

function makeNode(id: string, claimed = false, _connections = 1): GraphNode {
  return { id, title: `Item ${id}`, city: 'tokyo', countryCode: 'JP', categories: ['activity'], isClaimedByTrip: claimed, x: 100, y: 100 }
}

describe('TravelGraph rendering logic', () => {
  describe('getNodeRadius', () => {
    it('orphan (0 connections) = 2.5px', () => {
      expect(getNodeRadius(0)).toBe(2.5)
    })
    it('low (1-2 connections) = 3px', () => {
      expect(getNodeRadius(1)).toBe(3)
      expect(getNodeRadius(2)).toBe(3)
    })
    it('mid (3-5 connections) = 3.5px', () => {
      expect(getNodeRadius(3)).toBe(3.5)
    })
    it('high (6-10 connections) = 4px', () => {
      expect(getNodeRadius(6)).toBe(4)
    })
    it('hub (10+ connections) = 4.5px', () => {
      expect(getNodeRadius(11)).toBe(4.5)
    })
  })

  describe('getNodeState', () => {
    it('claimed node returns "claimed"', () => {
      expect(getNodeState(makeNode('a', true), 5)).toBe('claimed')
    })
    it('orphan (0 connections) returns "dim"', () => {
      expect(getNodeState(makeNode('a', false), 0)).toBe('dim')
    })
    it('connected unclaimed returns "default"', () => {
      expect(getNodeState(makeNode('a', false), 3)).toBe('default')
    })
  })

  describe('NODE_COLORS', () => {
    it('dim uses star-dim color', () => {
      expect(NODE_COLORS.dim.fill).toBe('#b8c8e0')
    })
    it('claimed uses copper color', () => {
      expect(NODE_COLORS.claimed.fill).toBe('#c45a2d')
    })
    it('default uses star-default color', () => {
      expect(NODE_COLORS.default.fill).toBe('#d4e0f0')
    })
  })

  describe('EDGE_STYLES', () => {
    it('city edges: 0.8px width, 9% opacity', () => {
      expect(EDGE_STYLES.city.width).toBe(0.8)
      expect(EDGE_STYLES.city.opacity).toBe(0.09)
    })
    it('country edges: 0.5px width, 6% opacity', () => {
      expect(EDGE_STYLES.country.width).toBe(0.5)
      expect(EDGE_STYLES.country.opacity).toBe(0.06)
    })
    it('category edges: 0.3px width, 3% opacity', () => {
      expect(EDGE_STYLES.category.width).toBe(0.3)
      expect(EDGE_STYLES.category.opacity).toBe(0.03)
    })
  })
})
