function createMediaService({ ytdlp, ytdlpCommonOptions, infoCache, infoCacheMs }) {
  async function fetchInfo(url) {
    const cached = infoCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const result = await ytdlp(url, {
      ...ytdlpCommonOptions,
      dumpSingleJson: true,
      skipDownload: true,
      noWarnings: true,
      noPlaylist: true,
      noCheckCertificates: true,
      socketTimeout: 15
    });
    const value = {
      title: result.title || result.fulltitle || 'Download sem título',
      thumbnail: result.thumbnail || null,
      duration: Number(result.duration || 0),
      site: result.extractor_key || result.extractor || new URL(url).hostname,
      uploader: result.uploader || null
    };
    infoCache.set(url, { value, expiresAt: Date.now() + infoCacheMs });
    return value;
  }

  async function fetchPlaylistInfo(url) {
    const result = await ytdlp(url, {
      ...ytdlpCommonOptions,
      dumpSingleJson: true,
      flatPlaylist: true,
      skipDownload: true,
      noWarnings: true,
      noCheckCertificates: true,
      socketTimeout: 20,
      playlistEnd: 100
    });
    const extractor = result.extractor_key || result.extractor || new URL(url).hostname;
    const entries = (Array.isArray(result.entries) ? result.entries : [])
      .filter(entry => entry && (entry.id || entry.url))
      .map((entry, index) => {
        const entryUrl = entry.webpage_url || entry.original_url || entry.url || (entry.id && /youtube/i.test(extractor) ? `https://www.youtube.com/watch?v=${encodeURIComponent(entry.id)}` : null);
        return entryUrl ? {
          id: `episode-${entry.id || index + 1}`,
          title: entry.title || `Episódio ${index + 1}`,
          url: entryUrl,
          thumbnail: entry.thumbnail || null,
          duration: Number(entry.duration || 0),
          uploader: entry.uploader || result.uploader || null,
          site: extractor,
          kind: 'series',
          episodeNumber: Number(entry.episode_number || entry.playlist_index || index + 1),
          seasonNumber: Number(entry.season_number || 1)
        } : null;
      })
      .filter(Boolean);
    const seasons = [...new Set(entries.map(entry => entry.seasonNumber || 1))]
      .sort((a, b) => a - b)
      .map(seasonNumber => ({
        seasonNumber,
        title: `Temporada ${seasonNumber}`,
        episodes: entries.filter(entry => (entry.seasonNumber || 1) === seasonNumber)
      }));
    return { title: result.title || 'Série da fonte', site: extractor, seasons };
  }

  function errorCode(error) {
    const raw = String(error?.stderr || error?.message || error || '');
    if (/Sign in|not a bot|age-restricted|login required|members-only/i.test(raw)) return 'authentication-required';
    if (/Requested format is not available|format.*not available/i.test(raw)) return 'format-unavailable';
    if (/DRM|protected content/i.test(raw)) return 'drm-protected';
    if (/copyright|blocked in your country|not available in your country/i.test(raw)) return 'region-blocked';
    if (/Unsupported URL|no suitable extractor/i.test(raw)) return 'unsupported-url';
    if (/Video unavailable|removed|private video/i.test(raw)) return 'content-unavailable';
    if (/File is larger than/i.test(raw)) return 'file-too-large';
    return 'processing-error';
  }

  function translateError(error) {
    const code = errorCode(error);
    if (code === 'unsupported-url') return 'Este site ou URL não é suportado pelo motor de download.';
    if (code === 'content-unavailable') return 'O conteúdo não está disponível, foi removido ou é privado.';
    if (code === 'authentication-required') return 'O YouTube bloqueou esta sessão por verificação anti-bot. O TubeMateX não pode contornar esse bloqueio automaticamente: configura um cookies.txt local em YTDLP_COOKIES_FILE ou YTDLP_COOKIES_FROM_BROWSER no servidor, sem o comitar, e tenta novamente.';
    if (code === 'format-unavailable') return 'A qualidade pedida não existe neste conteúdo. Escolhe Automática ou tenta outra qualidade.';
    if (code === 'drm-protected') return 'Este catálogo usa DRM e não pode ser descarregado pelo TubeMateX.';
    if (code === 'region-blocked') return 'O conteúdo está bloqueado por direitos ou região.';
    if (code === 'file-too-large') return 'O ficheiro excede o limite de tamanho permitido.';
    return 'Não foi possível processar este download. Confirma o link e tenta novamente.';
  }

  return { fetchInfo, fetchPlaylistInfo, errorCode, translateError };
}

module.exports = { createMediaService };
