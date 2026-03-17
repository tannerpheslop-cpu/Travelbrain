# DESIGN-SYSTEM.md — Youji Visual Identity & Component Spec

> Claude Code: Read this file alongside CLAUDE.md at the start of every session. This is the authoritative reference for all visual and styling decisions. When building or modifying any UI component, follow this spec exactly.

---

## Brand Philosophy

Youji's visual identity is rooted in the **traveler's notebook** metaphor — intentional, human, craft-oriented. The design should feel like a beautifully made tool that disappears into the content. We reject default AI/startup aesthetics (purple gradients, Inter font, generic card layouts) and instead build a visual language that is warm, typographic, and distinctly Youji.

**Core positioning:** "AI can recommend. Youji manages reality."

**Core tagline:** Plan together, explore together.

---

## Design Intensity Levels

Not every surface gets the same treatment:

**Hero moments** (full expression): Share cards, trip overview header, trip library hero card, empty states. These are the surfaces people screenshot. The analog aesthetic is loudest here.

**Supporting elements** (moderate treatment): Destination cards, category pills, source badges, metadata displays, filter bars, carousel cards, route chains. Distinctive but not distracting. The JetBrains Mono typography and copper accent carry the identity.

**Functional substrate** (clean modern): Text inputs, form elements, navigation, settings, modals, search bars. Clean, fast, invisible. The analog identity is present only as palette warmth and the typography pairing.

---

## Typography

### Font Stack

**Display / UI headings:** DM Sans (Google Fonts)
- Weights: 400, 500, 600, 700
- Usage: Page titles, destination names, button labels, body text, item titles, descriptions
- Character: Clean, geometric, slightly warm — avoids the coldness of Inter/Helvetica

**Mono / Metadata / Brand:** JetBrains Mono (Google Fonts)
- Weights: 400, 500, 600, 700, 800
- Usage: All metadata (dates, counts, stats), filter pills, category tags, source labels, the "youji 游记" brand mark, status badges, route chains, separators, section labels
- Character: The typewriter/mechanical texture of the brand. This is where the analog identity lives.

### Google Fonts Import

```
https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap
```

### Type Scale

| Element | Font | Size | Weight | Letter-spacing | Line Height |
|---|---|---|---|---|---|
| Page title (h1) | DM Sans | 32px | 700 | -0.5px | 1.2 |
| Hero trip name | DM Sans | 24px | 700 | -0.3px | 1.2 |
| Section title (h2) | DM Sans | 17-19px | 600-700 | -0.2px | 1.3 |
| Card title | DM Sans | 16-17px | 700 | -0.2px | 1.3 |
| Item title | DM Sans | 13px | 500 | 0 | 1.35 |
| Body text | DM Sans | 14px | 400 | 0 | 1.6 |
| Button label | DM Sans | 13px | 600 | 0 | 1 |
| Brand mark "youji 游记" | JetBrains Mono | 11px | 500 | 3px | 1 |
| Section label (e.g., "ROUTE") | JetBrains Mono | 10px | 500 | 1.5px | 1 |
| Metadata line (dates, counts) | JetBrains Mono | 11-12px | 400 | 0 | 1.4 |
| Category pill | JetBrains Mono | 9-10px | 500 | 0 | 1 |
| Source badge | JetBrains Mono | 10px | 500 | 0 | 1 |
| Status badge | JetBrains Mono | 9px | 600 | 0.5px | 1 |
| Filter button | JetBrains Mono | 12px | 400/600 | 0 | 1 |
| Chapter number (large watermark) | JetBrains Mono | 56-110px | 800 | 0 | 1 |
| Chapter number (inline) | JetBrains Mono | 13-28px | 800 | 0 | 1 |
| Country name (spaced) | JetBrains Mono | 11px | 700 | 2px | 1 |
| Route arrow separator | JetBrains Mono | 9-10px | 400 | 0 | 1 |

### Typography Rules

1. Country names in spaced uppercase: `J A P A N` — JetBrains Mono, 11px, weight 700, letter-spacing 2px, uppercase
2. Metadata separators use the `·` (middle dot) in `--color-text-faint`
3. Route chains use `→` arrow in JetBrains Mono 9-10px, color `--color-border-light`
4. Numbers in metadata ALWAYS use JetBrains Mono, never DM Sans
5. The brand mark "youji 游记" always renders in JetBrains Mono 500, 11px, letter-spacing 3px, uppercase, color `--color-text-faint`
6. Chapter/sequence numbers use JetBrains Mono 800 with leading zeros: `01`, `02`, `03`
7. Heading text NEVER uses JetBrains Mono — headings are always DM Sans
8. All-caps labels (section headers like "ROUTE") are JetBrains Mono 500, 10px, letter-spacing 1.5px, color `--color-text-faint`
9. Status badges are JetBrains Mono 600, 9px, letter-spacing 0.5px, uppercase

---

## Color System

### Core Palette — CSS Custom Properties

```css
:root {
  --color-accent: #c45a2d;
  --color-accent-light: #c45a2d10;
  --color-accent-med: #c45a2d22;
  --color-accent-shadow: rgba(196,90,45,0.25);

  --color-text-primary: #2a2a28;
  --color-text-secondary: #6b6860;
  --color-text-tertiary: #9e9b94;
  --color-text-faint: #b5b2ab;
  --color-text-ghost: #c5c2bb;
  --color-text-mist: #d5d2cb;

  --color-border: #e8e6e1;
  --color-border-light: #eceae5;
  --color-border-subtle: #f0eeea;
  --color-border-input: #e0ddd7;
  --color-border-dashed: #d5d2cb;

  --color-bg-page: #faf9f7;
  --color-bg-card: #ffffff;
  --color-bg-muted: #f5f3f0;
  --color-bg-tinted: #f8f7f4;
  --color-bg-pill: #f0eeea;
  --color-bg-pill-dark: #eeece8;
}
```

### Color Rules

1. The copper accent (`--color-accent`) is used sparingly: primary buttons, active/selected states, destination labels, links, hover title states. Never as a large background fill.
2. No opacity layers on text. All text colors are flat hex values.
3. Background is always warm off-white (`--color-bg-page`), never pure white. Cards are `--color-bg-card` (white).
4. There is no secondary accent color. The entire palette is copper + warm neutrals.
5. Hover on cards: border shifts to `--color-accent` at ~25% opacity, card lifts 2px with increased shadow.
6. Hover on titles within cards: text color transitions to `--color-accent`.

---

## Spacing & Layout

### Spacing Scale

| Token | Value | Usage |
|---|---|---|
| `--space-xs` | 4px | Inline element gaps, internal pill padding |
| `--space-sm` | 6px | Between pills, between filter buttons |
| `--space-md` | 10px | Between items in a list, carousel card gap |
| `--space-lg` | 14-16px | Between cards in a grid, section margin-bottom |
| `--space-xl` | 20px | Page horizontal padding, card internal padding |
| `--space-2xl` | 24-28px | Section separations, header padding-bottom |
| `--space-3xl` | 36px | Page top padding |

### Layout Patterns

**Max width:** 780-860px centered with 20px horizontal padding.

**Page structure:** Header (brand mark + page title + metadata + actions) → Divider (1px) → Content area

**Card border radius:** 12-16px for page-level cards, 10-12px for smaller cards, 3-6px for pills and badges.

**Grid layouts:**
- Inbox: `repeat(auto-fill, minmax(240px, 1fr))`, gap 12px
- Items within expanded destinations: 2-column grid
- Trip library: Hero card full-width, then horizontal carousels

**Horizontal carousels:** `overflow-x: auto`, scrollbar hidden, `margin: 0 -20px`, `padding: 0 20px` for edge-to-edge scroll.

---

## Component Patterns

### Brand Mark

Appears at the top of every page:

```
youji 游记
```

JetBrains Mono 500, 11px, letter-spacing 3px, uppercase, color `--color-text-faint`.

### Page Header

```
[Brand mark]
[Page title — DM Sans 32px 700]
[Metadata line — JetBrains Mono 12px 400, separated by · in --color-text-mist]
[Action buttons — below metadata with --space-2xl gap]
```

Action buttons are NEVER on the same line as the page title. They sit below.

### Primary Button

Background: `--color-accent`. Color: white. Border: none. Border-radius: 8px. Padding: 9px 20px. Font: DM Sans 13px 600. Box-shadow: `0 1px 4px --color-accent-shadow`.

### Secondary Button

Background: `--color-bg-card`. Color: `--color-text-secondary`. Border: 1px solid `--color-border-input`. Border-radius: 8px. Padding: 9px 20px. Font: DM Sans 13px 500.

### Filter Pill (inactive)

Background: transparent. Border: 1px solid `--color-border-input`. Color: `--color-text-secondary`. Border-radius: 6px. Padding: 5px 14px. Font: JetBrains Mono 12px 400.

### Filter Pill (active)

Background: `--color-accent-light`. Border: 1.5px solid `--color-accent`. Color: `--color-accent`. Font-weight: 600.

### Category Pill

Background: `--color-bg-pill`. Color: `--color-text-tertiary`. Border-radius: 3-4px. Padding: 2-3px 6-8px. Font: JetBrains Mono 9-10px 500.

### Category Pill (dominant/highlighted)

Background: `--color-accent-med`. Color: `--color-accent`.

### Status Badge

Font: JetBrains Mono 9px 600. Letter-spacing: 0.5px. Uppercase. Padding: 3px 8px. Border-radius: 4px.

- Planning: color `--color-accent`, bg `--color-accent-med`
- Draft: color `--color-text-tertiary`, bg `--color-bg-pill-dark`
- Aspirational: color `--color-text-faint`, bg `--color-bg-muted`

### Source Icon (text-based)

Rendered in JetBrains Mono inside 28-32px square container, bg `--color-bg-pill`, color `--color-text-tertiary`, border-radius 6-7px:

- TikTok: `♫`
- Instagram: `◎`
- URL/website: `↗`
- Manual note: `✎`
- Screenshot: `▣`

### Card (standard)

Background: `--color-bg-card`. Border: 1px solid `--color-border`. Border-radius: 12px. Transition: all 0.15s ease.

Hover: border tints copper, shadow increases (`0 4px 16px rgba(0,0,0,0.05)`), `translateY(-2px)`, title transitions to `--color-accent`.

### Card (hero)

Same as standard but: border-radius 16px, larger hover shadow (`0 8px 28px rgba(0,0,0,0.06)`), contains left panel with tinted background for flags/visual identity.

### Card (add/new — dashed)

Border: 1.5-2px dashed `--color-border-dashed`. Background: transparent. Border-radius: 12-14px. Hover: border transitions to copper, bg transitions to `--color-accent-light`.

### Watermark Chapter Numbers

Large JetBrains Mono 800 numbers positioned absolute top-right of card containers. Size varies: 56px (carousel), 80px (grid), 110px (hero). Default color: `--color-border-subtle` (nearly invisible). Hover: transitions to `--color-accent-med`. pointer-events: none.

### Route Chain

```
Tokyo → Kyoto → Osaka → Hiroshima

City name: DM Sans 12-13px 500, color --color-text-secondary
Arrow: JetBrains Mono 9-10px 400, color --color-text-mist, margin 0 5-6px
```

Wraps with flexbox. In compact contexts: show first 4 destinations then `+N` in `--color-text-ghost`.

### Metadata Line

```
Apr 1–18 · 18d · 6 destinations · 15 saves

Font: JetBrains Mono 11-12px 400
Color: --color-text-tertiary
Separator: · in --color-text-mist
```

### Horizontal Carousel Section

Section title: DM Sans 17px 600. Description: JetBrains Mono 11px 400. Count right-aligned in `--color-text-faint`. Cards in flex row, gap 14px, overflow-x auto. Always include a dashed "add" card at the end.

### Card Bottom Metadata Bar

Padding: 8-12px 16-20px. Border-top: 1px solid `--color-border-subtle`. Background: `--color-bg-page`. Flex, space-between.

---

## Interaction States

### Hover

- Cards: lift 2px, border tints copper, shadow increases, title shifts to copper
- Primary buttons: background darkens slightly
- Dashed cards: border transitions to copper, bg to accent-light
- All transitions: 0.15s ease

### Active/Selected

- Filter pills: copper border, copper text, accent-light background
- Tabs: copper text, 2px solid copper bottom border
- Expanded destination accordion: copper border tint, chapter number panel fills copper with white number

### Empty States

Centered. Icon in JetBrains Mono 24-32px, color `--color-text-faint`, opacity 0.25-0.4. Primary message DM Sans 14px `--color-text-faint`. Secondary message JetBrains Mono 12px `--color-text-ghost`. 60px+ vertical padding.

---

## Page-Specific Patterns

### Inbox (Travel Brain)

- Grid view: CSS grid `repeat(auto-fill, minmax(240px, 1fr))`, gap 12px
- List view: vertical stack with hover background tint
- Grouped by country with flag + spaced-uppercase country header (JetBrains Mono 700, 11px, letter-spacing 2px)
- Search bar at top of header
- Filters below search: Unassigned, Trip dropdown, City dropdown (NOT category filters — categories appear as pills on individual cards only)
- Grid/list toggle in top-right of filter row
- Floating + save button (fixed bottom-right, accent color, circular, 52px, shadow `0 4px 16px rgba(196,90,45,0.35)`)
- Brand mark "youji 游记" above page title
- Page metadata line: "{N} saves · {N} countries" in JetBrains Mono

### Trips Library

- Brand mark + "Trips" page title + metadata + "+ New Trip" primary button
- Hero card at top (full-width, taller, left panel with flag + chapter watermark 01, right panel with trip details including route chain, metadata, category pills, "Up next" label in accent)
- Below hero: horizontal carousels grouped by planning stage: "Planning", "Drafts", "Someday"
- Each carousel has title (DM Sans 17px 600), description (JetBrains Mono 11px), count, scrollable row of 260px-wide cards
- Each carousel ends with a dashed "+ New trip" card
- Carousel cards: flag, watermark number, trip name, compact route chain, bottom metadata bar with stats + category pills

### Trip Overview (single trip)

- Brand mark + trip name + metadata (flag, days, destinations, saves) + action buttons below
- Tab navigation: Destinations | Itinerary | Logistics (copper underline on active)
- Destinations tab: collapsible accordion sections with chapter number panels (72px wide left strip, JetBrains Mono 28px 800). Collapsed: number panel muted, destination name, dates, saves count, category pills, day range, chevron. Expanded: number panel fills copper with white number, items list with source icons, category pills, "Add from Inbox" dashed button
- Country grouping headers between destination groups (flag + spaced country name)
- Itinerary tab: timeline view with vertical line, day dots, destination headers with chapter numbers, drop zones per day
- Logistics tab: empty state with ✎ icon
- Dashed "+ Add another destination" card at bottom

### Share Card

- Compact centered card on tinted background
- "Shared by" with avatar initial + name
- Trip name, metadata, numbered destination list
- Two CTAs: "Fork this trip" (primary) + "Comment" (secondary)
- Footer: brand mark + tagline
- Below card: soft CTA for non-users

---

## What This System Does NOT Cover Yet

- Dark mode
- Mobile-specific layouts (responsive behavior, bottom nav, touch targets)
- Animation/motion beyond basic hover transitions
- Illustrated icons (current source icons are text characters)
- Onboarding flow UI
- Companion mode interaction UI details
- Settings/account pages
- Error and loading state designs

These should follow the same intensity principles: functional surfaces stay clean, hero moments get full expression.
