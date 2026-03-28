# Youji — Travel Graph Technical Specification

> Implementation rules for the Travel Graph visualization on Horizon.
> Read first: /docs/BRAND-IDENTITY.md for visual identity context.

## 1. Overview

Force-directed network visualization rendering saved items as an interactive star map on Horizon. Every save is a node. Shared attributes create edges that drive clustering via physics.

Architecture: d3-force computes positions, React renders SVG. Client-side data computation from existing saved_items query.

Key files:
  src/components/horizon/TravelGraph.tsx
  src/components/horizon/useGraphSimulation.ts
  src/components/horizon/useGraphData.ts
  src/components/horizon/graphConstants.ts

## 2. Data Model

Node: id, title, city, countryCode, categories[], isClaimedByTrip, x, y

Edge: source, target, weight (1.0|0.5|0.3), type (city|country|category)

Edge priority: one edge per pair max. City (1.0) > Country (0.5) > Category (0.3).

## 3. Physics

Forces: charge (-30 default, -80 if <4 nodes), center (0.05), link (distance 25/60/100 by type, strength = weight*0.8), collision (radius 8, strength 0.7). velocityDecay 0.4, alphaDecay 0.02.

Let simulation run visibly (2-3s settle). Warm restart at alpha 0.3 for new saves. Clamp to container bounds with 20px padding. Persist settled positions.

## 4. Visual Rules

Nodes: circles with radial glow. Radius 2.5-4.5px by connection count. Colors: star-default (#d4e0f0), star-dim (#b8c8e0), star-bright (#edf2fa), copper (#c45a2d) for claimed.

Edges: barely visible lines. City 0.8px 9%, Country 0.5px 6%, Category 0.3px 3%. All #d4e0f0.

Cluster labels: 4+ same-city nodes. DM Sans 11px uppercase, star-bright at 60%. City name only.

Background: transparent SVG over sunset progression gradient.

## 5. Interaction

Tap node: select, show preview, brighten, dim others.
Tap cluster: filter card grid below to that city.
Tap empty: deselect, restore all.

No drag, no pinch, no long-press.
44px touch targets on all nodes.

## 6. Animation

Page load: stagger fade-in from center outward, 400ms each, 3s cap. Simulation runs during.
New save: fade in 600ms at center, warm restart, drift to cluster.

No twinkling, pulsing, or idle animation.

## 7. Layout

Top 40-50% viewport (~380px on iPhone 14). Full width. Scrolls away.

Below: stats line, Recently Added, filters, card grid.
Stats: "47 saves · 12 countries · 23 cities" in JetBrains Mono 13px star-default.

## 8. Density

1-3: charge -80, spread nodes. 4-10: loose clusters. 10-25: first labels. 25-50: distinct clusters. 50+: hide category edges. 100+: collapse 8+ same-city clusters into weighted nodes.
