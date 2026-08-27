const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
  try {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const film = {
        id: 'film-1', title: 'Filme público de demonstração',
        url: 'https://www.youtube.com/watch?v=film-1',
        thumbnail: 'https://i.ytimg.com/vi/film-1/hqdefault.jpg',
        site: 'Internet Archive', uploader: 'Catálogo público',
        description: 'Metadata real fornecida pela origem.', duration: 540, kind: 'film'
      };
      const series = { ...film, id: 'series-1', title: 'Série pública com episódios', kind: 'series', playlistUrl: 'https://www.youtube.com/playlist?list=series-1' };
      const live = {
        id: 'iptv-1', title: 'Record News · Direto', channelName: 'Record News',
        url: 'https://example.com/record.m3u8', thumbnail: 'https://example.com/record.png',
        site: 'IPTV público · iptv-org', country: 'BR', language: 'por', languages: ['por'],
        categories: ['news'], quality: 'HD', availabilityLabel: 'Not 24/7', kind: 'live', live: true, directStream: true
      };
      const home = {
        hero: film,
        rows: [
          { id: 'featured', title: 'Em destaque agora', items: [film] },
          { id: 'films', title: 'Filmes públicos e cinema', items: [film] },
          { id: 'series', title: 'Séries e episódios públicos', items: [series] },
          { id: 'anime', title: 'Anime e animação', items: [{ ...film, id: 'anime-1', title: 'Anime official trailer' }] }
        ],
        generatedAt: new Date().toISOString()
      };
      await page.route('**/api/entertainment/home', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(home) }));
      await page.route('**/api/iptv/playlists', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          policy: 'Apenas fontes filtradas entram no catálogo.',
          sources: [
            { label: 'IPTV público mundial', safety: 'filtered', note: 'ok' },
            { label: 'M3U.cl total', safety: 'unverified', note: 'não importada' },
            { label: 'IPTV público NSFW', safety: 'blocked', note: 'bloqueada' }
          ]
        })
      }));
      await page.route('**/api/iptv/channels?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [live], source: 'iptv-org' }) }));
      await page.route('**/api/search?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [film] }) }));
      await page.route('**/api/media/stream?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://example.com/film.mp4', mimeType: 'video/mp4' }) }));
      await page.route('**/api/media/playlist?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ seasons: [{ seasonNumber: 1, title: 'Temporada 1', episodes: [{ id: 'episode-1', title: 'Episódio 1 · Primeiro capítulo', url: 'https://example.com/episode-1.mp4', duration: 300, kind: 'series' }, { id: 'episode-2', title: 'Episódio 2 · Continuação', url: 'https://example.com/episode-2.mp4', duration: 320, kind: 'series' }] }] }) }));
      await page.route('**/api/downloads', route => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ job: { id: 'cine-download' } }) }));
      await page.goto(`${base}/entertainment.html`, { waitUntil: 'networkidle' });
      await page.locator('#heroTitle').waitFor();
      for (const selector of ['.entertainment-topbar', '#entHero', '#entertainmentRows', '#iptvSection', '#iptvSourceList', '#entSearchZone']) {
        if (await page.locator(selector).count() !== 1) throw new Error(`sem ${selector}`);
      }
      if (!(await page.locator('#heroTitle').textContent()).includes('Entretenimento com origem')) throw new Error('hero institucional não foi renderizado');
      if ((await page.locator('.ent-card').count()) < 3) throw new Error('rails cinematográficos não foram renderizados');
      if ((await page.locator('.ent-card-badge').allTextContents()).some(text => /youtube/i.test(text))) throw new Error('YouTube apareceu nos rails principais do Cine');
      if (!(await page.locator('#iptvSourceList').textContent()).includes('bloqueada')) throw new Error('estado da fonte bloqueada não foi exposto');
      await page.locator('.ent-card').first().locator('[data-action="details"]').click();
      if (await page.locator('#entDetailDrawer').getAttribute('hidden') !== null) throw new Error('drawer de detalhes não abriu');
      if (await page.locator('.ent-player-option').count() !== 3) throw new Error('opções de player incompletas');
      await page.locator('#detailDownload').click();
      await page.locator('#detailList').click();
      await page.locator('#closeDetail').click();
      await page.locator('.ent-card[data-item-id="series-1"] [data-action="details"]').click();
      await page.locator('#detailSeries').waitFor({ state: 'visible' });
      await page.locator('#detailEpisodes .ent-episode').nth(1).waitFor();
      if (await page.locator('#detailEpisodes .ent-episode').count() !== 2) throw new Error('temporadas/episódios públicos não foram renderizados');
      await page.locator('#closeDetail').click();
      await page.locator('.ent-nav-link[data-view="my-list"]').click();
      if (!(await page.locator('#personalRows').textContent()).includes('Minha lista')) throw new Error('Minha lista não persistiu');
      await page.locator('#openEntertainmentSearch').click();
      await page.locator('#spaceQuery').fill('filme');
      await page.locator('#spaceSearch').evaluate(form => form.requestSubmit());
      await page.locator('#spaceResults .ent-card').first().waitFor();
      await page.locator('#loadIptv').click();
      await page.locator('#iptvResults .ent-card').first().waitFor();
      await page.locator('#iptvResults .ent-card').first().locator('[data-action="play"]').click();
      await page.waitForFunction(() => document.querySelector('#videoDrawer')?.hidden === false || document.querySelector('#spaceStatus')?.dataset.kind === 'error');
      if (await page.locator('#videoDrawer').getAttribute('hidden') !== null) throw new Error('player live não abriu');
      await page.locator('#closeVideo').click();
      await page.locator('.ent-nav-link[data-view="live"]').click();
      await page.waitForFunction(() => document.querySelector('#iptvStatus')?.textContent.includes('canais'));
      if (!(await page.locator('#iptvStatus').textContent()).includes('canais')) throw new Error('navegação Ao vivo não carregou o hub IPTV');
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error(`overflow em ${width}px`);
      await context.close();
    }
    console.log('ENTERTAINMENT_NETFLIX_E2E_OK');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error('ENTERTAINMENT_NETFLIX_E2E_FAIL', error.message); process.exit(1); });
