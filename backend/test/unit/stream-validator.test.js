'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStreamValidator, inspectHls, isPrivateAddress, resolvePublicUrl } = require('../../services/stream-validator');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const response = (status, contentType, body = '', extraHeaders = {}) => ({
  status,
  headers: { 'content-type': contentType, ...extraHeaders },
  body: Buffer.from(body)
});

test('bloqueia endereços especiais e aceita apenas IPs globais', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.1.2', '198.18.0.1', '2001:db8::1', '::1']) {
    assert.equal(isPrivateAddress(address), true, `${address} deve ser bloqueado`);
  }
  for (const address of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) {
    assert.equal(isPrivateAddress(address), false, `${address} deve ser público`);
  }
});

test('rejeita DNS que resolve para rede privada antes de enviar qualquer pedido', async () => {
  let called = false;
  const lookup = async () => [{ address: '127.0.0.1', family: 4 }];
  await assert.rejects(resolvePublicUrl('https://private.example/stream.m3u8', lookup), /unsafe-host/);
  const validator = createStreamValidator({ lookup, request: async () => { called = true; return response(200, 'video/mp4'); } });
  assert.equal((await validator.probeStream('https://private.example/video.mp4')).status, 'unsafe');
  assert.equal(called, false);
});

test('não valida streams em HTTP inseguro', async () => {
  let called = false;
  const validator = createStreamValidator({ lookup: publicLookup, request: async () => { called = true; return response(200, 'video/mp4'); } });
  const result = await validator.probeStream('http://media.example/video.mp4');
  assert.equal(result.status, 'insecure');
  assert.equal(called, false);
});

test('valida um ficheiro de media acessível por HTTPS e range parcial', async () => {
  let optionsSeen;
  const validator = createStreamValidator({
    lookup: publicLookup,
    request: async (_url, _addresses, options) => { optionsSeen = options; return response(206, 'video/mp4', '\u0000\u0000\u0000\u0018ftypmp42'); }
  });
  const result = await validator.probeStream('https://media.example/movie.mp4');
  assert.equal(result.status, 'online');
  assert.equal(result.code, 206);
  assert.match(optionsSeen.headers.range, /^bytes=0-/);
  assert.equal(optionsSeen.maxBytes, 64 * 1024);
});

test('valida manifesto HLS e o primeiro segmento sem descarregar o stream completo', async () => {
  const requested = [];
  const validator = createStreamValidator({
    lookup: publicLookup,
    request: async (url, _addresses, options) => {
      requested.push({ path: url.pathname, method: options.method, range: options.headers.range });
      if (url.pathname === '/live/index.m3u8') return response(206, 'application/vnd.apple.mpegurl', '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n');
      if (url.pathname === '/live/segment.ts') return response(206, 'video/mp2t', 'segment');
      return response(404, 'text/plain');
    }
  });
  const result = await validator.probeStream('https://media.example/live/index.m3u8');
  assert.equal(result.status, 'online');
  assert.deepEqual(requested.map(item => item.path), ['/live/index.m3u8', '/live/segment.ts']);
  assert.ok(requested.every(item => item.method === 'GET' && item.range));
});

test('classifica uma playlist HLS protegida sem tentar obter as chaves', () => {
  const result = inspectHls('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="license.key"\n#EXTINF:4,\nsegment.ts');
  assert.equal(result.status, 'drm-protected');
});

test('não oferece HLS encriptado como validado sem provar a autorização da chave', () => {
  const result = inspectHls('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\nsegment.ts');
  assert.equal(result.status, 'protected-unverified');
});

test('deteta proteção DRM em MPEG-DASH e não marca o manifesto como reproduzível', async () => {
  const validator = createStreamValidator({
    lookup: publicLookup,
    request: async () => response(200, 'application/dash+xml', '<MPD><Period><ContentProtection schemeIdUri="urn:uuid:widevine"/></Period></MPD>')
  });
  const result = await validator.probeStream('https://media.example/manifest.mpd');
  assert.equal(result.status, 'drm-protected');
});

test('valida um segmento DASH e não apenas o manifesto', async () => {
  const requested = [];
  const validator = createStreamValidator({
    lookup: publicLookup,
    request: async url => {
      requested.push(url.pathname);
      if (url.pathname === '/dash/manifest.mpd') return response(200, 'application/dash+xml', '<MPD><Period><AdaptationSet><Representation id="video"><SegmentTemplate media="chunk-$RepresentationID$-$Number$.m4s" startNumber="1"/></Representation></AdaptationSet></Period></MPD>');
      if (url.pathname === '/dash/chunk-video-1.m4s') return response(206, 'video/mp4', 'segment');
      return response(404, 'text/plain');
    }
  });
  const result = await validator.probeStream('https://media.example/dash/manifest.mpd');
  assert.equal(result.status, 'online');
  assert.deepEqual(requested, ['/dash/manifest.mpd', '/dash/chunk-video-1.m4s']);
});

test('não marca manifesto DASH sem segmento individualizável como online', async () => {
  const validator = createStreamValidator({
    lookup: publicLookup,
    request: async () => response(200, 'application/dash+xml', '<MPD><Period><AdaptationSet><Representation id="video"/></AdaptationSet></Period></MPD>')
  });
  const result = await validator.probeStream('https://media.example/manifest.mpd');
  assert.equal(result.status, 'incompatible');
  assert.match(result.label, /segmento verificável/);
});

test('classifica autenticação, bloqueio regional e restrição legal sem tentar contornar o acesso', async () => {
  for (const [code, expected] of [[401, 'Autenticação necessária'], [403, 'Acesso recusado'], [451, 'Restrição legal ou regional']]) {
    const validator = createStreamValidator({ lookup: publicLookup, request: async () => response(code, 'text/plain') });
    const result = await validator.probeStream('https://media.example/live.m3u8');
    assert.equal(result.status, 'restricted');
    assert.match(result.label, new RegExp(expected));
  }
});

test('segue no máximo redirecionamentos públicos revalidando o destino', async () => {
  const hosts = [];
  const validator = createStreamValidator({
    lookup: async host => { hosts.push(host); return [{ address: '93.184.216.34', family: 4 }]; },
    request: async url => url.hostname === 'media.example'
      ? response(302, 'text/plain', '', { location: 'https://cdn.example/movie.mp4' })
      : response(206, 'video/mp4', 'data')
  });
  const result = await validator.probeStream('https://media.example/movie.mp4');
  assert.equal(result.status, 'online');
  assert.ok(hosts.includes('cdn.example'));
});
