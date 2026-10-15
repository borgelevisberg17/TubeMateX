const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
  try {
    for (const width of [1440, 768, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const iptvRequests = [];
      const waitForIptvRequests = async target => { const deadline = Date.now() + 5000; while (iptvRequests.length < target && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10)); if (iptvRequests.length < target) throw new Error(`request IPTV não iniciou (esperado ${target}, recebido ${iptvRequests.length})`); };
      const film = {
        id: 'film-1', title: 'Filme público de demonstração',
        url: 'https://www.youtube.com/watch?v=film-1',
        thumbnail: 'https://i.ytimg.com/vi/film-1/hqdefault.jpg',
        site: 'Internet Archive', uploader: 'Catálogo público',
        description: 'Media pública de demonstração.', duration: 540, kind: 'film',
        publicPlayback: true, streamAvailable: true, metadataOnly: false
      };
      const protectedFilm = { ...film, id: 'drm-film', title: 'Filme protegido não reproduzível', availabilityLabel: 'DRM protected' };
      const series = { ...film, id: 'series-1', title: 'Série pública com episódios', kind: 'series', playlistUrl: 'https://www.youtube.com/playlist?list=series-1' };
      const live = {
        id: 'iptv-1', title: 'Record News · Direto', channelName: 'Record News',
        url: 'https://example.com/record.m3u8', thumbnail: 'https://example.com/record.png',
        site: 'IPTV público · iptv-org', country: 'BR', language: 'por', languages: ['por'],
        categories: ['news'], quality: 'HD', availabilityLabel: 'Verificada', kind: 'live', live: true, directStream: true,
        publicPlayback: true, streamAvailable: true, metadataOnly: false, validationStatus: 'online'
      };
      const sports = { ...live, id: 'iptv-sports-1', title: 'Arena Sport 1 · Direto', channelName: 'Arena Sport 1', categories: ['sports'] };
      const portugal = { ...live, id: 'iptv-pt-1', title: 'SIC Notícias · Direto', channelName: 'SIC Notícias', country: 'PT', availabilityLabel: 'Geo-blocked' };
      const brands = { ...live, id: 'iptv-brand-1', title: 'AXN · Direto', channelName: 'AXN', categories: ['entertainment'] };
      const home = {
        hero: film,
        rows: [
          { id: 'featured', title: 'Em destaque agora', items: [film, protectedFilm] },
          { id: 'films', title: 'Filmes públicos e cinema', items: [film] },
          { id: 'series', title: 'Séries e episódios públicos', items: [series] },
          { id: 'anime', title: 'Anime e animação', items: [{ ...film, id: 'anime-1', title: 'Anime public animation' }] },
          { id: 'sports', title: 'Desporto ao vivo', items: [sports] },
          { id: 'portugal', title: 'Portugal em direto', items: [portugal] },
          { id: 'brands', title: 'Cinema, ação e infantil', items: [brands] }
        ],
        generatedAt: new Date().toISOString()
      };
      await page.route('**/api/entertainment/home', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(home) }));
      await page.route('**/api/entertainment/sources', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [{ id: 'iptv-org', label: 'IPTV-org', mode: 'live', url: 'https://github.com/iptv-org/iptv' }], policy: 'Fontes públicas.' }) }));
      await page.route('**/api/entertainment/sources/health', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [{ id: 'iptv-org', mode: 'live', status: 'online', note: 'API disponível' }] }) }));
      await page.route('**/api/entertainment/search?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: 'filme', results: [film, protectedFilm] }) }));
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
      await page.route('**/api/iptv/channels?**', async route => {
        const params = new URL(route.request().url()).searchParams;
        iptvRequests.push({ query: params.get('q'), country: params.get('country'), language: params.get('language'), category: params.get('category'), offset: params.get('offset'), limit: params.get('limit') });
        const isStaleRequest = params.get('q') === 'corrida' && params.get('country') !== 'BR';
        await new Promise(resolve => setTimeout(resolve, params.get('q') === 'corrida' ? (isStaleRequest ? 140 : 15) : ['Record', 'geoblock'].includes(params.get('q')) ? 160 : 45));
        if (params.get('q') === 'falha') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fonte IPTV temporariamente indisponível.' }) });
        const item = params.get('q') === 'geoblock' ? portugal : isStaleRequest ? { ...live, id: 'iptv-stale', title: 'Resposta antiga do filtro' } : live;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [item], total: 1300, candidateCount: 2905, pendingValidationCount: 0, remainingValidationCount: 35, excludedCount: 1558, hasMore: true, source: 'iptv-org' }) });
      });
      await page.route('**/api/iptv/meta', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ countries: [{ code: 'AO', count: 2 }, { code: 'BR', count: 12 }, { code: 'PT', count: 12 }], categories: [{ id: 'sports', count: 18 }, { id: 'news', count: 14 }], source: 'iptv-org' }) }));
      await page.route('**/api/search?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [film] }) }));
      await page.route('**/api/media/stream?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://example.com/film.mp4', mimeType: 'video/mp4' }) }));
      await page.route('**/api/media/playlist?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ seasons: [{ seasonNumber: 1, title: 'Temporada 1', episodes: [{ id: 'episode-1', title: 'Episódio 1 · Primeiro capítulo', url: 'https://example.com/episode-1.mp4', duration: 300, kind: 'series' }, { id: 'episode-2', title: 'Episódio 2 · Continuação', url: 'https://example.com/episode-2.mp4', duration: 320, kind: 'series' }] }] }) }));
      await page.route('**/api/downloads', route => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ job: { id: 'cine-download' } }) }));
      await page.goto(`${base}/entertainment.html`, { waitUntil: 'domcontentloaded' });
      await page.locator('#heroTitle').waitFor();
      for (const selector of ['.tmx-app-header', '.tmx-local-nav .entertainment-nav', '#entHero', '#vodHeading', '#entertainmentRows', '#iptvSection', '#iptvHeading', '#iptvSourceList', '#entSearchZone']) {
        if (await page.locator(selector).count() !== 1) throw new Error(`sem ${selector}`);
      }
      for (const label of ['Pesquisar canal', 'País', 'Idioma', 'Género']) if (await page.getByLabel(label, { exact: true }).count() !== 1) throw new Error(`filtro sem nome acessível: ${label}`);
      if (await page.locator('#iptvStatus').getAttribute('role') !== 'status' || await page.locator('#iptvStatus').getAttribute('aria-live') !== 'polite') throw new Error('o estado IPTV não é anunciado de forma educada');
      if (await page.locator('#iptvResults').getAttribute('role') !== 'region' || !['true', 'false'].includes(await page.locator('#iptvResults').getAttribute('aria-busy'))) throw new Error('a região dos resultados IPTV não tem semântica/busy state válido');
      if (await page.locator('#toggleIptv').getAttribute('aria-controls') !== 'iptvBody') throw new Error('o controlo de recolher não identifica a região IPTV');
      if (await page.locator('.ent-nav-link[data-view="home"]').getAttribute('aria-pressed') !== 'true') throw new Error('a vista ativa não é anunciada na navegação');
      if (await page.locator('#iptvAdvancedFilters').isVisible() || await page.locator('#toggleIptvFilters').getAttribute('aria-expanded') !== 'false') throw new Error('os filtros avançados não começam recolhidos');
      await page.locator('#toggleIptvFilters').click();
      if (!(await page.locator('#iptvAdvancedFilters').isVisible()) || await page.locator('#toggleIptvFilters').getAttribute('aria-expanded') !== 'true') throw new Error('o botão Filtros não expandiu a região refinada');
      await page.locator('#iptvQuery').focus();
      await page.keyboard.press('Tab');
      const toolbarFocus = await page.evaluate(() => ({ id: document.activeElement?.id, outline: getComputedStyle(document.activeElement).outlineWidth }));
      if (toolbarFocus.id !== 'toggleIptvFilters' || toolbarFocus.outline !== '3px') throw new Error('a pesquisa não segue para o botão de filtros com foco visível');
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.id) !== 'loadIptv') throw new Error('a sequência de teclado da barra de pesquisa está incorreta');
      await page.keyboard.press('Tab');
      const focusCheck = await page.evaluate(() => ({ id: document.activeElement?.id, outline: getComputedStyle(document.activeElement).outlineWidth }));
      if (focusCheck.id !== 'iptvCountry' || focusCheck.outline !== '3px') throw new Error('a sequência de teclado ou o foco visível dos filtros IPTV falhou');
      if (!(await page.locator('#heroTitle').textContent()).includes('Entretenimento com origem')) throw new Error('hero institucional não foi renderizado');
      if ((await page.locator('.ent-card').count()) < 3) throw new Error('rails cinematográficos não foram renderizados');
      if (await page.locator('#entertainmentRows [data-item-id="drm-film"]').count() || await page.locator('#entertainmentRows .ent-rail[data-rail-id="live"]').count()) throw new Error('a vista VOD expôs conteúdo protegido ou canais live duplicados');
      if ((await page.locator('.ent-card-art-fallback').count()) < 3) throw new Error('cartões sem poster fallback resiliente');
      const posterImage = page.locator('.ent-card .ent-card-art img').first();
      await posterImage.evaluate(image => image.dispatchEvent(new Event('error')));
      if (!(await posterImage.isHidden())) throw new Error('poster indisponível não ativou o fallback visual');
      if (!(await page.locator('#iptvCountry option[value="AO"]').count())) throw new Error('país Angola não entrou no filtro dinâmico');
      if (!(await page.locator('#iptvCategory option[value="sports"]').count())) throw new Error('categoria desporto não entrou no filtro dinâmico');
      if ((await page.locator('.ent-card-badge').allTextContents()).some(text => /youtube/i.test(text))) throw new Error('YouTube apareceu nos rails principais do Cine');
      for (const view of ['sports','portugal','brands']) if (await page.locator(`.ent-nav-link[data-view="${view}"]`).count() !== 1) throw new Error(`navegação sem ${view}`);
      if (await page.locator('.ent-catalog-chip').count() !== 5) throw new Error('atalhos rápidos do catálogo incompletos');
      await page.locator('.ent-catalog-chip[data-view="movies"]').click();
      if (await page.locator('.ent-catalog-chip[data-view="movies"]').getAttribute('aria-pressed') !== 'true' || await page.locator('.ent-nav-link[data-view="movies"]').getAttribute('aria-pressed') !== 'true') throw new Error('atalho de filmes não sincronizou o estado ativo');
      await page.locator('.ent-catalog-chip[data-view="home"]').click();
      await page.locator('.ent-nav-link[data-view="sports"]').click();
      if (await page.locator('.ent-nav-link[data-view="sports"]').getAttribute('aria-pressed') !== 'true' || await page.locator('.ent-nav-link[data-view="home"]').getAttribute('aria-pressed') !== 'false') throw new Error('o estado da navegação não acompanhou a vista selecionada');
      if (!(await page.locator('.ent-rail-heading').allTextContents()).some(text => /Desporto ao vivo/i.test(text))) throw new Error('rail de desporto não abriu');
      if (!(await page.locator('#iptvSourceList').textContent()).includes('bloqueada')) throw new Error('estado da fonte bloqueada não foi exposto');
      if (!(await page.locator('#iptvSourceList').textContent()).includes('API online')) throw new Error('a saúde da API não foi exposta');
      await page.locator('#toggleIptvFilters').click();
      if (await page.locator('#iptvAdvancedFilters').isVisible()) throw new Error('os chips rápidos devem funcionar com o painel refinado fechado');
      if (await page.locator('.iptv-quick-chip').count() !== 7 || await page.locator('.iptv-quick-chip[data-quick-filter="all"]').getAttribute('aria-pressed') !== 'true') throw new Error('atalhos rápidos por país e género incompletos');
      const portugalResponse = page.waitForResponse(response => response.url().includes('/api/iptv/channels?') && new URL(response.url()).searchParams.get('country') === 'PT');
      await page.locator('.iptv-quick-chip[data-quick-country="PT"]').click(); await portugalResponse;
      await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      if (iptvRequests.at(-1)?.country !== 'PT' || await page.locator('.iptv-quick-chip[data-quick-country="PT"]').getAttribute('aria-pressed') !== 'true' || await page.locator('#iptvAdvancedFilters').isVisible()) throw new Error('o atalho Portugal não aplicou filtro sem abrir o painel avançado');
      if (/verificad|validaç|reproduzíveis confirmados/i.test(await page.locator('#iptvResults').textContent())) throw new Error('o card expõe detalhe técnico de validação ao utilizador');
      const iptvSummary = await page.locator('#iptvStatus').textContent();
      if (!/1–1 de 1.300 canais/.test(iptvSummary) || /valid|excluíd|pendente/i.test(iptvSummary)) throw new Error(`resumo IPTV confunde página carregada com fontes pendentes: ${iptvSummary}`);
      if (await page.locator('#iptvPagination').isHidden() || !(await page.locator('#iptvPageStatus').textContent()).includes('Página 1 de')) throw new Error('a paginação vertical IPTV não mostra a página atual');
      if (await page.locator('#loadMoreIptv').isVisible()) throw new Error('a validação de novas fontes deve ficar separada da paginação de canais já verificados');
      const nextPageResponse = page.waitForResponse(response => response.url().includes('/api/iptv/channels?') && new URL(response.url()).searchParams.get('offset') === '24');
      await page.locator('#iptvNextPage').click(); await nextPageResponse;
      await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      if (!(await page.locator('#iptvPageStatus').textContent()).includes('Página 2 de') || iptvRequests.at(-1)?.limit !== '24') throw new Error('a navegação IPTV não carregou a página vertical seguinte em lotes de 12');
      const previousPageResponse = page.waitForResponse(response => response.url().includes('/api/iptv/channels?') && new URL(response.url()).searchParams.get('offset') === '0');
      await page.locator('#iptvPreviousPage').click(); await previousPageResponse;
      await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      const moviesResponse = page.waitForResponse(response => response.url().includes('/api/iptv/channels?') && new URL(response.url()).searchParams.get('category') === 'movies');
      await page.locator('.iptv-quick-chip[data-quick-category="movies"]').click(); await moviesResponse;
      await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      if (iptvRequests.at(-1)?.category !== 'movies' || await page.locator('.iptv-quick-chip[data-quick-category="movies"]').getAttribute('aria-pressed') !== 'true') throw new Error('o atalho Filmes não aplicou a categoria mesmo sem contagem na API');
      const allResponse = page.waitForResponse(response => response.url().includes('/api/iptv/channels?') && response.status() === 200 && new URL(response.url()).searchParams.get('country') === '');
      await page.locator('.iptv-quick-chip[data-quick-filter="all"]').click(); await allResponse;
      await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      if (iptvRequests.at(-1)?.country !== '' || await page.locator('.iptv-quick-chip[data-quick-filter="all"]').getAttribute('aria-pressed') !== 'true') throw new Error('o atalho Todos não limpou o país selecionado');
      await page.locator('#toggleIptvFilters').click();
      await page.locator('#toggleIptv').click();
      if (await page.locator('#toggleIptv').getAttribute('aria-expanded') !== 'false' || await page.locator('#iptvBody').isVisible()) throw new Error('o painel IPTV não recolheu ou não anunciou o estado fechado');
      await page.locator('#toggleIptv').click();
      if (await page.locator('#toggleIptv').getAttribute('aria-expanded') !== 'true') throw new Error('o painel IPTV não reabriu');
      await page.locator('.ent-nav-link[data-view="home"]').click();
      await page.locator('.ent-card').first().locator('[data-action="details"]').click();
      if (await page.locator('#entDetailDrawer').getAttribute('hidden') !== null) throw new Error('drawer de detalhes não abriu');
      if (await page.locator('.ent-player-option').count() !== 3) throw new Error('opções de player incompletas');
      await page.locator('#detailDownload').click();
      await page.locator('#detailList').click();
      await page.locator('#detailInternal').click();
      await page.locator('#videoDrawer').waitFor({ state: 'visible' });
      const playerDialog = page.locator('#videoDrawer .video-drawer-card');
      if ((await page.locator('#videoContentBadge').textContent()).trim() !== 'FILME') throw new Error('badge de conteúdo VOD não refletiu o tipo do filme');
      if (!(await page.locator('#spaceVideo').getAttribute('poster'))?.includes('film-1')) throw new Error('poster do conteúdo não ficou visível no player');
      if (await playerDialog.getAttribute('role') !== 'dialog' || await playerDialog.getAttribute('aria-modal') !== 'true' || await playerDialog.getAttribute('aria-labelledby') !== 'videoTitle') throw new Error('player sem semântica de diálogo modal acessível');
      await page.waitForFunction(() => document.activeElement?.id === 'closeVideo');
      await page.keyboard.press('Shift+Tab');
      if (await page.evaluate(() => document.activeElement?.id) !== 'videoOpenSource') throw new Error('Shift+Tab escapou da última ação do player');
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.id) !== 'closeVideo') throw new Error('Tab não voltou ao início do diálogo do player');
      for (const selector of ['#videoPlayToggle','#videoSeek','#videoMute','#videoVolume','#videoFullscreen','#videoOpenSource']) if (await page.locator(selector).count() !== 1) throw new Error(`player sem ${selector}`);
      await page.locator('#spaceVideo').evaluate(video => video.dispatchEvent(new Event('error')));
      if (await page.locator('[data-player-retry]').count() !== 1) throw new Error('player sem retry no estado de erro');
      await page.locator('#entDetailDrawer').evaluate(() => {});
      await page.locator('#videoDrawer').evaluate(drawer => { drawer.requestFullscreen = () => { window.__fullscreenRequested = true; return Promise.resolve(); }; });
      await page.locator('#videoFullscreen').click();
      if (!(await page.evaluate(() => window.__fullscreenRequested))) throw new Error('fullscreen não foi solicitado ao drawer completo');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('#videoDrawer')?.hidden === true);
      await page.waitForFunction(() => document.activeElement?.id === 'detailInternal');
      const returnedFocus = await page.evaluate(() => ({ id: document.activeElement?.id, tag: document.activeElement?.tagName, className: document.activeElement?.className }));
      if (returnedFocus.id !== 'detailInternal') throw new Error(`fechar o player com Escape não devolveu o foco ao acionador: ${JSON.stringify(returnedFocus)}`);
      await page.locator('#closeDetail').click();
      await page.locator('.ent-card[data-item-id="series-1"] [data-action="details"]').click();
      await page.locator('#detailSeries').waitFor({ state: 'visible' });
      await page.locator('#detailEpisodes .ent-episode').nth(1).waitFor();
      if (await page.locator('#detailEpisodes .ent-episode').count() !== 2) throw new Error('temporadas/episódios públicos não foram renderizados');
      await page.locator('#closeDetail').click();
      const cardListButton = page.locator('.ent-card[data-item-id="film-1"] [data-action="list"]').first();
      if (!(await cardListButton.getAttribute('aria-label')).startsWith('Remover ')) throw new Error('o cartão não refletiu o item já salvo na Minha lista');
      await cardListButton.click();
      if (!(await cardListButton.getAttribute('aria-label')).startsWith('Adicionar ') || await cardListButton.locator('svg').count() !== 1) throw new Error('o estado de remoção não atualizou o rótulo e preservou o SVG');
      await cardListButton.click();
      if (!(await cardListButton.getAttribute('aria-label')).startsWith('Remover ') || await cardListButton.locator('svg').count() !== 1) throw new Error('o estado de adição não atualizou o rótulo e preservou o SVG');
      await page.locator('.ent-nav-link[data-view="my-list"]').click();
      if (!(await page.locator('#personalRows').textContent()).includes('Minha lista')) throw new Error('Minha lista não persistiu');
      await page.locator('#openEntertainmentSearch').click();
      await page.locator('#spaceQuery').fill('filme');
      await page.locator('#spaceSearch').evaluate(form => form.requestSubmit());
      await page.locator('#spaceResults .ent-card').first().waitFor();
      if (await page.locator('#spaceResults .ent-card').count() !== 1 || (await page.locator('#spaceResults').textContent()).includes('Filme protegido não reproduzível')) throw new Error('a pesquisa global mostrou um resultado DRM');
      await page.locator('#loadIptv').click();
      await page.locator('#iptvResults .ent-card').first().waitFor();
      await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      const listBounds = await page.locator('#iptvResults').evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, display: getComputedStyle(el).display, columns: getComputedStyle(el).gridTemplateColumns.split(' ').length }));
      const resultCardWidth = await page.locator('#iptvResults .ent-card').first().evaluate(card => card.getBoundingClientRect().width);
      if (listBounds.display !== 'grid' || (width > 700 && listBounds.columns < 2) || (width <= 700 && width > 350 && listBounds.columns !== 2) || listBounds.scrollWidth > listBounds.width + 1 || resultCardWidth > listBounds.width + 1) throw new Error(`lista IPTV não está em fluxo vertical ou excedeu a largura em ${width}px: ${JSON.stringify({listBounds,resultCardWidth})}`);
      await page.locator('#iptvResults .ent-card').first().locator('[data-action="play"]').click();
      await page.waitForFunction(() => document.querySelector('#videoDrawer')?.hidden === false || document.querySelector('#spaceStatus')?.dataset.kind === 'error');
      if (await page.locator('#videoDrawer').getAttribute('hidden') !== null) throw new Error('player live não abriu');
      if ((await page.locator('#videoContentBadge').textContent()).trim() !== 'AO VIVO') throw new Error('badge AO VIVO não refletiu o canal live');
      await page.waitForFunction(() => document.activeElement?.id === 'closeVideo');
      const playerBounds = await page.evaluate(() => ({ viewport: innerWidth, width: document.querySelector('.video-drawer-card').getBoundingClientRect().width, stageWidth: document.querySelector('#ytPlayerStage').getBoundingClientRect().width, documentWidth: document.documentElement.scrollWidth, centerDisplay: getComputedStyle(document.querySelector('#ytCenterPlay')).display, center: document.querySelector('#ytCenterPlay').getBoundingClientRect().toJSON(), seek: document.querySelector('.yt-seek-bar-wrap').getBoundingClientRect().toJSON() }));
      if (playerBounds.width > playerBounds.viewport || playerBounds.stageWidth > playerBounds.viewport || playerBounds.documentWidth > playerBounds.viewport) throw new Error(`player live excede viewport ${width}px: ${JSON.stringify(playerBounds)}`);
      if (width <= 360 && playerBounds.centerDisplay !== 'none') throw new Error(`botão central sobrepõe controlos em ${width}px: ${JSON.stringify(playerBounds)}`);
      if (width > 360 && width <= 500 && playerBounds.center.bottom > playerBounds.seek.top + 2) throw new Error(`botão central sobrepõe a barra de progresso em ${width}px: ${JSON.stringify(playerBounds)}`);
      await page.locator('#closeVideo').click();
      await page.waitForFunction(() => document.querySelector('#videoDrawer')?.hidden === true);
      await page.waitForFunction(() => document.activeElement?.matches('[data-action="play"]')).catch(() => {});
      if (await page.evaluate(() => document.activeElement?.matches('[data-action="play"]')) !== true) throw new Error(`fechar o player live não restaurou o foco ao canal: ${JSON.stringify(await page.evaluate(() => ({id:document.activeElement?.id,tag:document.activeElement?.tagName,cls:document.activeElement?.className})) )}`);
      await page.locator('.ent-nav-link[data-view="live"]').click();
      await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      if (!(await page.locator('#iptvStatus').textContent()).includes('canais')) throw new Error('navegação Ao vivo não carregou o hub IPTV');
      await page.locator('#iptvQuery').fill('Record');
      const recordRequestCount = iptvRequests.length + 1;
      await page.locator('#iptvQuery').press('Enter');
      if (await page.locator('#iptvResults').getAttribute('aria-busy') !== 'true') throw new Error('o início da pesquisa não anunciou que os resultados estão ocupados');
      if (await page.locator('#iptvResults .ent-card').count() !== 1) throw new Error('a pesquisa piscou ou removeu os canais que já estavam visíveis');
      await waitForIptvRequests(recordRequestCount); await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      if (iptvRequests.at(-1)?.query !== 'Record') throw new Error('a pesquisa por Enter não enviou o termo IPTV');
      const brazilRequestCount = iptvRequests.length + 1;
      await page.locator('#iptvCountry').selectOption('BR');
      await waitForIptvRequests(brazilRequestCount); await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      if (iptvRequests.at(-1)?.country !== 'BR') throw new Error('a alteração do país não atualizou os resultados');
      if (!(await page.locator('#iptvFilterSummary').textContent()).includes('Brasil')) throw new Error('o resumo compacto de filtros ativos não foi atualizado');
      await page.locator('#iptvQuery').fill('geoblock');
      const geoRequestCount = iptvRequests.length + 1;
      await page.locator('#iptvQuery').press('Enter'); await waitForIptvRequests(geoRequestCount);
      await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      if ((await page.locator('#iptvResults').textContent()).includes('SIC Notícias')) throw new Error('o catálogo IPTV expôs um canal geo-blocked recebido na resposta');
      const clearRequestCount = iptvRequests.length + 1;
      await page.locator('#clearIptvFilters').click(); await waitForIptvRequests(clearRequestCount);
      await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      if (await page.locator('#iptvQuery').inputValue() !== '' || await page.locator('#iptvCountry').inputValue() !== '' || iptvRequests.at(-1)?.query !== '') throw new Error('Limpar filtros não restaurou os valores nem os resultados');
      await page.locator('#iptvQuery').fill('corrida');
      const corridaRequestCount = iptvRequests.length + 1;
      await page.locator('#iptvQuery').press('Enter');
      if (await page.locator('#iptvResults').getAttribute('aria-busy') !== 'true') throw new Error('o estado de carregamento não foi definido na primeira consulta concorrente');
      await waitForIptvRequests(corridaRequestCount);
      const latestBrazilRequestCount = iptvRequests.length + 1;
      await page.locator('#iptvCountry').selectOption('BR');
      await waitForIptvRequests(latestBrazilRequestCount); await page.waitForFunction(() => document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      await page.waitForTimeout(180);
      if ((await page.locator('#iptvResults').textContent()).includes('Resposta antiga')) throw new Error('uma resposta IPTV obsoleta sobrescreveu os filtros mais recentes');
      await page.locator('#clearIptvFilters').click();
      await page.waitForFunction(() => document.querySelector('#iptvStatus')?.textContent.includes('1–1 de') && document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      await page.locator('#iptvQuery').fill('falha');
      const failedRequestCount = iptvRequests.length + 1;
      await page.locator('#iptvQuery').press('Enter'); await waitForIptvRequests(failedRequestCount);
      await page.waitForFunction(() => document.querySelector('#iptvStatus')?.textContent === 'Não foi possível atualizar' && document.querySelector('#iptvResults')?.getAttribute('aria-busy') === 'false');
      if (await page.locator('#iptvResults .ent-card').count() !== 1) throw new Error('uma falha transitória apagou o catálogo IPTV já visível');
      if (await page.locator('#iptvFilters').evaluate(form => form.scrollWidth > form.clientWidth + 1)) throw new Error(`os filtros IPTV têm overflow em ${width}px`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error(`overflow em ${width}px`);
      await page.locator('.ent-nav-link[data-view="home"]').click();
      await page.route('**/api/entertainment/home', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hero: null, rows: [] }) }));
      await page.locator('#refreshEntertainment').click();
      await page.locator('.ent-catalog-empty').waitFor();
      if (!(await page.locator('.ent-catalog-empty').textContent()).includes('Sem coleções disponíveis')) throw new Error('estado vazio do catálogo não foi explicado');
      await page.locator('[data-catalog-retry]').click();
      await page.locator('.ent-catalog-empty').waitFor();
      await page.locator('[data-catalog-search]').click();
      if (!(await page.locator('#entSearchZone').isVisible())) throw new Error('ação pesquisar não abriu a pesquisa global');
      await page.locator('#closeEntertainmentSearch').click();
      await context.close();
    }
    console.log('ENTERTAINMENT_NETFLIX_E2E_OK');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error('ENTERTAINMENT_NETFLIX_E2E_FAIL', error.stack || error.message); process.exit(1); });
