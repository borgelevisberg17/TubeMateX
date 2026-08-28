const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
(async () => {
  const response = await fetch(`${base}/api/entertainment/home`);
  if (!response.ok) throw new Error(`home ${response.status}`);
  const payload = await response.json();
  const rows = new Map((payload.rows || []).map(row => [row.id, row]));
  for (const id of ['sports', 'portugal', 'brands']) {
    const row = rows.get(id);
    if (!row || !row.items?.length) throw new Error(`rail ${id} sem conteúdo real`);
  }
  for (const country of ['AO', 'BR', 'PT']) { const response = await fetch(`${base}/api/iptv/channels?country=${country}&limit=12`); if (!response.ok) throw new Error(`país ${country} indisponível`); const result = await response.json(); if (!result.results?.length) throw new Error(`país ${country} sem canais`); if (!result.results.some(item => item.thumbnail)) throw new Error(`país ${country} sem logos`); }
  const brands = rows.get('brands').items.map(item => `${item.channelName || ''} ${item.title || ''}`).join(' ');
  for (const expected of ['AXN', 'Sony', 'Universal', 'Disney', 'FOX']) if (!new RegExp(expected, 'i').test(brands)) throw new Error(`marca ausente: ${expected}`);
  const all = (payload.rows || []).flatMap(row => row.items || []);
  if (all.some(item => /youtube/i.test(item.site || '') || /youtube/i.test(item.url || ''))) throw new Error('YouTube entrou no Cine');
  console.log('ENTERTAINMENT_COVERAGE_OK', JSON.stringify({ sports: rows.get('sports').items.length, portugal: rows.get('portugal').items.length, brands: rows.get('brands').items.length, countries: ['AO', 'BR', 'PT'] }));
})().catch(error => { console.error('ENTERTAINMENT_COVERAGE_FAIL', error.message); process.exit(1); });
