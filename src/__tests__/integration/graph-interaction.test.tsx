import { describe, it, expect, vi, beforeAll } from 'vitest'

// Mock d3-force before any imports
vi.mock('d3-force', () => ({
  forceSimulation: () => {
    const sim: Record<string, unknown> = {}
    const chainable = () => sim
    sim.nodes = (n: unknown[]) => { sim._nodes = n; return sim }
    sim.force = chainable
    sim.alphaDecay = chainable
    sim.velocityDecay = chainable
    sim.alpha = (v?: number) => v !== undefined ? sim : 0.001
    sim.restart = chainable
    sim.stop = chainable
    sim.on = (_event: string, cb?: () => void) => { if (cb) cb(); return sim }
    sim._nodes = []
    return sim
  },
  forceLink: () => ({ id: () => ({ distance: () => ({ strength: () => ({}) }) }) }),
  forceManyBody: () => ({ strength: () => ({ distanceMax: () => ({}) }) }),
  forceCenter: () => ({}),
  forceCollide: () => ({ radius: () => ({ strength: () => ({}) }) }),
}))

// Mock supabase (transitive)
vi.mock('../../lib/supabase', () => ({
  supabase: {}, supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key', invokeEdgeFunction: vi.fn(),
}))
vi.mock('../../lib/googleMaps', () => ({
  loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined),
}))

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
  // ResizeObserver that immediately fires with a width
  global.ResizeObserver = vi.fn().mockImplementation((cb: (entries: Array<{ contentRect: { width: number } }>) => void) => ({
    observe: () => { setTimeout(() => cb([{ contentRect: { width: 400 } }]), 0) },
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })) as unknown as typeof ResizeObserver
})

import { computeClusterLabels, getNodeRadius, getNodeState, NODE_COLORS, EDGE_STYLES } from '../../components/horizon/TravelGraph'
import type { GraphNode } from '../../components/horizon/useGraphData'

describe('TravelGraph interaction logic', () => {
  it('computeClusterLabels returns labels for 4+ node cities', () => {
    const nodes: GraphNode[] = [
      { id: 'a', title: 'A', city: 'Tokyo', countryCode: 'JP', categories: [], isClaimedByTrip: false, x: 100, y: 100 },
      { id: 'b', title: 'B', city: 'Tokyo', countryCode: 'JP', categories: [], isClaimedByTrip: false, x: 110, y: 90 },
      { id: 'c', title: 'C', city: 'Tokyo', countryCode: 'JP', categories: [], isClaimedByTrip: false, x: 105, y: 95 },
      { id: 'd', title: 'D', city: 'Tokyo', countryCode: 'JP', categories: [], isClaimedByTrip: false, x: 108, y: 88 },
    ]
    const labels = computeClusterLabels(nodes)
    // 4 JP nodes → country label "Japan" + city label "Tokyo" (3+ in one city)
    const countryLabels = labels.filter(l => l.level === 'country')
    expect(countryLabels).toHaveLength(1)
    expect(countryLabels[0].text).toBe('Japan')
  })

  it('selected node has bright state colors defined', () => {
    // When a node is selected, TravelGraph applies 'bright' state
    expect(NODE_COLORS.bright.fill).toBe('var(--star-bright)')
    expect(NODE_COLORS.bright.glowOpacity).toBe(0.40)
  })

  it('EDGE_STYLES has higher opacity for city edges than category edges', () => {
    expect(EDGE_STYLES.city.opacity).toBeGreaterThan(EDGE_STYLES.country.opacity)
    expect(EDGE_STYLES.country.opacity).toBeGreaterThan(EDGE_STYLES.category.opacity)
  })

  it('getNodeRadius returns larger radius for more connections', () => {
    expect(getNodeRadius(0)).toBeLessThan(getNodeRadius(3))
    expect(getNodeRadius(3)).toBeLessThan(getNodeRadius(11))
  })

  it('getNodeState returns claimed for trip items', () => {
    const node: GraphNode = { id: 'x', title: 'X', city: 'Tokyo', countryCode: 'JP', categories: [], isClaimedByTrip: true, x: 0, y: 0 }
    expect(getNodeState(node, 5)).toBe('claimed')
  })
})
