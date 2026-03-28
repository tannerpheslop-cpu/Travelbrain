import { describe, it, expect } from 'vitest'
import { computeEdges, extractCity, type GraphNode } from '../../components/horizon/useGraphData'

function makeNode(id: string, city: string | null, cc: string | null, cats: string[] = ['activity']): GraphNode {
  return { id, title: `Item ${id}`, city: city?.toLowerCase() ?? null, countryCode: cc, categories: cats, isClaimedByTrip: false, x: 0, y: 0 }
}

describe('extractCity', () => {
  it('extracts first segment before comma', () => {
    expect(extractCity('Tokyo, Japan')).toBe('tokyo')
  })
  it('returns null for null input', () => {
    expect(extractCity(null)).toBeNull()
  })
  it('returns full string if no comma', () => {
    expect(extractCity('Tokyo')).toBe('tokyo')
  })
  it('is case-insensitive', () => {
    expect(extractCity('TOKYO, Japan')).toBe('tokyo')
  })
})

describe('computeEdges', () => {
  it('creates city edge between same-city items', () => {
    const nodes = [makeNode('a', 'tokyo', 'JP'), makeNode('b', 'tokyo', 'JP')]
    const edges = computeEdges(nodes)
    expect(edges).toHaveLength(1)
    expect(edges[0].type).toBe('city')
    expect(edges[0].weight).toBe(1.0)
  })

  it('creates country edge between same-country different-city items', () => {
    const nodes = [makeNode('a', 'tokyo', 'JP'), makeNode('b', 'kyoto', 'JP')]
    const edges = computeEdges(nodes)
    expect(edges).toHaveLength(1)
    expect(edges[0].type).toBe('country')
    expect(edges[0].weight).toBe(0.5)
  })

  it('creates category edge between items sharing category', () => {
    const nodes = [
      makeNode('a', 'tokyo', 'JP', ['restaurant']),
      makeNode('b', 'paris', 'FR', ['restaurant']),
    ]
    const edges = computeEdges(nodes)
    expect(edges).toHaveLength(1)
    expect(edges[0].type).toBe('category')
    expect(edges[0].weight).toBe(0.3)
  })

  it('city edge takes priority — no duplicate country or category edge', () => {
    // Same city, same country, same category — should produce ONE city edge, not three
    const nodes = [
      makeNode('a', 'tokyo', 'JP', ['restaurant']),
      makeNode('b', 'tokyo', 'JP', ['restaurant']),
    ]
    const edges = computeEdges(nodes)
    expect(edges).toHaveLength(1)
    expect(edges[0].type).toBe('city')
  })

  it('country edge prevents category edge for same pair', () => {
    const nodes = [
      makeNode('a', 'tokyo', 'JP', ['restaurant']),
      makeNode('b', 'kyoto', 'JP', ['restaurant']),
    ]
    const edges = computeEdges(nodes)
    expect(edges).toHaveLength(1)
    expect(edges[0].type).toBe('country')
  })

  it('orphan nodes have zero edges', () => {
    const nodes = [
      makeNode('a', 'tokyo', 'JP', ['restaurant']),
      makeNode('b', null, null, ['activity']),
    ]
    const edges = computeEdges(nodes)
    expect(edges).toHaveLength(0)
  })

  it('handles multiple nodes with correct edge count', () => {
    // 3 Tokyo items + 1 Kyoto = 3 city edges (Tokyo pairs) + 3 country edges (Tokyo-Kyoto pairs)
    const nodes = [
      makeNode('t1', 'tokyo', 'JP'),
      makeNode('t2', 'tokyo', 'JP'),
      makeNode('t3', 'tokyo', 'JP'),
      makeNode('k1', 'kyoto', 'JP'),
    ]
    const edges = computeEdges(nodes)
    const cityEdges = edges.filter(e => e.type === 'city')
    const countryEdges = edges.filter(e => e.type === 'country')
    expect(cityEdges).toHaveLength(3) // t1-t2, t1-t3, t2-t3
    expect(countryEdges).toHaveLength(3) // t1-k1, t2-k1, t3-k1
  })
})
