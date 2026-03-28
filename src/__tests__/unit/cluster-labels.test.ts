import { describe, it, expect } from 'vitest'
import { computeClusterLabels } from '../../components/horizon/TravelGraph'
import type { GraphNode } from '../../components/horizon/useGraphData'

function makeNode(id: string, city: string, x: number, y: number): GraphNode {
  return { id, title: `Item ${id}`, city, countryCode: 'JP', categories: ['activity'], isClaimedByTrip: false, x, y }
}

describe('computeClusterLabels', () => {
  it('city with 4+ nodes gets a label', () => {
    const nodes = [
      makeNode('a', 'Tokyo', 100, 100),
      makeNode('b', 'Tokyo', 110, 90),
      makeNode('c', 'Tokyo', 105, 95),
      makeNode('d', 'Tokyo', 108, 88),
    ]
    const labels = computeClusterLabels(nodes)
    expect(labels).toHaveLength(1)
    expect(labels[0].city).toBe('Tokyo')
  })

  it('city with 3 nodes does NOT get a label', () => {
    const nodes = [
      makeNode('a', 'Tokyo', 100, 100),
      makeNode('b', 'Tokyo', 110, 90),
      makeNode('c', 'Tokyo', 105, 95),
    ]
    expect(computeClusterLabels(nodes)).toHaveLength(0)
  })

  it('label positioned at centroid x, above highest node y', () => {
    const nodes = [
      makeNode('a', 'Kyoto', 100, 200),
      makeNode('b', 'Kyoto', 120, 180),
      makeNode('c', 'Kyoto', 110, 160),
      makeNode('d', 'Kyoto', 130, 190),
    ]
    const labels = computeClusterLabels(nodes)
    expect(labels).toHaveLength(1)
    // Centroid x = (100+120+110+130)/4 = 115
    expect(labels[0].x).toBeCloseTo(115, 0)
    // Highest node y = 160, label at 160 - 15 = 145
    expect(labels[0].y).toBe(145)
  })

  it('overlapping labels: smaller cluster hidden', () => {
    // Two clusters very close together
    const nodes = [
      // 5-node cluster
      makeNode('a1', 'Tokyo', 100, 100),
      makeNode('a2', 'Tokyo', 102, 98),
      makeNode('a3', 'Tokyo', 104, 96),
      makeNode('a4', 'Tokyo', 106, 94),
      makeNode('a5', 'Tokyo', 108, 92),
      // 4-node cluster at nearly the same position
      makeNode('b1', 'Osaka', 103, 99),
      makeNode('b2', 'Osaka', 105, 97),
      makeNode('b3', 'Osaka', 107, 95),
      makeNode('b4', 'Osaka', 109, 93),
    ]
    const labels = computeClusterLabels(nodes)
    // Only the larger cluster's label survives
    expect(labels).toHaveLength(1)
    expect(labels[0].city).toBe('Tokyo')
  })

  it('non-overlapping labels both show', () => {
    const nodes = [
      makeNode('a1', 'Tokyo', 50, 50),
      makeNode('a2', 'Tokyo', 55, 55),
      makeNode('a3', 'Tokyo', 60, 45),
      makeNode('a4', 'Tokyo', 52, 48),
      makeNode('b1', 'Kyoto', 300, 300),
      makeNode('b2', 'Kyoto', 305, 295),
      makeNode('b3', 'Kyoto', 310, 290),
      makeNode('b4', 'Kyoto', 302, 298),
    ]
    const labels = computeClusterLabels(nodes)
    expect(labels).toHaveLength(2)
  })

  it('nodes without city are excluded from clustering', () => {
    const nodes = [
      makeNode('a', '', 100, 100),
      makeNode('b', '', 110, 90),
      makeNode('c', '', 105, 95),
      makeNode('d', '', 108, 88),
    ]
    expect(computeClusterLabels(nodes)).toHaveLength(0)
  })
})
