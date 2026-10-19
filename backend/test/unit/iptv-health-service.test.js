'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createIptvHealthService } = require('../../services/iptv-health-service');

const channel = (id, streams) => ({ id: `iptv-${id}`, channelId: id, title: id, url: streams[0]?.url || null, streams });

test('mostra apenas canais com stream validada e escolhe a primeira alternativa funcional', async () => {
  const item = channel('one', [
    { url: 'https://bad.example/a.m3u8' },
    { url: 'https://good.example/b.m3u8' },
    { url: 'https://not-checked.example/c.m3u8' }
  ]);
  const service = createIptvHealthService({ probeStream: async url => url.includes('good') ? { status: 'online', label: 'HLS válido', latencyMs: 42, code: 206, contentType: 'video/mp2t' } : { status: 'offline', label: 'HTTP 404', code: 404 } });
  assert.equal(service.snapshot([item]).pendingCount, 1);
  await service.waitForIdle();
  const result = service.snapshot([item]);
  assert.equal(result.pendingCount, 0);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].url, 'https://good.example/b.m3u8');
  assert.equal(result.items[0].streams.length, 1);
  assert.equal(result.items[0].validationStatus, 'online');
  assert.equal(result.items[0].publicPlayback, true);
  assert.equal(result.items[0].metadataOnly, false);
});

test('classifica canal sem streams browser-compatíveis como não suportado', async () => {
  const item = channel('external', [{ url: 'https://media.example/live.m3u8', requiresExternalPlayer: true, referrer: 'https://origin.example' }]);
  const service = createIptvHealthService({ probeStream: async () => { throw new Error('não devia sondar'); } });
  service.snapshot([item]);
  await service.waitForIdle();
  assert.equal(service.statusOf(item).status, 'unsupported');
  assert.equal(service.snapshot([item]).items.length, 0);
});

test('mantém estados de acesso restrito, DRM e indisponibilidade como não reproduzíveis', async () => {
  for (const status of ['restricted', 'drm-protected', 'offline']) {
    const item = channel(status, [{ url: `https://${status}.example/live.m3u8` }]);
    const service = createIptvHealthService({ probeStream: async () => ({ status, label: status }) });
    service.snapshot([item]);
    await service.waitForIdle();
    assert.equal(service.snapshot([item]).items.length, 0);
    assert.equal(service.statusOf(item).status, status);
  }
});

test('limita a concorrência da fila', async () => {
  let active = 0;
  let peak = 0;
  const service = createIptvHealthService({
    concurrency: 2,
    probeStream: async () => {
      active += 1; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 15));
      active -= 1;
      return { status: 'online', label: 'ok', latencyMs: 1 };
    }
  });
  service.snapshot(Array.from({ length: 7 }, (_, index) => channel(String(index), [{ url: `https://stream${index}.example/a.m3u8` }])));
  await service.waitForIdle();
  assert.equal(peak, 2);
});

test('cache é invalidado pelo TTL e pelo conjunto de URLs', async () => {
  let clock = 1000;
  let probes = 0;
  const service = createIptvHealthService({ ttlMs: 100, now: () => clock, probeStream: async () => { probes += 1; return { status: 'online', label: 'ok', latencyMs: 5 }; } });
  const item = channel('cache', [{ url: 'https://a.example/live.m3u8' }]);
  service.snapshot([item]); await service.waitForIdle();
  service.snapshot([item]); await service.waitForIdle();
  assert.equal(probes, 1);
  clock += 101;
  service.snapshot([item]); await service.waitForIdle();
  assert.equal(probes, 2);
  const changed = channel('cache', [{ url: 'https://b.example/live.m3u8' }]);
  service.snapshot([changed]); await service.waitForIdle();
  assert.equal(probes, 3);
});

test('restaura validações persistidas dentro do TTL sem sondar de novo', async () => {
  const item = channel('restored', [{ url: 'https://restored.example/live.m3u8' }]);
  let probes = 0;
  const seed = createIptvHealthService({ probeStream: async () => ({ status: 'online', label: 'ok', latencyMs: 12 }) });
  const key = seed.keyOf(item);
  const checkedAt = Date.now();
  const service = createIptvHealthService({ probeStream: async () => { probes += 1; throw new Error('não devia sondar'); } });
  service.restore([{ key, entry: { status: 'online', label: 'ok', checkedAt, latencyMs: 12, stream: { url: item.url } } }]);
  const result = service.snapshot([item]);
  await service.waitForIdle();
  assert.equal(result.items.length, 1);
  assert.equal(probes, 0);
});

test('persiste o resultado concluído para o próximo processo', async () => {
  const saved = [];
  const item = channel('persist', [{ url: 'https://persist.example/live.m3u8' }]);
  const service = createIptvHealthService({ probeStream: async () => ({ status: 'online', label: 'ok', latencyMs: 8 }), persistEntry: (key, entry) => saved.push({ key, entry }) });
  service.snapshot([item]);
  await service.waitForIdle();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].key, service.keyOf(item));
  assert.equal(saved[0].entry.status, 'online');
});
