# Youji — Visual Identity System v2

> **Status:** Draft — April 2026
> **Supersedes:** youji-brand-visual-identity-system.md (March 2026), DESIGN-SYSTEM.md
> **Ship:** Dark mode first. Light mode tokens defined but not implemented.
>
> **This is NOT a Builder prompt.** This is a design spec for alignment before implementation.

---

## 1. The Palette

Five colors. Every element in the app uses one of these.

| Hex       | Name         | Role                                           |
|-----------|--------------|-------------------------------------------------|
| #0A0C12   | Sky          | Deepest background, nav bar, Travel Graph canvas |
| #0d1a2a   | Sheet        | Sheet surfaces, main content layer               |
| #023661   | Deep Blue    | Category pills, selected states, toggle fills    |
| #3F3A42   | Dark Gray    | Cards, elevated surfaces, source preview cards   |
| #76828E   | Medium Gray  | Tertiary text, inactive icons, location pills    |
| #B8441E   | Orange       | FAB, active nav, badges, primary buttons, restaurant pills |

Orange (#B8441E) replaces copper (#c45a2d) everywhere — FAB, markers, route lines, badges, active states.

Note: #023661 is used for pill fills and selected states, NOT as a surface color. The sheet surface is #0d1a2a (barely blue).

---

## 2. Dark Mode Tokens (Ship First)

### Backgrounds

```
Sky:              #0A0C12     Nav, page bg, Travel Graph, input fields
Sheet:            #0d1a2a     Sheet surfaces, main content layer (barely blue)
Cards:            #3F3A42     Elevated cards, source preview cards, photo placeholders
Card hover:       #4a454e     Subtle lift on interaction
```

Three distinct depth layers: sky → sheet → cards. Every surface is clearly one of these three.

### Text

```
Primary:          #e4e8f0     Titles, names, headings
Secondary:        #a8c4dc     Descriptions, labels, metadata (warm blue tint)
Tertiary:         #76828E     Hints, placeholders, inactive labels
On accent:        #ffffff     Text on orange buttons and badges
```

### Accent

```
Orange:           #B8441E     FAB, active nav, primary buttons, restaurant pills, badges
Orange muted:     rgba(184, 68, 30, 0.15)    Orange pill backgrounds
Orange pressed:   #a03b1a     Tap/press state
```

### Stars (Travel Graph)

```
Dim:              #76828E     Faint stars
Default:          #c8d0d8     Standard stars
Bright:           #e4e8f0     Bright stars, selected
Claimed:          #B8441E     Star claimed by a Trip (orange)
```

### Borders

```
Subtle:           rgba(118, 130, 142, 0.06)    Faintest dividers between list items
Default:          rgba(118, 130, 142, 0.1)     Standard borders, section separators
Strong:           rgba(118, 130, 142, 0.2)     Emphasized borders, pill outlines on blue bg
```

### Functional

```
Success:          #5b8a72
Warning:          #B8441E     (orange doubles as warning)
Error/Delete:     #c44a3d     Destructive actions
```

---

## 3. Light Mode Tokens (Ship Later)

```
Sky:              #0A0C12     Starry sky always stays dark
Sheet:            #e8eaed     Light gray
Cards:            #ffffff     White
Primary text:     #0A0C12     Near black
Secondary text:   #76828E     Medium gray
Tertiary text:    #a0aab4     Light gray
Accent:           #B8441E     Same orange
Category pills:   #023661 / #76828E / #3F3A42 solid fills with light text
Nav:              #f0f1f3
```

---

## 4. Typography

### Fonts

```
Body:             DM Sans            All UI text
Monospace:        JetBrains Mono     Counters, stats, numerical data
```

No serif. All sans-serif throughout.

### Scale

```
Page title:       18px, weight 500
Card title:       11-12px, weight 500
Body text:        13px, weight 400
Description:      12px, weight 400
Labels:           9-10px, weight 500, uppercase, letter-spacing 0.06-0.08em
Pills:            8-9px, weight 500
Counter numbers:  36px, weight 500, JetBrains Mono
Stats:            10px, weight 400, JetBrains Mono
```

### Rules

- Minimum font size: 16px on all input fields (iOS zoom prevention)
- No emoji anywhere — use text labels, Lucide icons, or badges
- Section headers: uppercase, letter-spaced, secondary color
- Wordmark "youji": 15px, weight 500, primary text color

---

## 5. Spacing and Density

### Grid

```
Card grid gap:    6px         Tight density — 6 cards visible on screen
Card padding:     8px         Internal padding within cards
Section gap:      14px        Between section header and next section header
List item gap:    6px padding Compact list rows
Page padding:     12px        Sheet edge to content
```

### Rhythm

```
Between sections:         14px
Between label and content: 8px
Between card title and pills: 4px
Between pills:            3px
Sheet top padding:        12px
```

---

## 6. Corner Radii

```
Cards:            8px        Horizon gallery cards, source preview cards
Sheet:            16px       Top corners of the sheet overlay
Pills:            99px       Always fully rounded
FAB:              50%        Circle
Inputs:           8px        Text inputs, textareas
Photos in cards:  0px        Photos bleed to card edges (top)
Photos standalone: 6px       Thumbnails in list rows
Buttons:          8px        Standard buttons
```

---

## 7. Pills

**All pill text is capitalized** — first letter uppercase. "Historical" not "historical", "Restaurant" not "restaurant", "Beijing" not "beijing".

### Category pills

Solid fill using palette colors. On the dark sheet (#0d1a2a), blue pills need slight differentiation.

```
Default categories (temple, park, historical, hike, museum, etc.):
  Background: #023661
  Text:       #a8c4dc
  Border:     none (sufficient contrast against #0d1a2a sheet)

Restaurant / food:
  Background: rgba(184, 68, 30, 0.15)
  Text:       #B8441E
  Border:     none

Nightlife:
  Background: rgba(184, 68, 30, 0.15)
  Text:       #B8441E
  Border:     none
```

Orange is reserved for food/nightlife categories. All other categories use the blue pill. This creates a simple two-tone system — blue for places, orange for food.

### Location pills

```
Background: rgba(118, 130, 142, 0.2)
Text:       #76828E
Border:     none
```

### Pill sizing

```
Font:       8-9px, weight 500
Padding:    1px 6px (in cards), 2px 8px (in detail views)
Radius:     99px
```

---

## 8. Cards

### Horizon gallery cards

```
Background:       #3F3A42
Border radius:    8px
Photo:            Top of card, no radius (bleeds to card edges), aspect ~1.1:1
Title:            11px, weight 500, #e4e8f0
Pills:            Below title, 4px gap from title, 3px gap between pills
Card padding:     8px (below photo)
```

### Route cards (grouped saves)

Same as gallery cards plus:
```
Badge:            Top-right corner, "12 places"
                  Background: #B8441E, text: white, 8px font, 1px 6px padding, 99px radius
Source line:       Below title, 8px font, #76828E (e.g., "cntraveler.com")
```

### Source preview cards (in detail views)

```
Background:       #3F3A42
Border radius:    8px
Padding:          10px
Thumbnail:        36-40px square, 6px radius, left side
Title:            11-12px, weight 500, #e4e8f0, 1 line ellipsis
Domain:           9px, #76828E
Link icon:        Right side, 12px, #76828E
```

---

## 9. Surfaces

### Three-layer depth system

```
Layer 1 (sky):    #0A0C12    The deepest void. Nav bar. Travel Graph.
Layer 2 (sheet):  #0d1a2a    The main content surface. Always visible below cards.
Layer 3 (cards):  #3F3A42    Everything that sits ON the sheet — cards, inputs, previews.
```

This replaces the old system where the sheet was light cream (#faf8f4). ALL sheets are now dark.

### Sheet behavior

- Horizon: sheet overlays the Travel Graph, #0d1a2a background, 16px top radius
- Trip page: sheet overlays the map, same #0d1a2a background
- Save detail: full-screen #0d1a2a with #3F3A42 for cards within it
- FAB menu: #0d1a2a background

### Input fields

```
Background:       #0A0C12    (sky color — creates depth against the blue sheet)
Border:           0.5px solid rgba(118, 130, 142, 0.15)
Text:             #e4e8f0
Placeholder:      #76828E
Focus border:     rgba(168, 196, 220, 0.3)
```

---

## 10. Icons

```
Library:          Lucide
Stroke weight:    2px (standard), 1.5px (dense contexts)
Size:             16px default, 13-14px in toolbars, 20px in FAB menu
Active color:     #B8441E
Inactive color:   #76828E
On blue surface:  #a8c4dc
```

---

## 11. Motion

### Principles

- Atmospheric surfaces (stars, graphs) move organically — soft easing, gentle drift
- Functional surfaces (sheets, cards, buttons) move decisively — quick, clean
- Nothing blinks, flashes, or demands attention
- Progressive reveals: items appear one at a time with 200ms stagger

### Timing

```
Sheet snap:       200ms ease-out
Card tap:         100ms scale(0.98)
Item slide-in:    300ms ease-out (translateY 12px → 0, opacity 0 → 1)
Pill appear:      150ms fade
Counter flip:     200ms per digit
Star fade-in:     400ms, staggered 100-150ms between stars
Section collapse: 200ms ease
Photo lazy load:  200ms opacity fade
```

### Easing

```
Standard:         ease-out (for entrances)
Bounce:           never
Spring:           only for sheet snap physics
```

---

## 12. Bottom Navigation

```
Background:       #0A0C12 (sky)
Border top:       0.5px solid rgba(118, 130, 142, 0.08)
Height:           48px
Icon size:        16px
Label size:       8px
Active:           #B8441E (icon + label)
Inactive:         #76828E
```

---

## 13. Toast Notifications

```
Background:       #3F3A42
Text:             #e4e8f0
Border radius:    8px
Padding:          10px 16px
Position:         Top center, below status bar
Auto-dismiss:     2 seconds
```

---

## 14. Buttons

### Primary (copper/orange)

```
Background:       #B8441E
Text:             #ffffff
Border radius:    8px
Padding:          12px 20px
Font:             14px, weight 500
Pressed:          #a03b1a
Disabled:         opacity 0.5
```

### Secondary (outline)

```
Background:       transparent
Border:           0.5px solid rgba(118, 130, 142, 0.2)
Text:             #a8c4dc
Border radius:    8px
Pressed bg:       rgba(118, 130, 142, 0.1)
```

### Destructive

```
Background:       transparent
Text:             #c44a3d
Border:           0.5px solid rgba(196, 74, 61, 0.2)
Pressed bg:       rgba(196, 74, 61, 0.1)
```

---

## 15. FAB

```
Size:             44px
Shape:            Circle (border-radius: 50%)
Background:       #B8441E
Icon:             + (plus), white, 18px, stroke-width 2.5
Position:         Bottom-right, 14px from edge, above nav bar
```

---

## 16. Surface Application Map

| Surface              | Background | Text primary | Text secondary | Cards/elevated |
|----------------------|------------|-------------|----------------|----------------|
| Horizon page         | #0A0C12    | #e4e8f0     | #a8c4dc        | #3F3A42        |
| Horizon sheet        | #0d1a2a    | #e4e8f0     | #a8c4dc        | #3F3A42        |
| Trip map             | Mapbox dark| #e4e8f0     | #a8c4dc        | #3F3A42        |
| Trip sheet           | #0d1a2a    | #e4e8f0     | #a8c4dc        | #3F3A42        |
| Save detail          | #0d1a2a    | #e4e8f0     | #a8c4dc        | #3F3A42        |
| Route detail         | #0d1a2a    | #e4e8f0     | #a8c4dc        | #3F3A42        |
| Unpack flow          | #0A0C12    | #e4e8f0     | #a8c4dc        | #3F3A42        |
| FAB menu             | #0d1a2a    | #e4e8f0     | #a8c4dc        | —              |
| Bottom nav           | #0A0C12    | #B8441E (active) | #76828E (inactive) | —     |
| Toast                | #3F3A42    | #e4e8f0     | —              | —              |

---

## 17. What Changes From v1

| Element              | v1 (March 2026)        | v2 (April 2026)         |
|----------------------|------------------------|-------------------------|
| Accent color         | Copper #c45a2d         | Orange #B8441E          |
| Sheet background     | Light cream #faf8f4    | Dark navy #0d1a2a       |
| Card background      | #1c2035                | #3F3A42                 |
| Sky background       | #080c18                | #0A0C12                 |
| Text secondary       | #8088a0                | #a8c4dc                 |
| Pill style           | Copper tint bg         | Solid blue #023661 / orange tint |
| Pill text            | Lowercase              | Capitalized (first letter) |
| Card border radius   | Mixed (8-12px)         | 8px everywhere          |
| Grid gap             | 8-10px                 | 6px                     |
| Sheet style          | Light on dark           | Dark on dark (navy on black) |
| Sunset progression   | Golden hour → night     | TBD — may simplify      |

---

## 18. Resolved Decisions (continued)

- **Sunset progression:** Keep it, update colors to align with new palette. Warm ambers shift to subtle warm tones that complement the #0d1a2a sheet.
- **Mapbox map style:** Update to use #0A0C12 / #0d1a2a tones for land, water, and borders.
- **Photo gradient overlay:** Yes — subtle dark gradient at bottom of card photos where text sits, ensuring legibility on light photos.

## 19. Resolved Decisions

- **FAB menu surface:** #0d1a2a (matches sheet)
- **Trip markers and route lines:** Orange #B8441E replaces copper everywhere including map
- **Sheet color:** #0d1a2a (barely blue), not #023661 (too saturated for surfaces)
- **Orange shade:** #B8441E (warm dark), not #DB5227 (too vibrant)
- **Pill capitalization:** First letter uppercase always
- **Kinetic buttons:** Kept — press states, hover effects, smooth transitions all stay
- **Light mode:** Deferred. Tokens defined but not shipping yet
