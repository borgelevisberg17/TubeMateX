'use strict';

const CACHE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 7000;
const QUERY = 'query { Page(perPage:1) { media(type:ANIME) { id } } }';

function createCatalogSourceHealth({ fetchImpl = fetch, env = process.env, now = Date.now, cacheMs = CACHE_MS } = {}) {
  let cached = null;
  let expiresAt = 0;
  let inFlight = null;

  async function getJson(url, options = {}) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`http-${response.status}`);
    return response.json();
  }

  async function checkAll({ force = false } = {}) {
    if (!force && cached && expiresAt > now()) return cached;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const checks = [
        ['iptv-org', 'live', async () => {
          const [channels, streams] = await Promise.all(['channels', 'streams'].map(name => getJson(`https://iptv-org.github.io/api/${name}.json`)));
          if (!Array.isArray(channels) || !Array.isArray(streams)) throw new Error('invalid-payload');
          return { records: channels.length, streams: streams.length, note: 'API de catálogo acessível; cada canal só aparece após a sua stream passar a validação.' };
        }],
        ['internet-archive', 'vod', async () => {
          const query = encodeURIComponent('mediatype:movies AND (language:Portuguese OR language:English)');
          const payload = await getJson(`https://archive.org/advancedsearch.php?q=${query}&rows=1&output=json`);
          if (!Number.isFinite(Number(payload.response?.numFound))) throw new Error('invalid-payload');
          return { records: Number(payload.response.numFound), note: 'API acessível; só ficheiros de vídeo em português/inglês que passem sondagem são listados.' };
        }],
        ['tmdb', 'metadata-only', async () => {
          const bearer = String(env.TMDB_BEARER_TOKEN || '').trim();
          const apiKey = String(env.TMDB_API_KEY || '').trim();
          if (!bearer && !apiKey) return { status: 'not-configured', note: 'API opcional não configurada; não fornece streams de reprodução.' };
          const url = `https://api.themoviedb.org/3/configuration${bearer ? '' : `?api_key=${encodeURIComponent(apiKey)}`}`;
          const payload = await getJson(url, bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : {});
          if (!payload.images) throw new Error('invalid-payload');
          return { note: 'API acessível, mas usada apenas para metadata; excluída das secções de reprodução.' };
        }],
        ['anilist', 'metadata-only', async () => {
          const payload = await getJson('https://graphql.anilist.co', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: QUERY }) });
          if (!payload.data?.Page) throw new Error('invalid-payload');
          return { note: 'API acessível, mas usada apenas para metadata; excluída das secções de reprodução.' };
        }],
        ['tvmaze', 'metadata-only', async () => {
          const payload = await getJson('https://api.tvmaze.com/shows?page=0');
          if (!Array.isArray(payload)) throw new Error('invalid-payload');
          return { records: payload.length, note: 'API acessível, mas usada apenas para metadata; excluída das secções de reprodução.' };
        }]
      ];
      const results = await Promise.all(checks.map(async ([id, mode, check]) => {
        const startedAt = now();
        try {
          const details = await check();
          return { id, mode, status: details.status || 'online', configured: details.status !== 'not-configured', checkedAt: new Date(now()).toISOString(), latencyMs: Math.max(0, now() - startedAt), ...details };
        } catch (error) {
          const reason = String(error?.message || error);
          return { id, mode, status: /http-\d+/.test(reason) ? 'unavailable' : 'error', configured: true, checkedAt: new Date(now()).toISOString(), latencyMs: Math.max(0, now() - startedAt), note: 'A verificação da API falhou; os itens desta fonte não são usados como reprodução até haver media validada.' };
        }
      }));
      cached = results;
      expiresAt = now() + cacheMs;
      return results;
    })();
    try { return await inFlight; } finally { inFlight = null; }
  }

  return { checkAll };
}

module.exports = { createCatalogSourceHealth };
