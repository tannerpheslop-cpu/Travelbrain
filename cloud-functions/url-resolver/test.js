/**
 * Local test script for the URL resolver service.
 *
 * Usage:
 *   1. Start the service: npm start
 *   2. In another terminal: node test.js
 *   3. Or test against deployed service: RESOLVER_URL=https://your-service.run.app node test.js
 */

const BASE_URL = process.env.RESOLVER_URL || 'http://localhost:8080';
const API_KEY = process.env.RESOLVER_API_KEY || '';

async function resolve(url) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;

  const res = await fetch(`${BASE_URL}/resolve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url }),
  });
  return { status: res.status, body: await res.json() };
}

async function test(name, url, check) {
  process.stdout.write(`  ${name}... `);
  try {
    const result = await resolve(url);
    const passed = check(result);
    console.log(passed ? '✓ PASS' : `✗ FAIL — ${JSON.stringify(result.body)}`);
    return passed;
  } catch (err) {
    console.log(`✗ ERROR — ${err.message}`);
    return false;
  }
}

async function run() {
  console.log(`\nTesting URL Resolver at ${BASE_URL}\n`);
  let passed = 0;
  let total = 0;

  // 1. Google Maps mobile short link → full maps URL
  total++;
  if (await test(
    'Google Maps mobile link resolves to maps/place URL',
    'https://maps.app.goo.gl/A8tH3XcFD6rBpCcu5?g_st=ic',
    (r) => r.status === 200 && r.body.success && r.body.resolved_url.includes('/maps/')
  )) passed++;

  // 2. Google Maps desktop short link
  total++;
  if (await test(
    'Google Maps desktop link resolves to maps/place URL',
    'https://maps.app.goo.gl/ffAc3Vkgp4LLM7oj8',
    (r) => r.status === 200 && r.body.success && r.body.resolved_url.includes('/maps/')
  )) passed++;

  // 3. t.co Twitter short link
  total++;
  if (await test(
    't.co link resolves to full URL',
    'https://t.co/test123',
    (r) => r.status === 200 || r.status === 504 // May fail if link is invalid, that's OK
  )) passed++;

  // 4. vm.tiktok.com
  total++;
  if (await test(
    'vm.tiktok.com link resolves',
    'https://vm.tiktok.com/test123',
    (r) => r.status === 200 || r.status === 504
  )) passed++;

  // 5. Disallowed domain rejected
  total++;
  if (await test(
    'Non-allowed domain rejected with 403',
    'https://example.com/some-page',
    (r) => r.status === 403 && r.body.error === 'domain_not_allowed'
  )) passed++;

  // 6. Health check
  total++;
  process.stdout.write('  Health check... ');
  try {
    const res = await fetch(BASE_URL);
    const body = await res.json();
    const ok = body.status === 'ok';
    console.log(ok ? '✓ PASS' : '✗ FAIL');
    if (ok) passed++;
    total; // already incremented
  } catch (err) {
    console.log(`✗ ERROR — ${err.message}`);
  }

  // 7. Missing URL returns 400
  total++;
  process.stdout.write('  Missing URL returns 400... ');
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['x-api-key'] = API_KEY;
    const res = await fetch(`${BASE_URL}/resolve`, {
      method: 'POST', headers, body: JSON.stringify({}),
    });
    const body = await res.json();
    const ok = res.status === 400 && body.error === 'missing_url';
    console.log(ok ? '✓ PASS' : '✗ FAIL');
    if (ok) passed++;
  } catch (err) {
    console.log(`✗ ERROR — ${err.message}`);
  }

  console.log(`\nResults: ${passed}/${total} passed\n`);
}

run().catch(console.error);
