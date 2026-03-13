# Youji Product Backlog

These are ideas for future development. They should NOT be implemented during MVP development unless explicitly approved. This document is a parking lot, not a to-do list.

---

## Tier 2 — Core Loop Enhancements

### Friend Activity Recommendations

- Companions can submit activity recommendations to a trip (not just comment/vote)
- Contributed items appear as suggestions (ghost cards) that the trip owner accepts or dismisses
- Users can cherry-pick individual items from friends' trips into their own (atomic fork, not full trip fork)
- Prompted recommendations: trip owner can send "You know Tokyo — what should we do?" to a friend

### Accommodations Layer

- Hotels/hostels as a distinct content layer within destinations
- Own small section at top or bottom of each destination section on trip page
- Can enter the system two ways: saved inspirationally via inbox (auto-tagged as accommodation from domain), or configured directly within a destination during planning
- Typically one accommodation per destination per date range

### Transport Connectors

- Transport as connective tissue between destinations (flights, trains, buses, drives)
- Belongs to the transition between two destinations, not to either one
- Visually represented as illustrated dotted pathway with brief details (e.g., "Train · 12 hours")
- Text-based entry, not a booking integration

### Visa & Travel Advisories

- Set home country once in user profile
- Passive awareness of visa requirements per destination country
- Altitude/health warnings (e.g., supplemental oxygen for high-altitude destinations)
- Use free data sources (passport index APIs, government travel advisory feeds)

### Rapid Capture Enhancements

- Multi-add entry: type destination, press Enter, repeat
- Multi-line paste: paste a list of place names, auto-split into draft entries
- Draft-first, resolve-second model for Google Places
- Designed for blog-driven manual extraction and friend recommendation lists

---

## Tier 3 — Monetization & Growth

### Trip Diary / Completion Layer

- After trip dates pass, prompt user to rate/tag activities ("went here," "skipped," "must go back")
- Lightweight trip summary generation from tagged activities
- Photo attachment to completed activities
- Shareable trip completion stories
- A completed trip with diary content is more valuable than a planned trip (feeds into marketplace)

### Marketplace

- Users can sell their trip itineraries to strangers via an in-app marketplace
- Fork/adopt for friends remains free; marketplace is for strangers via creator listings
- Creators: influencers, travel bloggers, budget travelers, tastemakers
- Buyers: people who don't want to plan, want a shortcut to a proven itinerary
- Purchased trips fork into buyer's account as a living plan (not a PDF)
- Creators can embed external content (YouTube video, Substack link) as social proof on the listing
- Rich preview before purchase: destination count, day count, map overview, creator's embedded content, but not the full itinerary
- Diary entries are NOT required to sell a trip — external social proof (YouTube, blog) is sufficient
- Budget travel angle: "I traveled Asia for $30/day, buy my trip for $20"
- Second growth loop: creator promotes Youji listing on their platform → audience buys → new Youji users
- Revenue split TBD (industry standard rates)

### AI Features (Paid Tier)

- Paste travel blog → auto-extract destinations, hotels, activities, restaurants
- Auto-generate draft trip from long-form content
- Route optimization suggestions
- Smart itinerary ordering

---

## Tier 4 — Future Exploration

### On-Trip Features

- Activities near you (surface closest saved activity to user's current location)
- Offline access to itinerary and saved items
- Booking vault (store confirmations, tickets)

### Discovery

- Browse public/marketplace trips
- Trending destinations
- Pre-populated historical/themed trips (e.g., Silk Road) — editorial content, only if user-generated supply exists

### Onboarding Wow Moment

- Guided first save: prompt user to add 5+ places they dream about visiting
- System detects geographic cluster and suggests "Looks like you're building a trip in Japan"
- One-tap trip creation from cluster
- This is the moment users understand the product

### Living Map Cues (Advanced)

- Subtle visual connectors between nearby inbox items
- "You have 4 saves near Lijiang — create a trip?" prompts in inbox
- Journey emergence UI that reveals trips forming from saves
- Animated path lines, directional flow hints

### Illustrated Icon System (Full Version)

- Replace Lucide placeholder icons with custom graphite-style illustrations
- Tier 1: ~25–30 core category icons (mountain, restaurant, temple, hotel, etc.)
- Tier 2: Regional food/cultural variants (ramen, dumplings, tacos, curry)
- Tier 3: Rare landmark-specific icons (Great Wall, Eiffel Tower, Mt. Fuji)
- Generate via AI image tools, curate for consistent style
- Style: monochrome graphite, consistent line weight, minimal shading

### Other Ideas

- Campsite/hiking API integration with trail connectors
- Text block parsing via Claude API (simpler version of full blog parsing)
- Import from Google Maps saved places
- Overlap detection (notify friends when future trips coincide in same city)
- Calendar export and sync
- Schedule conflict detection
