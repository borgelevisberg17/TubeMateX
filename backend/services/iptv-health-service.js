'use strict';

const crypto = require('node:crypto');

const FAILURE_ORDER = ['drm-protected', 'restricted', 'protected-unverified', 'unsafe', 'insecure', 'timeout', 'offline', 'incompatible', 'unsupported'];

function createIptvHealthService({ probeStream, concurrency = 4, ttlMs = 30 * 60 * 1000, now = Date.now } = {}) {
  if (typeof probeStream !== 'function') throw new TypeError('probeStream must be a function');
  const cache = new Map();
  const queue = [];
  const pending = new Set();
  let active = 0;
  const maxConcurrent = Math.max(1, Math.min(8, Number(concurrency) || 4));

  function keyOf(item) {
    const urls = (item?.streams || []).map(stream => String(stream?.url || '')).filter(Boolean).sort();
    if (!urls.length && item?.url) urls.push(String(item.url));
    return crypto.createHash('sha256').update(`${item?.channelId || item?.id || ''}\n${urls.join('\n')}`).digest('hex');
  }

  function fresh(item) {
    const key = keyOf(item);
    const entry = cache.get(key);
    if (entry && now() - entry.checkedAt < ttlMs) return entry;
    if (entry) cache.delete(key);
    return null;
  }

  function failureStatus(results) {
    const statuses = new Set(results.map(result => result.status));
    return FAILURE_ORDER.find(status => statuses.has(status)) || 'offline';
  }

  async function validateItem(item) {
    const candidates = [...(item?.streams || [])];
    if (item?.url && !candidates.some(stream => stream.url === item.url)) candidates.unshift({ url: item.url, requiresExternalPlayer: item.requiresExternalPlayer });
    const usable = candidates.filter(stream => stream?.url && !stream.requiresExternalPlayer && !stream.referrer && !stream.userAgent);
    if (!usable.length) return { status: 'unsupported', label: 'Nenhuma stream compatível com o player web', checkedAt: now(), failures: [] };
    const failures = [];
    for (const stream of usable) {
      const result = await probeStream(stream.url);
      if (result.status === 'online') return { status: 'online', label: result.label, checkedAt: now(), latencyMs: result.latencyMs, code: result.code, contentType: result.contentType, stream: { ...stream, requiresExternalPlayer: false }, failures };
      failures.push({ url: stream.url, status: result.status, label: result.label, code: result.code });
    }
    const status = failureStatus(failures);
    return { status, label: failures[0]?.label || 'Nenhuma stream reproduzível foi encontrada', checkedAt: now(), failures };
  }

  function pump() {
    while (active < maxConcurrent && queue.length) {
      const task = queue.shift();
      active += 1;
      validateItem(task.item)
        .then(entry => cache.set(task.key, entry))
        .catch(error => cache.set(task.key, { status: 'offline', label: 'Falha ao validar a fonte', checkedAt: now(), failures: [{ status: 'offline', label: String(error?.message || error) }] }))
        .finally(() => { active -= 1; pending.delete(task.key); pump(); });
    }
  }

  function schedule(items) {
    for (const item of items || []) {
      const key = keyOf(item);
      if (!key || fresh(item) || pending.has(key)) continue;
      pending.add(key);
      queue.push({ item, key });
    }
    pump();
  }

  function snapshot(items, { scheduleValidation = true } = {}) {
    if (scheduleValidation) schedule(items);
    const onlineItems = [];
    let pendingCount = 0;
    let failedCount = 0;
    let unknownCount = 0;
    for (const item of items || []) {
      const entry = fresh(item);
      if (!entry) {
        if (pending.has(keyOf(item))) pendingCount += 1;
        else unknownCount += 1;
        continue;
      }
      if (entry.status === 'online' && entry.stream) {
        onlineItems.push({
          ...item,
          url: entry.stream.url,
          streams: [entry.stream],
          metadataOnly: false,
          publicPlayback: true,
          streamCount: 1,
          streamAvailable: true,
          directStream: true,
          requiresExternalPlayer: false,
          availabilityLabel: `Verificada · ${Math.max(0, Math.round(Number(entry.latencyMs) || 0))} ms`,
          validationStatus: 'online',
          validationCheckedAt: new Date(entry.checkedAt).toISOString()
        });
      } else failedCount += 1;
    }
    return { items: onlineItems, pendingCount, failedCount, unknownCount, totalCandidates: (items || []).length };
  }

  async function waitForIdle({ timeoutMs = 30000 } = {}) {
    const started = now();
    while (queue.length || active > 0) {
      if (now() - started >= timeoutMs) throw new Error('IPTV validation did not become idle before timeout');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  function statusOf(item) { return fresh(item); }
  function isPending(item) { return pending.has(keyOf(item)); }
  function clear() { cache.clear(); queue.length = 0; pending.clear(); }
  return { clear, isPending, keyOf, schedule, snapshot, statusOf, waitForIdle };
}

module.exports = { createIptvHealthService };
