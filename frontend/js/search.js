(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const duration = seconds => { const value = Number(seconds || 0); if (!value) return ''; const minutes = Math.floor(value / 60); return `${minutes}:${String(Math.floor(value % 60)).padStart(2, '0')}`; };
  const notify = message => { const status = $('#searchStatus'); status.textContent = message; };
  function render(results) {
    const container = $('#searchResults');
    if (!results.length) { container.innerHTML = '<div class="search-empty">Nenhum resultado encontrado. Tenta uma pesquisa diferente.</div>'; return; }
    container.innerHTML = results.map(item => `<article class="search-result"><div class="search-result-thumb">${item.thumbnail ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy" />` : '<span>♪</span>'}${item.duration ? `<span class="duration-badge">${duration(item.duration)}</span>` : ''}</div><div class="search-result-copy"><strong title="${esc(item.title)}">${esc(item.title)}</strong><span>${esc(item.site)}${item.uploader ? ` · ${esc(item.uploader)}` : ''}${item.live ? ' · Ao vivo' : ''}${item.kind === 'film' ? ' · Filme' : ''}</span></div><div class="search-result-actions"><select class="result-format" aria-label="Formato para ${esc(item.title)}"><option value="mp3">MP3</option><option value="mp4" selected>MP4</option><option value="webm">WEBM</option><option value="opus">OPUS</option></select><button class="result-download" type="button" data-result-url="${esc(item.url)}">Usar link</button></div></article>`).join('');
  }
  async function search(event) {
    event.preventDefault();
    const query = $('#searchQuery').value.trim();
    if (query.length < 2) { notify('Indica pelo menos 2 caracteres para pesquisar.'); $('#searchQuery').focus(); return; }
    const button = $('#searchForm button[type="submit"]'); button.disabled = true; button.classList.add('is-loading'); notify('A pesquisar em fontes públicas…'); $('#searchResults').innerHTML = '<div class="search-loading"><span></span><span></span><span></span></div>';
    const params = new URLSearchParams({ q: query, type: $('#searchType').value, source: $('#searchSource').value, limit: '8' });
    try {
      const response = await fetch(`/api/search?${params}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'A pesquisa não está disponível.');
      render(result.results || []);
      const unavailable = result.unavailableSources?.length ? ` Fontes sem credenciais: ${result.unavailableSources.join(', ')}.` : '';
      notify(`${result.results?.length || 0} resultados encontrados em ${result.source === 'all' ? 'todas as streams' : result.source}.${unavailable}`);
    } catch (error) { $('#searchResults').innerHTML = `<div class="search-empty">${esc(error.message)}</div>`; notify('Não foi possível concluir a pesquisa.'); }
    finally { button.disabled = false; button.classList.remove('is-loading'); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('#searchForm').addEventListener('submit', search);
    $('#searchResults').addEventListener('click', event => {
      const button = event.target.closest('[data-result-url]');
      if (!button) return;
      const card = button.closest('.search-result'); const format = card.querySelector('.result-format').value;
      if (window.TubeMateX?.download) window.TubeMateX.download(button.dataset.resultUrl, format);
    });
  });
})();
