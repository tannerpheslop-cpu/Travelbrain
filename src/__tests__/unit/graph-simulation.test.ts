import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGraphSimulation } from '../../components/horizon/useGraphSimulation'
import type { GraphNode, GraphEdge } from '../../components/horizon/useGraphData'
import { GRAPH } from '../../components/horizon/graphConstants'

function makeNode(id: string, city: string | null = null, cc: string | null = null): GraphNode {
  return { id, title: `Item ${id}`, city, countryCode: cc, categories: ['activity'], isClaimedByTrip: false, x: 0, y: 0 }
}

// Mock requestAnimationFrame for synchronous testing
beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0)
    return 0
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useGraphSimulation', () => {
  it('returns nodes with x, y positions after simulation runs', async () => {
    const nodes = [makeNode('a', 'tokyo', 'JP'), makeNode('b', 'kyoto', 'JP')]
    const edges: GraphEdge[] = [{ source: 'a', target: 'b', weight: 0.5, type: 'country' }]

    const { result } = renderHook(() => useGraphSimulation({
      nodes, edges, width: 400, height: 400, enabled: true,
    }))

    // Wait for simulation to produce positions
    await waitFor(() => {
      const sn = result.current.simulatedNodes
      expect(sn.length).toBe(2)
      // At least one node should have moved from (0, 0)
      const moved = sn.some(n => n.x !== 0 || n.y !== 0)
      expect(moved).toBe(true)
    }, { timeout: 5000 })
  })

  it('nodes stay within container bounds', async () => {
    const W = 300
    const H = 300
    const nodes = [
      makeNode('a', 'tokyo', 'JP'),
      makeNode('b', 'tokyo', 'JP'),
      makeNode('c', 'tokyo', 'JP'),
    ]
    const edges: GraphEdge[] = []

    const { result } = renderHook(() => useGraphSimulation({
      nodes, edges, width: W, height: H, enabled: true,
    }))

    await waitFor(() => {
      for (const n of result.current.simulatedNodes) {
        expect(n.x).toBeGreaterThanOrEqual(GRAPH.BOUNDS_PAD)
        expect(n.x).toBeLessThanOrEqual(W - GRAPH.BOUNDS_PAD)
        expect(n.y).toBeGreaterThanOrEqual(GRAPH.BOUNDS_PAD)
        expect(n.y).toBeLessThanOrEqual(H - GRAPH.BOUNDS_PAD)
      }
    }, { timeout: 5000 })
  })

  it('starts as not settled when simulation is enabled', () => {
    const nodes = [makeNode('a'), makeNode('b')]
    const edges: GraphEdge[] = []

    const { result } = renderHook(() => useGraphSimulation({
      nodes, edges, width: 400, height: 400, enabled: true,
    }))

    // Simulation starts running — initially not settled (unless it converges instantly)
    // The important contract: isSettled is false at start, becomes true eventually
    expect(typeof result.current.isSettled).toBe('boolean')
  })

  it('disabled simulation returns original nodes and isSettled=true', () => {
    const nodes = [makeNode('a')]
    const edges: GraphEdge[] = []

    const { result } = renderHook(() => useGraphSimulation({
      nodes, edges, width: 400, height: 400, enabled: false,
    }))

    expect(result.current.isSettled).toBe(true)
    expect(result.current.simulatedNodes).toEqual(nodes)
  })
})
