'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 2;
const MAX_MANIFEST_BYTES = 64 * 1024;
const USER_AGENT = 'TubeMateX-Source-Health/1.0';

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase().replace(/^\[|\]$/g, '');
  const version = net.isIP(value);
  if (version === 4) {
    const [a, b, c] = value.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  if (version === 6) {
    const mapped = value.match(/^(?:0:){5}ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    const compressedMapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (compressedMapped) return isPrivateAddress(compressedMapped[1]);
    // Accept only global-unicast 2000::/3; all other IPv6 ranges are special-use.
    if (!/^[23]/.test(value) || value === '::' || value === '::1') return true;
    return /^2001:db8:/i.test(value);
  }
  return true;
}

async function resolvePublicUrl(value, lookup = dns.lookup) {
  let parsed;
  try { parsed = new URL(String(value || '')); } catch { throw new Error('invalid-url'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid-url');
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new Error('unsafe-host');
  let addresses;
  if (net.isIP(hostname)) addresses = [{ address: hostname, family: net.isIP(hostname) }];
  else {
    try { addresses = await lookup(hostname, { all: true, verbatim: true }); } catch { throw new Error('dns-failed'); }
  }
  if (!addresses?.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('unsafe-host');
  return { parsed, addresses };
}

function requestPinned(url, addresses, { method = 'GET', headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_MANIFEST_BYTES } = {}) {
  const transport = url.protocol === 'https:' ? https : http;
  const pinnedAddress = addresses[0];
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve(value);
    };
    const req = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method,
      headers: { 'user-agent': USER_AGENT, accept: '*/*', ...headers },
      servername: net.isIP(url.hostname) ? undefined : url.hostname,
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [pinnedAddress]);
        else callback(null, pinnedAddress.address, pinnedAddress.family);
      }
    }, response => {
      const result = { status: response.statusCode || 0, headers: response.headers, body: Buffer.alloc(0) };
      if (method === 'HEAD' || maxBytes <= 0) {
        response.destroy();
        return finish(null, result);
      }
      const chunks = [];
      let length = 0;
      response.on('data', chunk => {
        if (settled) return;
        const remaining = Math.max(0, maxBytes - length);
        if (remaining) { const slice = chunk.subarray(0, remaining); chunks.push(slice); length += slice.length; }
        if (length >= maxBytes) {
          result.body = Buffer.concat(chunks, length);
          response.destroy();
          finish(null, result);
        }
      });
      response.on('end', () => { result.body = Buffer.concat(chunks, length); finish(null, result); });
      response.on('close', () => { if (!settled) { result.body = Buffer.concat(chunks, length); finish(null, result); } });
      response.on('error', error => { if (!settled) finish(error); });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', error => finish(error));
    req.end();
  });
}

function classifyHttp(status) {
  if (status === 401) return { status: 'restricted', label: 'Autenticação necessária · não contornada' };
  if (status === 403) return { status: 'restricted', label: 'Acesso recusado ou bloqueio regional · não contornado' };
  if (status === 451) return { status: 'restricted', label: 'Restrição legal ou regional · não contornada' };
  if (status === 429) return { status: 'restricted', label: 'Limite temporário da origem · não repetir automaticamente' };
  if (status === 404 || status === 410) return { status: 'offline', label: `Stream indisponível · HTTP ${status}` };
  if (status >= 300 && status < 400) return { status: 'redirect-unverified', label: 'Redirecionamento não validado' };
  if (status < 200 || status >= 300) return { status: 'offline', label: `HTTP ${status || 'sem resposta'}` };
  return null;
}

function inspectHls(text) {
  const body = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!body.startsWith('#EXTM3U')) return { status: 'incompatible', label: 'Resposta não é um manifesto HLS válido' };
  const keys = body.split(/\r?\n/).filter(line => /^#EXT-X-KEY:/i.test(line));
  if (keys.some(line => /METHOD=SAMPLE-AES|KEYFORMAT=(?!"?identity"?)/i.test(line))) return { status: 'drm-protected', label: 'Manifesto protegido por DRM · não contornado' };
  if (keys.some(line => !/METHOD=NONE/i.test(line))) return { status: 'protected-unverified', label: 'Manifesto encriptado; reprodução não validada' };
  const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const variantIndex = lines.findIndex(line => /^#EXT-X-STREAM-INF:/i.test(line));
  if (variantIndex >= 0) {
    const variant = lines.slice(variantIndex + 1).find(line => !line.startsWith('#'));
    return variant ? { status: 'master', target: variant } : { status: 'incompatible', label: 'Manifesto HLS master sem variante' };
  }
  const extInfIndex = lines.findIndex(line => /^#EXTINF:/i.test(line));
  if (extInfIndex >= 0) {
    const segment = lines.slice(extInfIndex + 1).find(line => !line.startsWith('#'));
    return segment ? { status: 'media', target: segment } : { status: 'incompatible', label: 'Manifesto HLS sem segmento' };
  }
  return { status: 'incompatible', label: 'Manifesto HLS sem segmentos reproduzíveis' };
}

function xmlDecode(value) {
  return String(value || '').replace(/&(amp|lt|gt|quot|apos);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity]);
}

function xmlAttribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? xmlDecode(match[1]) : '';
}

function inspectDash(text, manifestUrl) {
  const body = String(text || '');
  if (!/<MPD\b/i.test(body)) return { status: 'incompatible', label: 'Resposta não é um manifesto MPEG-DASH válido' };
  if (/<ContentProtection\b|widevine|playready|fairplay/i.test(body)) return { status: 'drm-protected', label: 'MPEG-DASH protegido por DRM · não contornado' };

  const baseMatch = body.match(/<BaseURL\b[^>]*>([^<]+)<\/BaseURL>/i);
  const base = baseMatch ? xmlDecode(baseMatch[1].trim()) : '';
  const segmentMatch = body.match(/<SegmentURL\b[^>]*\bmedia\s*=\s*["']([^"']+)["'][^>]*>/i);
  let target = segmentMatch ? xmlDecode(segmentMatch[1]) : '';

  if (!target) {
    const templateMatch = body.match(/<SegmentTemplate\b[^>]*>/i);
    if (templateMatch) {
      const template = xmlAttribute(templateMatch[0], 'media');
      const representation = (body.match(/<Representation\b[^>]*>/i) || [''])[0];
      const number = Number(xmlAttribute(templateMatch[0], 'startNumber')) || 1;
      target = template
        .replace(/\$Number(?:%0\d+d)?\$/g, String(number))
        .replace(/\$RepresentationID\$/g, xmlAttribute(representation, 'id'))
        .replace(/\$Bandwidth\$/g, xmlAttribute(representation, 'bandwidth'));
      if (!template || /\$[^$]+\$/.test(target)) target = '';
    }
  }

  const manifestBase = base ? new URL(base, manifestUrl) : new URL(manifestUrl);
  if (!target && base) {
    const basePath = new URL(base, manifestUrl);
    if (/\.[a-z0-9]{2,8}$/i.test(basePath.pathname)) return { status: 'segment', target: basePath.toString() };
  }
  if (!target) return { status: 'incompatible', label: 'Manifesto DASH acessível, mas não contém um segmento verificável' };
  return { status: 'segment', target: new URL(target, manifestBase).toString() };
}

function looksLikeHls(url, contentType = '') {
  return /\.m3u8$/i.test(url.pathname) || /mpegurl|vnd\.apple\.mpegurl/i.test(String(contentType));
}
function looksLikeDash(url, contentType = '') {
  return /\.mpd$/i.test(url.pathname) || /dash\+xml/i.test(String(contentType));
}
function isMediaContentType(contentType = '') {
  return /^(video\/|audio\/|application\/(?:octet-stream|mp4|vnd\.apple\.mpegurl)|application\/dash\+xml)/i.test(String(contentType).trim());
}

function createStreamValidator({ lookup = dns.lookup, request = requestPinned, now = Date.now, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  async function requestSafe(value, options = {}, redirects = 0) {
    const { parsed, addresses } = await resolvePublicUrl(value, lookup);
    if (parsed.protocol !== 'https:') return { status: 'insecure', label: 'HTTP inseguro · não será oferecido como reprodução segura', code: null, headers: {}, body: Buffer.alloc(0), url: parsed };
    const response = await request(parsed, addresses, { timeoutMs, ...options });
    const location = response.headers?.location;
    if (response.status >= 300 && response.status < 400 && location && redirects < MAX_REDIRECTS) {
      const next = new URL(location, parsed);
      return requestSafe(next.toString(), options, redirects + 1);
    }
    return { ...response, url: parsed };
  }

  async function probeStream(value) {
    const startedAt = now();
    let currentUrl = value;
    try {
      for (let depth = 0; depth <= 2; depth += 1) {
        const safe = await resolvePublicUrl(currentUrl, lookup);
        if (safe.parsed.protocol !== 'https:') return { status: 'insecure', code: null, label: 'HTTP inseguro · não será oferecido como reprodução segura', latencyMs: now() - startedAt };
        const response = await requestSafe(currentUrl, { method: 'GET', headers: { range: `bytes=0-${MAX_MANIFEST_BYTES - 1}`, 'accept-encoding': 'identity' }, maxBytes: MAX_MANIFEST_BYTES });
        const httpFailure = classifyHttp(response.status);
        if (httpFailure) return { ...httpFailure, code: response.status, contentType: String(response.headers?.['content-type'] || ''), latencyMs: now() - startedAt };
        const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
        if (looksLikeHls(response.url, contentType)) {
          const manifest = inspectHls(response.body.toString('utf8'));
          if (manifest.status === 'drm-protected' || manifest.status === 'protected-unverified' || manifest.status === 'incompatible') return { ...manifest, code: response.status, contentType, latencyMs: now() - startedAt };
          if (depth >= 2) return { status: 'incompatible', code: response.status, label: 'Playlist HLS demasiado profunda para validar', contentType, latencyMs: now() - startedAt };
          currentUrl = new URL(manifest.target, response.url).toString();
          continue;
        }
        if (looksLikeDash(response.url, contentType)) {
          const manifest = inspectDash(response.body.toString('utf8'), response.url);
          if (manifest.status !== 'segment') return { ...manifest, code: response.status, contentType, latencyMs: now() - startedAt };
          if (depth >= 2) return { status: 'incompatible', code: response.status, label: 'Manifesto DASH demasiado profundo para validar', contentType, latencyMs: now() - startedAt };
          currentUrl = manifest.target;
          continue;
        }
        if (!isMediaContentType(contentType)) return { status: 'incompatible', code: response.status, label: `Tipo de media incompatível · ${contentType || 'desconhecido'}`, contentType, latencyMs: now() - startedAt };
        if (response.status !== 200 && response.status !== 206) return { status: 'offline', code: response.status, label: `Range de media inválido · HTTP ${response.status}`, contentType, latencyMs: now() - startedAt };
        return { status: 'online', code: response.status, label: 'Media acessível por HTTPS e intervalo parcial', contentType, latencyMs: now() - startedAt };
      }
      return { status: 'incompatible', code: null, label: 'Não foi possível validar a playlist', latencyMs: now() - startedAt };
    } catch (error) {
      const reason = String(error?.message || error);
      const status = ['unsafe-host', 'invalid-url'].includes(reason) ? 'unsafe' : reason === 'dns-failed' ? 'offline' : /timeout/i.test(reason) ? 'timeout' : 'offline';
      const label = status === 'unsafe' ? 'Destino privado ou URL insegura' : status === 'timeout' ? 'A fonte excedeu o tempo de resposta' : status === 'offline' ? 'Fonte indisponível ou DNS inválido' : 'Fonte indisponível';
      return { status, code: null, label, latencyMs: now() - startedAt };
    }
  }

  return { probeStream, requestSafe };
}

module.exports = { createStreamValidator, inspectDash, inspectHls, isPrivateAddress, resolvePublicUrl };
