const { errorCode, translateError } = require('./media-errors');

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

  return { fetchInfo, fetchPlaylistInfo, errorCode, translateError };
}

module.exports = { createMediaService };
