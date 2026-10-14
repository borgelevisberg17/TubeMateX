(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const time = s => { const n = Number(s || 0); return n ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}` : '—'; };
  const root = document.body;
  const area = root.dataset.space || 'music';
  document.documentElement.dataset.theme = localStorage.getItem('tubematex-theme') || 'dark';
  root.dataset.autoplay = localStorage.getItem('tubematex-autoplay') !== 'false' ? 'true' : 'false';

  function initEntertainment() {
    root.dataset.entView = 'home';
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
    const videoPip = $('#videoPip');
    const videoPlaybackRate = $('#videoPlaybackRate');
    const videoQuality = $('#videoQuality');
    const videoPlayerNote = $('#videoPlayerNote');
    const videoContentBadge = $('#videoContentBadge');
    const videoOpenSource = $('#videoOpenSource');
    const ytPlayerStage = $('#ytPlayerStage');
    const ytCenterPlay = $('#ytCenterPlay');
    const videoRewind10 = $('#videoRewind10');
    const videoForward10 = $('#videoForward10');
    const ytSeekProgress = $('#ytSeekProgress');
    const ytLiveBadge = $('#ytLiveBadge');
    const ytTimeSep = $('#ytTimeSep');
    let userInactiveTimer = null;
    let playerStartupTimer = null;
    let previousVideoFocus = null;
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
    let iptvOffset = 0;
    let iptvTotal = 0;
    let iptvRequestSequence = 0;
    let currentItem = null;
    let currentStreamUrl = '';
    let failedStreamUrls = new Set();
    let hls = null;
    let hlsRecoveryAttempts = 0;
    let dash = null;
    let playbackGeneration = 0;
    let playbackAbortController = null;
    const PROGRESS_KEY = 'tubematex-entertainment-progress';
    const LIST_KEY = 'tubematex-entertainment-list';

    function readJson(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; } }
    function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
    function keyOf(item) { return item?.id || item?.url || ''; }
    function safeItem(item) { return { id: item?.id || keyOf(item), title: item?.title || 'Resultado sem título', url: item?.url || '', externalUrl: item?.externalUrl || item?.url || '', thumbnail: item?.thumbnail || '', duration: Number(item?.duration || 0), site: item?.site || 'Fonte pública', uploader: item?.uploader || '', description: item?.description || '', kind: item?.kind || 'video', live: Boolean(item?.live || item?.kind === 'live'), directStream: Boolean(item?.directStream), metadataOnly: Boolean(item?.metadataOnly), mimeType: item?.mimeType || '', country: item?.country || '', language: item?.language || '', languages: Array.isArray(item?.languages) ? item.languages : [], categories: Array.isArray(item?.categories) ? item.categories : [], quality: item?.quality || '', availabilityLabel: item?.availabilityLabel || '', playlistUrl: item?.playlistUrl || '', feedCount: Number(item?.feedCount || 0), streamCount: Number(item?.streamCount || 0), feeds: Array.isArray(item?.feeds) ? item.feeds : [], streams: Array.isArray(item?.streams) ? item.streams : [], streamAvailable: item?.streamAvailable !== false && Boolean(item?.url), referrer: item?.referrer || null, userAgent: item?.userAgent || null, requiresExternalPlayer: Boolean(item?.requiresExternalPlayer || item?.referrer || item?.userAgent) }; }
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
      const canPlay = !value.metadataOnly && (!value.live || value.streamAvailable) && Boolean(value.url);
      const metadataAction = value.metadataOnly || !canPlay ? 'Abrir fonte' : value.live ? 'Ver direto' : 'Ver agora';
      const facts = [value.country, languageLabel(value), value.quality, value.availabilityLabel, value.feedCount ? `${value.feedCount} feed${value.feedCount === 1 ? '' : 's'}` : '', value.streamCount ? `${value.streamCount} stream${value.streamCount === 1 ? '' : 's'}` : ''].filter(Boolean).slice(0, 4);
      const initials = String(value.channelName || value.title || 'TMX').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
      const isInList = listItems().some(entry => keyOf(entry) === id);
      return `<article class="ent-card" data-item-id="${esc(id)}"><div class="ent-card-art">${value.thumbnail ? `<img class="${value.live ? 'ent-channel-logo' : ''}" src="${esc(value.thumbnail)}" alt="" loading="lazy">` : `<div class="ent-card-art-fallback ${value.live ? 'ent-channel-logo-fallback' : ''}" aria-hidden="true">${value.live ? esc(initials) : 'TMX'}</div>`}<span class="ent-card-badge">${esc(value.site)}</span>${value.live ? `<span class="ent-card-live">${value.streamAvailable ? 'AO VIVO' : 'CATÁLOGO'}</span>` : ''}${percent ? `<div class="ent-card-progress"><span style="width:${percent}%"></span></div>` : ''}</div><div class="ent-card-copy"><h4>${esc(value.title)}</h4><p>${esc(value.uploader || (value.live ? 'Canal público' : 'Fonte pública'))}</p>${facts.length ? `<div class="ent-card-facts">${facts.map(fact => `<span>${esc(fact)}</span>`).join('')}</div>` : ''}<div class="ent-card-actions"><button class="primary" type="button" data-action="play" ${value.externalUrl || canPlay ? '' : 'disabled'}>${metadataAction}</button><button type="button" data-action="details" aria-label="Ver detalhes de ${esc(value.title)}"><svg class="tmx-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></svg></button><button type="button" data-action="list" aria-label="${isInList ? 'Remover' : 'Adicionar'} ${esc(value.title)} ${isInList ? 'da' : 'à'} Minha lista"><svg class="tmx-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${isInList ? '<path d="m5 12 4 4L19 6"/>' : '<path d="M12 5v14M5 12h14"/>'}</svg></button>${value.live || value.metadataOnly ? '' : '<button type="button" data-action="download" aria-label="Descarregar ' + esc(value.title) + '"><svg class="tmx-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></svg></button>'}</div></div></article>`;
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
      if (detailItem.feedCount) detailMeta.insertAdjacentHTML('beforeend', `<span>${detailItem.feedCount} feed${detailItem.feedCount === 1 ? '' : 's'}</span>`);
      if (detailItem.streamCount) detailMeta.insertAdjacentHTML('beforeend', `<span>${detailItem.streamCount} stream${detailItem.streamCount === 1 ? '' : 's'} verificada${detailItem.streamCount === 1 ? '' : 's'}</span>`);
      detailDescription.textContent = detailItem.description || `Este item foi encontrado em ${detailItem.site}. A disponibilidade, direitos e limitações pertencem à fonte original.`;
      const facts = [detailItem.country && `País: ${detailItem.country}`, languageLabel(detailItem) && `Idioma: ${languageLabel(detailItem)}`, detailItem.categories?.length && `Género: ${detailItem.categories.join(', ')}`, detailItem.quality && `Qualidade: ${detailItem.quality}`, detailItem.availabilityLabel && `Disponibilidade: ${detailItem.availabilityLabel}`].filter(Boolean);
      detailFacts.innerHTML = facts.map(fact => `<span>${esc(fact)}</span>`).join('');
      detailSource.href = detailItem.externalUrl || detailItem.url;
      detailPlay.textContent = detailItem.metadataOnly ? 'Abrir fonte' : detailItem.live ? (detailItem.streamAvailable ? 'Ver direto' : 'Abrir fonte') : 'Ver agora';
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
    function refreshListButtons() { const saved = new Set(listItems().map(keyOf)); document.querySelectorAll('[data-action="list"]').forEach(button => { const item = itemMap.get(button.closest('[data-item-id]')?.dataset.itemId); if (!item) return; const isInList = saved.has(keyOf(item)); button.setAttribute('aria-label', `${isInList ? 'Remover' : 'Adicionar'} ${item.title} ${isInList ? 'da' : 'à'} Minha lista`); const svg = button.querySelector('svg'); if (svg) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', isInList ? 'm5 12 4 4L19 6' : 'M12 5v14M5 12h14'); svg.replaceChildren(path); } else button.textContent = isInList ? '✓' : '＋'; }); }
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
    function clearPlayerStartupTimer() { if (playerStartupTimer) window.clearTimeout(playerStartupTimer); playerStartupTimer = null; }
    function markPlayerReady(generation, message = '') { if (generation !== playbackGeneration) return; clearPlayerStartupTimer(); if (videoLoading) videoLoading.hidden = true; ytPlayerStage?.classList.remove('has-error'); if (message) notify(message, 'success'); }
    function armPlayerStartupTimer(generation = playbackGeneration) { clearPlayerStartupTimer(); playerStartupTimer = window.setTimeout(() => { if (generation !== playbackGeneration || !video) return; if (video.readyState >= 2) { clearPlayerStartupTimer(); return; } showPlayerError('A fonte não entregou dados de vídeo em 15 segundos. Tenta novamente ou abre a fonte original.', generation); }, 15000); }
    function activateVideoDrawer() { if (!videoDrawer) return; const opening = videoDrawer.hidden; videoDrawer.hidden = false; document.body.classList.add('tmx-player-open'); if (opening) { previousVideoFocus = document.activeElement; window.requestAnimationFrame(() => { if (!videoDrawer.hidden) $('#closeVideo')?.focus({ preventScroll: true }); }); } }
    function showPlayerError(message, generation = playbackGeneration) { if (generation !== playbackGeneration) return; clearPlayerStartupTimer(); if (videoLoading) videoLoading.hidden = true; ytPlayerStage?.classList.add('has-error'); if (videoError) { videoError.innerHTML = `<span>${esc(message)}</span><button type="button" data-player-retry>Tentar novamente</button>`; videoError.hidden = false; videoError.querySelector('[data-player-retry]')?.addEventListener('click', () => currentItem && playItem(currentItem), { once: true }); } if (videoPlayToggle) videoPlayToggle.textContent = '▶'; notify(message, 'error'); }
    function hlsFailureMessage(data, item) { const statusCode = Number(data?.response?.code || data?.networkDetails?.status || 0); if (/geo-blocked/i.test(item?.availabilityLabel || '') || statusCode === 401 || statusCode === 403) return 'Este canal está bloqueado para esta região ou exige headers da fonte. Usa VLC, mpv ou abre a fonte original.'; if (statusCode === 404 || statusCode === 410) return 'O manifesto ou os segmentos deste canal já não estão disponíveis. Escolhe outro canal.'; if (data?.type === 'mediaError') return 'O codec deste canal não é compatível com o browser. Tenta VLC ou mpv.'; return 'A stream live está indisponível ou não pôde ser descodificada. Tenta a fonte externa.'; }
    function resetUserActivity() {
      if (!ytPlayerStage) return;
      ytPlayerStage.classList.add('user-active');
      ytPlayerStage.classList.remove('user-inactive');
      if (userInactiveTimer) clearTimeout(userInactiveTimer);
      if (video && !video.paused) {
        userInactiveTimer = setTimeout(() => {
          ytPlayerStage.classList.add('user-inactive');
          ytPlayerStage.classList.remove('user-active');
        }, 3000);
      }
    }

    async function playItem(item) {
      const value = register(item); if (!value) return;
      if (value.metadataOnly || (value.live && !value.url)) { closeVideo(); if (value.externalUrl) window.open(value.externalUrl, '_blank', 'noopener'); else notify('Este item não tem uma fonte externa válida.', 'error'); return; }
      if (!video) return;
      const sameItem = Boolean(currentItem && keyOf(currentItem) === keyOf(value));
      const generation = ++playbackGeneration;
      clearPlayerStartupTimer();
      playbackAbortController?.abort(); playbackAbortController = null;
      if (!sameItem) failedStreamUrls = new Set();
      try {
        video.pause(); if (hls) { hls.destroy(); hls = null; } if (dash) { dash.reset(); dash = null; } video.removeAttribute('src'); video.removeAttribute('poster'); video.load(); currentItem = value; currentStreamUrl = ''; if (videoError) videoError.hidden = true; if (videoLoading) videoLoading.hidden = false; activateVideoDrawer(); ytPlayerStage?.classList.remove('has-error'); $('#videoTitle').textContent = value.title; video.setAttribute('aria-label', `Vídeo: ${value.title}`); if (value.thumbnail) video.poster = value.thumbnail; if (videoContentBadge) { videoContentBadge.textContent = value.live ? 'AO VIVO' : value.kind === 'film' ? 'FILME' : value.kind === 'series' ? 'SÉRIE' : 'VÍDEO'; videoContentBadge.dataset.live = String(value.live); } $('#videoMeta').textContent = `${value.site}${value.live ? ' · Ao vivo' : ''}${value.availabilityLabel ? ` · ${value.availabilityLabel}` : ''}`; if (videoPlayerNote) videoPlayerNote.textContent = value.live ? 'Player interno · canal live HLS quando disponível' : 'Player interno · stream VOD fornecida pela fonte'; notify('A preparar reprodução…');
        if (ytLiveBadge) ytLiveBadge.hidden = !value.live;
        if (videoDuration) videoDuration.hidden = Boolean(value.live);
        if (ytTimeSep) ytTimeSep.hidden = Boolean(value.live);
        if (videoRewind10) videoRewind10.hidden = Boolean(value.live);
        if (videoForward10) videoForward10.hidden = Boolean(value.live);
        if (videoSeek) videoSeek.disabled = Boolean(value.live);
        const seenUrls = new Set();
        const streamCandidates = [{ ...value, url: value.url }, ...(Array.isArray(value.streams) ? value.streams.map(stream => ({ ...value, ...stream })) : [])].filter(stream => {
          if (!stream.url || stream.requiresExternalPlayer || failedStreamUrls.has(stream.url) || seenUrls.has(stream.url)) return false;
          seenUrls.add(stream.url);
          return true;
        });
        if (value.live && (!streamCandidates.length || /geo-blocked/i.test(value.availabilityLabel || ''))) { showPlayerError(/geo-blocked/i.test(value.availabilityLabel || '') ? 'Este canal está marcado como bloqueado para esta região. Usa VLC, mpv ou a fonte original.' : 'As fontes deste canal exigem headers que o browser não pode enviar. Usa VLC, mpv ou a fonte original.', generation); return; }
        const selected = streamCandidates[0] || value;
        if (videoQuality) { videoQuality.innerHTML = '<option value="-1">Auto</option>'; videoQuality.hidden = true; }
        if (videoPlaybackRate) videoPlaybackRate.value = '1';
        if (videoPip) videoPip.hidden = !document.pictureInPictureEnabled;
        let payload = value.directStream || value.live ? { url: selected.url, mimeType: selected.mimeType || value.mimeType || 'application/vnd.apple.mpegurl' } : null;
        if (!payload) {
          const controller = new AbortController(); playbackAbortController = controller;
          const timeoutId = window.setTimeout(() => controller.abort(), 15000);
          try {
            const response = await fetch(`/api/media/stream?url=${encodeURIComponent(value.url)}&type=video`, { signal: controller.signal });
            payload = await response.json().catch(() => ({}));
            if (generation !== playbackGeneration) return;
            if (!response.ok) throw new Error(payload.error || 'A fonte não forneceu uma stream compatível.');
          } finally { window.clearTimeout(timeoutId); if (playbackAbortController === controller) playbackAbortController = null; }
        }
        if (generation !== playbackGeneration) return;
        if (!payload.url) throw new Error(payload.error || 'A fonte não forneceu uma stream compatível.');
        currentStreamUrl = payload.url;
        if (value.live && currentStreamUrl !== value.url && videoPlayerNote) videoPlayerNote.textContent = `Player interno · fonte alternativa${selected.label ? ` · ${selected.label}` : ''}`;
        const isHls = /\.m3u8(?:$|\?)/i.test(payload.url);
        const isDash = /\.mpd(?:$|\?)/i.test(payload.url);
        if (isDash && videoPlayerNote) videoPlayerNote.textContent = 'Player interno · MPEG-DASH';
        video.addEventListener('loadedmetadata', () => {
          if (generation !== playbackGeneration) return;
          if (videoDuration) videoDuration.textContent = playerTime(video.duration);
          markPlayerReady(generation, 'Reprodução preparada.');
          const saved = progressItems().find(entry => keyOf(entry) === keyOf(value));
          if (saved?.progressSeconds && Number.isFinite(video.duration)) { try { video.currentTime = Math.min(saved.progressSeconds, Math.max(0, video.duration - 3)); } catch {} }
          notify('Reprodução preparada.', 'success');
        }, { once: true });
        if (isDash && window.dashjs?.MediaPlayer) {
          const player = window.dashjs.MediaPlayer().create(); dash = player; player.initialize(video, payload.url, false); const readyEvent = window.dashjs.MediaPlayer.events.STREAM_INITIALIZED; if (readyEvent) player.on(readyEvent, () => { if (generation === playbackGeneration && video.paused) markPlayerReady(generation, 'Stream DASH encontrado. Pressiona Reproduzir para iniciar.'); });
          player.on(window.dashjs.MediaPlayer.events.ERROR, data => {
            if (generation !== playbackGeneration || !data?.error) return;
            failedStreamUrls.add(currentStreamUrl); player.reset(); if (dash === player) dash = null;
            const next = (value.streams || []).some(stream => stream.url && !failedStreamUrls.has(stream.url) && !stream.requiresExternalPlayer);
            if (next) { notify('A fonte DASH falhou; a tentar uma alternativa…', ''); playItem(value); }
            else showPlayerError('Este stream MPEG-DASH não pôde ser reproduzido. Tenta VLC, mpv ou a fonte original.', generation);
          });
        } else if (isHls && window.Hls?.isSupported()) {
          hlsRecoveryAttempts = 0;
          const player = new window.Hls({ enableWorker: true, lowLatencyMode: false, capLevelToPlayerSize: true, maxBufferLength: 20, maxMaxBufferLength: 45, maxBufferSize: 50 * 1000 * 1000, backBufferLength: 10, manifestLoadingMaxRetry: 3, levelLoadingMaxRetry: 3, fragLoadingMaxRetry: 5, manifestLoadingRetryDelay: 1000, levelLoadingRetryDelay: 1000, fragLoadingRetryDelay: 1000 });
          hls = player; player.loadSource(payload.url); player.attachMedia(video);
          player.on(window.Hls.Events.MANIFEST_PARSED, (_event, data) => {
            if (generation !== playbackGeneration) return;
            hlsRecoveryAttempts = 0;
            if (video.paused) markPlayerReady(generation, value.live ? 'Canal encontrado. Pressiona Reproduzir para iniciar.' : 'Stream HLS preparado. Pressiona Reproduzir para iniciar.');
            if (videoQuality && Array.isArray(data?.levels) && data.levels.length > 1) { videoQuality.innerHTML = '<option value="-1">Auto</option>' + data.levels.map((level, index) => `<option value="${index}">${level.height ? `${level.height}p` : `${Math.round(Number(level.bitrate || 0) / 1000)} kbps`}</option>`).join(''); videoQuality.hidden = false; }
          });
          player.on(window.Hls.Events.ERROR, (_event, data) => {
            if (generation !== playbackGeneration || !data?.fatal) return;
            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && hlsRecoveryAttempts < 3) { hlsRecoveryAttempts += 1; const attempt = hlsRecoveryAttempts; notify(`A reconectar ao stream… (${attempt}/3)`, ''); window.setTimeout(() => { if (generation === playbackGeneration && hls === player) player.startLoad(-1); }, 1000 * attempt); return; }
            if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && hlsRecoveryAttempts < 3) { hlsRecoveryAttempts += 1; notify(`A recuperar o media… (${hlsRecoveryAttempts}/3)`, ''); player.recoverMediaError(); return; }
            failedStreamUrls.add(currentStreamUrl); player.destroy(); if (hls === player) hls = null;
            if ((value.streams || []).some(stream => stream.url && !failedStreamUrls.has(stream.url) && !stream.requiresExternalPlayer)) { notify('A fonte falhou; a tentar uma alternativa…', ''); playItem(value); }
            else showPlayerError(hlsFailureMessage(data, value), generation);
          });
        } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) video.src = payload.url;
        else if (!isHls && !isDash) video.src = payload.url;
        else if (isDash) throw new Error('Este browser não conseguiu carregar o player MPEG-DASH. Tenta VLC, mpv ou a fonte original.');
        else throw new Error('Este browser não suporta a reprodução HLS deste canal.');
        if (!hls && !dash) video.load();
        armPlayerStartupTimer(generation);
        notify('A ligar à fonte de vídeo…');
        if (root.dataset.autoplay === 'true') { try { await video.play(); } catch { if (generation === playbackGeneration) { clearPlayerStartupTimer(); if (videoLoading) videoLoading.hidden = true; notify('A reprodução automática foi bloqueada. Pressiona Reproduzir para iniciar.', ''); } } }
      } catch (error) {
        if (generation !== playbackGeneration) return;
        if (hls) { hls.destroy(); hls = null; } if (dash) { dash.reset(); dash = null; }
        video.removeAttribute('src'); video.load();
        showPlayerError(error.name === 'AbortError' ? 'A fonte demorou demasiado a responder. Tenta novamente ou escolhe outra.' : (error.message || 'Não foi possível reproduzir este item.'), generation);
      }
    }
    function closeVideo() { const wasOpen = Boolean(videoDrawer && !videoDrawer.hidden); const returnFocus = previousVideoFocus?.isConnected ? previousVideoFocus : ($('#iptvQuery') || heroPlay); clearPlayerStartupTimer(); playbackGeneration += 1; playbackAbortController?.abort(); playbackAbortController = null; failedStreamUrls = new Set(); hlsRecoveryAttempts = 0; if (userInactiveTimer) window.clearTimeout(userInactiveTimer); if (video) { rememberProgress(video.currentTime || 0); video.pause(); if (hls) { hls.destroy(); hls = null; } if (dash) { dash.reset(); dash = null; } video.removeAttribute('src'); video.removeAttribute('poster'); video.load(); } if (videoLoading) videoLoading.hidden = true; if (videoError) videoError.hidden = true; ytPlayerStage?.classList.remove('has-error', 'playing', 'user-inactive'); if (videoSeek) videoSeek.value = '0'; if (videoCurrentTime) videoCurrentTime.textContent = '0:00'; if (videoDuration) videoDuration.textContent = '0:00'; currentItem = null; currentStreamUrl = ''; videoDrawer.hidden = true; if (returnFocus && detailDrawer?.contains(returnFocus)) detailDrawer.hidden = false; document.body.classList.remove('tmx-player-open'); previousVideoFocus = null; if (wasOpen) window.requestAnimationFrame(() => returnFocus?.focus({ preventScroll: true })); }
    function rowForView(view) { if (!homePayload) return []; const map = { home: homePayload.rows, movies: homePayload.rows.filter(row => row.id === 'films' || row.id === 'featured' || row.id === 'documentary'), series: homePayload.rows.filter(row => row.id === 'series'), anime: homePayload.rows.filter(row => row.id === 'anime' || row.id === 'dorama'), sports: homePayload.rows.filter(row => row.id === 'sports'), portugal: homePayload.rows.filter(row => row.id === 'portugal'), brands: homePayload.rows.filter(row => row.id === 'brands'), live: homePayload.rows.filter(row => row.id === 'live' || row.id === 'news') }; return map[view] || []; }
    function activateView(view) { activeView = view; root.dataset.entView = view; const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; document.querySelectorAll('.ent-nav-link').forEach(button => { const selected = button.dataset.view === view; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); }); if (view === 'live') { renderRows(rowForView(view)); renderPersonal(); $('#iptvSection')?.scrollIntoView({ behavior, block: 'start' }); loadIptv(); } else { renderRows(rowForView(view)); renderPersonal(); if (view === 'my-list' && !listItems().length) { if (rows) rows.innerHTML = empty('A tua lista está vazia. Explora o catálogo e clica em ＋ para guardar filmes, séries e canais.'); } window.scrollTo({ top: 0, behavior }); } }
    async function loadHome() {
      try { const response = await fetch('/api/entertainment/home'); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o catálogo.'); homePayload = payload; setHero(payload.hero); renderRows(payload.rows || []); renderPersonal(); notify(`${payload.rows?.length || 0} coleções reais carregadas.`, 'success'); }
      catch (error) { homePayload = { rows: [] }; setHero(null); renderRows([]); renderPersonal(); notify(error.message || 'Catálogo indisponível.', 'error'); }
    }
    async function loadIptv(append = false) {
      const results = $('#iptvResults'); const statusLine = $('#iptvStatus');
      if (!results || !statusLine) return;
      const requestId = ++iptvRequestSequence;
      const query = $('#iptvQuery')?.value.trim() || ''; const country = $('#iptvCountry')?.value || ''; const selectedLanguage = $('#iptvLanguage')?.value || ''; const language = ['por', 'eng'].includes(selectedLanguage) ? selectedLanguage : ''; const category = $('#iptvCategory')?.value || '';
      const loadButton = $('#loadIptv'); const moreButton = $('#loadMoreIptv');
      if (!append) { iptvOffset = 0; iptvTotal = 0; results.innerHTML = '<div class="ent-loading-state">Consultando canais públicos…</div>'; }
      statusLine.textContent = append ? 'Carregando mais canais verificados…' : 'Consultando e validando streams…';
      results.setAttribute('aria-busy', 'true');
      if (loadButton) loadButton.disabled = true;
      if (moreButton) moreButton.disabled = true;
      try {
        const response = await fetch(`/api/iptv/channels?limit=60&offset=${iptvOffset}&q=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}&language=${encodeURIComponent(language)}&category=${encodeURIComponent(category)}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Canais indisponíveis.');
        if (requestId !== iptvRequestSequence) return;
        const pending = Number(payload.pendingValidationCount || 0);
        const remaining = Number(payload.remainingValidationCount || 0);
        const items = (payload.results || []).map(register);
        if (!append) results.innerHTML = '';
        if (items.length) results.insertAdjacentHTML('beforeend', items.map(card).join(''));
        else if (!append && pending > 0) results.innerHTML = `<div class="ent-loading-state">A validar ${pending} fontes. Só serão mostrados canais com stream acessível e compatível.</div>`;
        else if (!append && remaining > 0) results.innerHTML = `<div class="ent-loading-state">Esta tranche não encontrou streams reproduzíveis. Ainda há ${remaining} canais por validar; usa o botão abaixo para continuar.</div>`;
        else if (!append) results.innerHTML = empty(Number(payload.candidateCount) ? 'Nenhuma stream passou a validação. Fontes protegidas, inacessíveis ou incompatíveis foram excluídas.' : 'Nenhum canal em português ou inglês corresponde aos filtros.');
        iptvTotal = Number(payload.total || 0);
        iptvOffset += items.length;
        statusLine.textContent = pending || remaining ? `${iptvOffset} reproduzíveis · ${pending} em validação · ${remaining} por validar · ${Number(payload.excludedCount || 0)} excluídos` : `${iptvOffset} de ${iptvTotal} canais validados · português/inglês`;
        if (moreButton) { moreButton.hidden = pending > 0 || !Boolean(payload.hasMore); moreButton.textContent = remaining > 0 ? `Validar mais fontes (${remaining} por verificar)` : `Carregar mais canais (${Math.max(0, iptvTotal - iptvOffset)} disponíveis)`; }
        if (!pending && !remaining) notify(`${iptvOffset} canais IPTV reproduzíveis carregados.`, items.length ? 'success' : '');
        else if (pending > 0 && !items.length) notify(`A verificar ${pending} canais IPTV em segundo plano…`, '');
        if (pending > 0 && !append) window.setTimeout(() => { if (requestId === iptvRequestSequence) loadIptv(false); }, 1800);
      } catch (error) {
        if (requestId !== iptvRequestSequence) return;
        if (!append) results.innerHTML = empty(error.message || 'Canais IPTV indisponíveis.');
        statusLine.textContent = 'Consulta indisponível';
        notify(error.message || 'Canais IPTV indisponíveis.', 'error');
      } finally {
        if (requestId === iptvRequestSequence) {
          results.setAttribute('aria-busy', 'false');
          if (loadButton) loadButton.disabled = false;
          if (moreButton) moreButton.disabled = false;
        }
      }
    }
    async function loadSources() {
      const box = $('#iptvSourceList'); if (!box) return;
      try {
        const [playlistResponse, catalogResponse, healthResponse] = await Promise.all([fetch('/api/iptv/playlists'), fetch('/api/entertainment/sources'), fetch('/api/entertainment/sources/health')]);
        const [playlists, catalog, health] = await Promise.all([playlistResponse.json(), catalogResponse.json(), healthResponse.ok ? healthResponse.json() : Promise.resolve({ sources: [] })]);
        const healthById = new Map((health.sources || []).map(source => [source.id, source]));
        const statusName = { online: 'API online', 'not-configured': 'não configurada', unavailable: 'API indisponível', error: 'erro ao validar' };
        const playlistTags = (playlists.sources || []).map(source => `<span class="iptv-source-tag ${esc(source.safety)}" title="${esc(source.note)}">${esc(source.label)} · ${esc(source.safety === 'filtered' ? 'filtrada' : source.safety === 'blocked' ? 'bloqueada' : 'não verificada')}</span>`).join('');
        const catalogTags = (catalog.sources || []).map(source => {
          const status = healthById.get(source.id); const suffix = status ? ` · ${statusName[status.status] || status.status}` : '';
          const label = `${source.label} · ${source.mode || 'metadata'}${source.configured === false ? ' · opcional' : ''}${suffix}`;
          const title = [source.policy, status?.note].filter(Boolean).join(' ');
          return source.url ? `<a class="iptv-source-tag catalog-source-tag" href="${esc(source.url)}" target="_blank" rel="noopener" title="${esc(title)}">${esc(label)}</a>` : `<span class="iptv-source-tag catalog-source-tag" title="${esc(title)}">${esc(label)}</span>`;
        }).join('');
        box.innerHTML = `<div class="iptv-source-heading"><strong>Fontes auditadas</strong><span>${esc(catalog.policy || playlists.policy || '')} A reachability da API não garante playback; fontes metadata-only não fornecem streams.</span></div>${playlistTags}${catalogTags}`;
      } catch { box.textContent = 'Estado das fontes indisponível; nenhuma lista externa foi importada.'; }
    }
    async function loadIptvMeta() {
      try {
        const response = await fetch('/api/iptv/meta'); if (!response.ok) return;
        const payload = await response.json(); const country = $('#iptvCountry'); const category = $('#iptvCategory'); const language = $('#iptvLanguage');
        const countryNames = { AO: 'Angola', BR: 'Brasil', PT: 'Portugal', US: 'Estados Unidos', GB: 'Reino Unido', KR: 'Coreia do Sul', JP: 'Japão', ES: 'Espanha', FR: 'França', DE: 'Alemanha', MZ: 'Moçambique', CV: 'Cabo Verde' };
        const categoryNames = { news: 'Notícias', movies: 'Filmes', series: 'Séries', documentary: 'Documentários', cooking: 'Cozinha', music: 'Música', religious: 'Religioso', kids: 'Infantil', animation: 'Anime/animação', sports: 'Desporto', general: 'Generalista', entertainment: 'Entretenimento', culture: 'Cultura', education: 'Educação' };
        if (language) { const selected = language.value; language.innerHTML = '<option value="">Português e inglês</option><option value="por">Português</option><option value="eng">Inglês</option>'; language.value = ['por', 'eng'].includes(selected) ? selected : ''; }
        if (country) country.innerHTML = '<option value="">Todos os países</option>' + (payload.countries || []).map(item => `<option value="${esc(item.code)}">${esc(countryNames[item.code] || item.code)} · ${item.count}</option>`).join('');
        if (category) category.innerHTML = '<option value="">Todas as categorias</option>' + (payload.categories || []).map(item => `<option value="${esc(item.id)}">${esc(categoryNames[item.id] || item.id)} · ${item.count}</option>`).join('');
      } catch {}
    }
    async function search(event) {
      event?.preventDefault(); const term = $('#spaceQuery').value.trim(); if (term.length < 2) return notify('Escreve pelo menos 2 caracteres para pesquisar.', 'error'); searchZone.hidden = false; searchResults.innerHTML = '<div class="ent-loading-state">A consultar fontes reais…</div>'; notify('A pesquisar no catálogo…');
      try { let payload; if (/^https?:\/\//i.test(term)) { const response = await fetch(`/api/media/info?url=${encodeURIComponent(term)}`); payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Não foi possível resolver este URL.'); payload = { results: [{ ...payload, url: term, kind: 'film' }] }; } else { const response = await fetch(`/api/entertainment/search?q=${encodeURIComponent(term)}`); payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'A pesquisa falhou.'); } const items = (payload.results || []).map(register); searchResults.innerHTML = items.length ? items.map(card).join('') : empty('Nenhum resultado real para esta pesquisa.'); notify(`${items.length} resultados encontrados.`, items.length ? 'success' : ''); searchZone.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (error) { searchResults.innerHTML = empty(error.message || 'A pesquisa falhou.'); notify(error.message || 'A pesquisa falhou.', 'error'); }
    }
    document.querySelectorAll('.ent-nav-link').forEach(button => button.addEventListener('click', () => activateView(button.dataset.view)));
    $('#openEntertainmentSearch')?.addEventListener('click', () => { searchZone.hidden = false; $('#spaceQuery')?.focus(); searchZone.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $('#closeEntertainmentSearch')?.addEventListener('click', () => { searchZone.hidden = true; });
    $('#spaceSearch')?.addEventListener('submit', search);
    $('#refreshEntertainment')?.addEventListener('click', () => { homePayload = null; loadHome(); });
    $('#iptvFilters')?.addEventListener('submit', event => { event.preventDefault(); loadIptv(false); });
    $('#clearIptvFilters')?.addEventListener('click', () => { $('#iptvFilters')?.reset(); loadIptv(false); });
    $('#loadMoreIptv')?.addEventListener('click', () => loadIptv(true));
    ['iptvQuery', 'iptvCountry', 'iptvLanguage', 'iptvCategory'].forEach(id => { const control = $(`#${id}`); control?.addEventListener('change', () => { if (id !== 'iptvQuery') loadIptv(false); }); });
    $('#toggleIptv')?.addEventListener('click', event => { const body = $('#iptvBody'); const collapsed = body.hidden; body.hidden = !collapsed; event.currentTarget.textContent = collapsed ? 'Recolher IPTV' : 'Expandir IPTV'; event.currentTarget.setAttribute('aria-expanded', String(collapsed)); });
    document.addEventListener('click', event => { const cardEl = event.target.closest('.ent-card'); if (cardEl) { const item = itemMap.get(cardEl.dataset.itemId); if (item && event.target.closest('[data-action="play"]')) playItem(item); if (item && event.target.closest('[data-action="details"]')) showDetail(item); if (item && event.target.closest('[data-action="list"]')) toggleList(item); if (item && event.target.closest('[data-action="download"]')) downloadItem(item); } });
    heroPlay?.addEventListener('click', () => $('#entertainmentRows')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); heroMore?.addEventListener('click', () => $('#iptvSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); heroList?.addEventListener('click', () => $('#iptvSourceList')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    $('#closeDetail')?.addEventListener('click', () => { detailDrawer.hidden = true; }); detailDrawer?.addEventListener('click', event => { if (event.target.matches('[data-close-detail]')) detailDrawer.hidden = true; }); detailPlay?.addEventListener('click', () => { if (detailItem) { detailDrawer.hidden = true; playItem(detailItem); } }); detailList?.addEventListener('click', () => detailItem && toggleList(detailItem));
    async function openExternalPlayer(protocol) { if (!detailItem) return; try { let url = detailItem.url; if (!detailItem.directStream && !detailItem.live) { const response = await fetch(`/api/media/stream?url=${encodeURIComponent(detailItem.url)}&type=video`); const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.url) throw new Error(payload.error || 'A fonte não forneceu uma stream externa.'); url = payload.url; } notify(`A abrir no ${protocol.toUpperCase()}…`, 'success'); window.location.assign(`${protocol}://${url}`); } catch (error) { notify(`${protocol.toUpperCase()} indisponível: ${error.message || 'abre a fonte oficial.'}`, 'error'); } }
    detailDownload?.addEventListener('click', () => detailItem && downloadItem(detailItem));
    $('#detailInternal')?.addEventListener('click', () => { document.querySelectorAll('.ent-player-option').forEach(button => button.classList.toggle('active', button.id === 'detailInternal')); if (detailItem) { detailDrawer.hidden = true; playItem(detailItem); } }); $('#detailVlc')?.addEventListener('click', () => openExternalPlayer('vlc')); $('#detailMpv')?.addEventListener('click', () => openExternalPlayer('mpv'));
    const playerTime = seconds => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; };
    const togglePlay = () => { if (!video) return; if (video.paused) video.play().catch(() => showPlayerError('A fonte não iniciou a reprodução. Usa a fonte original ou um player externo.')); else video.pause(); };
    videoPlayToggle?.addEventListener('click', togglePlay);
    ytCenterPlay?.addEventListener('click', togglePlay);
    videoRewind10?.addEventListener('click', () => { if (video) video.currentTime = Math.max(0, video.currentTime - 10); });
    videoForward10?.addEventListener('click', () => { if (video && Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, video.currentTime + 10); });
    ytPlayerStage?.addEventListener('mousemove', resetUserActivity);
    ytPlayerStage?.addEventListener('touchstart', resetUserActivity);
    video?.addEventListener('play', () => {
      if (ytPlayerStage) ytPlayerStage.classList.add('playing');
      if (video.readyState < 2) armPlayerStartupTimer(playbackGeneration);
      if (videoPlayToggle) { videoPlayToggle.textContent = 'Ⅱ'; videoPlayToggle.setAttribute('aria-label', 'Pausar'); }
      resetUserActivity();
    });
    video?.addEventListener('playing', () => markPlayerReady(playbackGeneration, 'Reprodução iniciada.'));
    video?.addEventListener('pause', () => {
      if (ytPlayerStage) { ytPlayerStage.classList.remove('playing'); ytPlayerStage.classList.add('user-active'); ytPlayerStage.classList.remove('user-inactive'); }
      if (videoPlayToggle) { videoPlayToggle.textContent = '▶'; videoPlayToggle.setAttribute('aria-label', 'Reproduzir'); }
      rememberProgress(video.currentTime || 0);
    });
    video?.addEventListener('timeupdate', () => {
      if (videoCurrentTime) videoCurrentTime.textContent = playerTime(video.currentTime);
      const pct = (Number.isFinite(video.duration) && video.duration > 0) ? (video.currentTime / video.duration) * 100 : 0;
      if (videoSeek) videoSeek.value = String(pct);
      if (ytSeekProgress) ytSeekProgress.style.width = `${pct}%`;
      if (video.currentTime > 5 && Math.floor(video.currentTime) % 5 === 0) rememberProgress(video.currentTime);
    });
    video?.addEventListener('loadedmetadata', () => { if (videoDuration) videoDuration.textContent = playerTime(video.duration); });
    video?.addEventListener('error', () => { if (currentItem?.live && currentStreamUrl) { failedStreamUrls.add(currentStreamUrl); const next = (currentItem.streams || []).some(stream => stream.url && !failedStreamUrls.has(stream.url) && !stream.requiresExternalPlayer); if (next) { notify('A fonte falhou; a tentar uma alternativa…', ''); playItem(currentItem); return; } } showPlayerError('A fonte não pôde ser reproduzida neste browser. Tenta VLC, mpv ou a fonte original.'); });
    videoSeek?.addEventListener('input', () => { if (video && Number.isFinite(video.duration)) video.currentTime = (Number(videoSeek.value) / 100) * video.duration; });
    videoVolume?.addEventListener('input', () => { if (video) { video.volume = Number(videoVolume.value); video.muted = video.volume === 0; if (videoMute) videoMute.textContent = video.muted ? '🔇' : '🔊'; } });
    videoMute?.addEventListener('click', () => { if (!video) return; video.muted = !video.muted; videoMute.textContent = video.muted ? '🔇' : '🔊'; });
    videoQuality?.addEventListener('change', () => { if (hls) hls.currentLevel = Number(videoQuality.value); });
    videoPlaybackRate?.addEventListener('change', () => { if (video) video.playbackRate = Number(videoPlaybackRate.value || 1); });
    videoPip?.addEventListener('click', async () => { if (!video || !document.pictureInPictureEnabled) return; try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); } catch { notify('Picture-in-Picture não está disponível para esta fonte.', 'error'); } });
    videoFullscreen?.addEventListener('click', () => { const target = videoDrawer || $('.video-drawer'); if (target?.requestFullscreen) target.requestFullscreen().catch(() => {}); else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen(); });
    document.addEventListener('keydown', event => {
      if (!videoDrawer || videoDrawer.hidden) return;
      const dialog = videoDrawer.querySelector('.video-drawer-card');
      if (event.key === 'Escape' && !document.fullscreenElement) { event.preventDefault(); closeVideo(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element => !element.hidden && element.getClientRects().length);
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1], active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !dialog.contains(active))) { event.preventDefault(); first.focus(); }
    });
    ytPlayerStage?.addEventListener('keydown', event => { if (!videoDrawer || videoDrawer.hidden || /input|select|button|textarea/i.test(event.target?.tagName || '')) return; if (event.key === ' ') { event.preventDefault(); togglePlay(); } if (event.key === 'ArrowLeft') { event.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); } if (event.key === 'ArrowRight') { event.preventDefault(); if (Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, video.currentTime + 10); } if (event.key.toLowerCase() === 'm') { video.muted = !video.muted; if (videoMute) videoMute.textContent = video.muted ? '🔇' : '🔊'; } if (event.key.toLowerCase() === 'f') videoFullscreen?.click(); });
    videoOpenSource?.addEventListener('click', () => currentItem && window.open(currentItem.externalUrl || currentItem.url, '_blank', 'noopener'));
    $('#closeVideo')?.addEventListener('click', closeVideo); video?.addEventListener('ended', () => { const current = progressItems().filter(item => keyOf(item) !== keyOf(currentItem)); saveJson(PROGRESS_KEY, current); renderPersonal(); });
    loadSources(); loadHome(); loadIptvMeta().then(() => loadIptv());
  }

  if (area === 'entertainment') return initEntertainment();

  const selectedSources = { music: ['youtube', 'soundcloud', 'vimeo', 'twitch'], social: ['youtube', 'vimeo', 'twitch'] };
  let selectedSource = 'all'; let activeFilter = 'all'; let resultItems = []; const audio = $('#spaceAudio'); const video = $('#spaceVideo'); const drawer = $('#videoDrawer'); const results = $('#spaceResults'); const query = $('#spaceQuery'); const status = $('#spaceStatus'); const playerTitle = $('#spacePlayerTitle'); const playerArtist = $('#spacePlayerArtist'); const playerCover = $('#spacePlayerCover'); const playerEmpty = $('#spacePlayerEmpty'); const playerBody = $('#spacePlayerBody'); const playerSeek = $('#spacePlayerSeek'); const playerCurrent = $('#spacePlayerCurrent'); const playerDuration = $('#spacePlayerDuration'); let current = null; let controller = null;
  function notify(text, kind = '') { if (status) { status.textContent = text; status.dataset.kind = kind; } }
  function stopMedia() { [audio, video].forEach(media => { if (media) { media.pause(); media.removeAttribute('src'); media.load(); } }); if (drawer) drawer.hidden = true; }
  async function stream(item) { if (item.metadataOnly) return notify('Este item é metadata-only. Abre a fonte oficial para reproduzir.', 'error'); stopMedia(); current = item; const type = area === 'music' ? 'audio' : 'video'; notify('A preparar pré-visualização…'); try { let payload; if (item.directStream) payload = { url: item.url, mimeType: item.mimeType || 'video/mp4' }; else { const response = await fetch(`/api/media/stream?url=${encodeURIComponent(item.url)}&type=${type}`); payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'A fonte não forneceu uma stream compatível.'); } if (!payload.url) throw new Error(payload.error || 'A fonte não forneceu uma stream compatível.'); if (area === 'music') { audio.src = payload.url; audio.load(); playerTitle.textContent = item.title; playerArtist.textContent = item.uploader || item.site || 'Fonte pública'; playerCover.style.backgroundImage = item.thumbnail ? `url("${item.thumbnail.replace(/"/g, '')}")` : ''; playerEmpty.hidden = true; playerBody.hidden = false; if (root.dataset.autoplay === 'true') await audio.play().catch(() => {}); } else { video.src = payload.url; $('#videoTitle').textContent = item.title; $('#videoMeta').textContent = `${item.site || 'Fonte'}${item.uploader ? ` · ${item.uploader}` : ''}`; drawer.hidden = false; if (root.dataset.autoplay === 'true') await video.play().catch(() => {}); } notify('Pré-visualização pronta.', 'success'); } catch (error) { stopMedia(); notify(error.message || 'Não foi possível abrir a pré-visualização.', 'error'); } }
  function card(item) { return window.TMXComponents.mediaCard(item, { area, formatDuration: time, escapeHtml: esc }); }
  function matchesFilter(item) { if (activeFilter === 'all') return true; const haystack = `${item.title || ''} ${item.uploader || ''} ${item.description || ''}`.toLowerCase(); if (activeFilter === 'movies') return item.kind === 'film' || /movie|film|filme|cinema/.test(haystack); if (activeFilter === 'series') return item.kind === 'series' || /series|season|episode|série|episódio/.test(haystack); if (activeFilter === 'anime') return /anime|manga|japan animation/.test(haystack); if (activeFilter === 'dorama') return /dorama|k-drama|korean drama|j-drama/.test(haystack); return true; }
  function render(items) { resultItems = items || []; const visible = resultItems.filter(matchesFilter); results.innerHTML = visible.length ? visible.map(card).join('') : `<div class="space-state">Não há itens com metadata de ${activeFilter === 'all' ? 'esta fonte' : activeFilter}. Pesquisa outro termo ou remove o filtro.</div>`; }
  async function download(item) { notify('A iniciar download…'); try { const response = await fetch('/api/downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: item.url, format: area === 'music' ? 'mp3' : 'mp4', quality: 'auto' }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Não foi possível iniciar o download.'); notify('Download adicionado à fila.', 'success'); } catch (error) { notify(error.message || 'Falha ao iniciar download.', 'error'); } }
  results?.addEventListener('click', event => { const cardEl = event.target.closest('[data-url]'); if (!cardEl) return; const item = { url: cardEl.dataset.url, title: $('h3', cardEl)?.textContent || 'Conteúdo', site: $('p', cardEl)?.textContent || '', thumbnail: $('img', cardEl)?.src || '', live: cardEl.dataset.live === 'true', directStream: cardEl.dataset.directStream === 'true', metadataOnly: cardEl.dataset.metadataOnly === 'true', mimeType: cardEl.dataset.mimeType || '' }; if (event.target.closest('.preview-action')) stream(item); if (event.target.closest('.download-action')) download(item); });
  $('#spaceSearch')?.addEventListener('submit', event => { event.preventDefault(); const term = query.value.trim(); if (term.length < 2) return notify('Escreve pelo menos 2 caracteres para pesquisar.', 'error'); if (controller) controller.abort(); controller = new AbortController(); notify('A pesquisar nas fontes configuradas…'); results.innerHTML = '<div class="space-state">A consultar resultados reais…</div>'; fetch(`/api/search?q=${encodeURIComponent(term)}&type=${area === 'music' ? 'music' : 'video'}&source=${encodeURIComponent(selectedSource)}&limit=16`, { signal: controller.signal }).then(async response => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'A pesquisa falhou.'); render(payload.results || []); notify(`${payload.results?.length || 0} resultados encontrados.`, 'success'); }).catch(error => { if (error.name !== 'AbortError') { render([]); notify(error.message || 'A pesquisa falhou.', 'error'); } }); });
  fetch('/api/platforms').then(r => r.json()).then(payload => { const allowed = selectedSources[area] || []; const box = $('#spaceSources'); const list = (payload.platforms || []).filter(p => allowed.includes(p.id)); if (box) box.innerHTML = `<button class="space-chip active" data-source="all">Todas as fontes</button>` + list.map(p => `<button class="space-chip" data-source="${esc(p.id)}">${esc(p.label)}${p.mode === 'metadata-only' ? ' · catálogo' : ''}</button>`).join(''); }).catch(() => {});
  $('#spaceSources')?.addEventListener('click', event => { const button = event.target.closest('[data-source]'); if (!button) return; selectedSource = button.dataset.source; document.querySelectorAll('#spaceSources [data-source]').forEach(item => item.classList.toggle('active', item === button)); if (query.value.trim().length >= 2) $('#spaceSearch').requestSubmit(); });
})();
