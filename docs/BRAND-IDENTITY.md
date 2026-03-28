# Youji — Brand Visual Identity System

> **What this is:** The canonical reference for Youji's visual identity.
> Hand to Builder instances when implementing visual changes.
> Reference across sessions for design decisions.
>
> **Status:** Locked — March 2026
> **Supersedes:** All previous brand/design references including
> "traveler's notebook" metaphor and warm-neutral palette.

---

## 1. The Night Sky

Youji's visual identity is built on a single metaphor: **the night sky.**

This isn't a theme applied to the product — it's the identity that emerged through the product's strongest design surface (the dark Mapbox trip map) and is now extended intentionally to every surface.

The metaphor maps structurally onto every phase of the user experience:

- **Horizon is the night sky.** Saves are stars. They accumulate one by one, and constellations (clusters of related saves) form over time. The user looks at their sky and discovers patterns in their own curiosity.
- **A trip is a constellation you choose to trace.** You see a cluster, you draw lines through it, and it becomes a plan. The trip map's copper route lines connect stars into journeys.
- **The horizon is the boundary between the known and the unknown.** It's where you look when you're wondering what's out there — where stars meet the earth.

### Why this metaphor wins

- **Emotional, not organizational.** Nobody shares their notebook. People share their sky.
- **Naturalizes sparsity.** A notebook with 3 entries feels empty. A sky with 3 stars feels like dusk.
- **Compounds.** Each new star changes the whole sky. The 50th save shifts constellations.
- **Visually distinctive.** Dark-canvas products in travel are rare. Youji is immediately recognizable.

### Brand attributes

| Attribute | Description |
|-----------|-------------|
| Wonder | The feeling of looking up and realizing how vast your curiosity is |
| Discovery | Patterns emerge that you didn't consciously create — the product reveals you to yourself |
| Accumulation | Every save adds a star. The sky fills over time. The collection compounds in beauty and meaning |
| Intention | Tracing constellations into trips. Moving from dreaming to planning to doing |
| Personal | Your sky is unique. No two users' collections look alike. This is your travel identity rendered visually |

---

## 2. The Dual Temperature System

The product has two emotional registers, distinguished by color temperature:

### Looking up — Horizon (cool)

The user gazes upward at the night sky. The canvas is deep blue-black. Stars are cool white-blue — distant, scattered, luminous. This is curiosity in its raw, undirected form. The color temperature is **cool**.

### Looking down — Trips (warm)

The user gazes downward at the earth from space. The map is dark, and cities glow warm amber-copper — human settlements alive with activity, connected by routes. This is curiosity grounded into a plan. The color temperature is **warm**.

**Same sky, two perspectives.** Looking up = cool. Looking down = warm.

This gives Horizon and Trips their own emotional registers while feeling like one coherent product. The copper accent bridges both — it appears subtly as city glow on Horizon and prominently as markers and route lines on Trips.

---

## 3. The Sunset Progression

Horizon's background is **dynamic** — it transitions from golden hour to full night as the user's save count increases. This solves the critical "0 to 30 saves" engagement problem by making the sparse state its own beautiful moment rather than a lesser version of the full state.

### The two-layer rendering model

The sky background is always two layers composited together:

**Layer 1 — Linear gradient (top to bottom).** This does 95% of the work. It establishes the sky colors, the mid-tones, and the overall atmosphere.

**Layer 2 — Subtle radial overlay (centered below bottom edge).** This adds a gentle curve to the warm horizon band so it doesn't read as a flat line. Uses a very large radius (~130% of canvas height) and low opacity (8-25%). In the final stage, this transitions to a compact round copper city glow.

### Stage 0: Golden hour — 0 saves

Layer 1 — Linear gradient:
  0% — #1a1028, 30% — #3d1f3a, 55% — #7a2e3a, 75% — #c4582d, 90% — #d4863a, 100% — #e8a04a

Layer 2 — Radial curve:
  Center: (width/2, height + 60), Radius: height * 1.3
  Color: #e8a04a, Max opacity: 25%
  Stops: 0%->full, 35%->60%, 70%->20%, 100%->transparent

### Stage 1: Sunset — 1-5 saves

Layer 1 — Linear gradient:
  0% — #0e1424, 25% — #1f1a35, 50% — #4a2040, 72% — #9a3833, 88% — #c4682d, 100% — #d4863a

Layer 2 — Radial curve:
  Center: (width/2, height + 60), Radius: height * 1.3
  Color: #d4863a, Max opacity: 20%

### Stage 2: Dusk — 6-15 saves

Layer 1 — Linear gradient:
  0% — #080c18, 20% — #0e1228, 50% — #1f1530, 75% — #5a2535, 92% — #8a4530, 100% — #a05a30

Layer 2 — Radial curve:
  Center: (width/2, height + 60), Radius: height * 1.3
  Color: #a05a30, Max opacity: 15%

### Stage 3: Early night — 16-30 saves

Layer 1 — Linear gradient:
  0% — #080c18, 25% — #0b0f20, 50% — #101428, 70% — #1a1530, 82% — #2a1d33, 92% — #3d2535, 100% — #4a2a35

Layer 2 — Radial curve:
  Center: (width/2, height + 60), Radius: height * 1.3
  Color: #4a2a35, Max opacity: 10%

### Stage 4: Full night — 30+ saves

Layer 1 — Linear gradient:
  0% — #080c18, 40% — #090e1c, 70% — #0b1020, 90% — #0e1326, 100% — #141828

Layer 2 — City glow (REPLACES the sunset curve):
  Center: (width/2, height + 20), Radius: height * 0.5
  Stops: 0% — #c45a2d at 15% opacity, 30% — #c45a2d at 9%, 60% — #c45a2d at 4%, 100% — transparent
  CRITICAL: This is compact and round. It does NOT spread warmth across the lower third. It pools at the very bottom center.

### Implementation notes

- Continuous interpolation between stages, NOT discrete if-else jumps
- Transition thresholds: 0, 1, 6, 16, 30
- The gradient only recalculates on page load or after a save action — not per frame
- The Layer 2 transition from sunset curve to city glow happens during Stage 3->4: center drops, radius shrinks from 130% to 50%, color shifts from warm amber to copper

---

## 4. Color Palette

### 4.1 CSS Token Map

/* Canvas */
--color-deep-bg:           #080c18;
--color-surface:            #141828;
--color-surface-elevated:   #1c2035;
--color-surface-light:      #faf8f4;

/* Stars (cool register) */
--color-star-dim:           #b8c8e0;
--color-star-default:       #d4e0f0;
--color-star-bright:        #edf2fa;

/* Copper (warm register) */
--color-copper-deep:        #8a4020;
--color-copper:             #c45a2d;
--color-copper-glow:        #e8904a;

/* Text */
--color-text-primary:       #e4e8f0;
--color-text-secondary:     #8088a0;
--color-text-tertiary:      #4a5068;
--color-text-on-light:      #1a1d27;

/* Functional */
--color-success:            #5b8a72;
--color-warning:            #c49a2d;
--color-error:              #c44a3d;

/* Graph edges */
--color-edge-strong:        #d4e0f018;
--color-edge-medium:        #d4e0f010;
--color-edge-weak:          #d4e0f008;

### 4.2 Semantic color usage

| Element | Token | Meaning |
|---------|-------|---------|
| Star nodes on Horizon | --color-star-default | Curiosity — unstructured saves |
| Star nodes claimed by a trip | --color-copper | Intention — save has become a plan |
| Graph edges | --color-edge-* | Relationships between saves |
| City glow on Horizon | --color-copper at low opacity | The world below, inviting you to plan |
| Trip map markers | --color-copper | Destinations you'll visit |
| Trip route lines | --color-copper | Journey connecting destinations |
| FAB | --color-copper | Action — save something new |
| Selected filter pills | --color-copper fill | Active choice |

---

## 5. Typography

| Context | Font | Color | Weight |
|---------|------|-------|--------|
| Body text on dark | DM Sans | --color-text-primary | 400 |
| Labels/metadata on dark | DM Sans | --color-text-secondary | 400 |
| Graph cluster labels | DM Sans | --color-star-bright | 500, 11px uppercase |
| Horizon stats line | JetBrains Mono | --color-star-default | 400 |
| Chapter numbers (trips) | JetBrains Mono | --color-copper | 500 |
| Numerical data | JetBrains Mono | --color-text-primary | 400 |

---

## 6. Surface Application

| Surface | Background | Text | Notes |
|---------|-----------|------|-------|
| Horizon page | Sunset progression gradient | Cool palette | Graph hero at top, cards below |
| Trip map | Mapbox dark base | Warm palette | Already correct |
| Trip library | --color-deep-bg | Cool palette | Atmospheric trip cards |
| Save sheet | --color-surface-light | --color-text-on-light | Stays light — intentional contrast |
| DraggableSheet | --color-surface | Cool palette | Not white |
| Bottom nav | --color-surface | Active: --color-copper / Inactive: --color-text-secondary | Subtle top border |
| Toast notifications | --color-surface | --color-star-default | Toasts belong to the sky |

---

## 7. Motion Principles

- **Atmospheric surfaces move organically.** Soft easing, gentle physics, drifting.
- **Functional surfaces move decisively.** Quick, clean, purposeful.
- **Nothing blinks, flashes, or demands attention.** The sky doesn't shout.
- **Graph nodes fade in with stagger** (200-400ms) — stars appearing as eyes adjust.
- **Sunset progression changes between visits**, not during a session. Imperceptible.

---

## 8. Implementation Sequencing

**Phase 0.5:** Color tokens -> Horizon dark background -> Toast styling -> Travel Graph prototype
**Phase 1:** Trip Library dark -> Sheet surface update -> Card refinement -> Empty states -> Bottom nav
**Phase 2:** Motion polish -> Photography direction -> Marketing surfaces
**Phase 3:** Periodic reflection ("Your Sky") -> Constellation naming
