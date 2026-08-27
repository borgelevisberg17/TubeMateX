const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true }); const base = process.env.TEST_BASE_URL || 'http://localhost:4173'; const page = await browser.newPage({ viewport: { width: 900, height: 900 } }); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/user', route => route.fulfill({ status: 401, body: '{}' }));
  await page.route('**/api/capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ formats:[{id:'mp4'}], platforms:[{id:'youtube'}], maxConcurrentDownloads:2 }) }));
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#defaultFormat').count(), 1); assert.equal(await page.locator('.tmx-space-footer').count(), 1); assert.equal(await page.locator('#autoplayToggle').count(), 1);
  await page.locator('#defaultFormat').selectOption('mp3'); await page.locator('label:has(#autoplayToggle)').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('tubematex-default-format')), 'mp3'); assert.equal(await page.evaluate(() => localStorage.getItem('tubematex-autoplay')), 'false');
  assert.equal(await page.locator('#backendStatus').textContent(), 'Online'); assert.equal(await page.locator('#capabilityPlatforms').textContent(), '1'); assert.deepEqual(errors, []);
  await browser.close(); console.log('SETTINGS E2E OK: preferências persistentes e capacidades do backend.');
})().catch(error => { console.error(error); process.exit(1); });
