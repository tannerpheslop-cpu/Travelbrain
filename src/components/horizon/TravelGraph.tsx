import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import type { SavedItem } from '../../types'
import { useGraphData, type GraphNode, type GraphEdge } from './useGraphData'
import { useGraphSimulation } from './useGraphSimulation'
import { GRAPH } from './graphConstants'

/**
 * Travel Graph — force-directed star map visualization.
 * See /docs/TRAVEL-GRAPH.md for the full specification.
 */

interface TravelGraphProps {
  savedItems: SavedItem[]
  claimedItemIds?: Set<string>
  height?: number
  onNodeSelect?: (item: SavedItem | null) => void
  onClusterSelect?: (city: string | null) => void
}

// ── Node visual state ────────────────────────────────────────────────────────

type NodeState = 'dim' | 'default' | 'claimed' | 'bright'

const NODE_COLORS: Record<NodeState, { fill: string; glowOpacity: number }> = {
  dim:     { fill: '#b8c8e0', glowOpacity: 0.15 },
  default: { fill: '#d4e0f0', glowOpacity: 0.25 },
  claimed: { fill: '#c45a2d', glowOpacity: 0.25 },
  bright:  { fill: '#edf2fa', glowOpacity: 0.40 },
}

const EDGE_STYLES: Record<GraphEdge['type'], { width: number; opacity: number }> = {
  city:     { width: 0.8, opacity: 0.09 },
  country:  { width: 0.5, opacity: 0.06 },
  category: { width: 0.3, opacity: 0.03 },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getNodeRadius(connectionCount: number): number {
  if (connectionCount === 0) return GRAPH.NODE_RADIUS.orphan
  if (connectionCount <= 2) return GRAPH.NODE_RADIUS.low
  if (connectionCount <= 5) return GRAPH.NODE_RADIUS.mid
  if (connectionCount <= 10) return GRAPH.NODE_RADIUS.high
  return GRAPH.NODE_RADIUS.hub
}

function getNodeState(node: GraphNode, connectionCount: number): NodeState {
  if (node.isClaimedByTrip) return 'claimed'
  if (connectionCount === 0) return 'dim'
  return 'default'
}

function countConnections(nodeId: string, edges: GraphEdge[]): number {
  return edges.filter(e => e.source === nodeId || e.target === nodeId).length
}

// ── Cluster label computation ────────────────────────────────────────────────

interface ClusterLabel {
  city: string
  x: number
  y: number
  nodeCount: number
  width: number  // estimated bounding box width
  height: number
}

function computeClusterLabels(nodes: GraphNode[]): ClusterLabel[] {
  // Group by city
  const cityGroups = new Map<string, GraphNode[]>()
  for (const n of nodes) {
    if (!n.city) continue
    const key = n.city.toLowerCase()
    const group = cityGroups.get(key) ?? []
    group.push(n)
    cityGroups.set(key, group)
  }

  const labels: ClusterLabel[] = []
  for (const [, group] of cityGroups) {
    if (group.length < GRAPH.CLUSTER_LABEL_MIN) continue
    // Centroid x, highest node y (minimum y) - offset
    const cx = group.reduce((s, n) => s + n.x, 0) / group.length
    const minY = Math.min(...group.map(n => n.y))
    const displayName = group[0].city ?? ''
    labels.push({
      city: displayName,
      x: cx,
      y: minY - 15,
      nodeCount: group.length,
      width: displayName.length * 6.5 + 8, // estimate
      height: 14,
    })
  }

  // Collision avoidance: hide smaller cluster if overlapping
  const visible = new Set(labels.map((_, i) => i))
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (!visible.has(i) || !visible.has(j)) continue
      const a = labels[i], b = labels[j]
      // Check bounding box overlap
      const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2
      const overlapY = Math.abs(a.y - b.y) < (a.height + b.height) / 2
      if (overlapX && overlapY) {
        // Hide the smaller cluster
        if (a.nodeCount < b.nodeCount) visible.delete(i)
        else visible.delete(j)
      }
    }
  }

  return labels.filter((_, i) => visible.has(i))
}

// ── Preview card ─────────────────────────────────────────────────────────────

function NodePreviewCard({ item }: { item: SavedItem }) {
  return (
    <div
      data-testid="node-preview"
      style={{
        position: 'absolute',
        bottom: 8,
        left: 16,
        right: 16,
        background: 'var(--color-surface, #141828)',
        borderRadius: 10,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        zIndex: 5,
      }}
    >
      {item.image_url && (
        <img
          src={item.image_url}
          alt=""
          style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
          color: 'var(--color-text-primary, #e4e8f0)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {item.title}
        </div>
        <div style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 11,
          color: 'var(--color-text-secondary, #8088a0)',
          marginTop: 1,
        }}>
          {item.location_name?.split(',')[0] ?? ''}{item.category ? ` · ${item.category}` : ''}
        </div>
      </div>
    </div>
  )
}

// ── Stagger helpers (exported for testing) ──────────────────────────────────

/** Sort nodes by distance from center (closest first). Returns sorted IDs. */
export function sortNodesByDistanceFromCenter(
  nodes: GraphNode[],
  centerX: number,
  centerY: number,
): string[] {
  return [...nodes]
    .sort((a, b) => {
      const da = Math.hypot(a.x - centerX, a.y - centerY)
      const db = Math.hypot(b.x - centerX, b.y - centerY)
      return da - db
    })
    .map(n => n.id)
}

/** Compute stagger delay for a given sort index. */
export function computeStaggerDelay(sortIndex: number, totalNodes: number): number {
  if (totalNodes <= 1) return 0
  return Math.min((sortIndex / totalNodes) * GRAPH.FADE_STAGGER_CAP, GRAPH.FADE_STAGGER_CAP)
}

/** Compute a node's fade-in opacity based on elapsed time since mount. */
export function computeFadeOpacity(elapsed: number, staggerDelay: number, fadeDuration: number): number {
  if (elapsed < staggerDelay) return 0
  return Math.min(1, (elapsed - staggerDelay) / fadeDuration)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TravelGraph({
  savedItems,
  claimedItemIds,
  height: heightProp,
  onNodeSelect,
  onClusterSelect,
}: TravelGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)

  // ── Stagger fade-in state ──
  const mountTimeRef = useRef(Date.now())
  const [fadeProgress, setFadeProgress] = useState(0) // 0 = start, 1 = all visible
  const prevItemIdsRef = useRef<Set<string>>(new Set())
  const newNodeIdRef = useRef<string | null>(null)
  const newNodeTimeRef = useRef(0)
  const rafRef = useRef<number>(0)

  // Stable refs for callbacks
  const onNodeSelectRef = useRef(onNodeSelect)
  onNodeSelectRef.current = onNodeSelect
  const onClusterSelectRef = useRef(onClusterSelect)
  onClusterSelectRef.current = onClusterSelect

  // Measure container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect
      const maxH = heightProp ?? Math.min(380, window.innerHeight * 0.45)
      setDimensions({ width, height: maxH })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [heightProp])

  // Data
  const { nodes, edges, stats } = useGraphData(savedItems, claimedItemIds)

  // Simulation
  const { simulatedNodes, simulatedEdges, addNode } = useGraphSimulation({
    nodes,
    edges,
    width: dimensions.width,
    height: dimensions.height,
    enabled: dimensions.width > 0 && dimensions.height > 0,
  })

  // ── Detect new saves ──
  useEffect(() => {
    const currentIds = new Set(savedItems.map(i => i.id))
    const prevIds = prevItemIdsRef.current

    if (prevIds.size > 0 && currentIds.size === prevIds.size + 1) {
      // Exactly one new item
      for (const id of currentIds) {
        if (!prevIds.has(id)) {
          newNodeIdRef.current = id
          newNodeTimeRef.current = Date.now()
          // Find the new node and add it to simulation
          const newNode = nodes.find(n => n.id === id)
          if (newNode && addNode) addNode(newNode)
          break
        }
      }
    }

    prevItemIdsRef.current = currentIds
  }, [savedItems, nodes, addNode])

  // ── Animation loop for stagger + new node fade ──
  useEffect(() => {
    if (simulatedNodes.length === 0) return

    const totalDuration = GRAPH.FADE_STAGGER_CAP + GRAPH.FADE_DURATION
    const tick = () => {
      const elapsed = Date.now() - mountTimeRef.current
      const newNodeElapsed = newNodeIdRef.current ? Date.now() - newNodeTimeRef.current : Infinity

      // Continue animating if stagger or new-node fade is in progress
      const staggerDone = elapsed > totalDuration
      const newNodeDone = !newNodeIdRef.current || newNodeElapsed > GRAPH.NEW_FADE

      if (staggerDone && newNodeDone) {
        setFadeProgress(1)
        if (newNodeIdRef.current && newNodeDone) newNodeIdRef.current = null
        return
      }

      setFadeProgress(elapsed / totalDuration) // triggers re-render
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [simulatedNodes.length])

  // ── Stagger order (sorted by distance from center) ──
  const staggerOrder = useMemo(() => {
    if (dimensions.width === 0) return new Map<string, number>()
    const sorted = sortNodesByDistanceFromCenter(
      simulatedNodes,
      dimensions.width / 2,
      dimensions.height / 2,
    )
    return new Map(sorted.map((id, i) => [id, i]))
  }, [simulatedNodes, dimensions.width, dimensions.height])

  // Connection counts
  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of simulatedNodes) {
      counts.set(n.id, countConnections(n.id, simulatedEdges))
    }
    return counts
  }, [simulatedNodes, simulatedEdges])

  // Connected node IDs for selected node
  const connectedToSelected = useMemo(() => {
    if (!selectedNodeId) return null
    const connected = new Set<string>([selectedNodeId])
    for (const e of simulatedEdges) {
      const src = typeof e.source === 'string' ? e.source : (e.source as any).id
      const tgt = typeof e.target === 'string' ? e.target : (e.target as any).id
      if (src === selectedNodeId) connected.add(tgt)
      if (tgt === selectedNodeId) connected.add(src)
    }
    return connected
  }, [selectedNodeId, simulatedEdges])

  // Cluster labels
  const clusterLabels = useMemo(
    () => computeClusterLabels(simulatedNodes),
    [simulatedNodes],
  )

  // Cluster centroids (for tap detection)
  const clusterCentroids = useMemo(() => {
    const cityGroups = new Map<string, GraphNode[]>()
    for (const n of simulatedNodes) {
      if (!n.city) continue
      const key = n.city.toLowerCase()
      const group = cityGroups.get(key) ?? []
      group.push(n)
      cityGroups.set(key, group)
    }
    const centroids: Array<{ city: string; x: number; y: number }> = []
    for (const [, group] of cityGroups) {
      if (group.length < 2) continue
      centroids.push({
        city: group[0].city ?? '',
        x: group.reduce((s, n) => s + n.x, 0) / group.length,
        y: group.reduce((s, n) => s + n.y, 0) / group.length,
      })
    }
    return centroids
  }, [simulatedNodes])

  // Resolve edge endpoints
  const resolvedEdges = useMemo(() => {
    const nodeMap = new Map(simulatedNodes.map(n => [n.id, n]))
    return simulatedEdges.map(e => {
      const sourceId = typeof e.source === 'string' ? e.source : (e.source as any).id
      const targetId = typeof e.target === 'string' ? e.target : (e.target as any).id
      const s = nodeMap.get(sourceId)
      const t = nodeMap.get(targetId)
      return s && t ? { ...e, x1: s.x, y1: s.y, x2: t.x, y2: t.y, sourceId, targetId } : null
    }).filter(Boolean) as Array<GraphEdge & { x1: number; y1: number; x2: number; y2: number; sourceId: string; targetId: string }>
  }, [simulatedNodes, simulatedEdges])

  // Item lookup for preview
  const itemMap = useMemo(() => new Map(savedItems.map(i => [i.id, i])), [savedItems])

  // ── Node opacity based on selection + stagger fade ──
  const getNodeOpacity = useCallback((nodeId: string): number => {
    // Stagger fade-in
    let fadeAlpha = 1
    if (fadeProgress < 1) {
      // Check if this is the new node (special handling)
      if (nodeId === newNodeIdRef.current) {
        const newElapsed = Date.now() - newNodeTimeRef.current
        fadeAlpha = Math.min(1, newElapsed / GRAPH.NEW_FADE)
      } else {
        const elapsed = Date.now() - mountTimeRef.current
        const sortIdx = staggerOrder.get(nodeId) ?? 0
        const delay = computeStaggerDelay(sortIdx, simulatedNodes.length)
        fadeAlpha = computeFadeOpacity(elapsed, delay, GRAPH.FADE_DURATION)
      }
    }

    // Selection dimming
    let selectionAlpha = 1
    if (selectedNodeId) {
      selectionAlpha = connectedToSelected?.has(nodeId) ? 1 : 0.3
    } else if (selectedCluster) {
      const node = simulatedNodes.find(n => n.id === nodeId)
      selectionAlpha = node?.city?.toLowerCase() === selectedCluster.toLowerCase() ? 1 : 0.3
    }

    return fadeAlpha * selectionAlpha
  }, [selectedNodeId, selectedCluster, connectedToSelected, simulatedNodes, fadeProgress, staggerOrder])

  // ── Edge opacity based on selection ──
  const getEdgeOpacity = useCallback((e: { sourceId: string; targetId: string; type: GraphEdge['type'] }): number => {
    const base = EDGE_STYLES[e.type].opacity
    if (selectedNodeId) {
      if (e.sourceId === selectedNodeId || e.targetId === selectedNodeId) return base * 2
      return base * 0.3
    }
    if (selectedCluster) return base * 0.5
    return base
  }, [selectedNodeId, selectedCluster])

  // ── Tap handlers ──
  const handleNodeTap = useCallback((nodeId: string) => {
    if (selectedNodeId === nodeId) {
      // Deselect
      setSelectedNodeId(null)
      setSelectedCluster(null)
      onNodeSelectRef.current?.(null)
      return
    }
    setSelectedNodeId(nodeId)
    setSelectedCluster(null)
    onNodeSelectRef.current?.(itemMap.get(nodeId) ?? null)
  }, [selectedNodeId, itemMap])

  const handleSvgTap = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Check if the tap was on a touch target (handled by handleNodeTap)
    if ((e.target as SVGElement).closest('[data-touch-target]')) return

    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Check cluster centroids
    for (const c of clusterCentroids) {
      const dx = c.x - x, dy = c.y - y
      if (Math.sqrt(dx * dx + dy * dy) < 30) {
        setSelectedCluster(c.city)
        setSelectedNodeId(null)
        onClusterSelectRef.current?.(c.city)
        onNodeSelectRef.current?.(null)
        return
      }
    }

    // Deselect
    setSelectedNodeId(null)
    setSelectedCluster(null)
    onNodeSelectRef.current?.(null)
    onClusterSelectRef.current?.(null)
  }, [clusterCentroids])

  // ── Selected item for preview ──
  const selectedItem = selectedNodeId ? itemMap.get(selectedNodeId) ?? null : null

  if (dimensions.width === 0) {
    return <div ref={containerRef} data-testid="travel-graph" style={{ width: '100%', height: heightProp ?? 380 }} />
  }

  return (
    <div data-testid="travel-graph" style={{ width: '100%' }}>
      {/* Graph container */}
      <div ref={containerRef} style={{ width: '100%', height: dimensions.height, position: 'relative' }}>
        <svg
          data-testid="travel-graph-svg"
          width={dimensions.width}
          height={dimensions.height}
          style={{ display: 'block' }}
          onClick={handleSvgTap}
        >
          {/* Defs */}
          <defs>
            <filter id="node-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Layer 1: Edges */}
          <g data-testid="edges-layer">
            {resolvedEdges.map((e, i) => {
              const style = EDGE_STYLES[e.type]
              return (
                <line
                  key={`edge-${i}`}
                  x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke="#d4e0f0"
                  strokeWidth={style.width}
                  opacity={getEdgeOpacity(e)}
                  style={{ transition: 'opacity 300ms ease' }}
                />
              )
            })}
          </g>

          {/* Layer 2: Node glows */}
          <g data-testid="glows-layer">
            {simulatedNodes.map(node => {
              const cc = connectionCounts.get(node.id) ?? 0
              const state = selectedNodeId === node.id ? 'bright' : getNodeState(node, cc)
              const radius = getNodeRadius(cc)
              const { fill, glowOpacity } = NODE_COLORS[state]
              const opacity = getNodeOpacity(node.id)
              return (
                <circle
                  key={`glow-${node.id}`}
                  cx={node.x} cy={node.y}
                  r={radius * 4}
                  fill={fill}
                  opacity={glowOpacity * opacity}
                  filter="url(#node-glow)"
                  style={{ transition: 'opacity 300ms ease' }}
                />
              )
            })}
          </g>

          {/* Layer 3: Solid nodes */}
          <g data-testid="nodes-layer">
            {simulatedNodes.map(node => {
              const cc = connectionCounts.get(node.id) ?? 0
              const state = selectedNodeId === node.id ? 'bright' : getNodeState(node, cc)
              const radius = getNodeRadius(cc)
              const { fill } = NODE_COLORS[state]
              const opacity = getNodeOpacity(node.id)
              return (
                <circle
                  key={`node-${node.id}`}
                  data-testid={`graph-node-${node.id}`}
                  data-state={state}
                  cx={node.x} cy={node.y}
                  r={radius}
                  fill={fill}
                  opacity={opacity}
                  style={{ transition: 'opacity 300ms ease' }}
                />
              )
            })}
          </g>

          {/* Layer 4: Touch targets (invisible, 44px) */}
          <g data-testid="touch-layer">
            {simulatedNodes.map(node => (
              <circle
                key={`touch-${node.id}`}
                data-touch-target
                cx={node.x} cy={node.y}
                r={22}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); handleNodeTap(node.id) }}
              />
            ))}
          </g>

          {/* Layer 5: Cluster labels */}
          <g data-testid="cluster-labels">
            {clusterLabels.map(label => (
              <text
                key={`label-${label.city}`}
                data-testid={`cluster-label-${label.city.toLowerCase()}`}
                x={label.x}
                y={label.y}
                textAnchor="middle"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '11px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fill: '#edf2fa',
                  fillOpacity: 0.6,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                {label.city}
              </text>
            ))}
          </g>
        </svg>

        {/* Preview card */}
        {selectedItem && <NodePreviewCard item={selectedItem} />}
      </div>

      {/* Stats line */}
      <div
        data-testid="graph-stats"
        style={{
          textAlign: 'center',
          padding: '10px 16px 4px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: '0.3px',
        }}
      >
        {selectedCluster ? (
          <span style={{ color: '#c45a2d' }}>
            {selectedCluster} · {simulatedNodes.filter(n => n.city?.toLowerCase() === selectedCluster.toLowerCase()).length} saves
          </span>
        ) : (
          <span style={{ color: 'var(--color-star-default, #d4e0f0)' }}>
            {stats.saves} saves · {stats.countries} countries · {stats.cities} cities
          </span>
        )}
      </div>
    </div>
  )
}

// Export for testing
export { getNodeRadius, getNodeState, NODE_COLORS, EDGE_STYLES, computeClusterLabels }
export type { ClusterLabel }
