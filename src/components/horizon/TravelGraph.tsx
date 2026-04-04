import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import type { SavedItem } from '../../types'
import { useGraphData, type GraphNode, type GraphEdge } from './useGraphData'
import { useGraphSimulation } from './useGraphSimulation'
import { GRAPH } from './graphConstants'
import { getCategoryLabel, LEGACY_CATEGORY_MAP } from '../../lib/categories'

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
  dim:     { fill: 'var(--star-dim)',     glowOpacity: 0.15 },
  default: { fill: 'var(--star-default)', glowOpacity: 0.25 },
  claimed: { fill: 'var(--accent-primary)', glowOpacity: 0.25 },
  bright:  { fill: 'var(--star-bright)',  glowOpacity: 0.40 },
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

// ── Star glow helpers ────────────────────────────────────────────────────────

/** Generate a 4-point star SVG path centered at (cx, cy). */
function starPath(cx: number, cy: number, outerR: number, innerR: number): string {
  const points: [number, number][] = []
  for (let i = 0; i < 4; i++) {
    const outerAngle = (i * Math.PI / 2) - Math.PI / 2
    const innerAngle = outerAngle + Math.PI / 4
    points.push([cx + Math.cos(outerAngle) * outerR, cy + Math.sin(outerAngle) * outerR])
    points.push([cx + Math.cos(innerAngle) * innerR, cy + Math.sin(innerAngle) * innerR])
  }
  return 'M' + points.map(p => p.join(',')).join('L') + 'Z'
}

/** Deterministic hash → rotation angle (0-44 degrees) for visual variation. */
function starRotation(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 45
}

/** Star glow parameters per node state. */
const STAR_PARAMS: Record<NodeState, { outerMult: number; innerMult: number; blur: number }> = {
  dim:     { outerMult: 3,   innerMult: 1,   blur: 1.5 },
  default: { outerMult: 4,   innerMult: 1.2, blur: 2 },
  claimed: { outerMult: 4,   innerMult: 1.2, blur: 2 },
  bright:  { outerMult: 5,   innerMult: 1.5, blur: 2.5 },
}

// ── Cluster label computation ────────────────────────────────────────────────

/** Country-to-name lookup for common travel countries */
const COUNTRY_NAMES: Record<string, string> = {
  JP: 'Japan', CN: 'China', TW: 'Taiwan', KR: 'South Korea', TH: 'Thailand',
  VN: 'Vietnam', IN: 'India', HK: 'Hong Kong', SG: 'Singapore', MY: 'Malaysia',
  ID: 'Indonesia', PH: 'Philippines', MN: 'Mongolia', MM: 'Myanmar', LA: 'Laos',
  KH: 'Cambodia', NP: 'Nepal', LK: 'Sri Lanka', US: 'United States', CA: 'Canada',
  MX: 'Mexico', GB: 'United Kingdom', FR: 'France', DE: 'Germany', IT: 'Italy',
  ES: 'Spain', PT: 'Portugal', NL: 'Netherlands', CH: 'Switzerland', AT: 'Austria',
  GR: 'Greece', TR: 'Turkey', AU: 'Australia', NZ: 'New Zealand', BR: 'Brazil',
  AR: 'Argentina', CL: 'Chile', PE: 'Peru', CO: 'Colombia', CR: 'Costa Rica',
  ZA: 'South Africa', MA: 'Morocco', EG: 'Egypt', KE: 'Kenya', TZ: 'Tanzania',
  AE: 'UAE', JO: 'Jordan', OM: 'Oman', IS: 'Iceland', NO: 'Norway', SE: 'Sweden',
  DK: 'Denmark', FI: 'Finland', IE: 'Ireland', CZ: 'Czech Republic', PL: 'Poland',
  HR: 'Croatia', HU: 'Hungary', RO: 'Romania', BG: 'Bulgaria', UZ: 'Uzbekistan',
  KG: 'Kyrgyzstan', GE: 'Georgia',
}

interface ClusterLabel {
  text: string
  level: 'country' | 'city'
  x: number
  y: number
  nodeCount: number
  width: number
  height: number
}

const COUNTRY_LABEL_MIN = 2
const CITY_LABEL_MIN = 3

function computeClusterLabels(nodes: GraphNode[]): ClusterLabel[] {
  // Group by country
  const countryGroups = new Map<string, GraphNode[]>()
  for (const n of nodes) {
    if (!n.countryCode) continue
    const group = countryGroups.get(n.countryCode) ?? []
    group.push(n)
    countryGroups.set(n.countryCode, group)
  }

  const labels: ClusterLabel[] = []

  for (const [code, countryNodes] of countryGroups) {
    if (countryNodes.length < COUNTRY_LABEL_MIN) continue

    // Country label
    const cx = countryNodes.reduce((s, n) => s + n.x, 0) / countryNodes.length
    const minY = Math.min(...countryNodes.map(n => n.y))
    const countryName = COUNTRY_NAMES[code] ?? code
    labels.push({
      text: countryName,
      level: 'country',
      x: cx,
      y: minY - 20,
      nodeCount: countryNodes.length,
      width: countryName.length * 7 + 8,
      height: 14,
    })

    // City sub-labels within this country
    const cityGroups = new Map<string, GraphNode[]>()
    for (const n of countryNodes) {
      if (!n.city) continue
      const key = n.city.toLowerCase()
      const group = cityGroups.get(key) ?? []
      group.push(n)
      cityGroups.set(key, group)
    }

    for (const [, cityNodes] of cityGroups) {
      if (cityNodes.length < CITY_LABEL_MIN) continue
      const cityCx = cityNodes.reduce((s, n) => s + n.x, 0) / cityNodes.length
      const cityMinY = Math.min(...cityNodes.map(n => n.y))
      const cityName = cityNodes[0].city ?? ''
      labels.push({
        text: cityName,
        level: 'city',
        x: cityCx,
        y: cityMinY - 12,
        nodeCount: cityNodes.length,
        width: cityName.length * 6 + 6,
        height: 12,
      })
    }
  }

  // Collision avoidance: country labels have priority over city labels
  const visible = new Set(labels.map((_, i) => i))
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (!visible.has(i) || !visible.has(j)) continue
      const a = labels[i], b = labels[j]
      const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2
      const overlapY = Math.abs(a.y - b.y) < (a.height + b.height) / 2
      if (overlapX && overlapY) {
        // Country labels always win over city labels
        if (a.level === 'country' && b.level === 'city') { visible.delete(j); continue }
        if (b.level === 'country' && a.level === 'city') { visible.delete(i); continue }
        // Same level: hide the smaller cluster
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
        background: 'var(--bg-base, #15181c)',
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
          color: 'var(--text-primary, #e8eaed)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {item.title}
        </div>
        <div style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 11,
          color: 'var(--color-text-secondary, #a8c4dc)',
          marginTop: 1,
        }}>
          {item.location_name?.split(',')[0] ?? ''}{item.category ? ` · ${getCategoryLabel(LEGACY_CATEGORY_MAP[item.category] ?? item.category)}` : ''}
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
  // Skip entrance animation on return visits within the same session
  const ENTRANCE_FLAG = 'youji-horizon-entrance-played'
  const entranceAlreadyPlayed = useRef(() => {
    try { return sessionStorage.getItem(ENTRANCE_FLAG) === 'true' } catch { return false }
  })
  const skipEntrance = entranceAlreadyPlayed.current()
  const mountTimeRef = useRef(Date.now())
  const [fadeProgress, setFadeProgress] = useState(skipEntrance ? 1 : 0)
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
  const { nodes, edges } = useGraphData(savedItems, claimedItemIds)

  // Simulation
  const { simulatedNodes, simulatedEdges, addNode } = useGraphSimulation({
    nodes,
    edges,
    width: dimensions.width,
    height: dimensions.height,
    enabled: dimensions.width > 0 && dimensions.height > 0,
  })

  // ── Detect new saves (single or batch) ──
  const newNodeIdsRef = useRef<Map<string, number>>(new Map()) // id → stagger time
  useEffect(() => {
    const currentIds = new Set(savedItems.map(i => i.id))
    const prevIds = prevItemIdsRef.current

    if (prevIds.size > 0 && currentIds.size > prevIds.size) {
      const newIds: string[] = []
      for (const id of currentIds) {
        if (!prevIds.has(id)) newIds.push(id)
      }

      if (newIds.length > 0) {
        const baseTime = Date.now()
        const BATCH_STAGGER_MS = 120 // 120ms between each new star

        for (let i = 0; i < newIds.length; i++) {
          newNodeIdsRef.current.set(newIds[i], baseTime + i * BATCH_STAGGER_MS)
          // For single new node, also set the legacy ref for backward compat
          if (newIds.length === 1) {
            newNodeIdRef.current = newIds[0]
            newNodeTimeRef.current = baseTime
          }
        }

        // Add first new node to simulation (triggers warm restart)
        const firstNew = nodes.find(n => n.id === newIds[0])
        if (firstNew && addNode) addNode(firstNew)

        // Restart animation loop
        mountTimeRef.current = baseTime
        setFadeProgress(0.99) // Trigger re-render for animation
      }
    }

    prevItemIdsRef.current = currentIds
  }, [savedItems, nodes, addNode])

  // ── Animation loop for stagger + new node fade ──
  useEffect(() => {
    if (simulatedNodes.length === 0) return

    // If entrance already played and no new node, skip animation entirely
    if (skipEntrance && !newNodeIdRef.current) {
      setFadeProgress(1)
      return
    }

    const totalDuration = GRAPH.FADE_STAGGER_CAP + GRAPH.FADE_DURATION
    const tick = () => {
      const elapsed = Date.now() - mountTimeRef.current
      const newNodeElapsed = newNodeIdRef.current ? Date.now() - newNodeTimeRef.current : Infinity

      // Continue animating if stagger or new-node fade is in progress
      const staggerDone = skipEntrance || elapsed > totalDuration
      const newNodeDone = !newNodeIdRef.current || newNodeElapsed > GRAPH.NEW_FADE

      if (staggerDone && newNodeDone) {
        setFadeProgress(1)
        if (newNodeIdRef.current && newNodeDone) newNodeIdRef.current = null
        // Mark entrance as played for this session
        try { sessionStorage.setItem(ENTRANCE_FLAG, 'true') } catch { /* ignore */ }
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
      // Check if this is a batch-staggered new node
      const batchTime = newNodeIdsRef.current.get(nodeId)
      if (batchTime) {
        const elapsed = Date.now() - batchTime
        fadeAlpha = Math.min(1, elapsed / GRAPH.NEW_FADE)
      } else if (nodeId === newNodeIdRef.current) {
        // Legacy single-node handling
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
  // Adaptive edge scaling: more visible for sparse graphs, fainter for dense
  const opacityScale = Math.max(0.5, Math.min(1.5, 30 / Math.max(1, simulatedNodes.length)))
  const widthScale = Math.max(0.8, Math.min(1.5, 25 / Math.max(1, simulatedNodes.length)))

  const getEdgeOpacity = useCallback((e: { sourceId: string; targetId: string; type: GraphEdge['type'] }): number => {
    const base = EDGE_STYLES[e.type].opacity * opacityScale
    if (selectedNodeId) {
      if (e.sourceId === selectedNodeId || e.targetId === selectedNodeId) return base * 2
      return base * 0.3
    }
    if (selectedCluster) return base * 0.5
    return base
  }, [selectedNodeId, selectedCluster, opacityScale])

  const getEdgeWidth = useCallback((type: GraphEdge['type']): number => {
    return EDGE_STYLES[type].width * widthScale
  }, [widthScale])

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
            {/* Star glow filters — one per blur level */}
            <filter id="star-glow-dim" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="1.5" />
            </filter>
            <filter id="star-glow-default" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            <filter id="star-glow-claimed" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            <filter id="star-glow-bright" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2.5" />
            </filter>

            {/* Soft center dot gradients — diffuse edges for point-of-light effect */}
            <radialGradient id="dot-default">
              <stop offset="0%" stopColor="var(--star-default)" stopOpacity="1" />
              <stop offset="60%" stopColor="var(--star-default)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--star-default)" stopOpacity="0.3" />
            </radialGradient>
            <radialGradient id="dot-claimed">
              <stop offset="0%" stopColor="#B8441E" stopOpacity="1" />
              <stop offset="60%" stopColor="#B8441E" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#B8441E" stopOpacity="0.3" />
            </radialGradient>
            <radialGradient id="dot-dim">
              <stop offset="0%" stopColor="var(--text-tertiary)" stopOpacity="0.8" />
              <stop offset="60%" stopColor="var(--text-tertiary)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="var(--text-tertiary)" stopOpacity="0.15" />
            </radialGradient>
            <radialGradient id="dot-bright">
              <stop offset="0%" stopColor="var(--text-primary)" stopOpacity="1" />
              <stop offset="60%" stopColor="var(--text-primary)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--text-primary)" stopOpacity="0.4" />
            </radialGradient>
          </defs>

          {/* Layer 1: Edges */}
          <g data-testid="edges-layer">
            {resolvedEdges.map((e, i) => {
              return (
                <line
                  key={`edge-${i}`}
                  x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke="var(--star-default)"
                  strokeWidth={getEdgeWidth(e.type)}
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
              const sp = STAR_PARAMS[state]
              const rot = starRotation(node.id)
              return (
                <path
                  key={`glow-${node.id}`}
                  d={starPath(node.x, node.y, radius * sp.outerMult, radius * sp.innerMult)}
                  fill={fill}
                  opacity={glowOpacity * opacity}
                  filter={`url(#star-glow-${state})`}
                  transform={`rotate(${rot} ${node.x} ${node.y})`}
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
              const radius = getNodeRadius(cc) * 1.5  // 1.5x to compensate for soft edge
              const opacity = getNodeOpacity(node.id)
              const gradientId = `dot-${state}`
              return (
                <circle
                  key={`node-${node.id}`}
                  data-testid={`graph-node-${node.id}`}
                  data-state={state}
                  cx={node.x} cy={node.y}
                  r={radius}
                  fill={`url(#${gradientId})`}
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
                key={`label-${label.level}-${label.text}`}
                data-testid={`cluster-label-${label.text.toLowerCase()}`}
                data-level={label.level}
                x={label.x}
                y={label.y}
                textAnchor="middle"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: label.level === 'country' ? '11px' : '9px',
                  fontWeight: label.level === 'country' ? 500 : 400,
                  textTransform: label.level === 'country' ? 'uppercase' : 'none',
                  letterSpacing: label.level === 'country' ? '1px' : '0.3px',
                  fill: label.level === 'country' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fillOpacity: label.level === 'country' ? 0.5 : 0.6,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                {label.text}
              </text>
            ))}
          </g>
        </svg>

        {/* Preview card */}
        {selectedItem && <NodePreviewCard item={selectedItem} />}
      </div>

      {/* Stats counter removed — the graph itself is the accumulation visualization */}
    </div>
  )
}

// Export for testing
export { getNodeRadius, getNodeState, NODE_COLORS, EDGE_STYLES, computeClusterLabels, starPath, starRotation, STAR_PARAMS }

/** Compute edge opacity scale for a given node count. Exported for testing. */
export function computeEdgeOpacityScale(nodeCount: number): number {
  return Math.max(0.5, Math.min(1.5, 30 / Math.max(1, nodeCount)))
}

/** Compute edge width scale for a given node count. Exported for testing. */
export function computeEdgeWidthScale(nodeCount: number): number {
  return Math.max(0.8, Math.min(1.5, 25 / Math.max(1, nodeCount)))
}
export type { ClusterLabel }
