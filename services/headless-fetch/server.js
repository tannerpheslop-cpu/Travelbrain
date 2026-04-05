const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Stealth plugin patches headless Chrome detection vectors
// (navigator.webdriver, chrome.runtime, permissions, codec checks, etc.)
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const API_SECRET = process.env.HEADLESS_API_SECRET || '';

// Simple auth — shared secret between prepare-extraction and this service
function authenticate(req, res, next) {
  const token = req.headers['x-api-secret'];
  if (!API_SECRET || token === API_SECRET) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'youji-headless-fetch' });
});

// Main endpoint: render a URL and return HTML
app.post('/fetch', authenticate, async (req, res) => {
  const { url, timeout = 20000 } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  console.log(`[headless-fetch] Rendering: ${url}`);
  const startTime = Date.now();

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--single-process',
        '--no-zygote',
      ],
    });

    const page = await browser.newPage();

    // Set a realistic viewport and user agent
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Block unnecessary resources to speed up rendering
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Navigate — use domcontentloaded first (faster), then wait for body content
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeout,
    });

    const httpStatus = response ? response.status() : 0;

    // Wait for the real page content to appear (handles JS challenges)
    // Check periodically if we've moved past a challenge page
    const maxWait = 12000;
    const checkInterval = 500;
    let waited = 0;
    while (waited < maxWait) {
      const title = await page.title();
      const isChallenge = title.includes('Security Checkpoint') ||
                          title.includes('Just a moment') ||
                          title.includes('Attention Required') ||
                          title.includes('Checking your browser');
      if (!isChallenge) break;
      await new Promise(r => setTimeout(r, checkInterval));
      waited += checkInterval;
    }

    // Extra settle time for SPAs and lazy content
    await new Promise(r => setTimeout(r, 1500));

    // Scroll to trigger lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(r => setTimeout(r, 1000));

    // Get the full HTML
    await page.evaluate(() => window.scrollTo(0, 0));
    const html = await page.content();

    const elapsed = Date.now() - startTime;
    const passedChallenge = !html.includes('Security Checkpoint') &&
                            !html.includes('Checking your browser');

    console.log(`[headless-fetch] Done: ${url} — ${httpStatus} — ${html.length} chars — ${elapsed}ms — challenge_passed=${passedChallenge}`);

    res.json({
      success: true,
      html: html,
      httpStatus: httpStatus,
      contentLength: html.length,
      elapsed: elapsed,
      passedChallenge: passedChallenge,
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[headless-fetch] Error: ${url} — ${error.message} — ${elapsed}ms`);

    res.status(500).json({
      success: false,
      error: error.message,
      elapsed: elapsed,
    });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`[headless-fetch] Listening on port ${PORT}`);
});
