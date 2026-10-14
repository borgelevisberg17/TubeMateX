/* Shared, framework-free UI components used by the media workspaces. */
(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
  const routes = [
    ['home', '/', 'Início'],
    ['music', '/music.html', 'Música'],
    ['social', '/social.html', 'Social'],
    ['cine', '/entertainment.html', 'Cine'],
    ['library', '/profile', 'Biblioteca']
  ];
  const contexts = {
    home: 'Pesquisa e descoberta', music: 'Área de música', social: 'Vídeo social',
    cine: 'Cinema e canais', library: 'Biblioteca pessoal', downloads: 'Fila e tarefas', settings: 'Preferências'
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const link = (href, label, className, current = false) => {
    const node = element('a', className, label);
    node.href = href;
    if (current) node.setAttribute('aria-current', 'page');
    return node;
  };
  const iconPaths = {
    search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z', 'm17 17 4 4'],
    download: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
    settings: ['M10 2h4l.6 2.2a8 8 0 0 1 1.7 1l2.1-.7 2 3.5-1.5 1.6a8 8 0 0 1 0 2l1.5 1.6-2 3.5-2.1-.7a8 8 0 0 1-1.7 1L14 22h-4l-.6-2.2a8 8 0 0 1-1.7-1l-2.1.7-2-3.5 1.5-1.6a8 8 0 0 1 0-2L3.6 8l2-3.5 2.1.7a8 8 0 0 1 1.7-1L10 2Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
    arrow: ['M5 12h14', 'm12 5 7 7-7 7']
  };
  function svgIcon(name, className = 'tmx-icon-svg') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    (iconPaths[name] || []).forEach(data => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', data);
      svg.append(path);
    });
    return svg;
  }

  function renderHeader(placeholder) {
    const active = placeholder.dataset.active || 'home';
    const localNav = placeholder.querySelector('.entertainment-nav');
    const localActions = placeholder.querySelector('.ent-top-actions');
    const header = element('header', 'tmx-app-header');
    header.dataset.active = active;
    const brand = link('/', '', 'tmx-app-brand');
    brand.setAttribute('aria-label', 'TubeMateX — página inicial');
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mark.setAttribute('viewBox', '0 0 24 24');
    mark.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 4v16l14-8L5 4Z');
    mark.append(path);
    const wordmark = element('span', 'tmx-app-wordmark');
    wordmark.append(document.createTextNode('TubeMate'), element('span', 'tmx-brand-x', 'X'));
    brand.append(mark, wordmark);
    header.append(brand);

    const context = element('span', 'tmx-app-context', placeholder.dataset.context || contexts[active] || 'Media workspace');
    header.append(context);

    const nav = element('nav', 'tmx-main-nav');
    nav.setAttribute('aria-label', 'Navegação principal');
    routes.forEach(([key, href, label]) => nav.append(link(href, label, 'tmx-main-nav-link', key === active)));
    header.append(nav);

    const actions = element('div', 'tmx-header-actions');
    if (localActions) {
      const search = localActions.querySelector('#openEntertainmentSearch');
      if (search) { search.replaceChildren(svgIcon('search')); actions.append(search); }
    }
    const downloads = link('/downloads.html', 'Downloads', 'tmx-download-launch tmx-header-action tmx-header-download', active === 'downloads');
    downloads.setAttribute('aria-label', active === 'downloads' ? 'Downloads, página atual' : 'Abrir downloads');
    downloads.prepend(svgIcon('download'));
    downloads.append(element('span', 'tmx-download-count', '0'));
    downloads.querySelector('.tmx-download-count').dataset.downloadCount = '';
    actions.append(downloads);
    const settings = link('/settings', 'Definições', 'tmx-header-action tmx-header-settings', active === 'settings');
    settings.prepend(svgIcon('settings'));
    actions.append(settings);
    header.append(actions);

    if (localNav) {
      const subnav = element('div', 'tmx-local-nav');
      subnav.append(localNav);
      placeholder.replaceWith(header, subnav);
    } else {
      placeholder.replaceWith(header);
    }
  }

  function mediaCard(item, options = {}) {
    const escape = options.escapeHtml || escapeHtml;
    const formatTime = options.formatDuration || (seconds => {
      const value = Number(seconds || 0);
      return value ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '—';
    });
    const area = options.area || 'social';
    const isVideo = area !== 'music';
    const isSocial = area === 'social';
    const isLive = Boolean(item.live || item.kind === 'live');
    const cardClass = isSocial ? 'social-card' : isVideo ? 'catalog-card' : 'track-row';
    const thumbClass = isSocial ? 'social-thumb' : isVideo ? 'catalog-poster' : 'track-cover-wrap';
    const bodyClass = isSocial ? 'social-card-body' : isVideo ? 'catalog-card-body' : 'track-copy';
    const actionClass = isSocial ? 'social-card-actions' : isVideo ? 'catalog-card-actions' : 'track-actions';
    const title = item.title || 'Resultado sem título';
    const sourceAction = item.metadataOnly
      ? `<a class="space-button primary" href="${escape(item.externalUrl || item.url)}" target="_blank" rel="noopener noreferrer">Abrir fonte <span class="sr-only">(abre num novo separador)</span></a>`
      : `<button class="space-button preview-action" type="button" aria-label="${isLive ? 'Ver' : isVideo ? 'Pré-visualizar' : 'Ouvir'} ${escape(title)}">${isLive ? 'Ver direto' : isVideo ? 'Abrir vídeo' : 'Ouvir'}</button>${isLive ? '' : `<button class="space-button primary download-action" type="button" aria-label="Baixar ${escape(title)}">Baixar</button>`}`;
    const thumbnail = item.thumbnail
      ? `<img class="${isVideo ? '' : 'track-cover'}" src="${escape(item.thumbnail)}" alt="" loading="lazy">`
      : `<div class="${isVideo ? 'social-thumb-fallback' : 'track-cover track-cover-empty'}" aria-hidden="true">${isVideo ? 'VIDEO' : 'AUDIO'}</div>`;
    const source = item.site ? `<span class="${isSocial ? 'social-badge' : 'catalog-badge'}">${escape(item.site)}</span>` : '';
    const duration = item.duration ? `<span class="duration-badge">${escape(formatTime(item.duration))}</span>` : '';
    const mediaMeta = isVideo
      ? `<span class="catalog-meta">${item.kind === 'film' ? 'Filme ou série' : 'Vídeo longo'} · ${escape(formatTime(item.duration))}</span>`
      : `<span class="track-meta">${escape(item.site || 'Fonte')} · ${escape(formatTime(item.duration))}</span>`;
    return `<article class="${cardClass}" data-url="${escape(item.url)}" data-live="${isLive}" data-direct-stream="${Boolean(item.directStream || isLive)}" data-metadata-only="${Boolean(item.metadataOnly)}" data-mime-type="${escape(item.mimeType || '')}">
      <div class="${thumbClass}">${thumbnail}${isVideo ? source : ''}${duration}</div>
      <div class="${bodyClass}"><h3>${escape(title)}</h3><p>${escape(item.uploader || item.site || 'Fonte pública')}${item.live ? ' · Ao vivo' : ''}</p>${mediaMeta}<div class="${actionClass}">${sourceAction}</div></div>
    </article>`;
  }

  const api = { escapeHtml, mediaCard, renderHeader };
  if (typeof window !== 'undefined') {
    window.TMXComponents = api;
    document.querySelectorAll('tmx-app-header').forEach(renderHeader);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
