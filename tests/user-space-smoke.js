const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless:true });
  try {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({ viewport:{ width, height:900 } });
      const page = await context.newPage();
      await page.route('**/api/user', route => route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({displayName:'Visitante',email:'visitante@example.com'})}));
      await page.route('**/api/history', route => route.fulfill({status:200, contentType:'application/json', body:JSON.stringify([])}));
      await page.route('**/api/capabilities', route => route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({formats:['mp3','mp4'],platforms:['YouTube','SoundCloud'],maxConcurrentDownloads:2})}));
      await page.route('**/api/library**', route => route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({items:[{id:'demo-1',title:'Ficheiro de teste',format:'mp4',formatLabel:'MP4',site:'YouTube',createdAt:'2026-08-27T10:00:00.000Z',favorite:true}],total:1,offset:0,limit:24,hasMore:false,facets:{sites:['YouTube']}})}));
      for (const routePath of ['/profile','/settings']) {
        const errors=[]; page.on('pageerror', error => errors.push(error.message));
        const response = await page.goto(`http://localhost:3000${routePath}`, {waitUntil:'networkidle'});
        if (!response || !response.ok()) throw new Error(`${routePath} falhou em ${width}px`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) throw new Error(`${routePath} tem overflow em ${width}px`);
        if (routePath === '/profile') { if (await page.locator('.export-button').count() !== 2) throw new Error('Biblioteca sem exportações'); if (await page.locator('#downloadHistory [data-convert-format]').count() !== 1) throw new Error('Biblioteca sem conversão'); }
        if (routePath === '/settings') { for (const selector of ['#defaultFormat','#autoplayToggle','#backendStatus','#capabilityPlatforms']) if (await page.locator(selector).count() !== 1) throw new Error(`Definições sem ${selector}`); }
        if (errors.length) throw new Error(`${routePath} JS: ${errors.join('; ')}`);
        await page.screenshot({path:path.join('/tmp', `${routePath.slice(1)}-${width}.png`), fullPage:true});
      }
      await context.close();
    }
    console.log('USER_SPACES_SMOKE_OK');
  } finally { await browser.close(); }
})().catch(error => { console.error('USER_SPACES_SMOKE_FAIL', error.message); process.exit(1); });
