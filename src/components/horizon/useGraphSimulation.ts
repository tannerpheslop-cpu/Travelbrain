import { useRef, useState, useEffect, useCallback } from 'react'
import {
  forceSimulation,
  forceCenter,
  forceManyBody,
  forceLink,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import { GRAPH } from './graphConstants'
import type { GraphNode, GraphEdge } from './useGraphData'

/**
 * D3 force simulation hook for the Travel Graph.
 * See /docs/TRAVEL-GRAPH.md Section 3 (Physics).
 *
 * Takes nodes/edges, runs physics, returns updated positions.
 * Batches tick updates via requestAnimationFrame for performance.
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface SimNode extends SimulationNodeDatum {
  id: string
  title: string
  city: string | null
  countryCode: string | null
  categories: string[]
  isClaimedByTrip: boolean
}

interface SimEdge extends SimulationLinkDatum<SimNode> {
  weight: number
  type: 'city' | 'country' | 'category'
}

interface UseGraphSimulationProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
  enabled: boolean
}

export interface UseGraphSimulationResult {
  simulatedNodes: GraphNode[]
  simulatedEdges: GraphEdge[]
  isSettled: boolean
  addNode: (node: GraphNode) => void
  /** Update the Y-axis bounding constraint. Nodes will drift to fill the new area. */
  updateBounds: (newHeight: number) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Seed nodes with initial positions based on geography */
function seedPositions(
  nodes: SimNode[],
  width: number,
  height: number,
  prevPositions: Map<string, { x: number; y: number }>,
): void {
  const cx = width / 2
  const cy = height / 2

  // Group by city for initial clustering
  const cityPositions = new Map<string, { x: number; y: number }>()

  for (const node of nodes) {
    // Restore previous positions if available
    const prev = prevPositions.get(node.id)
    if (prev) {
      node.x = prev.x
      node.y = prev.y
      continue
    }

    // Seed near city cluster if same city
    if (node.city) {
      const existing = cityPositions.get(node.city)
      if (existing) {
        node.x = existing.x + (Math.random() - 0.5) * 30
        node.y = existing.y + (Math.random() - 0.5) * 30
      } else {
        // New city cluster — spread around center
        const angle = Math.random() * Math.PI * 2
        const radius = 40 + Math.random() * (Math.min(width, height) * 0.25)
        node.x = cx + Math.cos(angle) * radius
        node.y = cy + Math.sin(angle) * radius
        cityPositions.set(node.city, { x: node.x, y: node.y })
      }
    } else {
      // No location — periphery
      const angle = Math.random() * Math.PI * 2
      const radius = Math.min(width, height) * 0.3 + Math.random() * 40
      node.x = cx + Math.cos(angle) * radius
      node.y = cy + Math.sin(angle) * radius
    }
  }
}

/** Clamp nodes within container bounds */
function clampBounds(nodes: SimNode[], width: number, height: number): void {
  const pad = GRAPH.BOUNDS_PAD
  for (const n of nodes) {
    if (n.x != null) n.x = Math.max(pad, Math.min(width - pad, n.x))
    if (n.y != null) n.y = Math.max(pad, Math.min(height - pad, n.y))
  }
}

// ── Session storage persistence ──────────────────────────────────────────────

const STORAGE_KEY = 'youji-graph-positions'

function loadPersistedPositions(): Map<string, { x: number; y: number }> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>
    return new Map(Object.entries(parsed))
  } catch {
    return new Map()
  }
}

function savePersistedPositions(positions: Map<string, { x: number; y: number }>): void {
  try {
    const obj: Record<string, { x: number; y: number }> = {}
    for (const [id, pos] of positions) obj[id] = pos
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // sessionStorage might be full or unavailable — ignore
  }
}

// Exported for testing
export { loadPersistedPositions, savePersistedPositions, STORAGE_KEY }

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGraphSimulation({
  nodes,
  edges,
  width,
  height,
  enabled,
}: UseGraphSimulationProps): UseGraphSimulationResult {
  const [simulatedNodes, setSimulatedNodes] = useState<GraphNode[]>(nodes)
  const [simulatedEdges, setSimulatedEdges] = useState<GraphEdge[]>(edges)
  const [isSettled, setIsSettled] = useState(false)

  const simRef = useRef<Simulation<SimNode, SimEdge> | null>(null)
  const frameRef = useRef<number>(0)
  const simNodesRef = useRef<SimNode[]>([])
  const simEdgesRef = useRef<SimEdge[]>([])
  const prevPositionsRef = useRef<Map<string, { x: number; y: number }>>(loadPersistedPositions())
  const boundsWidthRef = useRef(width)
  const boundsHeightRef = useRef(height)

  // ── Create / update simulation ──
  useEffect(() => {
    if (!enabled || width === 0 || height === 0 || nodes.length === 0) {
      setSimulatedNodes(nodes)
      setSimulatedEdges(edges)
      setIsSettled(true)
      return
    }

    // Stop previous simulation
    simRef.current?.stop()
    cancelAnimationFrame(frameRef.current)

    // Build simulation nodes
    const simNodes: SimNode[] = nodes.map(n => ({
      id: n.id,
      title: n.title,
      city: n.city,
      countryCode: n.countryCode,
      categories: n.categories,
      isClaimedByTrip: n.isClaimedByTrip,
      x: n.x,
      y: n.y,
    }))

    // Seed positions (restore previous or compute initial)
    seedPositions(simNodes, width, height, prevPositionsRef.current)

    // Check how many nodes have restored positions vs new
    const restoredCount = simNodes.filter(n => prevPositionsRef.current.has(n.id)).length
    const newRatio = (simNodes.length - restoredCount) / simNodes.length
    const skipAnimation = restoredCount > 0 && newRatio < 0.5

    // Build simulation edges (d3 wants source/target as node references or IDs)
    const simEdges: SimEdge[] = edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      type: e.type,
    }))

    simNodesRef.current = simNodes
    simEdgesRef.current = simEdges

    // Density-dependent charge
    const chargeStrength = simNodes.length < GRAPH.SPARSE_THRESHOLD
      ? GRAPH.CHARGE_SPARSE
      : GRAPH.CHARGE_DEFAULT

    // Create simulation
    const sim = forceSimulation<SimNode>(simNodes)
      .velocityDecay(GRAPH.VELOCITY_DECAY)
      .alphaDecay(GRAPH.ALPHA_DECAY)
      .force('charge', forceManyBody<SimNode>()
        .strength(chargeStrength)
        .distanceMax(GRAPH.CHARGE_MAX_DIST)
      )
      .force('center', forceCenter<SimNode>(width / 2, height / 2)
        .strength(GRAPH.CENTER_STRENGTH)
      )
      .force('link', forceLink<SimNode, SimEdge>(simEdges)
        .id(d => d.id)
        .distance(d => GRAPH.LINK_DIST[d.type])
        .strength(d => d.weight * GRAPH.LINK_STRENGTH_MULT)
      )
      .force('collide', forceCollide<SimNode>(GRAPH.COLLISION_RADIUS)
        .strength(GRAPH.COLLISION_STRENGTH)
      )

    // If all (or most) positions restored, start nearly settled
    if (skipAnimation) {
      sim.alpha(0.05) // Very low — just nudge, don't reshake
    }
    setIsSettled(skipAnimation)

    boundsWidthRef.current = width
    boundsHeightRef.current = height

    // Batched tick handler
    sim.on('tick', () => {
      clampBounds(simNodesRef.current, boundsWidthRef.current, boundsHeightRef.current)

      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        const updated: GraphNode[] = simNodesRef.current.map(n => ({
          id: n.id,
          title: n.title,
          city: n.city,
          countryCode: n.countryCode,
          categories: n.categories,
          isClaimedByTrip: n.isClaimedByTrip,
          x: n.x ?? 0,
          y: n.y ?? 0,
        }))
        setSimulatedNodes(updated)

        // Check if settled
        if (sim.alpha() < 0.01) {
          setIsSettled(true)
          // Persist positions to ref + sessionStorage
          for (const n of simNodesRef.current) {
            if (n.x != null && n.y != null) {
              prevPositionsRef.current.set(n.id, { x: n.x, y: n.y })
            }
          }
          savePersistedPositions(prevPositionsRef.current)
        }
      })
    })

    sim.on('end', () => {
      setIsSettled(true)
      // Persist final positions to ref + sessionStorage
      for (const n of simNodesRef.current) {
        if (n.x != null && n.y != null) {
          prevPositionsRef.current.set(n.id, { x: n.x, y: n.y })
        }
      }
      savePersistedPositions(prevPositionsRef.current)
    })

    simRef.current = sim

    return () => {
      sim.stop()
      cancelAnimationFrame(frameRef.current)
      // Save positions on unmount
      savePersistedPositions(prevPositionsRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length, width, height, enabled])

  // ── Add node (warm restart) ──
  const addNode = useCallback((node: GraphNode) => {
    const sim = simRef.current
    if (!sim) return

    const simNode: SimNode = {
      id: node.id,
      title: node.title,
      city: node.city,
      countryCode: node.countryCode,
      categories: node.categories,
      isClaimedByTrip: node.isClaimedByTrip,
      x: width / 2 + (Math.random() - 0.5) * 20,
      y: height / 2 + (Math.random() - 0.5) * 20,
    }

    simNodesRef.current.push(simNode)
    sim.nodes(simNodesRef.current)
    sim.alpha(GRAPH.WARM_ALPHA).restart()
    setIsSettled(false)
  }, [width, height])

  // ── Update bounds (responsive density) ──
  const updateBounds = useCallback((newHeight: number) => {
    const sim = simRef.current
    if (!sim) return
    boundsHeightRef.current = newHeight
    // Update center force to the new center
    sim.force('center', forceCenter<SimNode>(boundsWidthRef.current / 2, newHeight / 2)
      .strength(GRAPH.CENTER_STRENGTH))
    // Gentle reheat so nodes drift to new positions over ~500-800ms
    sim.alpha(0.3).restart()
    setIsSettled(false)
  }, [])

  return { simulatedNodes, simulatedEdges, isSettled, addNode, updateBounds }
}
