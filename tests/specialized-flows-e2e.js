const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless:true });
  const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
  try {
    const context = await browser.newContext({ viewport:{width:1280,height:900} });
    const page = await context.newPage();
    const platformPayload = {platforms:[{id:'youtube',label:'YouTube',mode:'download'},{id:'soundcloud',label:'SoundCloud',mode:'download'},{id:'vimeo',label:'Vimeo',mode:'download'},{id:'twitch',label:'Twitch',mode:'download'}]};
    await page.route('**/api/platforms', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(platformPayload)}));
    const searchRequests = [];
    await page.route('**/api/search**', route => { searchRequests.push(new URL(route.request().url()).searchParams); return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:[{url:'https://example.test/media',title:'Resultado de teste',thumbnail:null,duration:90,site:'Teste',uploader:'Canal'},{url:'https://example.test/media-2',title:'Segunda faixa',thumbnail:null,duration:120,site:'Teste',uploader:'Outro canal'}],unavailableSources:[]})}); });
    await page.route('**/api/media/stream**', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'https://cdn.test/media',mimeType:'video/mp4'})}));
    let downloadBody = null;
    await page.route('**/api/downloads', async route => { downloadBody = JSON.parse(route.request().postData() || '{}'); await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({job:{id:'test-job'}})}); });
    await page.goto(`${base}/music.html`);
    if (await page.locator('#spaceSearch input').getAttribute('aria-label') !== 'Pesquisar música, artistas ou podcasts') throw new Error('Busca de música sem rótulo acessível');
    await page.locator('[data-music-query="jazz instrumental"]').click(); await page.locator('.track-row').first().waitFor();
    if (searchRequests.at(-1)?.get('q') !== 'jazz instrumental') throw new Error('Pesquisa rápida não iniciou a descoberta');
    if (await page.locator('#spaceSources [data-source="all"]').getAttribute('aria-pressed') !== 'true') throw new Error('A fonte selecionada não foi anunciada aos leitores de ecrã');
    await page.locator('#spaceQuery').fill('teste'); await page.locator('#spaceSearch').press('Enter'); await page.locator('.track-row').first().waitFor(); await page.locator('.preview-action').first().click(); await page.locator('#spaceAudio[src]').waitFor({state:'attached',timeout:5000}); if (!await page.locator('#spaceAudio').getAttribute('src')) throw new Error('Música sem stream no player');
    if (await page.locator('#spacePlayerBody').isHidden() || await page.locator('#spacePlayerTitle').textContent() !== 'Resultado de teste' || await page.locator('#musicPlayerSource').textContent() !== 'Teste') throw new Error('O player não refletiu a faixa ou origem escolhida');
    for (const selector of ['#musicPrevious', '#musicBack10', '#spacePlay', '#musicForward10', '#musicNext', '#spacePlayerSeek', '#musicMute', '#musicVolume']) if (!await page.locator(selector).count()) throw new Error(`Controle de player em falta: ${selector}`);
    if (await page.locator('#musicPrevious').isEnabled() || !(await page.locator('#musicNext').isEnabled())) throw new Error('Navegação entre faixas não refletiu a posição atual');
    if (!(await page.locator('#spacePlayerSeek').getAttribute('aria-valuetext'))?.includes('de') || await page.locator('#musicVolume').getAttribute('aria-valuetext') !== '100%') throw new Error('Controles do player sem estado acessível');
    await page.locator('#musicNext').click(); await page.waitForFunction(() => document.querySelector('#spacePlayerTitle')?.textContent === 'Segunda faixa');
    await page.locator('#musicPrevious').click(); await page.waitForFunction(() => document.querySelector('#spacePlayerTitle')?.textContent === 'Resultado de teste');
    await page.locator('#musicVolume').evaluate(el => { el.value = '55'; el.dispatchEvent(new Event('input', { bubbles:true })); });
    if (await page.locator('#musicVolumeValue').textContent() !== '55%' || await page.locator('#spaceAudio').evaluate(el => el.volume) !== 0.55) throw new Error('Controle de volume não atualizou o áudio');
    await page.locator('#musicMute').click(); if (await page.locator('#musicMute').getAttribute('aria-pressed') !== 'true') throw new Error('Mute não anunciou o estado silenciado');
    await page.locator('#musicMute').click(); if (await page.locator('#musicMute').getAttribute('aria-pressed') !== 'false') throw new Error('Mute não restaurou o som');
    await page.locator('#spaceAudio').evaluate(el => el.dispatchEvent(new Event('play'))); if (await page.locator('#spacePlay').getAttribute('aria-label') !== 'Pausar') throw new Error('O player não atualizou o botão durante a reprodução');
    await page.locator('#spaceAudio').evaluate(el => el.dispatchEvent(new Event('pause'))); if (await page.locator('#spacePlay').getAttribute('aria-label') !== 'Reproduzir') throw new Error('O player não atualizou o botão durante a pausa');
    await page.locator('.download-action').first().click(); if (!downloadBody || downloadBody.format !== 'mp3') throw new Error('Música não enviou MP3');
    await page.goto(`${base}/social.html`); await page.locator('#spaceQuery').fill('teste'); await page.locator('#spaceSearch').press('Enter'); await page.locator('.social-card').first().waitFor(); await page.locator('.preview-action').first().click(); await page.locator('#videoDrawer').waitFor({state:'visible',timeout:5000}); if (await page.locator('#videoDrawer').getAttribute('hidden') !== null) throw new Error('Social não abriu drawer de vídeo'); if (!await page.locator('#spaceVideo').getAttribute('src')) throw new Error('Social sem stream de vídeo');
    await page.goto(`${base}/entertainment.html`); await page.locator('#openEntertainmentSearch').click(); await page.locator('#spaceQuery').fill('teste'); await page.locator('#spaceSearch').press('Enter'); await page.locator('.ent-card').first().waitFor();
    console.log('SPECIALIZED_FLOWS_OK');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error('SPECIALIZED_FLOWS_FAIL', error.message); process.exit(1); });
