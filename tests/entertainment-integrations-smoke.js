const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const get = async path => { const response = await fetch(`${base}${path}`); const payload = await response.json(); if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${payload.error || ''}`); return payload; };
(async () => {
  const meta = await get('/api/iptv/meta');
  const targetCountries = ['AO', 'BR', 'PT', 'US', 'GB'];
  for (const code of targetCountries) if (!meta.countries.some(item => item.code === code && Number(item.count) > 0)) throw new Error(`país ${code} não aparece com canais públicos`);
  const sources = await get('/api/entertainment/sources');
  for (const id of ['iptv-org', 'internet-archive', 'anilist', 'tvmaze']) if (!sources.sources.some(item => item.id === id)) throw new Error(`fonte ${id} ausente`);
  const first = await get('/api/iptv/channels?country=BR&limit=60&offset=0');
  if (!Array.isArray(first.results) || first.results.length > Math.min(60, first.total)) throw new Error('primeira página IPTV inválida');
  if (first.total > 60) {
    const second = await get('/api/iptv/channels?country=BR&limit=60&offset=60');
    const firstUrls = new Set(first.results.map(item => item.url));
    if (second.results.some(item => firstUrls.has(item.url))) throw new Error('paginação IPTV duplicou streams');
  }
  const search = await get('/api/entertainment/search?q=Naruto');
  if (!Array.isArray(search.results) || !search.results.length) throw new Error('pesquisa Cine sem resultados');
  if (search.results.some(item => item.site === 'YouTube')) throw new Error('pesquisa Cine incluiu YouTube');
  console.log(JSON.stringify({ ok: true, countries: targetCountries, brazilTotal: first.total, sources: sources.sources.map(item => item.id), searchResults: search.results.length }, null, 2));
})().catch(error => { console.error(error.message); process.exit(1); });
