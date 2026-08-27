const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1280,height:900}}); const page = await context.newPage();
    const items = [
      {id:'audio-1',title:'Faixa de teste',format:'mp3',formatLabel:'MP3',site:'SoundCloud',size:4000000,createdAt:'2026-08-27T10:00:00.000Z',completedAt:'2026-08-27T10:01:00.000Z',downloadUrl:'/api/downloads/audio-1/file',favorite:false},
      {id:'video-1',title:'Vídeo de teste',format:'mp4',formatLabel:'MP4',qualityLabel:'Automática',site:'YouTube',size:12000000,createdAt:'2026-08-27T11:00:00.000Z',completedAt:'2026-08-27T11:01:00.000Z',downloadUrl:'/api/downloads/video-1/file',favorite:false}
    ];
    await page.route('**/api/history', route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(items)})); await page.route('**/api/user', route=>route.fulfill({status:401,body:'{}'}));
    await page.route('**/api/library?**', route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items,total:items.length,offset:0,hasMore:false,facets:{sites:['SoundCloud','YouTube']}})}));
    await page.goto('http://localhost:3011/profile',{waitUntil:'networkidle'}); await page.locator('.history-play').first().waitFor();
    await page.locator('[data-history-action="play"]').nth(0).click(); await page.locator('#historyDetails').waitFor({state:'visible'}); if(await page.locator('.history-player audio').count()!==1||await page.locator('.history-player video').count()!==0)throw new Error('O detalhe MP3 não abriu player de áudio'); if(await page.locator('#notification.show').count()!==0)throw new Error('Detalhe MP3 foi exibido como toast');
    await page.locator('#closeHistoryDetails').click(); await page.locator('[data-history-action="play"]').nth(1).click(); await page.locator('.history-player video').waitFor(); if(await page.locator('.history-player audio').count()!==0)throw new Error('O detalhe MP4 manteve player de áudio concorrente');
    console.log('LIBRARY_PLAYBACK_OK'); await context.close();
  } finally { await browser.close(); }
})().catch(error=>{console.error('LIBRARY_PLAYBACK_FAIL',error.message);process.exit(1)});
