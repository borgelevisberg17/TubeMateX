const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
(async () => {
  const response = await fetch(`${base}/api/entertainment/home`);
  if (!response.ok) throw new Error(`home HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.hero?.site === 'YouTube') throw new Error('hero Cine ainda promove YouTube');
  const items = (payload.rows || []).flatMap(row => row.items || []);
  const sites = new Set(items.map(item => item.site));
  if ([...sites].some(site => /youtube/i.test(site || ''))) throw new Error('rail Cine contém YouTube');
  if (![...sites].some(site => /Internet Archive|IPTV público/i.test(site || ''))) throw new Error('fontes Cine esperadas ausentes');
  console.log('ENTERTAINMENT_SOURCE_SMOKE_OK', JSON.stringify({ hero: payload.hero?.site || null, sites: [...sites], rows: (payload.rows || []).map(row => `${row.id}:${row.items.length}`) }));
})().catch(error => { console.error('ENTERTAINMENT_SOURCE_SMOKE_FAIL', error.message); process.exit(1); });
