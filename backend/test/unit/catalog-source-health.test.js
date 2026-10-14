'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCatalogSourceHealth } = require('../../services/catalog-source-health');

const jsonResponse = payload => ({ ok: true, status: 200, json: async () => payload });

test('verifica fontes públicas e identifica metadata-only sem alegar playback', async () => {
  const calls = [];
  const health = createCatalogSourceHealth({
    env: {},
    fetchImpl: async url => {
      calls.push(String(url));
      if (String(url).includes('/channels.json')) return jsonResponse([{ id: 'one' }]);
      if (String(url).includes('/streams.json')) return jsonResponse([{ url: 'https://media.example/live.m3u8' }]);
      if (String(url).includes('archive.org/advancedsearch')) return jsonResponse({ response: { numFound: 42 } });
      if (String(url).includes('graphql.anilist.co')) return jsonResponse({ data: { Page: { media: [{ id: 1 }] } } });
      if (String(url).includes('tvmaze.com')) return jsonResponse([{ id: 1 }]);
      throw new Error('unexpected URL');
    }
  });
  const result = await health.checkAll();
  assert.equal(result.find(item => item.id === 'iptv-org').status, 'online');
  assert.equal(result.find(item => item.id === 'iptv-org').streams, 1);
  assert.equal(result.find(item => item.id === 'internet-archive').records, 42);
  for (const id of ['anilist', 'tvmaze']) {
    const source = result.find(item => item.id === id);
    assert.equal(source.mode, 'metadata-only');
    assert.match(source.note, /apenas para metadata/i);
  }
  assert.equal(result.find(item => item.id === 'tmdb').status, 'not-configured');
  assert.match(result.find(item => item.id === 'tmdb').note, /não fornece streams/i);
  assert.equal(JSON.stringify(result).includes('Bearer '), false);
  assert.equal(calls.length, 5);
});

test('cacheia probes concorrentes durante o TTL', async () => {
  let now = 1000;
  let calls = 0;
  const health = createCatalogSourceHealth({
    now: () => now,
    cacheMs: 100,
    env: { TMDB_API_KEY: 'test-key' },
    fetchImpl: async url => {
      calls += 1;
      if (String(url).includes('themoviedb.org')) return jsonResponse({ images: {} });
      if (String(url).includes('/channels.json')) return jsonResponse([]);
      if (String(url).includes('/streams.json')) return jsonResponse([]);
      if (String(url).includes('archive.org')) return jsonResponse({ response: { numFound: 0 } });
      if (String(url).includes('graphql.anilist.co')) return jsonResponse({ data: { Page: {} } });
      return jsonResponse([]);
    }
  });
  const first = await health.checkAll();
  const callCount = calls;
  const second = await health.checkAll();
  assert.deepEqual(second, first);
  assert.equal(calls, callCount);
  now += 101;
  await health.checkAll();
  assert.equal(calls, callCount * 2);
});

test('falhas externas ficam como indisponíveis sem incluir segredos na resposta', async () => {
  const health = createCatalogSourceHealth({
    env: { TMDB_BEARER_TOKEN: 'secret-value' },
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) })
  });
  const result = await health.checkAll();
  assert.equal(result.find(item => item.id === 'iptv-org').status, 'unavailable');
  assert.equal(result.find(item => item.id === 'tmdb').status, 'unavailable');
  assert.equal(JSON.stringify(result).includes('secret-value'), false);
});
