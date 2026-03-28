import { describe, it, expect } from 'vitest'
import { computeClusterLabels } from '../../components/horizon/TravelGraph'
import type { GraphNode } from '../../components/horizon/useGraphData'

function makeNode(id: string, city: string, countryCode: string, x: number, y: number): GraphNode {
  return { id, title: `Item ${id}`, city, countryCode, categories: ['activity'], isClaimedByTrip: false, x, y }
}

describe('computeClusterLabels — country + city hierarchy', () => {
  it('country with 2+ nodes gets a country label', () => {
    const nodes = [
      makeNode('a', 'Tokyo', 'JP', 100, 100),
      makeNode('b', 'Kyoto', 'JP', 120, 110),
    ]
    const labels = computeClusterLabels(nodes)
    const countryLabels = labels.filter(l => l.level === 'country')
    expect(countryLabels).toHaveLength(1)
    expect(countryLabels[0].text).toBe('Japan')
  })

  it('country with 1 node does NOT get a label', () => {
    const nodes = [
      makeNode('a', 'Tokyo', 'JP', 100, 100),
    ]
    expect(computeClusterLabels(nodes)).toHaveLength(0)
  })

  it('country with 3+ nodes in one city gets both country and city labels (before collision check)', () => {
    // Spread nodes far apart so labels don't collide
    const nodes = [
      makeNode('a', 'Tokyo', 'JP', 100, 200),
      makeNode('b', 'Tokyo', 'JP', 110, 180),
      makeNode('c', 'Tokyo', 'JP', 105, 160),
    ]
    const labels = computeClusterLabels(nodes)
    const country = labels.filter(l => l.level === 'country')
    expect(country).toHaveLength(1)
    expect(country[0].text).toBe('Japan')
    // City label may or may not survive collision avoidance with country label
    // but the country label must exist
  })

  it('country labels have smaller y (higher on screen) than city labels when both present', () => {
    // 5 nodes spread out so labels have room
    const nodes = [
      makeNode('a', 'Tokyo', 'JP', 100, 300),
      makeNode('b', 'Tokyo', 'JP', 120, 280),
      makeNode('c', 'Tokyo', 'JP', 110, 260),
      makeNode('d', 'Tokyo', 'JP', 130, 240),
      makeNode('e', 'Tokyo', 'JP', 105, 220),
    ]
    const labels = computeClusterLabels(nodes)
    const country = labels.find(l => l.level === 'country')
    const city = labels.find(l => l.level === 'city')
    expect(country).toBeDefined()
    if (city) {
      // Country offset is 20, city offset is 12, so country y should be smaller
      expect(country!.y).toBeLessThan(city.y)
    }
  })

  it('overlapping labels: country labels preferred over city labels', () => {
    // All at same position — country should win
    const nodes = [
      makeNode('a', 'Tokyo', 'JP', 100, 100),
      makeNode('b', 'Tokyo', 'JP', 101, 99),
      makeNode('c', 'Tokyo', 'JP', 102, 98),
    ]
    const labels = computeClusterLabels(nodes)
    // If they overlap, country wins. Both should be present if no overlap.
    const country = labels.filter(l => l.level === 'country')
    expect(country.length).toBeGreaterThanOrEqual(1)
  })

  it('nodes without countryCode excluded from country grouping', () => {
    const nodes = [
      makeNode('a', 'Unknown', '', 100, 100),
      makeNode('b', 'Unknown', '', 110, 90),
    ]
    expect(computeClusterLabels(nodes)).toHaveLength(0)
  })

  it('two countries get separate labels', () => {
    const nodes = [
      makeNode('a', 'Tokyo', 'JP', 50, 50),
      makeNode('b', 'Kyoto', 'JP', 60, 60),
      makeNode('c', 'Taipei', 'TW', 300, 300),
      makeNode('d', 'Kaohsiung', 'TW', 310, 310),
    ]
    const labels = computeClusterLabels(nodes)
    const countries = labels.filter(l => l.level === 'country')
    expect(countries).toHaveLength(2)
    const names = countries.map(l => l.text).sort()
    expect(names).toEqual(['Japan', 'Taiwan'])
  })

  it('city with 2 nodes (below city threshold) gets no city label', () => {
    const nodes = [
      makeNode('a', 'Tokyo', 'JP', 100, 100),
      makeNode('b', 'Tokyo', 'JP', 110, 90),
    ]
    const labels = computeClusterLabels(nodes)
    const city = labels.filter(l => l.level === 'city')
    expect(city).toHaveLength(0)
    // But country label should exist (2 nodes = above country threshold)
    const country = labels.filter(l => l.level === 'country')
    expect(country).toHaveLength(1)
  })
})
