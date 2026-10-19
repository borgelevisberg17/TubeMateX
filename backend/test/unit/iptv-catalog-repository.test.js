'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createIptvCatalogService } = require('../../services/iptv-catalog-service');
const { createIptvValidationRepository, sanitizeEntry } = require('../../services/iptv-validation-repository');
const { createIptvHealthService } = require('../../services/iptv-health-service');

function makeChannel(id, country = 'BR', languages = ['por']) {
  return { id: `iptv-${id}`, channelId: id, channelName: id, title: id, country, language: languages[0], languages, categories: ['news'], url: `https://${id}.example/live.m3u8`, streams: [{ url: `https://${id}.example/live.m3u8` }] };
}

test('serviço de catálogo filtra, pagina e deixa descoberta de canais em segundo plano', async () => {
  const channels = [makeChannel('b'), makeChannel('a'), makeChannel('english', 'US', ['eng'])];
  const health = createIptvHealthService({ probeStream: async () => ({ status: 'online', label: 'ok', latencyMs: 2 }) });
  const catalog = createIptvCatalogService({ loadCatalog: async () => channels, healthService: health, defaultBatchSize: 1 });
  const first = await catalog.getPage(1, { country: 'BR' });
  assert.equal(first.candidateCount, 2);
  assert.equal(first.results.length, 0);
  assert.equal(first.hasMore, true);
  await health.waitForIdle();
  const page = await catalog.getPage(1, { country: 'BR', scheduleValidation: false });
  assert.equal(page.results.length, 1);
  assert.equal(page.results[0].channelName, 'a');
  const meta = await catalog.getMeta();
  assert.deepEqual(meta.countries.map(country => country.code).sort(), ['BR', 'US']);
});

test('repositório grava, restaura e elimina cache vencida pelo TTL', async () => {
  let now = 10_000;
  const rows = new Map();
  const dbAll = async (_sql, params) => [...rows.values()].filter(row => row.checked_at > params[0] && row.expires_at > params[1]);
  const dbRun = async (sql, params) => {
    if (sql.startsWith('INSERT')) rows.set(params[0], { cache_key: params[0], result_json: params[1], checked_at: params[2], expires_at: params[3] });
    else if (sql.startsWith('DELETE')) {
      let changes = 0;
      for (const [key, row] of rows) if (row.expires_at <= params[0] || row.checked_at <= params[1]) { rows.delete(key); changes += 1; }
      return { changes };
    }
    return { changes: 1 };
  };
  const repository = createIptvValidationRepository({ dbAll, dbRun, now: () => now });
  await repository.save('abc', { status: 'online', label: 'ok', checkedAt: now, latencyMs: 9, stream: { url: 'https://a.example/live.m3u8' } }, 1000);
  assert.equal((await repository.load(1000)).length, 1);
  now += 1001;
  assert.equal((await repository.load(1000)).length, 0);
  assert.equal(rows.size, 0);
});

test('repositório sanitiza fallbacks e expõe o instante explícito de expiração sem registar URLs de falha', () => {
  const durable = sanitizeEntry({ status: 'offline', checkedAt: 500, code: null, latencyMs: null, failures: [{ url: 'https://secret.example/token=abc', status: 'offline', label: 'HTTP 403' }] });
  assert.equal(durable.code, null);
  assert.equal(durable.latencyMs, null);
  assert.equal(JSON.stringify(durable).includes('secret.example'), false);
});
