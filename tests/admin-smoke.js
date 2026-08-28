const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3133';
const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
if (!username || !password) throw new Error('ADMIN_USERNAME e ADMIN_PASSWORD são necessários apenas para o smoke test.');
let cookie = '';
let csrf = '';
async function request(path, options = {}) {
  const headers = { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(csrf ? { 'X-Admin-CSRF': csrf } : {}) };
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${body.error || ''}`);
  return body;
}
(async () => {
  const session = await request('/api/admin/session');
  if (!session.configured || session.authenticated) throw new Error('Estado inicial de sessão admin inválido.');
  const login = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  csrf = login.csrf;
  const source = await request('/api/admin/sources', { method: 'POST', body: JSON.stringify({ id: 'smoke-source', name: 'Fonte Smoke Autorizada', baseUrl: 'https://archive.org', allowedDomains: ['archive.org'], kind: 'vod' }) });
  if (source.source.id !== 'smoke-source') throw new Error('Fonte não criada.');
  const item = await request('/api/admin/catalog', { method: 'POST', body: JSON.stringify({ sourceId: 'smoke-source', contentType: 'film', title: 'Filme Smoke Autorizado', description: 'Item de teste', externalUrl: 'https://archive.org/details/smoke-test', categories: ['film'], isFeatured: true }) });
  const id = item.item.id;
  if (!['pending', 'needs-review'].includes(item.item.approvalStatus)) throw new Error('Item novo não entrou num estado de revisão.');
  const approved = await request(`/api/admin/catalog/${id}/approve`, { method: 'POST' });
  if (approved.item.approvalStatus !== 'approved') throw new Error('Item não aprovado.');
  const publicSources = await request('/api/entertainment/sources');
  if (!publicSources.sources.some(sourceEntry => sourceEntry.id === 'admin-smoke-source')) throw new Error('Fonte aprovada não aparece no catálogo público.');
  const search = await request('/api/entertainment/search?q=Filme%20Smoke%20Autorizado');
  if (!search.results.some(result => result.title === 'Filme Smoke Autorizado')) throw new Error('Item aprovado não aparece na pesquisa pública.');
  await request(`/api/admin/catalog/${id}`, { method: 'DELETE' });
  await request('/api/admin/sources/smoke-source', { method: 'DELETE' });
  console.log('ADMIN_SMOKE_OK');
})().catch(error => { console.error(error.message); process.exit(1); });
