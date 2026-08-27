const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
(async () => {
  const response = await fetch(`${base}/api/entertainment/home`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.rows)) throw new Error('contrato sem rows');
  if (payload.hero && (!payload.hero.url || !payload.hero.site)) throw new Error('hero sem URL/origem');
  if (!payload.rows.length) throw new Error('nenhuma coleção real foi devolvida');
  for (const row of payload.rows) {
    if (!row.id || !row.title || !Array.isArray(row.items)) throw new Error('rail inválido');
    for (const item of row.items) if (!item.url || !item.site) throw new Error(`item sem origem em ${row.id}`);
  }
  const ids = new Set(payload.rows.map(row => row.id));
  if (!ids.has('featured') || !ids.has('films')) throw new Error('rails essenciais ausentes');
  console.log('ENTERTAINMENT_HOME_API_OK', JSON.stringify({ hero: payload.hero?.title || null, rows: payload.rows.map(row => `${row.id}:${row.items.length}`) }));
})().catch(error => { console.error('ENTERTAINMENT_HOME_API_FAIL', error.message); process.exit(1); });
