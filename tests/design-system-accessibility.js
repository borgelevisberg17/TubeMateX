const fs = require('node:fs');
const path = require('node:path');

const frontend = path.join(__dirname, '..', 'frontend');
const pages = fs.readdirSync(frontend).filter(file => file.endsWith('.html')).sort();
const sharedShellPages = new Set(['index.html', 'social.html', 'entertainment.html', 'profile.html', 'downloads.html', 'settings.html']);
const customShellPages = new Set(['music.html']);
const failures = [];
const check = (condition, page, message) => { if (!condition) failures.push(`${page}: ${message}`); };

for (const page of pages) {
  const html = fs.readFileSync(path.join(frontend, page), 'utf8');
  check(/<html\b[^>]*\blang="(?:pt-BR|pt-PT)"/i.test(html), page, 'deve declarar o idioma do documento');
  check(/design-system\.css/.test(html), page, 'deve carregar a folha de fundamentos do design system');
  if (customShellPages.has(page)) {
    check(/class="music-sidebar"/.test(html), page, 'deve declarar a navegação lateral própria da área de música');
    check(/class="music-player"/.test(html), page, 'deve declarar o player persistente da área de música');
    check(/class="music-bottom-nav"/.test(html), page, 'deve declarar navegação móvel própria da área de música');
    check(/components\.css/.test(html), page, 'deve carregar os estilos de componentes partilhados');
    check(/components\.js/.test(html), page, 'deve carregar os componentes partilhados');
  }
  check(/class="skip-link"[^>]*href="#main-content"|href="#main-content"[^>]*class="skip-link"/i.test(html), page, 'deve oferecer link para saltar ao conteúdo');
  check(/<main\b[^>]*\bid="main-content"/i.test(html), page, 'deve declarar um landmark main com id main-content');
  check(/design-system\.js/.test(html), page, 'deve carregar os aprimoramentos globais do frontend');
  if (sharedShellPages.has(page)) {
    check(/<tmx-app-header\b/.test(html), page, 'deve usar o cabeçalho partilhado');
    check(/components\.css/.test(html), page, 'deve carregar os estilos de componentes partilhados');
    check(/components\.js/.test(html), page, 'deve carregar os componentes partilhados');
    const footerIcons = [...html.matchAll(/<span class="tmx-footer-icon">([\s\S]*?)<\/span>/g)].map(match => match[1]);
    check(footerIcons.length === 6, page, 'deve mostrar os seis ícones da navegação global');
    check(footerIcons.every(icon => /<svg\b[^>]*aria-hidden="true"/.test(icon)), page, 'os ícones decorativos devem ser SVGs ocultos a leitores de ecrã; os rótulos textuais nomeiam a navegação');
    check(!footerIcons.some(icon => /[⌂♫▣◉▤⚙]/u.test(icon)), page, 'a navegação não deve depender de símbolos Unicode ambíguos');
  }
}

const designSystem = fs.readFileSync(path.join(frontend, 'css', 'design-system.css'), 'utf8');
for (const [pattern, message] of [
  [/focus-visible/, 'deve manter um indicador de foco visível'],
  [/prefers-reduced-motion/, 'deve respeitar movimento reduzido'],
  [/forced-colors/, 'deve acomodar cores forçadas/alto contraste'],
  [/--tmx-bg:/, 'deve definir tokens de cor'],
  [/html\[data-theme="light"\]/, 'deve suportar o tema claro']
]) check(pattern.test(designSystem), 'design-system.css', message);

const home = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
check(/id="searchStatus"[^>]*aria-live="polite"|id="searchStatus"[^>]*role="status"/i.test(home), 'index.html', 'o estado da pesquisa deve ser anunciável');
check(/id="searchResults"[^>]*aria-live="polite"/i.test(home), 'index.html', 'os resultados da pesquisa devem ser anunciáveis');
check(/id="searchQuery"[^>]*aria-label=/i.test(home), 'index.html', 'o campo de pesquisa deve ter nome acessível');

if (failures.length) {
  console.error(`DESIGN_SYSTEM_ACCESSIBILITY_FAIL (${failures.length})`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`DESIGN_SYSTEM_ACCESSIBILITY_OK (${pages.length} páginas; ${sharedShellPages.size} com shell partilhada)`);
}
