# Youji Product Backlog

These are ideas for future development organized by strategic priority. They should NOT be implemented during current development unless explicitly approved.

---

## Tier 1 — Next Priority (after current polish work)

### Google Maps Export
- Export destinations and activities as a Google Maps list or directions URL
- Bridges Youji (planning) with Google Maps (navigation)
- Youji does not build its own navigation

### Booking Information Storage
- Accommodations per destination: hotel name, address, check-in/check-out, confirmation number, booking reference link, notes
- Transport between destinations: flight/train/bus details, departure/arrival times and locations, confirmation number, booking reference link, notes
- Transport displayed as connective tissue between destination sections (illustrated dotted pathway with logistics attached)
- Manual entry initially; Gmail auto-import later
- Youji stores and displays booking info but does NOT build a booking engine

### Trip Diary / Completion Layer
- Post-trip rating/tagging of activities ("went here," "skipped," "must go back")
- Trip summary generation
- Photo attachment to completed activities
- Powers the social intelligence layer (completed trips visible to friends)
- Powers marketplace quality signals
- IMPORTANT: This is a prerequisite for the marketplace — completed trips with ratings and diary content are the product worth selling. Build this before the marketplace.

---

## Tier 2 — Core Loop Enhancements

### Social Travel Intelligence — Phase 1
- Planning-the-same-region matching: notify users when friends are planning trips to the same country/region (not just city/date overlap)
- Expert friend routing: "Sarah visited Litang in 2025 — view her notes" indicators on destination detail pages
- "Steal this" from friends' completed trips: browse and pull activities from friends' past trips into your own
- City-level friend aggregation: "Your friends in Kyoto" showing aggregated activities from friends' completed trips
- Horizon "Friends' Activity" toggle: separate view showing friends' trip signals (creations, completions, interests) with actions

### Social Travel Intelligence — Phase 2
- "Friends are going" contextual discovery: ambient signals on Horizon ("3 friends have saves in Japan")
- Recommendation propagation: friends' ratings on completed trip activities surface on your planned trips for same destinations
- Prompted friend recommendations: "You know Tokyo — what should we do?" sent to specific friends

### Linked Fork Updates
- Forked trips remain linked to source trip
- Pull-based update notifications: "Marcus added a restaurant in Kyoto — add to yours?"
- Fork owner chooses which updates to pull — never automatic
- Unlink option to make fork fully independent
- Applies to both friend forks and marketplace purchases

### Friend Activity Recommendations
- Companions can submit activity recommendations to a trip (not just comment/vote)
- Contributed items appear as ghost cards the trip owner accepts or dismisses
- Atomic item cherry-picking from friends' trips into your own
- Prompted recommendations flow

### Accommodations Layer
- Hotels/hostels as distinct content layer within destinations
- Own section at top or bottom of destination detail page
- Two entry paths: saved via Horizon (auto-tagged from domain), or added via "Add a place" in destination
- Typically one per destination per date range

### Transport Connectors
- Transport between destinations (flights, trains, buses, drives)
- Belongs to the transition between two destinations
- Illustrated dotted pathway with logistics details (flight number, duration, times)
- Text-based entry initially, Gmail auto-import later

### Visa & Travel Advisories
- Set home country in profile
- Passive visa requirement awareness per destination country
- Altitude/health warnings
- Free data sources (passport index APIs, government advisory feeds)

### Rapid Capture Enhancements
- Multi-add entry improvements
- Draft-first resolution improvements
- Blog text extraction via Claude API (paid feature)

---

## Tier 3 — Marketplace (requires user base + completed trip supply)

The marketplace should NOT be built until there is a meaningful base of users creating and completing quality trips. The sequence is: polish product → get users → users create and complete trips (using the diary/completion layer from Tier 1) → launch marketplace with real inventory.

### Itinerary Marketplace
- Users sell trip itineraries to strangers via in-app marketplace
- Fork/adopt for friends remains free; marketplace is for stranger-to-stranger commerce
- Creators: influencers, travel bloggers, budget travelers, tastemakers
- Buyers: people who don't want to plan, want a shortcut to a proven itinerary
- Purchased trips fork into buyer's account as a living, editable plan
- Creators embed external social proof (YouTube, Substack links) on listing page
- Rich preview before purchase: destination count, day count, map overview, creator content — not the full itinerary
- Diary entries NOT required to sell — external social proof is sufficient
- Budget travel angle: "I traveled Asia for $30/day, buy my trip for $20"
- Linked fork model: creator updates propagate as pull-based notifications to buyers
- Revenue split TBD
- Competitive context: Mindtrip/Thatch is closest competitor (guide-based, not itinerary-based). Monitor their progress.

### Creator Tools (requires marketplace scale)
- Listing analytics (views, conversion, revenue)
- Promoted placement
- Creator verification badges
- Bulk upload tools

---

## Tier 4 — Future Exploration

### Social Travel Intelligence — Phase 3 (requires native app + scale)
- "Friends nearby" real-time detection during active trips
- Friend-powered destination ranking ("Top destinations among your friends this year")
- Collective taste mapping across friend network

### On-Trip Features
- Activities near you (surface closest saved activity to current location)
- Offline access to itinerary and saved items
- Booking vault (store confirmations, tickets)

### Discovery
- Browse public/marketplace trips
- Trending destinations
- Pre-populated historical/themed trips (editorial, only if user-generated supply exists)

### Onboarding Wow Moment
- Guided first save: add 5+ dream destinations rapidly
- Cluster detection → "Looks like you're building a trip in Japan"
- One-tap trip creation from cluster

### Living Map Cues (Advanced)
- Visual connectors between nearby Horizon items
- Journey emergence prompts in Horizon
- Animated path lines

### Illustrated Icon System
- Replace Lucide placeholders with custom graphite-style illustrations
- Tier 1: 25-30 core category icons
- Tier 2: Regional food/cultural variants
- Tier 3: Rare landmark-specific easter eggs

### Gmail Integration
- Auto-import flight confirmations, hotel bookings, travel scheduling from Gmail
- Parse confirmation emails into appropriate trip destinations

### Other Ideas
- Campsite/hiking API integration
- Calendar export and sync
- Schedule conflict detection
- Import from Google Maps saved places
- Day numbering without specific dates
- Route optimization algorithm

---

## Explicitly Out of Scope

These features are deliberately NOT being built. Other tools handle them better and building them would dilute Youji's focus.

- AI recommendation engine (AI is utility only — parsing, extraction — never the source of recommendations)
- Booking engine (no flight/hotel search, price comparison, or purchase processing)
- Hourly/minute-level time-slot scheduling
- Expense tracking / bill splitting
- Offline map downloads
- Real-time turn-by-turn navigation
- GPS journey tracking
- Social media feed (no infinite scroll, no passive content consumption)
- Price comparison tools
- Currency conversion
