(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const savedTheme = localStorage.getItem('tubematex-theme') || (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  function notify(message, type = 'success') {
    const element = $('#notification');
    element.textContent = message;
    element.className = `notification ${type} show`;
    setTimeout(() => element.classList.remove('show'), 3500);
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('tubematex-theme', theme);
    $('#settingsThemeToggle').checked = theme === 'dark';
  }
  function renderUser(user) {
    if (!user) return;
    $('#settingsUserName').textContent = user.displayName || 'Utilizador';
    $('#settingsUserEmail').textContent = user.email || 'Conta Google';
    $('#sessionDescription').textContent = 'A tua conta está ligada nesta sessão.';
    $('#loginOrLogout').textContent = 'Sair';
    $('#loginOrLogout').removeAttribute('href');
    $('#loginOrLogout').classList.add('logout-action');
    if (user.avatar) $('#settingsAvatar').innerHTML = `<img src="${esc(user.avatar)}" alt="" />`;
  }
  async function initUser() {
    try {
      const response = await fetch('/api/user');
      if (response.ok) renderUser(await response.json());
    } catch (error) { console.warn('Sessão indisponível', error); }
  }
  async function loadCapabilities() {
    try { const response = await fetch('/api/capabilities'); if (!response.ok) throw new Error(); const data = await response.json(); $('#backendStatus').textContent = 'Online'; $('#backendStatus').classList.add('is-online'); $('#capabilityFormats').textContent = data.formats?.length || 0; $('#capabilityPlatforms').textContent = data.platforms?.length || 0; $('#capabilityConcurrency').textContent = data.maxConcurrentDownloads || 1; $('#capabilityNote').textContent = 'Capacidades carregadas do backend atual.'; }
    catch { $('#backendStatus').textContent = 'Indisponível'; $('#backendStatus').classList.add('is-error'); $('#capabilityNote').textContent = 'Não foi possível consultar o backend agora.'; }
  }
  function loadPreferences() { $('#defaultFormat').value = localStorage.getItem('tubematex-default-format') || 'mp4'; $('#autoplayToggle').checked = localStorage.getItem('tubematex-autoplay') !== 'false'; }

  async function logout() {
    if (!window.confirm('Queres terminar a sessão?')) return;
    try { await fetch('/auth/logout', { method: 'POST' }); window.location.href = '/'; }
    catch { notify('Não foi possível terminar a sessão.', 'error'); }
  }
  async function clearHistory() {
    if (!window.confirm('Queres eliminar todo o histórico deste navegador?')) return;
    try {
      const response = await fetch('/api/history', { method: 'DELETE' });
      if (!response.ok) throw new Error();
      notify('Histórico eliminado.', 'success');
    } catch { notify('Não foi possível eliminar o histórico.', 'error'); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    setTheme(savedTheme);
    $('#settingsThemeToggle').addEventListener('change', event => setTheme(event.target.checked ? 'dark' : 'light'));
    loadPreferences();
    $('#languageSelector').value = localStorage.getItem('tubematex-language') || 'pt-pt';
    $('#defaultFormat').addEventListener('change', event => { localStorage.setItem('tubematex-default-format', event.target.value); notify('Formato padrão guardado.'); });
    $('#autoplayToggle').addEventListener('change', event => { localStorage.setItem('tubematex-autoplay', String(event.target.checked)); notify('Preferência de reprodução guardada.'); });
    $('#languageSelector').addEventListener('change', event => { localStorage.setItem('tubematex-language', event.target.value); notify('Preferência de idioma guardada.'); });
    $('#clearHistoryBtn').addEventListener('click', clearHistory);
    $('#loginOrLogout').addEventListener('click', event => { if (event.currentTarget.classList.contains('logout-action')) { event.preventDefault(); logout(); } });
    initUser(); loadCapabilities();
  });
})();
