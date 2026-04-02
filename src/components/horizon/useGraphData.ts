import { useMemo } from 'react'
import type { SavedItem } from '../../types'

/**
 * Graph data computation for the Travel Graph visualization.
 * See /docs/TRAVEL-GRAPH.md Section 2 (Data Model).
 *
 * Pure data transformation — no physics, no rendering.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  title: string
  city: string | null
  countryCode: string | null
  categories: string[]
  isClaimedByTrip: boolean
  x: number
  y: number
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
  type: 'city' | 'country' | 'category'
}

export interface GraphStats {
  saves: number
  countries: number
  cities: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: GraphStats
}

// ── City name extraction ─────────────────────────────────────────────────────

function extractCity(locationName: string | null): string | null {
  if (!locationName) return null
  return locationName.split(',')[0].trim().toLowerCase()
}

// ── Edge computation ─────────────────────────────────────────────────────────

/**
 * Compute edges between all pairs of nodes.
 * One edge per pair max, highest priority wins:
 *   City (1.0) > Country (0.5) > Category (0.3)
 */
function computeEdges(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = []
  const edgeSet = new Set<string>()

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      const key = `${a.id}|${b.id}`

      // Priority 1: same city
      if (a.city && b.city && a.city === b.city) {
        edgeSet.add(key)
        edges.push({ source: a.id, target: b.id, weight: 1.0, type: 'city' })
        continue
      }

      // Priority 2: same country (different city or no city)
      if (a.countryCode && b.countryCode && a.countryCode === b.countryCode) {
        edgeSet.add(key)
        edges.push({ source: a.id, target: b.id, weight: 0.5, type: 'country' })
        continue
      }

      // Priority 3: shared category
      const sharedCat = a.categories.some(c => b.categories.includes(c))
      if (sharedCat && !edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push({ source: a.id, target: b.id, weight: 0.3, type: 'category' })
      }
    }
  }

  return edges
}

// ── Main hook ────────────────────────────────────────────────────────────────

/**
 * Transforms saved items into graph data (nodes + edges + stats).
 * @param savedItems - all of the user's saves
 * @param claimedItemIds - Set of item IDs that are in a trip destination
 */
export function useGraphData(
  savedItems: SavedItem[],
  claimedItemIds?: Set<string>,
): GraphData {
  return useMemo(() => {
    // Deduplicate by place_id: multiple saves of the same place → one star node
    const placeIdMap = new Map<string, SavedItem>() // place_id → first item
    const deduped: SavedItem[] = []

    for (const item of savedItems) {
      if (item.location_place_id) {
        if (!placeIdMap.has(item.location_place_id)) {
          placeIdMap.set(item.location_place_id, item)
          deduped.push(item)
        }
        // Skip duplicate place_ids — first one represents all copies
      } else {
        deduped.push(item) // No place_id → always include
      }
    }

    const nodes: GraphNode[] = deduped.map(item => ({
      id: item.id,
      title: item.title,
      city: extractCity(item.location_name),
      countryCode: item.location_country_code?.toUpperCase() ?? null,
      categories: [item.category],
      isClaimedByTrip: claimedItemIds?.has(item.id) ?? false,
      x: 0,
      y: 0,
    }))

    const edges = computeEdges(nodes)

    // Stats
    const countryCodes = new Set<string>()
    const cities = new Set<string>()
    for (const n of nodes) {
      if (n.countryCode) countryCodes.add(n.countryCode)
      if (n.city) cities.add(n.city)
    }

    return {
      nodes,
      edges,
      stats: {
        saves: savedItems.length, // Total saves (not deduped)
        countries: countryCodes.size,
        cities: cities.size,
      },
    }
  }, [savedItems, claimedItemIds])
}

// Export for testing
export { computeEdges, extractCity }
