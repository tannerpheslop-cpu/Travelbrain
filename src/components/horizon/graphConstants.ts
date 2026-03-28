/**
 * All magic numbers for the Travel Graph visualization.
 * See /docs/TRAVEL-GRAPH.md for the full specification.
 */

export const GRAPH = {
  // Physics — charge
  CHARGE_DEFAULT: -30,
  CHARGE_SPARSE: -80,
  SPARSE_THRESHOLD: 4,
  CHARGE_MAX_DIST: 200,

  // Physics — center
  CENTER_STRENGTH: 0.05,

  // Physics — links
  LINK_DIST: { city: 25, country: 60, category: 100 } as const,
  LINK_STRENGTH_MULT: 0.8,

  // Physics — collision
  COLLISION_RADIUS: 8,
  COLLISION_STRENGTH: 0.7,

  // Physics — simulation
  VELOCITY_DECAY: 0.4,
  ALPHA_DECAY: 0.02,
  WARM_ALPHA: 0.3,
  BOUNDS_PAD: 20,

  // Visual — node sizes (by connection count)
  NODE_RADIUS: { orphan: 2.5, low: 3, mid: 3.5, high: 4, hub: 4.5 } as const,

  // Visual — cluster labels
  CLUSTER_LABEL_MIN: 4,

  // Density thresholds
  COLLAPSE_MIN: 8,
  CATEGORY_EDGE_HIDE: 50,

  // Animation
  FADE_STAGGER_CAP: 3000,
  FADE_DURATION: 400,
  NEW_FADE: 600,
} as const
