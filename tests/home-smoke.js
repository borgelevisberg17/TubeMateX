const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
  try {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({viewport:{width,height:900}}); const page = await context.newPage(); const errors=[]; page.on('pageerror', e=>errors.push(e.message));
      await page.route('**/api/history', route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
      await page.route('**/api/user', route=>route.fulfill({status:401,body:'{}'}));
      const response=await page.goto(`${base}/`,{waitUntil:'networkidle'}); if(!response||!response.ok())throw new Error(`home falhou em ${width}px`);
      for(const selector of ['#searchForm','#searchResults','#downloadForm','#videoUrl','#quickFormat','#quickQuality','#liveQueue','.tmx-space-footer','.tmx-download-launch'])if(await page.locator(selector).count()!==1)throw new Error(`home sem ${selector}`);
      if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1))throw new Error(`home com overflow em ${width}px`); if(errors.length)throw new Error(`home JS: ${errors.join('; ')}`); await page.screenshot({path:`/tmp/home-${width}.png`,fullPage:true}); await context.close();
    } console.log('HOME_SMOKE_OK');
  } finally { await browser.close(); }
})().catch(error=>{console.error('HOME_SMOKE_FAIL',error.message);process.exit(1)});
