(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
  const duration = seconds => { const value = Number(seconds || 0); if (!value) return ''; const min = Math.floor(value / 60); return `${min}:${String(Math.floor(value % 60)).padStart(2, '0')}`; };
  const pageCategory = location.pathname.endsWith('/music') || location.pathname.endsWith('/music.html') ? 'music' : location.pathname.endsWith('/social') || location.pathname.endsWith('/social.html') ? 'video' : location.pathname.endsWith('/entertainment') || location.pathname.endsWith('/entertainment.html') ? 'film' : 'all';
  const state = { source: 'all', type: pageCategory, sort: 'relevance', results: [] };
  const notify = message => { const status = $('#searchStatus'); if (status) status.textContent = message; };
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  function render(results) {
    const container = $('#searchResults');
    state.results = results;
    if (!results.length) { container.innerHTML = '<div class="initial-state"><div class="state-icon">'+icon('search')+'</div><h2>Nenhum resultado encontrado</h2><p>Tente outro termo ou altere a fonte e o tipo de conteúdo.</p></div>'; return; }
    container.innerHTML = results.map(item => `<article class="search-result"><div class="search-result-thumb">${item.thumbnail ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy"/>` : icon('file')}${item.duration ? `<span class="duration-badge">${duration(item.duration)}</span>` : ''}</div><div class="search-result-copy"><strong title="${esc(item.title)}">${esc(item.title || 'Resultado sem título')}</strong>${item.uploader ? `<span class="creator">${esc(item.uploader)}</span>` : ''}<span>${esc(item.site || 'Fonte')} ${item.live ? '· Ao vivo' : ''} ${item.kind === 'film' ? '· Filme' : ''}</span><div class="result-tags"><b>${esc(item.kind === 'music' ? 'Música' : item.kind === 'film' ? 'Filme' : 'Vídeo')}</b></div></div><div class="search-result-actions"><button class="preview-button" type="button" data-preview-url="${esc(item.url)}" data-preview-type="${item.kind === 'video' || item.kind === 'film' ? 'video' : 'audio'}">${icon('play')} Pré-visualizar</button><select class="result-format" aria-label="Formato para ${esc(item.title)}"><option value="mp3">MP3</option><option value="mp4" selected>MP4</option><option value="webm">WEBM</option><option value="opus">OPUS</option></select><button class="result-download" type="button" data-result-url="${esc(item.url)}">${icon('download')} Baixar</button></div></article>`).join('');
  }
  async function search(event) {
    event?.preventDefault();
    const query = $('#searchQuery').value.trim();
    if (query.length < 2) { notify('Indica pelo menos 2 caracteres para pesquisar.'); $('#searchQuery').focus(); return; }
    const button = $('#searchForm button[type="submit"]'); button.disabled = true; button.classList.add('is-loading');
    $('#searchResults').innerHTML = '<div class="search-loading">A consultar as fontes configuradas…</div>'; notify('A pesquisar em fontes públicas…');
    const params = new URLSearchParams({ q: query, type: state.type, source: state.source, limit: '12' });
    try {
      const response = await fetch(`/api/search?${params}`); const result = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status === 429) { const retry = response.headers.get('Retry-After'); const wait = retry ? `${retry} segundos` : 'alguns segundos'; $('#searchResults').innerHTML = `<div class="rate-limit-card"><svg class="icon"><use href="#i-bell"></use></svg><div><strong>Limite temporário atingido</strong><p>A fonte recebeu muitos pedidos. Aguarda ${wait} e tenta novamente.</p></div></div>`; throw new Error(`Limite temporário: aguarda ${wait}.`); } throw new Error(result.error || 'A pesquisa não está disponível.'); }
      render(result.results || []);
      $('#resultsTitle').textContent = `Resultados para “${query}”`;
      const unavailable = result.unavailableSources?.length ? ` Fontes indisponíveis: ${result.unavailableSources.join(', ')}.` : '';
      notify(`${result.results?.length || 0} resultados reais encontrados.${unavailable}`);
    } catch (error) { if (!error.message.startsWith('Limite temporário')) $('#searchResults').innerHTML = `<div class="initial-state"><div class="state-icon">${icon('file')}</div><h2>Não foi possível pesquisar</h2><p>${esc(error.message)}</p></div>`; notify(error.message.startsWith('Limite temporário') ? error.message : 'A pesquisa falhou.'); }
    finally { button.disabled = false; button.classList.remove('is-loading'); }
  }
  function setFilter(group, value) { state[group] = value; document.querySelectorAll(`[data-${group}]`).forEach(button => button.classList.toggle('active', button.dataset[group] === value)); if ($('#searchQuery').value.trim().length >= 2) search(); }
  document.addEventListener('DOMContentLoaded', () => {
    const headings = { music: ['Música e áudio', 'Pesquisa focada em música, podcasts e áudio público.'], video: ['Redes sociais', 'Pesquisa focada em vídeos sociais e transmissões públicas.'], film: ['Filmes e séries', 'Pesquisa focada em vídeo longo, episódios e conteúdo audiovisual público.'], all: ['Pesquise para começar', 'Os resultados reais da API aparecem aqui.'] };
    const heading = headings[pageCategory]; if (heading) { $('#resultsTitle').textContent = heading[0]; $('#searchStatus').textContent = heading[1]; }
    document.querySelectorAll('[data-type]').forEach(button => button.classList.toggle('active', button.dataset.type === pageCategory || (pageCategory === 'all' && button.dataset.type === 'all')));
    $('#searchForm').addEventListener('submit', search);
    $('#sourceFilters').addEventListener('click', event => { const button = event.target.closest('[data-source]'); if (button) setFilter('source', button.dataset.source); });
    $('#typeFilters').addEventListener('click', event => { const button = event.target.closest('[data-type]'); if (button) setFilter('type', button.dataset.type); });
    $('#clearFilters').addEventListener('click', () => { state.source = 'all'; state.type = 'all'; document.querySelectorAll('.filter-option').forEach(button => button.classList.toggle('active', button.dataset.source === 'all' || button.dataset.type === 'all')); if ($('#searchQuery').value.trim().length >= 2) search(); });
    $('#sortResults').addEventListener('change', event => { state.sort = event.target.value; if (state.sort === 'title') state.results.sort((a,b) => String(a.title).localeCompare(String(b.title))); render(state.results); });
    $('#searchResults').addEventListener('click', event => {
      const preview = event.target.closest('[data-preview-url]');
      if (preview) { const title = preview.closest('.search-result')?.querySelector('strong')?.textContent || 'Pré-visualização'; window.TubeMateX?.preview(preview.dataset.previewUrl, title, preview.dataset.previewType || 'audio'); return; }
      const button = event.target.closest('[data-result-url]'); if (!button) return;
      const format = button.closest('.search-result')?.querySelector('.result-format')?.value || 'mp4'; window.TubeMateX?.download(button.dataset.resultUrl, format);
    });
  });
})();
