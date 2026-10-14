const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createSystemRouter } = require('../../routes/system-routes');
const { createMediaRouter } = require('../../routes/media-routes');

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  }
}

const passThrough = (_req, _res, next) => next();

function systemRouter() {
  return createSystemRouter({
    distributedQueue: null,
    getQueueSize: () => 4,
    getActiveJobs: () => 1,
    bullmqRole: 'both',
    listYtDlpPlugins: () => [{ id: 'fixture-plugin' }],
    ytdlpPluginDir: '/plugins',
    allowedFormats: { mp4: { label: 'MP4', type: 'video' }, mp3: { label: 'MP3', type: 'audio' } },
    videoQualities: { auto: 'Automática', 720: '720p' },
    maxConcurrentDownloads: 2,
    maxDownloadSize: 1024,
    searchProviders: ['ytsearch', 'scsearch'],
    searchProviderLabels: { ytsearch: 'YouTube', scsearch: 'SoundCloud' },
    youtubeAuthConfigured: false,
    supportedPlatforms: [{ id: 'youtube', label: 'YouTube' }],
    apiLimiter: passThrough
  });
}

test('contrato GET /health mantém estado operacional e números inteiros', async () => {
  await withServer(systemRouter(), async base => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await response.json(), {
      status: 'ok', service: 'TubeMateX', role: 'both', queue: 4, active: 1, distributed: null
    });
  });
});

test('contrato GET /api/capabilities descreve formatos, limites e fontes sem segredos', async () => {
  await withServer(systemRouter(), async base => {
    const response = await fetch(`${base}/api/capabilities`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.formats, [
      { id: 'mp4', label: 'MP4', type: 'video' },
      { id: 'mp3', label: 'MP3', type: 'audio' }
    ]);
    assert.deepEqual(payload.qualities, [{ id: '720', label: '720p' }, { id: 'auto', label: 'Automática' }]);
    assert.equal(payload.maxConcurrentDownloads, 2);
    assert.equal(payload.youtubeAuthConfigured, false);
    assert.deepEqual(payload.searchProviders, ['YouTube', 'SoundCloud']);
    assert.deepEqual(payload.platforms, [{ id: 'youtube', label: 'YouTube' }]);
    assert.equal(JSON.stringify(payload).includes('secret'), false);
  });
});

test('contrato GET /api/media/info rejeita URL inválido sem consultar a origem', async () => {
  let lookups = 0;
  const router = createMediaRouter({
    apiLimiter: passThrough,
    validateUrl: async value => value === 'https://media.example/item' ? value : null,
    fetchPlaylistInfo: async () => ({}),
    fetchInfo: async url => { lookups += 1; return { title: 'Clip público', url }; },
    ytdlp: async () => ({}), ytdlpCommonOptions: {},
    errorCode: () => 'processing-error', translateError: () => 'Falha de teste'
  });
  await withServer(router, async base => {
    const rejected = await fetch(`${base}/api/media/info?url=${encodeURIComponent('http://127.0.0.1/private')}`);
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /URL público válido/i);
    assert.equal(lookups, 0);

    const accepted = await fetch(`${base}/api/media/info?url=${encodeURIComponent('https://media.example/item')}`);
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { title: 'Clip público', url: 'https://media.example/item' });
    assert.equal(lookups, 1);
  });
});
