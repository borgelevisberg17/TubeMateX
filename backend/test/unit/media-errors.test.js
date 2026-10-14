const test = require('node:test');
const assert = require('node:assert/strict');
const { errorCode, translateError } = require('../../services/media-errors');
const { createMediaService } = require('../../services/media-service');

test('classifica erros comuns do yt-dlp em códigos estáveis', () => {
  const cases = [
    [{ stderr: 'Sign in to confirm you are not a bot' }, 'authentication-required'],
    [new Error('Requested format is not available'), 'format-unavailable'],
    ['DRM protected content', 'drm-protected'],
    ['This video is blocked in your country', 'region-blocked'],
    ['Unsupported URL: example.test', 'unsupported-url'],
    ['Video unavailable', 'content-unavailable'],
    ['File is larger than allowed', 'file-too-large'],
    ['unexpected failure', 'processing-error']
  ];
  for (const [error, expected] of cases) assert.equal(errorCode(error), expected);
});

test('fornece mensagem localizada para falhas e evita expor erro bruto', () => {
  const message = translateError(new Error('Unsupported URL: https://private.example/token'));
  assert.match(message, /não é suportado/i);
  assert.doesNotMatch(message, /private\.example|token/);
});

test('cacheia metadados durante a janela configurada', async () => {
  let calls = 0;
  const service = createMediaService({
    ytdlp: async () => { calls += 1; return { title: 'Faixa de teste', duration: 90, extractor_key: 'YouTube' }; },
    ytdlpCommonOptions: { quiet: true },
    infoCache: new Map(),
    infoCacheMs: 60_000
  });
  const first = await service.fetchInfo('https://example.org/watch/1');
  const second = await service.fetchInfo('https://example.org/watch/1');
  assert.equal(calls, 1);
  assert.deepEqual(second, first);
  assert.equal(first.title, 'Faixa de teste');
  assert.equal(first.duration, 90);
});

test('gera cartões vanilla com conteúdo escapado e ação correta para catálogo-only', () => {
  const { mediaCard } = require('../../../frontend/js/components');
  const card = mediaCard({ title: '<script>alert(1)</script>', url: 'https://example.org/item', site: 'Fonte', metadataOnly: true, externalUrl: 'https://example.org/source' }, { area: 'social' });
  assert.match(card, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(card, /<script>/);
  assert.match(card, /Abrir fonte/);
  assert.doesNotMatch(card, /download-action/);
});
