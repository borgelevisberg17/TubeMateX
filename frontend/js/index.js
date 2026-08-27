(() => {
  const state = { format: 'mp4', quality: 'auto', job: null, jobs: new Map(), eventSources: new Map(), infoTimer: null, infoRequest: null, pausedAll: false };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const icons = { moon: 'theme-moon', sun: 'theme-sun' };
  const formatLabels = {
    mp4: 'MP4 · Vídeo', mp3: 'MP3 · Áudio', webm: 'WEBM · Vídeo', opus: 'OPUS · Áudio'
  };
  const videoFormats = new Set(['mp4', 'webm', 'best']);

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function formatDate(value) {
    if (!value) return 'Agora';
    return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  function formatTime(seconds) {
    if (!Number.isFinite(Number(seconds))) return '0:00';
    const value = Math.max(0, Math.floor(Number(seconds)));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let amount = bytes; let index = 0;
    while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
    return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function showNotification(message, type = 'success') {
    const notification = $('#notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    clearTimeout(showNotification.timer);
    showNotification.timer = setTimeout(() => { notification.classList.remove('show'); }, 4200);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('tubematex-theme', theme);
    $('#themeIcon').className = theme === 'light' ? icons.sun : icons.moon;
    $('#themeToggle').setAttribute('aria-label', 'Modo escuro ativo');
  }

  function initTheme() {
    setTheme('dark');
    const toggle = $('#themeToggle');
    toggle?.addEventListener('click', () => {
      setTheme('dark');
      showNotification('Modo escuro Command Center ativo.', 'success');
    });
  }

  function setSelectedFormat(format) {
    state.format = format;
    $$('.format-option').forEach(option => {
      const active = option.dataset.format === format;
      option.classList.toggle('active', active);
      option.setAttribute('aria-checked', String(active));
    });
    const quickFormat = $('#quickFormat');
    if (quickFormat) quickFormat.value = format.toLowerCase();
    $('#selectedFormatLabel').textContent = formatLabels[format] || format.toUpperCase();
    $('#qualityControl').hidden = !videoFormats.has(format);
  }

  function setLoading(loading) {
    const button = $('#downloadButton');
    button.disabled = loading;
    $('#downloadButtonText').textContent = loading ? 'A preparar download…' : 'Descarregar conteúdo';
    $('#downloadButtonIcon').textContent = loading ? '⋯' : '↓';
  }

  function renderInfo(info) {
    const container = $('#videoInfo');
    if (!info) { container.hidden = true; container.innerHTML = ''; return; }
    container.innerHTML = `${info.thumbnail ? `<img src="${escapeHtml(info.thumbnail)}" alt="" loading="lazy" />` : '<div class="history-thumb history-placeholder">◉</div>'}<div class="media-preview-copy"><strong title="${escapeHtml(info.title)}">${escapeHtml(info.title)}</strong><span>${escapeHtml(info.site || 'Plataforma suportada')}${info.uploader ? ` · ${escapeHtml(info.uploader)}` : ''}</span></div>`;
    container.hidden = false;
  }

  async function fetchInfo() {
    const input = $('#videoUrl');
    const url = input.value.trim();
    if (!url) { renderInfo(null); return; }
    $('#urlInputWrap').classList.remove('invalid');
    $('#videoUrl').setAttribute('aria-invalid', 'false');
    try {
      new URL(url);
    } catch { return; }
    if (state.infoRequest) state.infoRequest.abort();
    state.infoRequest = new AbortController();
    try {
      const response = await fetch(`/api/media/info?url=${encodeURIComponent(url)}`, { signal: state.infoRequest.signal });
      if (!response.ok) return;
      renderInfo(await response.json());
    } catch (error) {
      if (error.name !== 'AbortError') console.warn('Pré-visualização indisponível', error);
    }
  }

  function renderLiveQueue() {
    const container = $('#liveQueue');
    if (!container) return;
    const jobs = [...state.jobs.values()].filter(job => !['completed','failed','cancelled'].includes(job.status));
    if (!jobs.length) { container.innerHTML = '<div class="queue-empty">Nenhum download em andamento.</div>'; }
    else container.innerHTML = jobs.map(job => {
      const progress = Math.max(0, Math.min(100, Number(job.progress?.percent || 0)));
      const statusLabel = job.progress?.label || job.status || 'Na fila…';
      const safeTitle = escapeHtml(job.title || 'Download em preparação');
      const paused = job.status === 'paused';
      return `<div class="queue-live-item ${escapeHtml(job.status || '')}" data-live-job="${escapeHtml(job.id)}"><div class="live-item-top"><strong>${safeTitle}</strong><b>${Math.round(progress)}%</b></div><div class="live-item-meta"><span>${escapeHtml(job.formatLabel || job.format || 'Ficheiro')}</span><span>${escapeHtml(job.error || statusLabel)}</span>${job.progress?.speed ? `<span>${escapeHtml(job.progress.speed)}</span>` : ''}</div><div class="queue-progress"><i style="width:${progress}%"></i></div><div class="live-item-actions"><button type="button" data-job-action="${escapeHtml(job.id)}">${paused ? 'Retomar' : 'Pausar'}</button><button type="button" data-cancel-live-job="${escapeHtml(job.id)}">Cancelar</button></div></div>`;
    }).join('');
    const count = $('#queueCount'); if (count) count.textContent = String(jobs.length);
    const pauseAll = $('#pauseAllButton'); if (pauseAll) pauseAll.textContent = state.pausedAll ? 'Retomar tudo' : 'Pausar tudo';
  }

  function updateJob(job) {
    state.job = job;
    state.jobs.set(job.id, job);
    renderLiveQueue();
    const status = $('#jobStatus');
    const progress = Math.max(0, Math.min(100, Number(job.progress?.percent || 0)));
    status.hidden = false;
    $('#statusLabel').textContent = job.progress?.label || job.status;
    $('#statusPercent').textContent = `${Math.round(progress)}%`;
    $('#progressValue').style.width = `${progress}%`;
    $('#statusDetail').textContent = job.error || (job.status === 'completed' ? 'O ficheiro está pronto para guardar.' : job.title || 'O pedido está a ser processado.');
    $('#cancelJob').hidden = !['queued', 'fetching', 'downloading'].includes(job.status);
    if (job.status === 'completed') {
      setLoading(false);
      $('#downloadButtonText').textContent = 'Descarregar novamente';
      $('#downloadButtonIcon').textContent = '↓';
      $('#statusDetail').innerHTML = `<a class="inline-download" href="${escapeHtml(job.downloadUrl)}">Guardar ${escapeHtml(job.formatLabel || job.format.toUpperCase())} ↗</a>`;
      showNotification('O teu ficheiro está pronto.', 'success');
      loadHistory();
    } else if (job.status === 'failed' || job.status === 'cancelled') {
      setLoading(false);
      if (job.status === 'failed') showNotification(job.error || 'O download falhou.', 'error');
    }
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      const source = state.eventSources.get(job.id);
      source?.close(); state.eventSources.delete(job.id); renderLiveQueue();
    }
  }

  function watchJob(job) {
    state.jobs.set(job.id, job);
    updateJob(job);
    const source = new EventSource(`/api/downloads/${encodeURIComponent(job.id)}/events`);
    state.eventSources.set(job.id, source);
    source.addEventListener('update', event => {
      try { updateJob(JSON.parse(event.data)); } catch (error) { console.warn('Atualização inválida', error); }
    });
    source.onerror = () => {
      const current = state.jobs.get(job.id);
      if (current && !['completed', 'failed', 'cancelled'].includes(current.status)) {
        setTimeout(async () => { try { const response = await fetch(`/api/downloads/${encodeURIComponent(job.id)}`); if (response.ok) updateJob(await response.json()); } catch {} }, 1800);
      } else { source.close(); state.eventSources.delete(job.id); }
    };
  }

  async function startDownload(event) {
    event.preventDefault();
    const url = $('#videoUrl').value.trim();
    if (!url) { showNotification('Cola primeiro o link do conteúdo.', 'error'); $('#videoUrl').focus(); return; }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch { showNotification('Indica um URL público válido.', 'error'); $('#urlInputWrap').classList.add('invalid'); $('#videoUrl').setAttribute('aria-invalid', 'true'); return; }
    setLoading(true);
    $('#urlInputWrap').classList.remove('invalid');
    try {
      const response = await fetch('/api/downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, format: state.format, quality: state.quality }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível adicionar o download.');
      setLoading(false);
      showNotification('Download adicionado à fila.', 'success');
      watchJob(result.job);
    } catch (error) {
      setLoading(false);
      showNotification(error.message, 'error');
    }
  }

  window.TubeMateX = window.TubeMateX || {};
  window.TubeMateX.preview = async (url, title = 'Pré-visualização', type = 'audio') => {
    if (!url) { showNotification('Este resultado ainda não tem uma URL de stream disponível.', 'error'); return; }
    const audio = $('#miniAudio');
    if (!audio) return;
    showNotification('A preparar a pré-visualização…', 'success');
    try {
      const response = await fetch(`/api/media/stream?url=${encodeURIComponent(url)}&type=${encodeURIComponent(type)}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) throw new Error(result.error || 'Não foi possível iniciar a pré-visualização.');
      audio.src = result.url;
      audio.dataset.sourceUrl = url;
      audio.dataset.title = result.title || title;
      $('#playerEmpty').hidden = true;
      $('#playerContent').hidden = false;
      const playerTitle = $('#playerTitle');
      if (playerTitle) playerTitle.textContent = result.title || title;
      const playerArtist = $('#playerArtist');
      if (playerArtist) playerArtist.textContent = 'Pré-visualização · '+(result.type === 'video' ? 'vídeo' : 'áudio');
      const playerCover = $('#playerCover');
      if (playerCover) playerCover.style.backgroundImage = result.thumbnail ? `url("${escapeHtml(result.thumbnail)}")` : 'linear-gradient(135deg,#162b40,#263649)';
      audio.onloadedmetadata = () => { $('#playerDuration').textContent = formatTime(audio.duration); };
      audio.ontimeupdate = () => { if (audio.duration) { $('#playerCurrent').textContent = formatTime(audio.currentTime); $('#playerSeek').value = String((audio.currentTime / audio.duration) * 100); } };
      await audio.play();
      const playButton = $('#playButton');
      if (playButton) { playButton.dataset.playing = 'true'; playButton.classList.add('is-playing'); }
      showNotification('Pré-visualização iniciada no mini player.', 'success');
    } catch (error) { showNotification(error.message, 'error'); }
  };
  window.TubeMateX.download = (url, format = 'mp4') => {
    $('#videoUrl').value = url;
    $('#clearUrl').hidden = false;
    setSelectedFormat(format);
    $('#downloadForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    startDownload({ preventDefault() {} });
  };

  function saveLocalHistory(items) {
    try { localStorage.setItem('tubematex-history', JSON.stringify(items.slice(0, 50))); } catch {}
  }

  function readLocalHistory() {
    try { const items = JSON.parse(localStorage.getItem('tubematex-history') || '[]'); return Array.isArray(items) ? items : []; } catch { return []; }
  }

  function renderHistory(items) {
    saveLocalHistory(items);
    const container = $('#historyContainer');
    $('#clearHistory').hidden = !items.length;
    if (!items.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg class="icon"><use href="#i-clock"></use></svg></div><h3>Ainda não há downloads</h3><p>Os teus ficheiros recentes aparecem aqui para acesso rápido.</p></div>';
      return;
    }
    container.innerHTML = items.slice(0, 12).map(item => `<article class="history-item"><div class="history-thumb ${item.thumbnail ? '' : 'history-placeholder'}">${item.thumbnail ? `<img class="history-image" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" />` : '<svg class="icon"><use href="#i-file"></use></svg>'}</div><div class="history-info"><div class="history-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title || 'Download')}</div><div class="history-meta"><span>${escapeHtml(item.formatLabel || item.format || 'Ficheiro')}${item.qualityLabel ? ` · ${escapeHtml(item.qualityLabel)}` : ''}</span><span>${escapeHtml(item.site || 'Plataforma')}</span><span>${formatDate(item.completedAt || item.createdAt)}${item.size ? ` · ${formatBytes(item.size)}` : ''}</span></div></div><button class="favorite-button ${item.favorite ? 'active' : ''}" data-favorite-id="${escapeHtml(item.id)}" type="button" aria-label="${item.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" aria-pressed="${Boolean(item.favorite)}">★</button>${item.downloadUrl ? `<a class="history-action" href="${escapeHtml(item.downloadUrl)}">Guardar ↗</a>` : ''}</article>`).join('');
  }

  async function loadHistory() {
    try {
      const response = await fetch('/api/history');
      if (response.ok) { renderHistory(await response.json()); return; }
      throw new Error('Histórico indisponível');
    } catch { const localItems = readLocalHistory(); renderHistory(localItems); if (localItems.length) showNotification('A mostrar o histórico guardado neste navegador.', 'success'); }
  }

  async function toggleFavorite(id, button) {
    button.disabled = true;
    const next = button.getAttribute('aria-pressed') !== 'true';
    try {
      const response = await fetch(`/api/library/${encodeURIComponent(id)}/favorite`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: next }) });
      if (!response.ok) throw new Error();
      button.classList.toggle('active', next); button.setAttribute('aria-pressed', String(next)); button.setAttribute('aria-label', next ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
      showNotification(next ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.');
    } catch { showNotification('Não foi possível atualizar o favorito.', 'error'); }
    finally { button.disabled = false; }
  }

  async function clearHistory() {
    if (!window.confirm('Queres mesmo eliminar o teu histórico recente?')) return;
    try {
      const response = await fetch('/api/history', { method: 'DELETE' });
      if (!response.ok) throw new Error();
      renderHistory([]);
      localStorage.removeItem('tubematex-history');
      showNotification('Histórico eliminado.', 'success');
    } catch { showNotification('Não foi possível eliminar o histórico.', 'error'); }
  }

  async function updateUserStatus() {
    try {
      const response = await fetch('/api/user');
      if (!response.ok) return;
      const user = await response.json();
      $('#userProfile').innerHTML = `<a href="/profile" class="user-info" title="Abrir perfil">${user.avatar ? `<img class="user-avatar" src="${escapeHtml(user.avatar)}" alt="" />` : '<span class="google-dot">U</span>'}<span>${escapeHtml(user.displayName || 'Conta')}</span></a>`;
    } catch { /* login é opcional */ }
  }

  function init() {
    initTheme();
    $$('.format-option').forEach(option => option.addEventListener('click', () => setSelectedFormat(option.dataset.format)));
    state.quality = localStorage.getItem('tubematex-quality') || 'auto';
    $('#qualitySelector').value = state.quality;
    $('#quickQuality').value = state.quality;
    const onQualityChange = event => { state.quality = event.target.value; $('#qualitySelector').value = state.quality; localStorage.setItem('tubematex-quality', state.quality); };
    $('#qualitySelector').addEventListener('change', onQualityChange);
    $('#quickQuality').addEventListener('change', onQualityChange);
    setSelectedFormat(state.format);
    $('#quickFormat')?.addEventListener('change', event => setSelectedFormat(event.target.value.toLowerCase()));
    $('#downloadForm').addEventListener('submit', startDownload);
    document.querySelectorAll('.preview-button').forEach(button => button.addEventListener('click', () => {
      const card = button.closest('.search-result');
      const title = card?.querySelector('strong')?.textContent || 'conteúdo selecionado';
      if (button.dataset.previewUrl) window.TubeMateX.preview(button.dataset.previewUrl, title, button.dataset.previewType || 'audio');
      else showNotification(`Pré-visualização de “${title}” selecionada.`, 'success');
      document.querySelector('.mini-player')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    $('#playerSeek')?.addEventListener('input', event => { const audio = $('#miniAudio'); if (audio?.duration) audio.currentTime = (Number(event.target.value) / 100) * audio.duration; });
    document.querySelector('.play-button')?.addEventListener('click', event => {
      const audio = $('#miniAudio');
      const playing = event.currentTarget.dataset.playing === 'true';
      if (!audio?.src) { showNotification('Escolhe um resultado para iniciar a pré-visualização.', 'error'); return; }
      if (playing) audio.pause(); else audio.play().catch(() => {});
      event.currentTarget.dataset.playing = String(!playing);
      event.currentTarget.classList.toggle('is-playing', !playing);
    });
    $('#videoUrl').addEventListener('input', event => {
      $('#clearUrl').hidden = !event.target.value;
      clearTimeout(state.infoTimer);
      state.infoTimer = setTimeout(fetchInfo, 650);
    });
    $('#clearUrl').addEventListener('click', () => { $('#videoUrl').value = ''; $('#clearUrl').hidden = true; renderInfo(null); $('#videoUrl').focus(); });
    $('#clearHistory').addEventListener('click', clearHistory);
    $('#historyContainer').addEventListener('click', event => { const button = event.target.closest('[data-favorite-id]'); if (button) toggleFavorite(button.dataset.favoriteId, button); });
    $('#urlInputWrap').addEventListener('dragover', event => { event.preventDefault(); $('#urlInputWrap').classList.add('drop-ready'); });
    $('#urlInputWrap').addEventListener('dragleave', () => $('#urlInputWrap').classList.remove('drop-ready'));
    $('#urlInputWrap').addEventListener('drop', event => {
      event.preventDefault();
      $('#urlInputWrap').classList.remove('drop-ready');
      const value = event.dataTransfer?.getData('text/plain')?.trim();
      if (value) { $('#videoUrl').value = value; $('#clearUrl').hidden = false; fetchInfo(); }
    });
    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') $('#downloadForm').requestSubmit();
      if (event.key === 'Escape' && document.activeElement === $('#videoUrl')) $('#clearUrl').click();
    });
    $('#liveQueue')?.addEventListener('click', async event => {
      const cancelButton = event.target.closest('[data-cancel-live-job]');
      const actionButton = event.target.closest('[data-job-action]');
      const id = cancelButton?.dataset.cancelLiveJob || actionButton?.dataset.jobAction;
      if (!id) return;
      const job = state.jobs.get(id); if (job) state.job = job;
      try {
        const endpoint = cancelButton ? `/api/downloads/${encodeURIComponent(id)}` : `/api/downloads/${encodeURIComponent(id)}/${job?.status === 'paused' ? 'resume' : 'pause'}`;
        const response = await fetch(endpoint, { method: cancelButton ? 'DELETE' : 'POST' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar o download.');
        updateJob(result); showNotification(cancelButton ? 'Download cancelado.' : (result.status === 'paused' ? 'Download pausado.' : 'Download retomado.'), cancelButton ? 'error' : 'success');
      } catch (error) { showNotification(error.message, 'error'); }
    });
    $('#pauseAllButton')?.addEventListener('click', async () => {
      try {
        const action = state.pausedAll ? 'resume-all' : 'pause-all';
        const response = await fetch(`/api/downloads/${action}`, { method: 'POST' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a fila.');
        state.pausedAll = !state.pausedAll; (result.jobs || []).forEach(updateJob); renderLiveQueue();
        showNotification(state.pausedAll ? 'Todos os downloads foram pausados.' : 'Todos os downloads foram retomados.', 'success');
      } catch (error) { showNotification(error.message, 'error'); }
    });
    $('#cancelJob').addEventListener('click', async () => {
      if (!state.job?.id) return;
      try {
        const response = await fetch(`/api/downloads/${encodeURIComponent(state.job.id)}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível parar o download.');
        const source = state.eventSources.get(state.job.id); source?.close(); state.eventSources.delete(state.job.id);
        updateJob(result);
        setLoading(false);
        showNotification('Download cancelado.', 'error');
      } catch (error) { showNotification(error.message, 'error'); }
    });
    loadHistory();
    updateUserStatus();
    const auth = new URLSearchParams(window.location.search).get('auth');
    if (auth === 'success') showNotification('Sessão iniciada com sucesso.', 'success');
    if (auth === 'failed') showNotification('Não foi possível iniciar sessão.', 'error');
    if (auth === 'unavailable') showNotification('Login ainda não configurado neste ambiente.', 'error');
    if (auth) window.history.replaceState({}, document.title, window.location.pathname);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
