(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const time = s => { const n = Number(s || 0); return n ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}` : '—'; };
  const root = document.body;
  const area = root.dataset.space || 'music';
  document.documentElement.dataset.theme = localStorage.getItem('tubematex-theme') || 'dark';
  root.dataset.autoplay = localStorage.getItem('tubematex-autoplay') !== 'false' ? 'true' : 'false';

  function initEntertainment() {
    const hero = $('#entHero');
    const heroBackdrop = $('#heroBackdrop');
    const heroTitle = $('#heroTitle');
    const heroMeta = $('#heroMeta');
    const heroDescription = $('#heroDescription');
    const heroSource = $('#heroSource');
    const heroPlay = $('#heroPlay');
    const heroMore = $('#heroMore');
    const heroList = $('#heroList');
    const rows = $('#entertainmentRows');
    const personalRows = $('#personalRows');
    const status = $('#spaceStatus');
    const videoDrawer = $('#videoDrawer');
    const video = $('#spaceVideo');
    const videoLoading = $('#videoLoading');
    const videoError = $('#videoError');
    const videoPlayToggle = $('#videoPlayToggle');
    const videoCurrentTime = $('#videoCurrentTime');
    const videoDuration = $('#videoDuration');
    const videoSeek = $('#videoSeek');
    const videoMute = $('#videoMute');
    const videoVolume = $('#videoVolume');
    const videoFullscreen = $('#videoFullscreen');
    const videoPlayerNote = $('#videoPlayerNote');
    const videoOpenSource = $('#videoOpenSource');
    const detailDrawer = $('#entDetailDrawer');
    const detailArt = $('#detailArt');
    const detailTitle = $('#detailTitle');
    const detailKicker = $('#detailKicker');
    const detailMeta = $('#detailMeta');
    const detailDescription = $('#detailDescription');
    const detailFacts = $('#detailFacts');
    const detailSource = $('#detailSource');
    const detailPlay = $('#detailPlay');
    const detailList = $('#detailList');
    const detailDownload = $('#detailDownload');
    const detailSeries = $('#detailSeries');
    const detailSeriesStatus = $('#detailSeriesStatus');
    const detailSeason = $('#detailSeason');
    const detailEpisodes = $('#detailEpisodes');
    const searchZone = $('#entSearchZone');
    const searchResults = $('#spaceResults');
    const iptvResults = $('#iptvResults');
    const iptvStatus = $('#iptvStatus');
    const itemMap = new Map();
    let homePayload = null;
    let heroItem = null;
    let detailItem = null;
    let activeView = 'home';
    let currentItem = null;
    let currentStreamUrl = '';
    let hls = null;
    let dash = null;
    const PROGRESS_KEY = 'tubematex-entertainment-progress';
    const LIST_KEY = 'tubematex-entertainment-list';

    function readJson(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; } }
    function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
    function keyOf(item) { return item?.id || item?.url || ''; }
    function safeItem(item) { return { id: item?.id || keyOf(item), title: item?.title || 'Resultado sem título', url: item?.url || '', externalUrl: item?.externalUrl || item?.url || '', thumbnail: item?.thumbnail || '', duration: Number(item?.duration || 0), site: item?.site || 'Fonte pública', uploader: item?.uploader || '', description: item?.description || '', kind: item?.kind || 'video', live: Boolean(item?.live || item?.kind === 'live'), directStream: Boolean(item?.directStream), metadataOnly: Boolean(item?.metadataOnly), mimeType: item?.mimeType || '', country: item?.country || '', language: item?.language || '', languages: Array.isArray(item?.languages) ? item.languages : [], categories: Array.isArray(item?.categories) ? item.categories : [], quality: item?.quality || '', availabilityLabel: item?.availabilityLabel || '', playlistUrl: item?.playlistUrl || '', referrer: item?.referrer || null, userAgent: item?.userAgent || null, requiresExternalPlayer: Boolean(item?.requiresExternalPlayer || item?.referrer || item?.userAgent) }; }
    function progressItems() { return readJson(PROGRESS_KEY, []).filter(item => item?.url && Number(item.progressSeconds) > 5).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)); }
    function listItems() { return readJson(LIST_KEY, []).filter(item => item?.url); }
    function notify(text, kind = '') { if (status) { status.textContent = text; status.dataset.kind = kind; } }
    function register(item) { const value = safeItem(item); const key = keyOf(value); if (key) itemMap.set(key, value); return value; }
    function typeLabel(item) { if (item.live) return 'Ao vivo'; if (item.kind === 'film') return 'Filme'; if (item.kind === 'series') return 'Série'; if (item.kind === 'music') return 'Vídeo musical'; return 'Vídeo'; }
    function languageLabel(item) { return item.language || item.languages?.[0] || ''; }
    function metaText(item) { return [typeLabel(item), item.site, item.duration ? time(item.duration) : '', item.country].filter(Boolean); }
    function card(item) {
      const value = register(item);
      const id = keyOf(value);
      const progress = progressItems().find(entry => keyOf(entry) === id);
      const percent = progress && Number(progress.durationSeconds) > 0 ? Math.min(100, Number(progress.progressSeconds) / Number(progress.durationSeconds) * 100) : 0;
      const metadataAction = value.metadataOnly ? 'Abrir fonte' : value.live ? 'Ver direto' : 'Ver agora';
      const facts = [value.country, languageLabel(value), value.quality, value.availabilityLabel].filter(Boolean).slice(0, 3);
      return `<article class="ent-card" data-item-id="${esc(id)}"><div class="ent-card-art">${value.thumbnail ? `<img src="${esc(value.thumbnail)}" alt="" loading="lazy">` : '<div class="ent-card-art-fallback">TMX</div>'}<span class="ent-card-badge">${esc(value.site)}</span>${value.live ? '<span class="ent-card-live">AO VIVO</span>' : ''}${percent ? `<div class="ent-card-progress"><span style="width:${percent}%"></span></div>` : ''}</div><div class="ent-card-copy"><h4>${esc(value.title)}</h4><p>${esc(value.uploader || (value.live ? 'Canal público' : 'Fonte pública'))}</p>${facts.length ? `<div class="ent-card-facts">${facts.map(fact => `<span>${esc(fact)}</span>`).join('')}</div>` : ''}<div class="ent-card-actions"><button class="primary" type="button" data-action="play">${metadataAction}</button><button type="button" data-action="details" aria-label="Ver detalhes de ${esc(value.title)}">ⓘ</button><button type="button" data-action="list" aria-label="Adicionar ${esc(value.title)} à Minha lista">${listItems().some(entry => keyOf(entry) === id) ? '✓' : '＋'}</button>${value.live || value.metadataOnly ? '' : '<button type="button" data-action="download" aria-label="Descarregar ' + esc(value.title) + '">↓</button>'}</div></div></article>`;
    }
    function empty(message) { return `<div class="ent-empty-state">${esc(message)}</div>`; }
    function renderRail(row, className = '') { return `<section class="ent-rail ${className}" data-rail-id="${esc(row.id)}"><div class="ent-rail-heading"><h3>${esc(row.title)}</h3><span>${row.items.length} ${row.items.length === 1 ? 'item' : 'itens'} · origem visível</span></div><div class="ent-card-rail">${row.items.map(card).join('')}</div></section>`; }
    function renderRows(rowList) { if (!rows) return; rows.innerHTML = rowList?.length ? rowList.map(row => renderRail(row)).join('') : empty('Não existem resultados reais disponíveis para esta coleção neste momento.'); }
    function renderPersonal() {
      const progress = progressItems();
      const list = listItems();
      const chunks = [];
      if (progress.length) chunks.push(renderRail({ id: 'continue', title: 'Continuar a ver', items: progress.map(item => ({ ...item, duration: Number(item.durationSeconds || item.duration || 0) })) }, 'ent-personal-rail'));
      if (activeView === 'my-list' && list.length) chunks.push(renderRail({ id: 'my-list', title: 'Minha lista', items: list }, 'ent-personal-rail'));
      else if (activeView === 'home' && list.length) chunks.push(renderRail({ id: 'my-list', title: 'Guardados para depois', items: list }, 'ent-personal-rail'));
      personalRows.innerHTML = chunks.join('');
      personalRows.hidden = !chunks.length;
    }
    function setHero(item) {
      heroItem = item ? register(item) : null;
      heroEyebrow.textContent = 'TubeMateX Cine';
      heroTitle.textContent = 'Entretenimento com origem.';
      heroMeta.innerHTML = '<span>Filmes</span><span>Séries</span><span>TV ao vivo</span>';
      heroDescription.textContent = 'Uma experiência para descobrir cinema público, séries, anime, doramas, novelas, documentários e canais ao vivo — com a origem, a disponibilidade e as limitações visíveis antes de assistir.';
      heroSource.textContent = heroItem?.thumbnail ? `${heroItem.site} · imagem de catálogo público` : 'Fontes públicas filtradas · sem catálogo proprietário';
      heroBackdrop.style.backgroundImage = heroItem?.thumbnail ? `url("${heroItem.thumbnail.replace(/"/g, '')}")` : '';
    }
    function showDetail(item) {
      detailItem = register(item); if (!detailItem) return;
      detailArt.style.backgroundImage = detailItem.thumbnail ? `url("${detailItem.thumbnail.replace(/"/g, '')}")` : '';
      detailTitle.textContent = detailItem.title;
      detailKicker.textContent = detailItem.live ? 'Canal ao vivo público' : `${typeLabel(detailItem)} · origem pública`;
      detailMeta.innerHTML = metaText(detailItem).map(value => `<span>${esc(value)}</span>`).join('');
      detailDescription.textContent = detailItem.description || `Este item foi encontrado em ${detailItem.site}. A disponibilidade, direitos e limitações pertencem à fonte original.`;
      const facts = [detailItem.country && `País: ${detailItem.country}`, languageLabel(detailItem) && `Idioma: ${languageLabel(detailItem)}`, detailItem.categories?.length && `Género: ${detailItem.categories.join(', ')}`, detailItem.quality && `Qualidade: ${detailItem.quality}`, detailItem.availabilityLabel && `Disponibilidade: ${detailItem.availabilityLabel}`].filter(Boolean);
      detailFacts.innerHTML = facts.map(fact => `<span>${esc(fact)}</span>`).join('');
      detailSource.href = detailItem.externalUrl || detailItem.url;
      detailPlay.textContent = detailItem.metadataOnly ? 'Abrir fonte' : detailItem.live ? 'Ver direto' : 'Ver agora';
      detailDownload.hidden = detailItem.live || detailItem.metadataOnly;
      detailList.textContent = listItems().some(entry => keyOf(entry) === keyOf(detailItem)) ? '✓ Na minha lista' : '＋ Minha lista';
      detailDrawer.hidden = false;
      loadEpisodes(detailItem);
    }
    function toggleList(item) {
      const value = register(item); if (!value) return;
      const current = listItems(); const index = current.findIndex(entry => keyOf(entry) === keyOf(value));
      if (index >= 0) { current.splice(index, 1); notify('Removido da Minha lista.', 'success'); } else { current.unshift(value); notify('Adicionado à Minha lista.', 'success'); }
      saveJson(LIST_KEY, current.slice(0, 100));
      if (detailItem && keyOf(detailItem) === keyOf(value)) detailList.textContent = listItems().some(entry => keyOf(entry) === keyOf(value)) ? '✓ Na minha lista' : '＋ Minha lista';
      setHero(heroItem); renderPersonal(); refreshListButtons();
    }
    function refreshListButtons() { const saved = new Set(listItems().map(keyOf)); document.querySelectorAll('[data-action="list"]').forEach(button => { const item = itemMap.get(button.closest('[data-item-id]')?.dataset.itemId); if (item) button.textContent = saved.has(keyOf(item)) ? '✓' : '＋'; }); }
    async function downloadItem(item) { const value = register(item); if (!value || value.live || value.metadataOnly) return notify(value?.live ? 'Canais live não podem ser descarregados.' : 'Este item só pode ser aberto na fonte oficial.', 'error'); notify('A adicionar à fila de download…'); try { const response = await fetch('/api/downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: value.url, format: 'mp4', quality: 'auto' }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Não foi possível iniciar o download.'); notify('Download adicionado à fila.', 'success'); } catch (error) { notify(error.message || 'Falha ao iniciar o download.', 'error'); } }
    async function loadEpisodes(item) {
      const value = register(item); const playlistUrl = value?.playlistUrl || (/([?&]list=)/i.test(value?.url || '') ? value.url : '');
      if (!playlistUrl || value.live || value.metadataOnly) { detailSeries.hidden = true; return; }
      detailSeries.hidden = false; detailSeriesStatus.textContent = 'A consultar a playlist…'; detailEpisodes.innerHTML = '<div class="ent-empty-state">A carregar episódios da fonte…</div>';
      try { const response = await fetch(`/api/media/playlist?url=${encodeURIComponent(playlistUrl)}`); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'A fonte não expõe episódios públicos.'); const seasons = Array.isArray(payload.seasons) ? payload.seasons : []; if (!seasons.length) throw new Error('A fonte não expõe temporadas ou episódios públicos.'); detailSeason.innerHTML = seasons.map(season => `<option value="${esc(season.seasonNumber)}">${esc(season.title)}</option>`).join(''); const drawEpisodes = () => { const season = seasons.find(entry => String(entry.seasonNumber) === String(detailSeason.value)) || seasons[0]; detailEpisodes.innerHTML = season.episodes.map((episode, index) => `<button class="ent-episode" type="button" data-episode-id="${esc(keyOf(episode))}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${esc(episode.title)}</strong><small>${episode.duration ? time(episode.duration) : 'Duração não informada'}</small></button>`).join(''); season.episodes.forEach(register); }; drawEpisodes(); detailSeason.onchange = drawEpisodes; detailSeriesStatus.textContent = `${seasons.length} ${seasons.length === 1 ? 'temporada' : 'temporadas'} · ${seasons.reduce((total, season) => total + season.episodes.length, 0)} episódios`; detailEpisodes.onclick = event => { const button = event.target.closest('[data-episode-id]'); const episode = itemMap.get(button?.dataset.episodeId); if (episode) showDetail(episode); };
      } catch (error) { detailSeriesStatus.textContent = 'Sem episódios'; detailEpisodes.innerHTML = `<div class="ent-empty-state">${esc(error.message || 'Esta fonte não expõe temporadas ou episódios.')}</div>`; }
    }
    function rememberProgress(seconds) {
      if (!currentItem || !currentItem.url || !Number.isFinite(seconds)) return;
      const current = progressItems().filter(entry => keyOf(entry) !== keyOf(currentItem));
      if (seconds > 5 && (!video.duration || seconds < video.duration - 3)) current.unshift({ ...safeItem(currentItem), progressSeconds: Math.floor(seconds), durationSeconds: Number(video.duration || currentItem.duration || 0), updatedAt: Date.now() });
      saveJson(PROGRESS_KEY, current.slice(0, 30)); renderPersonal();
    }
    function showPlayerError(message) { if (videoLoading) videoLoading.hidden = true; if (videoError) { videoError.innerHTML = `<span>${esc(message)}</span><button type="button" data-player-retry>Tentar novamente</button>`; videoError.hidden = false; videoError.querySelector('[data-player-retry]')?.addEventListener('click', () => currentItem && playItem(currentItem), { once: true }); } if (videoPlayToggle) videoPlayToggle.textContent = '▶'; notify(message, 'error'); }
    function hlsFailureMessage(data, item) { const statusCode = Number(data?.response?.code || data?.networkDetails?.status || 0); if (/geo-blocked/i.test(item?.availabilityLabel || '') || statusCode === 401 || statusCode === 403) return 'Este canal está bloqueado para esta região ou exige headers da fonte. Usa VLC, mpv ou abre a fonte original.'; if (statusCode === 404 || statusCode === 410) return 'O manifesto ou os segmentos deste canal já não estão disponíveis. Escolhe outro canal.'; if (data?.type === 'mediaError') return 'O codec deste canal não é compatível com o browser. Tenta VLC ou mpv.'; return 'A stream live está indisponível ou não pôde ser descodificada. Tenta a fonte externa.'; }
    async function playItem(item) {
      const value = register(item); if (!value) return;
      if (value.metadataOnly) { window.open(value.externalUrl || value.url, '_blank', 'noopener'); return; }
      if (!video) return;
      try {
        video.pause(); if (hls) { hls.destroy(); hls = null; } if (dash) { dash.reset(); dash = null; } video.removeAttribute('src'); video.load(); currentItem = value; currentStreamUrl = ''; if (videoError) videoError.hidden = true; if (videoLoading) videoLoading.hidden = false; videoDrawer.hidden = false; $('#videoTitle').textContent = value.title; $('#videoMeta').textContent = `${value.site}${value.live ? ' · Ao vivo' : ''}${value.availabilityLabel ? ` · ${value.availabilityLabel}` : ''}`; if (videoPlayerNote) videoPlayerNote.textContent = value.live ? 'Player interno · canal live HLS quando disponível' : 'Player interno · stream VOD fornecida pela fonte'; notify('A preparar reprodução…');
        if (value.live && (value.requiresExternalPlayer || /geo-blocked/i.test(value.availabilityLabel || ''))) { showPlayerError(/geo-blocked/i.test(value.availabilityLabel || '') ? 'Este canal está marcado como bloqueado para esta região. Usa VLC, mpv ou a fonte original.' : 'Este canal exige headers da fonte que o browser não pode enviar. Usa VLC, mpv ou a fonte original.'); return; }
        let payload = value.directStream || value.live ? { url: value.url, mimeType: value.mimeType || 'application/vnd.apple.mpegurl' } : null;
        if (!payload) { const response = await fetch(`/api/media/stream?url=${encodeURIComponent(value.url)}&type=video`); payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'A fonte não forneceu uma stream compatível.'); }
        if (!payload.url) throw new Error(payload.error || 'A fonte não forneceu uma stream compatível.');
        currentStreamUrl = payload.url;
        const isHls = /\.m3u8(?:$|\?)/i.test(payload.url);
        const isDash = /\.mpd(?:$|\?)/i.test(payload.url);
        if (isDash && videoPlayerNote) videoPlayerNote.textContent = 'Player interno · MPEG-DASH';
        if (isDash && window.dashjs?.MediaPlayer) { dash = window.dashjs.MediaPlayer().create(); dash.initialize(video, payload.url, false); dash.on(window.dashjs.MediaPlayer.events.ERROR, data => { if (data?.error) showPlayerError('Este stream MPEG-DASH não pôde ser reproduzido. Tenta VLC, mpv ou a fonte original.'); }); }
        else if (isHls && window.Hls?.isSupported()) { hls = new window.Hls({ enableWorker: true, lowLatencyMode: true }); hls.loadSource(payload.url); hls.attachMedia(video); hls.on(window.Hls.Events.MANIFEST_PARSED, () => { if (videoLoading) videoLoading.hidden = true; }); hls.on(window.Hls.Events.ERROR, (_event, data) => { if (data?.fatal) showPlayerError(hlsFailureMessage(data, value)); }); } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) video.src = payload.url;
        else if (!isHls && !isDash) video.src = payload.url;
        else if (isDash) throw new Error('Este browser não conseguiu carregar o player MPEG-DASH. Tenta VLC, mpv ou a fonte original.');
        else throw new Error('Este browser não suporta a reprodução HLS deste canal.');
        if (!hls && !dash) video.load(); video.addEventListener('loadedmetadata', () => { if (videoLoading) videoLoading.hidden = true; const saved = progressItems().find(entry => keyOf(entry) === keyOf(value)); if (saved?.progressSeconds && Number.isFinite(video.duration)) { try { video.currentTime = Math.min(saved.progressSeconds, Math.max(0, video.duration - 3)); } catch {} } }, { once: true }); notify('Reprodução pronta.', 'success');
        if (root.dataset.autoplay === 'true') await video.play().catch(() => {});
      } catch (error) { if (hls) { hls.destroy(); hls = null; } if (dash) { dash.reset(); dash = null; } video.removeAttribute('src'); video.load(); showPlayerError(error.message || 'Não foi possível reproduzir este item.'); }
    }
    function closeVideo() { if (video) { rememberProgress(video.currentTime || 0); video.pause(); if (hls) { hls.destroy(); hls = null; } if (dash) { dash.reset(); dash = null; } video.removeAttribute('src'); video.load(); } if (videoLoading) videoLoading.hidden = true; if (videoError) videoError.hidden = true; if (videoSeek) videoSeek.value = '0'; if (videoCurrentTime) videoCurrentTime.textContent = '0:00'; if (videoDuration) videoDuration.textContent = '0:00'; currentItem = null; currentStreamUrl = ''; videoDrawer.hidden = true; }
    function rowForView(view) { if (!homePayload) return []; const map = { home: homePayload.rows, movies: homePayload.rows.filter(row => row.id === 'films' || row.id === 'featured'), series: homePayload.rows.filter(row => row.id === 'series'), anime: homePayload.rows.filter(row => row.id === 'anime' || row.id === 'dorama'), sports: homePayload.rows.filter(row => row.id === 'sports'), portugal: homePayload.rows.filter(row => row.id === 'portugal'), brands: homePayload.rows.filter(row => row.id === 'brands'), live: homePayload.rows.filter(row => row.id === 'live' || row.id === 'news') }; return map[view] || []; }
    function activateView(view) { activeView = view; document.querySelectorAll('.ent-nav-link').forEach(button => button.classList.toggle('active', button.dataset.view === view)); if (view === 'live') { $('#iptvSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); loadIptv(); } else { renderRows(rowForView(view)); renderPersonal(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }
    async function loadHome() {
      try { const response = await fetch('/api/entertainment/home'); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o catálogo.'); homePayload = payload; setHero(payload.hero); renderRows(payload.rows || []); renderPersonal(); notify(`${payload.rows?.length || 0} coleções reais carregadas.`, 'success'); }
      catch (error) { homePayload = { rows: [] }; setHero(null); renderRows([]); renderPersonal(); notify(error.message || 'Catálogo indisponível.', 'error'); }
    }
    async function loadIptv() {
      const query = $('#iptvQuery')?.value.trim() || ''; const country = $('#iptvCountry')?.value || ''; const language = $('#iptvLanguage')?.value || ''; const category = $('#iptvCategory')?.value || '';
      iptvResults.innerHTML = '<div class="ent-loading-state">A validar canais públicos…</div>'; iptvStatus.textContent = 'A consultar iptv-org…';
      try { const response = await fetch(`/api/iptv/channels?limit=36&q=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}&language=${encodeURIComponent(language)}&category=${encodeURIComponent(category)}`); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Canais indisponíveis.'); const items = (payload.results || []).map(register); iptvResults.innerHTML = items.length ? items.map(card).join('') : empty('Nenhum canal aprovado corresponde aos filtros.'); iptvStatus.textContent = `${items.length} canais públicos · origem iptv-org`; notify(`${items.length} canais IPTV públicos encontrados.`, items.length ? 'success' : ''); }
      catch (error) { iptvResults.innerHTML = empty(error.message || 'Canais IPTV indisponíveis.'); iptvStatus.textContent = 'Consulta indisponível'; notify(error.message || 'Canais IPTV indisponíveis.', 'error'); }
    }
    async function loadSources() { const box = $('#iptvSourceList'); if (!box) return; try { const response = await fetch('/api/iptv/playlists'); const payload = await response.json(); box.innerHTML = `<div class="iptv-source-heading"><strong>Fontes auditadas</strong><span>${esc(payload.policy || '')}</span></div>` + (payload.sources || []).map(source => `<span class="iptv-source-tag ${esc(source.safety)}" title="${esc(source.note)}">${esc(source.label)} · ${esc(source.safety === 'filtered' ? 'filtrada' : source.safety === 'blocked' ? 'bloqueada' : 'não verificada')}</span>`).join(''); } catch { box.textContent = 'Estado das playlists indisponível; nenhuma lista externa foi importada.'; } }
    async function search(event) {
      event?.preventDefault(); const term = $('#spaceQuery').value.trim(); if (term.length < 2) return notify('Escreve pelo menos 2 caracteres para pesquisar.', 'error'); searchZone.hidden = false; searchResults.innerHTML = '<div class="ent-loading-state">A consultar fontes reais…</div>'; notify('A pesquisar no catálogo…');
      try { let payload; if (/^https?:\/\//i.test(term)) { const response = await fetch(`/api/media/info?url=${encodeURIComponent(term)}`); payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Não foi possível resolver este URL.'); payload = { results: [{ ...payload, url: term, kind: 'film' }] }; } else { const response = await fetch(`/api/search?q=${encodeURIComponent(term)}&type=film&limit=18`); payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'A pesquisa falhou.'); } const items = (payload.results || []).map(register); searchResults.innerHTML = items.length ? items.map(card).join('') : empty('Nenhum resultado real para esta pesquisa.'); notify(`${items.length} resultados encontrados.`, items.length ? 'success' : ''); searchZone.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (error) { searchResults.innerHTML = empty(error.message || 'A pesquisa falhou.'); notify(error.message || 'A pesquisa falhou.', 'error'); }
    }
    document.querySelectorAll('.ent-nav-link').forEach(button => button.addEventListener('click', () => activateView(button.dataset.view)));
    $('#openEntertainmentSearch')?.addEventListener('click', () => { searchZone.hidden = false; $('#spaceQuery')?.focus(); searchZone.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $('#closeEntertainmentSearch')?.addEventListener('click', () => { searchZone.hidden = true; });
    $('#spaceSearch')?.addEventListener('submit', search);
    $('#refreshEntertainment')?.addEventListener('click', () => { homePayload = null; loadHome(); });
    $('#loadIptv')?.addEventListener('click', loadIptv);
    ['iptvQuery', 'iptvCountry', 'iptvLanguage', 'iptvCategory'].forEach(id => { const control = $(`#${id}`); control?.addEventListener('change', () => { if (id !== 'iptvQuery') loadIptv(); }); });
    $('#iptvQuery')?.addEventListener('keydown', event => { if (event.key === 'Enter') loadIptv(); });
    $('#toggleIptv')?.addEventListener('click', event => { const body = $('#iptvBody'); const collapsed = body.hidden; body.hidden = !collapsed; event.currentTarget.textContent = collapsed ? 'Recolher' : 'Expandir'; event.currentTarget.setAttribute('aria-expanded', String(collapsed)); });
    document.addEventListener('click', event => { const cardEl = event.target.closest('.ent-card'); if (cardEl) { const item = itemMap.get(cardEl.dataset.itemId); if (item && event.target.closest('[data-action="play"]')) playItem(item); if (item && event.target.closest('[data-action="details"]')) showDetail(item); if (item && event.target.closest('[data-action="list"]')) toggleList(item); if (item && event.target.closest('[data-action="download"]')) downloadItem(item); } });
    heroPlay?.addEventListener('click', () => $('#entertainmentRows')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); heroMore?.addEventListener('click', () => $('#iptvSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); heroList?.addEventListener('click', () => $('#iptvSourceList')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    $('#closeDetail')?.addEventListener('click', () => { detailDrawer.hidden = true; }); detailDrawer?.addEventListener('click', event => { if (event.target.matches('[data-close-detail]')) detailDrawer.hidden = true; }); detailPlay?.addEventListener('click', () => { if (detailItem) { detailDrawer.hidden = true; playItem(detailItem); } }); detailList?.addEventListener('click', () => detailItem && toggleList(detailItem));
    async function openExternalPlayer(protocol) { if (!detailItem) return; try { let url = detailItem.url; if (!detailItem.directStream && !detailItem.live) { const response = await fetch(`/api/media/stream?url=${encodeURIComponent(detailItem.url)}&type=video`); const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.url) throw new Error(payload.error || 'A fonte não forneceu uma stream externa.'); url = payload.url; } notify(`A abrir no ${protocol.toUpperCase()}…`, 'success'); window.location.assign(`${protocol}://${url}`); } catch (error) { notify(`${protocol.toUpperCase()} indisponível: ${error.message || 'abre a fonte oficial.'}`, 'error'); } }
    detailDownload?.addEventListener('click', () => detailItem && downloadItem(detailItem));
    $('#detailInternal')?.addEventListener('click', () => { document.querySelectorAll('.ent-player-option').forEach(button => button.classList.toggle('active', button.id === 'detailInternal')); if (detailItem) { detailDrawer.hidden = true; playItem(detailItem); } }); $('#detailVlc')?.addEventListener('click', () => openExternalPlayer('vlc')); $('#detailMpv')?.addEventListener('click', () => openExternalPlayer('mpv'));
    const playerTime = seconds => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; };
    videoPlayToggle?.addEventListener('click', () => { if (!video) return; if (video.paused) video.play().catch(() => showPlayerError('A fonte não iniciou a reprodução. Usa a fonte original ou um player externo.')); else video.pause(); });
    video?.addEventListener('play', () => { if (videoPlayToggle) { videoPlayToggle.textContent = 'Ⅱ'; videoPlayToggle.setAttribute('aria-label', 'Pausar'); } });
    video?.addEventListener('pause', () => { if (videoPlayToggle) { videoPlayToggle.textContent = '▶'; videoPlayToggle.setAttribute('aria-label', 'Reproduzir'); } rememberProgress(video.currentTime || 0); });
    video?.addEventListener('timeupdate', () => { if (videoCurrentTime) videoCurrentTime.textContent = playerTime(video.currentTime); if (videoSeek && Number.isFinite(video.duration) && video.duration > 0) videoSeek.value = String((video.currentTime / video.duration) * 100); if (video.currentTime > 5 && Math.floor(video.currentTime) % 5 === 0) rememberProgress(video.currentTime); });
    video?.addEventListener('loadedmetadata', () => { if (videoDuration) videoDuration.textContent = playerTime(video.duration); if (videoLoading) videoLoading.hidden = true; });
    video?.addEventListener('error', () => showPlayerError('A fonte não pôde ser reproduzida neste browser. Tenta VLC, mpv ou a fonte original.'));
    videoSeek?.addEventListener('input', () => { if (video && Number.isFinite(video.duration)) video.currentTime = (Number(videoSeek.value) / 100) * video.duration; });
    videoVolume?.addEventListener('input', () => { if (video) { video.volume = Number(videoVolume.value); video.muted = video.volume === 0; if (videoMute) videoMute.textContent = video.muted ? '🔇' : '🔊'; } });
    videoMute?.addEventListener('click', () => { if (!video) return; video.muted = !video.muted; videoMute.textContent = video.muted ? '🔇' : '🔊'; });
    videoFullscreen?.addEventListener('click', () => { const target = videoDrawer || $('.video-drawer'); if (target?.requestFullscreen) target.requestFullscreen().catch(() => {}); else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen(); });
    videoOpenSource?.addEventListener('click', () => currentItem && window.open(currentItem.externalUrl || currentItem.url, '_blank', 'noopener'));
    $('#closeVideo')?.addEventListener('click', closeVideo); video?.addEventListener('ended', () => { const current = progressItems().filter(item => keyOf(item) !== keyOf(currentItem)); saveJson(PROGRESS_KEY, current); renderPersonal(); });
    loadSources(); loadHome();
  }

  if (area === 'entertainment') return initEntertainment();

  const selectedSources = { music: ['youtube', 'soundcloud', 'vimeo', 'twitch'], social: ['youtube', 'vimeo', 'twitch'] };
  let selectedSource = 'all'; let activeFilter = 'all'; let resultItems = []; const audio = $('#spaceAudio'); const video = $('#spaceVideo'); const drawer = $('#videoDrawer'); const results = $('#spaceResults'); const query = $('#spaceQuery'); const status = $('#spaceStatus'); const playerTitle = $('#spacePlayerTitle'); const playerArtist = $('#spacePlayerArtist'); const playerCover = $('#spacePlayerCover'); const playerEmpty = $('#spacePlayerEmpty'); const playerBody = $('#spacePlayerBody'); const playerSeek = $('#spacePlayerSeek'); const playerCurrent = $('#spacePlayerCurrent'); const playerDuration = $('#spacePlayerDuration'); let current = null; let controller = null;
  function notify(text, kind = '') { if (status) { status.textContent = text; status.dataset.kind = kind; } }
  function stopMedia() { [audio, video].forEach(media => { if (media) { media.pause(); media.removeAttribute('src'); media.load(); } }); if (drawer) drawer.hidden = true; }
  async function stream(item) { if (item.metadataOnly) return notify('Este item é metadata-only. Abre a fonte oficial para reproduzir.', 'error'); stopMedia(); current = item; const type = area === 'music' ? 'audio' : 'video'; notify('A preparar pré-visualização…'); try { let payload; if (item.directStream) payload = { url: item.url, mimeType: item.mimeType || 'video/mp4' }; else { const response = await fetch(`/api/media/stream?url=${encodeURIComponent(item.url)}&type=${type}`); payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'A fonte não forneceu uma stream compatível.'); } if (!payload.url) throw new Error(payload.error || 'A fonte não forneceu uma stream compatível.'); if (area === 'music') { audio.src = payload.url; audio.load(); playerTitle.textContent = item.title; playerArtist.textContent = item.uploader || item.site || 'Fonte pública'; playerCover.style.backgroundImage = item.thumbnail ? `url("${item.thumbnail.replace(/"/g, '')}")` : ''; playerEmpty.hidden = true; playerBody.hidden = false; if (root.dataset.autoplay === 'true') await audio.play().catch(() => {}); } else { video.src = payload.url; $('#videoTitle').textContent = item.title; $('#videoMeta').textContent = `${item.site || 'Fonte'}${item.uploader ? ` · ${item.uploader}` : ''}`; drawer.hidden = false; if (root.dataset.autoplay === 'true') await video.play().catch(() => {}); } notify('Pré-visualização pronta.', 'success'); } catch (error) { stopMedia(); notify(error.message || 'Não foi possível abrir a pré-visualização.', 'error'); } }
  function card(item) { const isVideo = area !== 'music'; const isSocial = area === 'social'; const isLive = Boolean(item.live || item.kind === 'live'); const cardClass = isSocial ? 'social-card' : isVideo ? 'catalog-card' : 'track-row'; const thumbClass = isSocial ? 'social-thumb' : isVideo ? 'catalog-poster' : 'track-cover-wrap'; const bodyClass = isSocial ? 'social-card-body' : isVideo ? 'catalog-card-body' : 'track-copy'; const actionClass = isSocial ? 'social-card-actions' : isVideo ? 'catalog-card-actions' : 'track-actions'; const sourceAction = item.metadataOnly ? `<a class="space-button primary" href="${esc(item.externalUrl || item.url)}" target="_blank" rel="noopener">Abrir fonte</a>` : `<button class="space-button preview-action" type="button">${isLive ? 'Ver direto' : isVideo ? 'Abrir vídeo' : 'Ouvir'}</button>${isLive ? '' : '<button class="space-button primary download-action" type="button">Baixar</button>'}`; return `<article class="${cardClass}" data-url="${esc(item.url)}" data-live="${isLive}" data-direct-stream="${Boolean(item.directStream || isLive)}" data-metadata-only="${Boolean(item.metadataOnly)}" data-mime-type="${esc(item.mimeType || '')}"><div class="${thumbClass}">${item.thumbnail ? `<img class="${isVideo ? '' : 'track-cover'}" src="${esc(item.thumbnail)}" alt="" loading="lazy">` : `<div class="${isVideo ? 'social-thumb-fallback' : 'track-cover track-cover-empty'}">${isVideo ? 'VIDEO' : 'AUDIO'}</div>`}${isVideo && item.site ? `<span class="${isSocial ? 'social-badge' : 'catalog-badge'}">${esc(item.site)}</span>` : ''}${item.duration ? `<span class="duration-badge">${time(item.duration)}</span>` : ''}</div><div class="${bodyClass}"><h3>${esc(item.title || 'Resultado sem título')}</h3><p>${esc(item.uploader || item.site || 'Fonte pública')} ${item.live ? '· Ao vivo' : ''}</p>${!isVideo ? `<span class="track-meta">${esc(item.site || 'Fonte')} · ${time(item.duration)}</span>` : `<span class="catalog-meta">${esc(item.kind === 'film' ? 'Filme ou série' : 'Vídeo longo')} · ${time(item.duration)}</span>`}<div class="${actionClass}">${sourceAction}</div></div></article>`; }
  function matchesFilter(item) { if (activeFilter === 'all') return true; const haystack = `${item.title || ''} ${item.uploader || ''} ${item.description || ''}`.toLowerCase(); if (activeFilter === 'movies') return item.kind === 'film' || /movie|film|filme|cinema/.test(haystack); if (activeFilter === 'series') return item.kind === 'series' || /series|season|episode|série|episódio/.test(haystack); if (activeFilter === 'anime') return /anime|manga|japan animation/.test(haystack); if (activeFilter === 'dorama') return /dorama|k-drama|korean drama|j-drama/.test(haystack); return true; }
  function render(items) { resultItems = items || []; const visible = resultItems.filter(matchesFilter); results.innerHTML = visible.length ? visible.map(card).join('') : `<div class="space-state">Não há itens com metadata de ${activeFilter === 'all' ? 'esta fonte' : activeFilter}. Pesquisa outro termo ou remove o filtro.</div>`; }
  async function download(item) { notify('A iniciar download…'); try { const response = await fetch('/api/downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: item.url, format: area === 'music' ? 'mp3' : 'mp4', quality: 'auto' }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Não foi possível iniciar o download.'); notify('Download adicionado à fila.', 'success'); } catch (error) { notify(error.message || 'Falha ao iniciar download.', 'error'); } }
  results?.addEventListener('click', event => { const cardEl = event.target.closest('[data-url]'); if (!cardEl) return; const item = { url: cardEl.dataset.url, title: $('h3', cardEl)?.textContent || 'Conteúdo', site: $('p', cardEl)?.textContent || '', thumbnail: $('img', cardEl)?.src || '', live: cardEl.dataset.live === 'true', directStream: cardEl.dataset.directStream === 'true', metadataOnly: cardEl.dataset.metadataOnly === 'true', mimeType: cardEl.dataset.mimeType || '' }; if (event.target.closest('.preview-action')) stream(item); if (event.target.closest('.download-action')) download(item); });
  $('#spaceSearch')?.addEventListener('submit', event => { event.preventDefault(); const term = query.value.trim(); if (term.length < 2) return notify('Escreve pelo menos 2 caracteres para pesquisar.', 'error'); if (controller) controller.abort(); controller = new AbortController(); notify('A pesquisar nas fontes configuradas…'); results.innerHTML = '<div class="space-state">A consultar resultados reais…</div>'; fetch(`/api/search?q=${encodeURIComponent(term)}&type=${area === 'music' ? 'music' : 'video'}&source=${encodeURIComponent(selectedSource)}&limit=16`, { signal: controller.signal }).then(async response => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'A pesquisa falhou.'); render(payload.results || []); notify(`${payload.results?.length || 0} resultados encontrados.`, 'success'); }).catch(error => { if (error.name !== 'AbortError') { render([]); notify(error.message || 'A pesquisa falhou.', 'error'); } }); });
  fetch('/api/platforms').then(r => r.json()).then(payload => { const allowed = selectedSources[area] || []; const box = $('#spaceSources'); const list = (payload.platforms || []).filter(p => allowed.includes(p.id)); if (box) box.innerHTML = `<button class="space-chip active" data-source="all">Todas as fontes</button>` + list.map(p => `<button class="space-chip" data-source="${esc(p.id)}">${esc(p.label)}${p.mode === 'metadata-only' ? ' · catálogo' : ''}</button>`).join(''); }).catch(() => {});
  $('#spaceSources')?.addEventListener('click', event => { const button = event.target.closest('[data-source]'); if (!button) return; selectedSource = button.dataset.source; document.querySelectorAll('#spaceSources [data-source]').forEach(item => item.classList.toggle('active', item === button)); if (query.value.trim().length >= 2) $('#spaceSearch').requestSubmit(); });
})();
