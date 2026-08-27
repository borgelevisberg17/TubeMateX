const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const contexts = [];
  const pages = [];
  const routes = [
    { path:'/music.html', body:'music', required:['#spaceAudio','#spacePlayerBody','.track-list','.tmx-space-footer'] },
    { path:'/social.html', body:'social', required:['#videoDrawer','.social-grid','#spaceVideo','.tmx-space-footer'] },
    { path:'/entertainment.html', body:'entertainment', required:['.entertainment-topbar','#entHero','#entertainmentRows','#iptvSection','#videoDrawer','.tmx-space-footer'] }
  ];
  try {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({ viewport:{ width, height:900 } }); contexts.push(context);
      for (const route of routes) {
        const page = await context.newPage(); pages.push(page);
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        const response = await page.goto(base + route.path, { waitUntil:'networkidle' });
        if (!response || !response.ok()) throw new Error(`${route.path} não respondeu com sucesso em ${width}px`);
        if (await page.locator('body').getAttribute('data-space') !== route.body) throw new Error(`${route.path} sem data-space correto`);
        for (const selector of route.required) if (await page.locator(selector).count() !== 1) throw new Error(`${route.path} sem ${selector}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) throw new Error(`${route.path} tem overflow horizontal em ${width}px`);
        if (errors.length) throw new Error(`${route.path} erros JS: ${errors.join('; ')}`);
        const name = `${route.body}-${width}.png`; await page.screenshot({ path:path.join('/tmp', name), fullPage:true });
      }
    }
    console.log('SPACES_SMOKE_OK');
  } finally { for (const page of pages) await page.close().catch(()=>{}); for (const context of contexts) await context.close().catch(()=>{}); await browser.close(); }
})().catch(error => { console.error('SPACES_SMOKE_FAIL', error.message); process.exit(1); });
