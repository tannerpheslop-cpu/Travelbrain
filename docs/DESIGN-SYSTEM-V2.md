# Youji — Design System V2

> **What this is:** The single canonical reference for Youji's visual identity and color system.
> Hand to Builder instances when implementing any visual changes.
> Reference across sessions for all design decisions.
>
> **Status:** Locked — April 2026
> **Supersedes:** All previous design references including youji-brand-visual-identity-system.md,
> DESIGN-SYSTEM.md (v1), and the April 2026 v2 interim palette.

---

## 1. The Night Sky

Youji's visual identity is built on a single metaphor: **the night sky.**

This isn't a theme applied to the product — it's the identity that emerged through the product's strongest design surface (the dark Mapbox trip map) and is now extended intentionally to every surface.

The metaphor maps structurally onto every phase of the user experience:

- **Horizon is the night sky.** Saves are stars. They accumulate one by one, and constellations (clusters of related saves) form over time. The user looks at their sky and discovers patterns in their own curiosity.
- **A trip is a constellation you choose to trace.** You see a cluster, you draw lines through it, and it becomes a plan. The trip map's orange route lines connect stars into journeys.
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

The user gazes upward at the night sky. The canvas is deep slate-blue. Stars are cool white-blue — distant, scattered, luminous. This is curiosity in its raw, undirected form. The color temperature is **cool**.

### Looking down — Trips (warm)

The user gazes downward at the earth from space. The map is dark, and cities glow warm ember-orange — human settlements alive with activity, connected by routes. This is curiosity grounded into a plan. The color temperature is **warm**.

**Same sky, two perspectives.** Looking up = cool. Looking down = warm.

This gives Horizon and Trips their own emotional registers while feeling like one coherent product. The orange accent bridges both — it appears subtly as city glow on Horizon and prominently as markers and route lines on Trips.

---

## 3. Design Philosophy

**This system should feel like:**

- Dark, but not cold
- Structured, but not rigid
- Expressive, but only in moments
- Premium, not playful

**Core principles:**

- **Tinted neutral system, not a colored UI.** Slight slate-blue bias with micro warmth. Orange is the only high-signal color. Everything else is quiet, restrained, layered.
- **Orange = meaning, not decoration.** At any moment, only 1–2 elements should be orange. It signals action, selection, and high-value state — nothing else.
- **Depth through elevation, not color.** Use slightly lighter surfaces and stronger shadows to signal elevation. Avoid filling selected states with color — use surface lift + subtle border shift + faint orange glow.
- **Cards = scan, not read.** Limit each card to: title, 1 metadata row, optional secondary info. Everything else belongs in the detail view.
- **Borders should be barely visible.** Prefer layer separation over lines.

---

## 4. Color Palette

### 4.1 CSS Token Map

```css
/* ─── Backgrounds & Surfaces ─────────────────────────────── */
--bg-canvas:          #121417;   /* Deepest bg, nav bar, Travel Graph canvas */
--bg-base:            #15181c;   /* Main content layer, draggable sheet */
--bg-subtle:          #181c20;   /* Subtle surface lift */
--bg-elevated-1:      #1c2126;   /* Cards, elevated surfaces */
--bg-elevated-2:      #21262c;   /* Source preview cards, nested cards */
--bg-elevated-3:      #262c33;   /* Tooltips, popovers */

/* ─── Text ────────────────────────────────────────────────── */
--text-primary:       #e8eaed;   /* Body, headings */
--text-secondary:     #b9c0c7;   /* Metadata, labels */
--text-tertiary:      #8d96a0;   /* Placeholder, inactive labels */
--text-muted:         #6f7781;   /* Disabled text, ghost labels */
--text-inverse:       #15181c;   /* Text on light surfaces (save sheet) */

/* ─── Borders & Dividers ──────────────────────────────────── */
--border-subtle:      #242a30;   /* Barely visible separation */
--border-default:     #2c333a;   /* Standard card border */
--border-strong:      #38414a;   /* Emphasized border, focus ring base */
--divider:            #22272e;   /* Section dividers */
--divider-soft:       #1c2127;   /* Very subtle content dividers */

/* ─── Accent (Orange) ─────────────────────────────────────── */
--accent-primary:     #B8441E;   /* FAB, active nav, badges, primary buttons */
--accent-hover:       #C9521F;   /* Hover state */
--accent-pressed:     #A33A1A;   /* Pressed/active state */
--accent-soft:        rgba(184, 68, 30, 0.15);  /* Soft fill (selected states, badges) */
--accent-glow:        rgba(184, 68, 30, 0.22);  /* Glow effect, city glow on Horizon */

/* ─── Stars (cool register — Horizon only) ────────────────── */
--star-dim:           #8d96a0;   /* Dim star nodes on Travel Graph */
--star-default:       #b9c0c7;   /* Default star nodes */
--star-bright:        #e8eaed;   /* Bright/active star nodes */

/* ─── Interaction States ──────────────────────────────────── */
--state-hover:        rgba(255, 255, 255, 0.04);
--state-pressed:      rgba(255, 255, 255, 0.06);
--state-selected:     rgba(184, 68, 30, 0.10);
--focus-ring:         rgba(184, 68, 30, 0.42);
--disabled-bg:        #1b1f24;
--disabled-text:      #626a74;

/* ─── Shadows ─────────────────────────────────────────────── */
--shadow-sm:          0 1px 2px rgba(0, 0, 0, 0.18);
--shadow-md:          0 6px 16px rgba(0, 0, 0, 0.24);
--shadow-lg:          0 12px 28px rgba(0, 0, 0, 0.30);

/* ─── Functional ──────────────────────────────────────────── */
--color-success:      #5b8a72;
--color-warning:      #c49a2d;
--color-error:        #c44a3d;

/* ─── Graph Edges ─────────────────────────────────────────── */
--edge-strong:        rgba(184, 192, 199, 0.094);
--edge-medium:        rgba(184, 192, 199, 0.063);
--edge-weak:          rgba(184, 192, 199, 0.031);

/* ─── (surface-light removed — save sheet is now dark) ────── */
```

### 4.2 Surface depth stack

Three canonical depth layers for all UI surfaces:

```
canvas (#121417) → base (#15181c) → elevated-1 (#1c2126)
```

Each step is a small tonal lift (3–5%). No big jumps. Use `bg-subtle` and `bg-elevated-2/3` for intermediate moments (nested cards, tooltips). Do not invent new surface colors outside this stack.

### 4.3 Semantic color usage

| Element | Token | Meaning |
|---------|-------|---------|
| Horizon canvas + nav | `--bg-canvas` | Deepest layer — the sky |
| DraggableSheet + main content | `--bg-base` | Content layer |
| Cards, elevated surfaces | `--bg-elevated-1` | Items sitting on the content layer |
| Source preview cards | `--bg-elevated-2` | Nested cards |
| Star nodes (unselected) | `--star-default` | Curiosity — unstructured save |
| Star nodes (claimed by trip) | `--accent-primary` | Intention — save has become a plan |
| Graph edges | `--edge-*` | Relationships between saves |
| City glow on Horizon (Stage 4) | `--accent-glow` | The world below, inviting you to plan |
| Trip map markers | `--accent-primary` | Destinations you'll visit |
| Trip route lines | `--accent-primary` | Journey connecting destinations |
| FAB | `--accent-primary` | Action — save something new |
| Active nav icon | `--accent-primary` | Current location |
| Inactive nav icon | `--text-tertiary` | Quiet — not competing with content |
| Selected filter pills | `--state-selected` fill + `--accent-primary` text | Active choice |
| Category pills | `--bg-elevated-2` fill + `--text-secondary` text | Scannable metadata (all categories uniform) |
| Location pills | `rgba(141,150,160,0.20)` fill + `--text-tertiary` text | Geographic context |
| Primary CTA buttons | `--accent-primary` | Only one on screen at a time |
| Save sheet | `--bg-base` | Dark surface — consistent with app theme |

### 4.4 Orange usage rules — CRITICAL

Orange is meaningful only when it is rare. Enforce strictly:

- **Allowed:** FAB, active nav indicator (small dot or icon only — not full tab), primary CTA button, badges on Route cards, selected state on pills/toggles, star nodes claimed by a trip, map markers and route lines, city glow on Horizon (Stage 4 only, very low opacity).
- **Not allowed:** Section headers, passive chips, decorative dividers, secondary labels, navigation bars as a whole, any element that is always visible and non-interactive.
- At any moment, **maximum 1–2 orange elements** should be visible on screen.

---

## 5. The Sunset Progression

Horizon's background is **dynamic** — it transitions from golden hour to full night as the user's save count increases. This solves the critical "0 to 30 saves" engagement problem by making the sparse state its own beautiful moment rather than a lesser version of the full state.

The full night end state resolves to `--bg-canvas` (#121417) — the same slate-tinted dark that underlies the entire UI. This grounds the sky in the product's visual system rather than feeling like a detached special effect.

### The two-layer rendering model

The sky background is always two layers composited together:

**Layer 1 — Linear gradient (top to bottom).** This does 95% of the work. It establishes the sky colors, the mid-tones, and the overall atmosphere.

**Layer 2 — Subtle radial overlay (centered below bottom edge).** This adds a gentle curve to the warm horizon band so it doesn't read as a flat line. Uses a very large radius (~130% of canvas height) and low opacity (8–25%). In the final stage, this transitions to a compact round orange city glow.

### Stage 0: Golden hour — 0 saves

The sky is alive with warm light. The user's journey is just beginning.

```
Layer 1 — Linear gradient (top → bottom):
  0%   — #1a1020    (deep slate-purple, nearly black)
  30%  — #3a1f38    (dark violet-purple)
  55%  — #78303a    (deep rose-burgundy)
  75%  — #b8441e    (full orange — the accent color itself at horizon)
  90%  — #c96830    (amber-orange)
  100% — #d4823c    (warm amber at base)

Layer 2 — Radial curve:
  Center: (width/2, height + 60)   Radius: height * 1.3
  Color: #d4823c   Max opacity: 25%
  Stops: 0%→full | 35%→60% | 70%→20% | 100%→transparent
```

### Stage 1: Sunset — 1–5 saves

The warm light begins to cool. Stars are becoming visible at the top.

```
Layer 1 — Linear gradient (top → bottom):
  0%   — #121417    (canvas — the night already owns the top)
  25%  — #1a1830    (very dark slate-purple)
  50%  — #3d1f38    (deep violet)
  72%  — #8a3530    (muted terracotta)
  88%  — #b8441e    (orange — retreating to the horizon)
  100% — #c96830    (amber base)

Layer 2 — Radial curve:
  Center: (width/2, height + 60)   Radius: height * 1.3
  Color: #c96830   Max opacity: 20%
```

### Stage 2: Dusk — 6–15 saves

Twilight. The warm band is narrow now. Cool tones dominate.

```
Layer 1 — Linear gradient (top → bottom):
  0%   — #121417    (canvas)
  20%  — #141820    (nearly canvas, very slight blue)
  50%  — #1a1830    (dark slate-purple)
  75%  — #4a2230    (muted rose-brown)
  92%  — #7a3820    (dark amber-brown)
  100% — #8a4220    (warm dark base)

Layer 2 — Radial curve:
  Center: (width/2, height + 60)   Radius: height * 1.3
  Color: #8a4220   Max opacity: 15%
```

### Stage 3: Early night — 16–30 saves

The sky is mostly dark. Just a hint of warmth remains at the base.

```
Layer 1 — Linear gradient (top → bottom):
  0%   — #121417    (canvas)
  25%  — #131518    (canvas + micro lift)
  50%  — #15181e    (barely cooler than canvas)
  70%  — #181820    (trace of slate)
  82%  — #1e1a22    (faint violet undertone)
  92%  — #261820    (last trace of warmth)
  100% — #2c1c22    (very dark rose-brown at base)

Layer 2 — Radial curve:
  Center: (width/2, height + 60)   Radius: height * 1.3
  Color: #2c1c22   Max opacity: 10%
```

### Stage 4: Full night — 30+ saves

The sky is fully dark. The city glows below. This is what the product becomes when it's truly yours.

```
Layer 1 — Linear gradient (top → bottom):
  0%   — #121417    (canvas — perfectly flat)
  40%  — #131518    (imperceptibly lighter)
  70%  — #14171b    (still essentially canvas)
  90%  — #15181c    (base — barely distinguishable)
  100% — #15181c    (base)

Layer 2 — City glow (REPLACES the sunset curve):
  Center: (width/2, height + 20)   Radius: height * 0.5
  Stops:
    0%   — rgba(184, 68, 30, 0.15)  (orange at 15%)
    30%  — rgba(184, 68, 30, 0.09)  (orange at 9%)
    60%  — rgba(184, 68, 30, 0.04)  (orange at 4%)
    100% — transparent

  CRITICAL: This is compact and round. It does NOT spread warmth
  across the lower third. It pools at the very bottom center.
  This is the --accent-glow color applied at low opacity.
```

### Implementation notes

- Continuous interpolation between stages, NOT discrete if-else jumps
- Transition thresholds: 0, 1, 6, 16, 30
- The gradient only recalculates on page load or after a save action — not per frame
- The Layer 2 transition from sunset curve to city glow happens during Stage 3→4: center drops, radius shrinks from 130% to 50%, color shifts from warm amber to orange (#B8441E)
- The full-night state resolves naturally to `--bg-canvas` (#121417) — this is intentional and grounds the sky in the design system

---

## 6. Typography

| Context | Font | Color Token | Weight / Size |
|---------|------|-------------|---------------|
| Body text | DM Sans | `--text-primary` | 400, 15–16px |
| Metadata, labels | DM Sans | `--text-secondary` | 400, 13px |
| Placeholder, inactive | DM Sans | `--text-tertiary` | 400, 13px |
| Graph cluster labels | DM Sans | `--star-bright` | 500, 11px uppercase |
| Horizon stats line | JetBrains Mono | `--star-default` | 400 |
| Chapter numbers (trips) | JetBrains Mono | `--accent-primary` | 500 |
| Counters, numerical data | JetBrains Mono | `--text-primary` | 400 |
| Text on save sheet | DM Sans | `--text-primary` | 400 |

**Hierarchy rule:** Use weight AND brightness together, not just size, to establish hierarchy. A `--text-primary` label at 500 weight reads as more important than the same size at `--text-secondary` 400 weight — use this intentionally.

---

## 7. Surface Application

| Surface | Background Token | Text Palette | Notes |
|---------|-----------------|--------------|-------|
| Horizon page | Sunset progression gradient | Cool (star tokens) | Graph hero at top, cards below |
| Travel Graph canvas | `--bg-canvas` | Star tokens | Rendered separately from gradient |
| Trip map | Mapbox dark base | Warm (accent tokens) | Already correct |
| Trip library | `--bg-canvas` | Cool palette | Atmospheric trip cards |
| DraggableSheet | `--bg-base` | Primary/secondary text | Not white, not canvas |
| Cards | `--bg-elevated-1` | Primary/secondary text | 8px radius |
| Source preview cards | `--bg-elevated-2` | Secondary/tertiary text | Nested within cards |
| Save sheet | `--bg-base` | `--text-primary` | Dark surface — consistent with app theme |
| Bottom nav | `--bg-canvas` | Active: `--accent-primary` / Inactive: `--text-tertiary` | Subtle `--border-subtle` top border |
| Toast notifications | `--bg-elevated-1` | `--text-primary` | `--shadow-md` |
| FAB menu sheet | `--bg-base` | `--text-primary` | Compact, Spotify-style |

---

## 8. Component Specs

### Cards
- Background: `--bg-elevated-1`
- Border: 1px `--border-subtle` (optional — prefer layer separation)
- Border radius: **8px** everywhere — do not deviate
- Internal padding: **12px**
- Grid gap: **6px** (dense — preserves the "sky full of stars" feeling)
- Photo gradient overlay: linear-gradient from transparent to rgba(18,20,23,0.85) for text legibility
- Max content per card: title + 1 metadata row + optional secondary info

### Pills
- All pills: first letter capitalized ("Historical" not "historical")
- Border radius: pill (9999px)
- All category pills: `--bg-elevated-2` fill, `--text-secondary` text, DM Sans 11px
- Location pills: `rgba(141, 150, 160, 0.20)` fill, `--text-tertiary` text
- Selected pills (filter bar): `--state-selected` fill, `--accent-primary` text
- No category-specific coloring — all categories use the same monochrome treatment
- Card pills read from `item_tags` table, falling back to legacy `category` column
- See `/docs/PILL-SYSTEM-CONTEXT.md` for the full pill system spec

### Buttons
- Primary: `--accent-primary` background, white text, 16px radius (or pill)
- Hover: `--accent-hover` background
- Pressed: `--accent-pressed` background
- Disabled: `--disabled-bg` background, `--disabled-text` text
- Only one primary button should be visible on screen at a time

### Navigation
- Background: `--bg-canvas`
- Active icon: `--accent-primary` (icon only — not background fill)
- Inactive icon: `--text-tertiary`
- Top border: 1px `--border-subtle`
- Navigation should not compete with content — keep it quiet

### Modals & Sheets
- All modals: `fixed inset-x-0 bottom-0` pattern — never `flex items-end`
- Sheet background: `--bg-base`
- Border radius (top corners only): 24px
- Handle indicator: `--border-strong`, 40px wide, 4px tall, centered

### Shadows
- Use `--shadow-sm` for cards on a surface
- Use `--shadow-md` for sheets and toasts
- Use `--shadow-lg` for modals and overlays
- Soft, diffused only — no sharp elevation

---

## 9. Motion Principles

- **Atmospheric surfaces move organically.** Soft easing (ease-out), gentle physics, drifting.
- **Functional surfaces move decisively.** Quick, clean, purposeful (ease-in-out, 150–200ms).
- **Nothing blinks, flashes, or demands attention.** The sky doesn't shout.
- **Graph nodes fade in with stagger** (200–400ms) — stars appearing as eyes adjust.
- **Sunset progression changes between visits**, not during a session. Imperceptible in real time.
- **Sheet transitions:** 300ms ease-out for appearance, 250ms ease-in for dismissal.
- **Card interactions:** 150ms ease-out scale(0.98) on press — subtle, physical.

---

## 10. What This System Is Not

- **Not a colored UI.** The slate-blue tint is micro — invisible at a glance, felt as refinement.
- **Not playful.** This is deliberate, atmospheric, premium. Corners stay at 8px on cards. Emoji are prohibited.
- **Not noisy.** Remove unnecessary borders, extra dividers, secondary labels that repeat info, decorative color. Goal: calm canvas.
- **Not orange-forward.** If you find yourself adding orange to a new element, stop and ask whether it belongs there.

---

## 11. Light Mode (Deferred)

Light mode tokens are defined but not shipping yet. Ship after dark mode is stable and validated with real users.

```css
/* Light mode overrides (not active) */
--bg-canvas:       #f0f2f5;
--bg-base:         #e8eaed;
--bg-elevated-1:   #ffffff;
--text-primary:    #1a1d21;
--text-secondary:  #4a5260;
/* Starry sky canvas stays dark in both modes */
/* --accent-primary stays #B8441E */
```

---

## 12. Rules That Cannot Be Changed Without Discussion

- All modals: `fixed inset-x-0 bottom-0` (never `flex items-end`)
- All inputs: 16px minimum font size
- Unsplash images: only on trip destination images, never on saves/entries
- Unified save sheet must never be removed or replaced
- `location_locked` must always be checked before any location update
- No emoji anywhere — text labels, Lucide icons, or badges only
- Card radius: 8px — not 16px, not 20px
- Save sheet uses `--bg-base` — dark, consistent with app theme
- Orange is always `--accent-primary` (#B8441E) — never `#ff8a4c` or any other variant
