const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const get = async path => { const response = await fetch(`${base}${path}`); const payload = await response.json(); if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${payload.error || ''}`); return payload; };
(async () => {
  const meta = await get('/api/iptv/meta');
  const targetCountries = ['AO', 'BR', 'PT', 'US', 'GB'];
  for (const code of targetCountries) if (!meta.countries.some(item => item.code === code && Number(item.count) > 0)) throw new Error(`país ${code} não aparece com canais públicos`);
  const sources = await get('/api/entertainment/sources');
  for (const id of ['iptv-org', 'internet-archive', 'anilist', 'tvmaze']) if (!sources.sources.some(item => item.id === id)) throw new Error(`fonte ${id} ausente`);
  const sourceHealth = await get('/api/entertainment/sources/health');
  if (!Array.isArray(sourceHealth.sources) || !sourceHealth.sources.some(item => item.id === 'iptv-org')) throw new Error('health das fontes indisponível');
  const first = await get('/api/iptv/channels?country=BR&limit=60&offset=0');
  if (!Array.isArray(first.results) || !Array.isArray(first.validation) || first.results.length > 60) throw new Error('primeira página IPTV inválida');
  if ((first.validation || []).some(item => !['por', 'eng'].includes(item.language))) throw new Error('catálogo IPTV incluiu idioma não suportado');
  if (first.results.some(item => item.metadataOnly || item.publicPlayback !== true || item.streamAvailable !== true)) throw new Error('IPTV devolveu item sem stream validada');
  if (first.total > 60) {
    const second = await get('/api/iptv/channels?country=BR&limit=60&offset=60');
    const firstUrls = new Set(first.results.map(item => item.url));
    if (second.results.some(item => firstUrls.has(item.url))) throw new Error('paginação IPTV duplicou streams');
  }
  const search = await get('/api/entertainment/search?q=Naruto');
  if (!Array.isArray(search.results)) throw new Error('pesquisa Cine inválida');
  if (search.results.some(item => item.site === 'YouTube' || item.metadataOnly || item.publicPlayback !== true || item.streamAvailable !== true)) throw new Error('pesquisa Cine incluiu item sem stream validada');
  console.log(JSON.stringify({ ok: true, countries: targetCountries, brazilPlayable: first.total, brazilCandidates: first.candidateCount, sourceHealth: sourceHealth.sources.map(item => `${item.id}:${item.status}`), searchResults: search.results.length }, null, 2));
})().catch(error => { console.error(error.message); process.exit(1); });
