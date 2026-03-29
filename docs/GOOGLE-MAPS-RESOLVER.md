# Google Maps Mobile Share Link Resolution

**Status:** Resolved — March 29, 2026
**Impact:** All Google Maps locations shared from iOS Google Maps app now resolve correctly

---

## The Problem

When a user shares a Google Maps location from their iPhone, the share generates a short link like:
```
https://maps.app.goo.gl/A8tH3XcFD6rBpCcu5?g_st=ic
```

Pasting this into Youji's save flow showed "Google Maps location" with no place name, no photo, and no coordinates. The same location shared from a desktop browser worked perfectly.

## Root Cause

Google Maps mobile share links use **Firebase Dynamic Links** — a system designed for mobile app deep linking, not web scraping.

| Link type | How it redirects | Server-side resolvable? |
|-----------|-----------------|----------------------|
| Desktop share | HTTP 301/302 redirect to full `google.com/maps/place/...` URL | Yes |
| Mobile share (iOS) | Returns an HTML/JavaScript app page. The real Maps URL is resolved via client-side JS execution. No Maps URL exists anywhere in the HTTP response or HTML source. | No |

We attempted 6 different server-side strategies before confirming this was impossible without a browser:

1. HTTP redirect following (HEAD, GET, manual chain) — returns 200, not a redirect
2. Multiple User-Agent headers (Chrome, Safari, curl) — all get the JS page
3. HTML parsing for `window.location`, meta refresh, href patterns — no Maps URL in HTML
4. OG meta tag extraction — not present in the Firebase page
5. Stripping tracking parameters (`?g_st=ic`) — same result without the parameter
6. Firebase Dynamic Links API — requires an API key we don't have for Google's links

## The Solution

Deployed a **headless browser microservice** on Google Cloud Run that resolves short URLs by actually navigating to them in Chromium.

### Architecture

```
User pastes maps.app.goo.gl link
        ↓
Supabase Edge Function (extract-metadata)
        ↓
Tier 1: Try HTTP redirect (free, fast, ~100ms)
        ↓ fails for mobile links
Tier 2: Call Cloud Run URL Resolver (~3-5s)
        ↓
Cloud Run: Puppeteer opens the link in headless Chromium
        ↓ Chromium executes the JavaScript redirect
Cloud Run returns: google.com/maps/place/O.POism+台北中山店/@25.05,121.52,...
        ↓
Edge Function parses the full Maps URL → extracts place name + coordinates
        ↓
Google Places enrichment runs → real photo, category, precise location
        ↓
Entry saved with place as hero identity
```

### Performance

| Metric | Value |
|--------|-------|
| Desktop link (Tier 1 only) | ~200ms |
| Mobile link (Tier 1 + Tier 2) | ~4-6 seconds |
| Cold start (first request after idle) | ~8-10 seconds |
| Warm request | ~3-5 seconds |

The save flow is not blocked — metadata extraction runs asynchronously after the save is confirmed. The user sees the save succeed immediately; the preview enriches in the background.

### Cost

| Component | Cost |
|-----------|------|
| Cloud Run (scale-to-zero) | ~$0-2/month at current usage |
| Per request | ~$0.00001 (512Mi-1Gi, <10s) |
| Google Places enrichment | $0.032-0.039 per unique place (cached after first lookup) |

The resolver only activates for `maps.app.goo.gl` links that fail HTTP redirect — desktop links never hit it. The domain allowlist prevents abuse.

### Infrastructure

- **Service:** Google Cloud Run (`url-resolver`)
- **Region:** us-central1
- **Container:** Node.js + Puppeteer + headless Chromium
- **Memory:** 1Gi (Chromium requirement)
- **Scaling:** 0-3 instances (zero when idle)
- **Auth:** API key via `x-api-key` header
- **Supabase secrets:** `URL_RESOLVER_ENDPOINT`, `URL_RESOLVER_API_KEY`

### Domain Allowlist

The resolver only accepts URLs from these domains (all others rejected with 403):
- maps.app.goo.gl
- goo.gl
- t.co (Twitter/X)
- vm.tiktok.com
- pin.it (Pinterest)
- redd.it (Reddit)
- bit.ly

This can be expanded if other platforms have similar resolution issues.

## What Users Experience Now

| Scenario | Before | After |
|----------|--------|-------|
| Share from iPhone Google Maps | "Google Maps location" — no name, no photo | Full place name, real photo, correct category, precise coordinates |
| Share from desktop browser | Worked correctly | Still works (unchanged, still fast) |
| Share a full maps URL (not short link) | Worked correctly | Still works (unchanged) |

## Files Changed

| File | Change |
|------|--------|
| `cloud-functions/url-resolver/` | New Cloud Run service (Express + Puppeteer) |
| `supabase/functions/extract-metadata/index.ts` | Two-tier redirect resolution, headless resolver integration |
| `src/__tests__/unit/platform-handlers.test.ts` | Tests for Google tracking param stripping |

## Future Considerations

- The headless resolver can also handle other platforms that use JS-based redirects if they arise
- Chrome cold start (~8-10s) could be reduced by setting `--min-instances 1` (~$5/month to keep one instance warm)
- The resolver could be extended to extract page content (not just the final URL) for platforms that block server-side scraping entirely
