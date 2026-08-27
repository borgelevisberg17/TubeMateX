(() => {
  const badge = document.querySelector('[data-download-count]');
  const launchers = [...document.querySelectorAll('.tmx-download-launch')];
  if (!badge && !launchers.length) return;
  async function refreshDownloadCount() { try { const response = await fetch('/api/downloads', { headers: { Accept: 'application/json' } }); if (!response.ok) return; const payload = await response.json(); const count = Number(payload.activeCount || 0); document.querySelectorAll('[data-download-count]').forEach(node => { node.textContent = String(count); node.dataset.downloadCount = String(count); }); launchers.forEach(link => link.classList.toggle('is-busy', count > 0)); } catch {} }
  refreshDownloadCount(); window.setInterval(refreshDownloadCount, 12000); window.TubeMateX = window.TubeMateX || {}; window.TubeMateX.refreshDownloadCount = refreshDownloadCount;
})();
