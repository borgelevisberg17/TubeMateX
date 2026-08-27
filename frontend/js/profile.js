(() => {
  document.documentElement.dataset.theme = localStorage.getItem('tubematex-theme') || 'dark';
  const $ = selector => document.querySelector(selector);
  const state = { q: '', format: 'all', site: 'all', favorite: false, sort: 'recent', offset: 0, limit: 24, total: 0, loading: false, lastItems: [] };
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const date = value => value ? new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';

  function notify(message, type = 'success') {
    const element = $('#notification'); element.textContent = message; element.className = `notification ${type} show`;
    clearTimeout(notify.timer); notify.timer = setTimeout(() => element.classList.remove('show'), 3400);
  }
  function emptyMessage() {
    if (state.favorite) return '<div class="user-empty"><strong>Ainda não tens favoritos.</strong><br />Marca a estrela num download para o encontrares aqui.</div>';
    if (state.q || state.format !== 'all' || state.site !== 'all') return '<div class="user-empty"><strong>Nenhum resultado encontrado.</strong><br />Experimenta remover um filtro ou pesquisar outro termo.</div>';
    return '<div class="user-empty">Ainda não tens downloads concluídos. <a href="/">Começa por colar um link.</a></div>';
  }
  function closeDetails() { const panel = $('#historyDetails'); panel.hidden = true; $('#historyDetailsBody').innerHTML = ''; }
  function openDetails(item, playNow = false) {
    const panel = $('#historyDetails'); const body = $('#historyDetailsBody'); const format = String(item.format || '').toLowerCase(); const isAudio = ['mp3', 'opus'].includes(format); const playable = Boolean(item.downloadUrl && item.completedAt);
    $('#historyDetailsTitle').textContent = item.title || 'Download';
    body.innerHTML = `<div class="history-detail-grid"><div><span>Formato</span><strong>${esc(item.formatLabel || item.format || 'Ficheiro')}</strong></div><div><span>Plataforma</span><strong>${esc(item.site || '—')}</strong></div><div><span>Concluído</span><strong>${date(item.completedAt || item.createdAt)}</strong></div><div><span>Tamanho</span><strong>${item.size ? `${Math.max(1, Math.round(item.size / 1024 / 1024))} MB` : '—'}</strong></div></div>${playable ? `<div class="history-player">${isAudio ? `<audio controls ${playNow ? 'autoplay' : ''} src="${esc(item.downloadUrl)}"></audio>` : `<video controls playsinline ${playNow ? 'autoplay' : ''} src="${esc(item.downloadUrl)}"></video>`}</div>` : '<p class="history-detail-note">Este item ainda não tem um ficheiro reproduzível associado.</p>'}<div class="history-detail-actions">${item.downloadUrl ? `<a class="u-action primary" href="${esc(item.downloadUrl)}" download>Guardar ficheiro</a>` : ''}<button class="u-action" type="button" id="closeHistoryDetailsInline">Fechar</button></div>`;
    panel.hidden = false; $('#closeHistoryDetailsInline')?.addEventListener('click', closeDetails);
  }
  function renderItems(items, append = false) {
    const container = $('#downloadHistory');
    if (!append && !items.length) { container.innerHTML = emptyMessage(); return; }
    state.lastItems = append ? [...(state.lastItems || []), ...items] : items;
    const html = items.map(item => `<article class="history-item" data-history-row-id="${esc(item.id)}"><div class="history-thumb ${item.thumbnail ? '' : 'history-placeholder'}">${item.thumbnail ? `<img class="history-image" src="${esc(item.thumbnail)}" alt="" loading="lazy" />` : '<svg class="icon"><use href="#i-file"></use></svg>'}</div><div class="history-info"><div class="history-title" title="${esc(item.title)}">${esc(item.title || 'Download')}</div><div class="history-meta"><span>${esc(item.formatLabel || item.format || 'Ficheiro')}${item.qualityLabel ? ` · ${esc(item.qualityLabel)}` : ''}</span><span>${esc(item.site || 'Plataforma')}</span><span>${date(item.completedAt || item.createdAt)}${item.size ? ` · ${Math.max(1, Math.round(item.size / 1024 / 1024))} MB` : ''}</span></div></div>${item.downloadUrl ? `<button class="history-action history-play" data-history-action="play" data-history-id="${esc(item.id)}" type="button">Reproduzir</button>` : ''}<button class="favorite-button ${item.favorite ? 'active' : ''}" data-favorite-id="${esc(item.id)}" type="button" aria-label="${item.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" aria-pressed="${Boolean(item.favorite)}">★</button>${item.downloadUrl ? `<a class="history-action" href="${esc(item.downloadUrl)}">Guardar</a>` : ''}<details class="history-menu"><summary aria-label="Mais ações">⋮</summary><div class="history-menu-popover"><button type="button" data-history-action="details" data-history-id="${esc(item.id)}">Ver informações</button><button type="button" data-history-action="remove" data-history-id="${esc(item.id)}">Remover</button></div></details><span class="convert-control"><select data-convert-format="${esc(item.id)}" aria-label="Converter ${esc(item.title)}"><option value="">Converter…</option><option value="mp3">MP3</option><option value="opus">OPUS</option><option value="mp4">MP4</option><option value="webm">WEBM</option></select></span></article>`).join('');
    if (append) container.insertAdjacentHTML('beforeend', html); else container.innerHTML = html;
  }
  function renderFacets(facets) {
    if (!facets?.sites) return;
    const select = $('#librarySite'); const current = state.site;
    select.innerHTML = '<option value="all">Todas as plataformas</option>' + facets.sites.map(site => `<option value="${esc(site.toLowerCase())}">${esc(site)}</option>`).join('');
    select.value = facets.sites.some(site => site.toLowerCase() === current) ? current : 'all';
    state.site = select.value;
  }
  function updateCount() { $('#libraryCount').textContent = `${state.total} ${state.total === 1 ? 'resultado' : 'resultados'}`; }
  function updateLoadMore(hasMore) { $('#loadMore').hidden = !hasMore; $('#loadMore').disabled = state.loading; }
  async function loadLibrary({ append = false } = {}) {
    if (state.loading) return;
    state.loading = true; updateLoadMore(false);
    if (!append) $('#downloadHistory').classList.add('is-loading');
    const params = new URLSearchParams({ q: state.q, format: state.format, site: state.site, favorite: state.favorite ? 'true' : 'all', sort: state.sort, limit: String(state.limit), offset: String(append ? state.offset : 0) });
    try {
      const response = await fetch(`/api/library?${params}`);
      if (!response.ok) throw new Error();
      const result = await response.json();
      state.total = Number(result.total || 0); state.offset = Number(result.offset || 0) + result.items.length;
      renderFacets(result.facets); renderItems(result.items, append); updateCount(); updateLoadMore(result.hasMore);
    } catch { $('#downloadHistory').innerHTML = '<div class="user-empty">Não foi possível carregar a biblioteca. Tenta novamente.</div>'; notify('A biblioteca está temporariamente indisponível.', 'error'); }
    finally { state.loading = false; $('#downloadHistory').classList.remove('is-loading'); updateLoadMore(Boolean($('#loadMore').hidden === false)); }
  }
  async function toggleFavorite(id, button) {
    button.disabled = true;
    const next = button.getAttribute('aria-pressed') !== 'true';
    try {
      const response = await fetch(`/api/library/${encodeURIComponent(id)}/favorite`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: next }) });
      if (!response.ok) throw new Error();
      button.classList.toggle('active', next); button.setAttribute('aria-pressed', String(next)); button.setAttribute('aria-label', next ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
      if (state.favorite && !next) loadLibrary(); else notify(next ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.');
    } catch { notify('Não foi possível atualizar o favorito.', 'error'); }
    finally { button.disabled = false; }
  }
  async function loadUserAndStats() {
    try {
      const [historyResponse, userResponse] = await Promise.all([fetch('/api/history'), fetch('/api/user')]);
      const items = historyResponse.ok ? await historyResponse.json() : [];
      $('#totalDownloads').textContent = items.length;
      $('#videoDownloads').textContent = items.filter(item => !['mp3', 'opus'].includes(String(item.format).toLowerCase())).length;
      $('#audioDownloads').textContent = items.filter(item => ['mp3', 'opus'].includes(String(item.format).toLowerCase())).length;
      if (userResponse.ok) {
        const user = await userResponse.json(); $('#userName').textContent = user.displayName || 'Utilizador'; $('#userEmail').textContent = user.email || 'Conta Google'; $('#userState').textContent = 'Ligado';
        if (user.avatar) $('#userAvatar').innerHTML = `<img src="${esc(user.avatar)}" alt="" />`;
      }
    } catch (error) { console.warn('Perfil indisponível', error); }
  }
  function debounce(callback, delay = 320) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); }; }
  document.addEventListener('DOMContentLoaded', () => {
    $('[data-filter-format="all"]').classList.add('active');
    document.querySelectorAll('[data-filter-format]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-filter-format]').forEach(item => item.classList.remove('active')); button.classList.add('active'); state.format = button.dataset.filterFormat; state.offset = 0; loadLibrary(); }));
    $('#librarySearch').addEventListener('input', debounce(event => { state.q = event.target.value.trim(); state.offset = 0; loadLibrary(); }));
    $('#librarySort').addEventListener('change', event => { state.sort = event.target.value; state.offset = 0; loadLibrary(); });
    $('#librarySite').addEventListener('change', event => { state.site = event.target.value; state.offset = 0; loadLibrary(); });
    $('#favoritesOnly').addEventListener('change', event => { state.favorite = event.target.checked; state.offset = 0; loadLibrary(); }); $('#favoritesNav')?.addEventListener('click', event => { event.preventDefault(); const checkbox = $('#favoritesOnly'); checkbox.checked = true; state.favorite = true; state.offset = 0; loadLibrary(); document.querySelectorAll('.u-side a').forEach(link => link.classList.remove('active')); event.currentTarget.classList.add('active'); });
    $('#loadMore').addEventListener('click', () => loadLibrary({ append: true }));
    $('#downloadHistory').addEventListener('click', event => { const button = event.target.closest('[data-favorite-id]'); if (button) toggleFavorite(button.dataset.favoriteId, button); });
    $('#downloadHistory').addEventListener('change', async event => { const select = event.target.closest('[data-convert-format]'); if (!select || !select.value) return; const id = select.dataset.convertFormat; const format = select.value; select.disabled = true; try { const response = await fetch(`/api/downloads/${encodeURIComponent(id)}/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'Não foi possível converter o ficheiro.'); notify(`Conversão para ${format.toUpperCase()} concluída.`); await loadLibrary(); } catch (error) { notify(error.message, 'error'); } finally { select.disabled = false; select.value = ''; } });
    $('#downloadHistory').addEventListener('click', async event => { const action = event.target.closest('[data-history-action]'); if (!action) return; const id = action.dataset.historyId; const item = state.lastItems?.find(entry => entry.id === id); if ((action.dataset.historyAction === 'details' || action.dataset.historyAction === 'play') && item) { openDetails(item, action.dataset.historyAction === 'play'); return; } if (action.dataset.historyAction === 'remove') { if (!confirm('Remover este item do histórico e apagar o ficheiro?')) return; const response = await fetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (!response.ok) { notify('Não foi possível remover o item.', 'error'); return; } notify('Item removido do histórico.'); await loadLibrary(); loadUserAndStats(); } });
    $('#closeHistoryDetails')?.addEventListener('click', closeDetails); $('#historyDetails')?.addEventListener('click', event => { if (event.target.id === 'historyDetails') closeDetails(); }); loadUserAndStats(); loadLibrary();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
})();
