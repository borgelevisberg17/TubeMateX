(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
  const searchForm = $('#searchForm');
  const searchQuery = $('#searchQuery');
  const searchResults = $('#searchResults');
  const searchStatus = $('#searchStatus');
  const stage = $('#mediaStage');
  const video = $('#mediaVideo');
  const audio = $('#mediaAudio');
  const queue = $('#liveQueue');
  const quickUrl = $('#videoUrl');
  const quickFormat = $('#quickFormat');
  const quickQuality = $('#quickQuality');
  let activeSearch;

  const notify = (message, kind = '') => {
    searchStatus.textContent = message;
    searchStatus.dataset.kind = kind;
  };
  const stop = () => {
    [video, audio].forEach(media => {
      if (!media) return;
      media.pause();
      media.removeAttribute('src');
      media.load();
    });
    video.hidden = false;
    audio.hidden = true;
    $('#playerContent').hidden = true;
    stage.hidden = true;
  };
  const resultCard = item => {
    const isAudio = item.kind === 'music' || ['SoundCloud', 'Spotify', 'Apple Music'].includes(item.site);
    const metadataOnly = Boolean(item.metadataOnly);
    const mediaKind = isAudio ? 'audio' : 'video';
    const duration = item.duration
      ? ` · ${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}`
      : '';
    return `<article class="h-result search-result" data-url="${esc(item.url)}" data-kind="${mediaKind}" data-metadata-only="${metadataOnly}">
      <div class="h-thumb">${item.thumbnail ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy">` : '<span aria-hidden="true"></span>'}</div>
      <div class="h-result-copy"><h3>${esc(item.title || 'Resultado sem título')}</h3><p>${esc(item.uploader || item.site || 'Fonte pública')}${duration}${metadataOnly ? ' · catálogo' : ''}</p></div>
      <div class="h-actions">${metadataOnly
        ? `<a class="h-button primary" href="${esc(item.externalUrl || item.url)}" target="_blank" rel="noopener noreferrer">Abrir fonte <span class="sr-only">(abre num novo separador)</span></a>`
        : `<button class="h-button preview" data-preview-type="${mediaKind}" type="button">${isAudio ? 'Ouvir' : 'Pré-visualizar'}</button><button class="h-button primary download" type="button">Baixar</button>`}
      </div>
    </article>`;
  };
  const render = items => {
    searchResults.innerHTML = items.length
      ? items.map(resultCard).join('')
      : '<div class="h-initial">Nenhum resultado encontrado. Tenta outro termo ou cola um URL público.</div>';
  };

  async function search(event) {
    event.preventDefault();
    const query = searchQuery.value.trim();
    if (query.length < 2) {
      notify('Indica pelo menos 2 caracteres para pesquisar.', 'error');
      searchQuery.focus();
      return;
    }
    activeSearch?.abort();
    const controller = new AbortController();
    activeSearch = controller;
    searchResults.setAttribute('aria-busy', 'true');
    notify('A pesquisar nas fontes configuradas…');
    searchResults.innerHTML = '<div class="h-initial" role="status">A consultar resultados reais…</div>';
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=all&source=all&limit=12`, { signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'A pesquisa falhou.');
      const results = payload.results || [];
      render(results);
      const unavailable = payload.unavailableSources?.length ? ` Fontes indisponíveis: ${payload.unavailableSources.join(', ')}.` : '';
      notify(`${results.length} ${results.length === 1 ? 'resultado' : 'resultados'} encontrados.${unavailable}`, 'success');
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) return;
      const rateLimited = error.message.includes('429') || error.message.toLowerCase().includes('rate limited');
      searchResults.innerHTML = `<div class="h-initial">${rateLimited ? 'Limite temporário atingido. Aguarda e tenta novamente.' : 'Não foi possível pesquisar agora. Tenta novamente.'}</div>`;
      notify(error.message, 'error');
    } finally {
      if (activeSearch === controller) searchResults.setAttribute('aria-busy', 'false');
    }
  }

  async function preview(item) {
    stop();
    try {
      if (item.metadataOnly) return notify('Este item só tem metadata. Abre a fonte oficial para reproduzir.', 'error');
      const response = await fetch(`/api/media/stream?url=${encodeURIComponent(item.url)}&type=${item.kind}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Esta fonte não forneceu media compatível.');
      $('#stageTitle').textContent = item.title;
      const isAudio = item.kind === 'audio';
      video.hidden = isAudio;
      audio.hidden = !isAudio;
      const player = isAudio ? audio : video;
      player.src = payload.url;
      player.load();
      const context = $('#playerContent');
      context.textContent = isAudio
        ? 'Contexto de áudio ativo — o vídeo permanece pausado.'
        : 'Contexto de vídeo ativo — o áudio permanece pausado.';
      context.hidden = false;
      stage.hidden = false;
      notify(`${isAudio ? 'Pré-visualização de áudio' : 'Pré-visualização de vídeo'} pronta.`, 'success');
      stage.focus?.();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function download(url, format = quickFormat.value, quality = quickQuality.value) {
    try {
      const response = await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format, quality })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível iniciar o download.');
      const job = payload.job || {};
      const item = document.createElement('div');
      item.className = 'h-queue-item';
      item.dataset.liveJob = job.id || '';
      item.innerHTML = `<strong>${esc(job.title || 'Download')}</strong><span>Na fila · ${esc(format.toUpperCase())}</span>`;
      queue.prepend(item);
      notify('Download adicionado à fila.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  searchForm.addEventListener('submit', search);
  $('#closeStage').addEventListener('click', () => {
    stop();
    $('#searchQuery').focus();
  });
  $('#downloadForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!quickUrl.value.trim()) {
      notify('Cola um URL público para iniciar o download.', 'error');
      quickUrl.focus();
      return;
    }
    download(quickUrl.value.trim());
  });
  searchResults.addEventListener('click', event => {
    const card = event.target.closest('[data-url]');
    if (!card) return;
    const item = {
      url: card.dataset.url,
      title: card.querySelector('h3')?.textContent || 'Conteúdo',
      site: card.querySelector('p')?.textContent || '',
      kind: card.dataset.kind || 'video',
      metadataOnly: card.dataset.metadataOnly === 'true'
    };
    if (event.target.closest('.preview')) preview(item);
    if (event.target.closest('.download')) download(item.url, item.kind === 'audio' ? 'mp3' : 'mp4', 'auto');
  });

  searchResults.setAttribute('aria-busy', 'true');
  fetch('/api/discover?area=home&limit=8')
    .then(response => response.ok ? response.json() : Promise.reject(new Error('Descoberta indisponível.')))
    .then(payload => {
      if (activeSearch) return;
      const results = payload.results || [];
      render(results);
      notify(results.length ? `Descoberta real · ${results.length} itens.` : 'Nenhuma fonte pública disponível agora.', results.length ? 'success' : '');
    })
    .catch(() => {
      if (!activeSearch) {
        searchResults.innerHTML = '<div class="h-initial">Pesquisa para carregar resultados reais. Nenhuma fonte pública foi inventada.</div>';
        notify('A descoberta automática está indisponível. Podes pesquisar manualmente.');
      }
    })
    .finally(() => { if (!activeSearch) searchResults.setAttribute('aria-busy', 'false'); });
})();
