/* Shared progressive enhancement for TubeMateX pages. */
(() => {
  const root = document.documentElement;
  const storedTheme = (() => {
    try { return localStorage.getItem('tubematex-theme'); } catch { return null; }
  })();
  const preferredTheme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  root.dataset.theme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : preferredTheme;

  const main = document.querySelector('main');
  if (main && !main.id) main.id = 'main-content';
  const target = main?.id || 'main-content';
  if (!document.querySelector('.skip-link')) {
    const link = document.createElement('a');
    link.className = 'skip-link';
    link.href = `#${target}`;
    link.textContent = 'Saltar para o conteúdo principal';
    document.body.prepend(link);
  }
})();
