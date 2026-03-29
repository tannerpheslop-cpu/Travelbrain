const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

// ── Config ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 8080;
const NAV_TIMEOUT = 10_000; // 10 seconds max for navigation
const API_KEY = process.env.RESOLVER_API_KEY || ''; // Set in Cloud Run env

/** Only resolve URLs from known short-link domains. */
const ALLOWED_DOMAINS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  't.co',
  'vm.tiktok.com',
  'pin.it',
  'redd.it',
  'bit.ly',
]);

/** Chromium args for minimal memory usage in containerized environments. */
const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-default-browser-check',
];

// ── Browser management ──────────────────────────────────────────────────────

let browser = null;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  console.log('[resolver] Launching Chromium...');
  browser = await puppeteer.launch({
    headless: 'new',
    args: CHROME_ARGS,
  });
  console.log('[resolver] Chromium launched');
  return browser;
}

// ── Authentication ──────────────────────────────────────────────────────────

function authenticate(req) {
  if (!API_KEY) return true; // No key set = development mode
  const provided = req.headers['x-api-key'] || req.query.key;
  return provided === API_KEY;
}

// ── Domain validation ───────────────────────────────────────────────────────

function isAllowedDomain(urlStr) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.replace(/^www\./, '');
    return ALLOWED_DOMAINS.has(host);
  } catch {
    return false;
  }
}

// ── Resolve endpoint ────────────────────────────────────────────────────────

app.post('/resolve', async (req, res) => {
  // Auth check
  if (!authenticate(req)) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }

  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'missing_url' });
  }

  // Domain allowlist
  if (!isAllowedDomain(url)) {
    return res.status(403).json({ success: false, error: 'domain_not_allowed' });
  }

  console.log(`[resolver] Resolving: ${url}`);
  const startTime = Date.now();

  let page = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    // Block unnecessary resources — we only need the final URL
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media', 'texttrack', 'manifest'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Set a mobile user agent (Google Maps short links may behave differently)
    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );

    // Navigate and wait for network to settle
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: NAV_TIMEOUT,
    });

    const resolvedUrl = page.url();
    const elapsed = Date.now() - startTime;
    console.log(`[resolver] Resolved in ${elapsed}ms: ${url} → ${resolvedUrl}`);

    res.json({
      success: true,
      resolved_url: resolvedUrl,
      elapsed_ms: elapsed,
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[resolver] Error after ${elapsed}ms:`, err.message);

    // Even on timeout, try to get the current URL — it may have partially resolved
    let partialUrl = url;
    try {
      if (page) partialUrl = page.url();
    } catch { /* ignore */ }

    // If the partial URL is different from the input, it partially resolved
    if (partialUrl !== url && partialUrl !== 'about:blank') {
      console.log(`[resolver] Partial resolution: ${partialUrl}`);
      res.json({
        success: true,
        resolved_url: partialUrl,
        elapsed_ms: elapsed,
        partial: true,
      });
    } else {
      res.status(504).json({
        success: false,
        error: 'resolution_timeout',
        elapsed_ms: elapsed,
      });
    }
  } finally {
    if (page) {
      try { await page.close(); } catch { /* ignore */ }
    }
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'youji-url-resolver' });
});

// ── Start server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[resolver] Listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[resolver] SIGTERM received, shutting down...');
  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
  }
  process.exit(0);
});
