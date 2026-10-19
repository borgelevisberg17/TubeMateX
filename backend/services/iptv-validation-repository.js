'use strict';

const DEFAULT_REDIS_KEY = 'tubematex:iptv:health:v1';

function sanitizeEntry(entry) {
  const durable = {
    status: String(entry?.status || 'offline'),
    label: String(entry?.label || 'Estado indisponível').slice(0, 240),
    checkedAt: Number(entry?.checkedAt) || Date.now(),
    latencyMs: entry?.latencyMs != null && Number.isFinite(Number(entry.latencyMs)) ? Number(entry.latencyMs) : null,
    code: entry?.code != null && Number.isFinite(Number(entry.code)) ? Number(entry.code) : null,
    contentType: entry?.contentType ? String(entry.contentType).slice(0, 100) : null
  };
  if (entry?.stream?.url) {
    durable.stream = {
      url: String(entry.stream.url),
      feed: entry.stream.feed ? String(entry.stream.feed).slice(0, 160) : null,
      label: entry.stream.label ? String(entry.stream.label).slice(0, 160) : null,
      quality: entry.stream.quality ? String(entry.stream.quality).slice(0, 48) : null,
      requiresExternalPlayer: false
    };
  }
  if (Array.isArray(entry?.failures)) {
    durable.failures = entry.failures.slice(0, 8).map(failure => ({
      status: String(failure.status || 'offline').slice(0, 40),
      label: String(failure.label || '').slice(0, 160),
      code: Number.isFinite(Number(failure.code)) ? Number(failure.code) : null
    }));
  }
  return durable;
}

function createIptvValidationRepository({ dbAll, dbRun, redisClient = null, redisReady = Promise.resolve(), log = () => {}, now = Date.now, redisKey = DEFAULT_REDIS_KEY } = {}) {
  if (typeof dbAll !== 'function' || typeof dbRun !== 'function') throw new TypeError('dbAll and dbRun are required');

  async function load(ttlMs) {
    const cutoff = now() - Math.max(0, Number(ttlMs) || 0);
    const rows = await dbAll('SELECT cache_key, result_json, checked_at FROM iptv_health_cache WHERE checked_at > ? AND expires_at > ?', [cutoff, now()]);
    const values = new Map(rows.map(row => [row.cache_key, row.result_json]));
    if (redisClient) {
      try {
        await redisReady;
        if (redisClient.isReady) {
          const redisRows = await redisClient.hGetAll(redisKey);
          for (const [key, value] of Object.entries(redisRows || {})) values.set(key, value);
        }
      } catch (error) {
        log('warn', 'iptv.cache.redis_read_failed', { errorName: String(error?.name || 'Error').slice(0, 80) });
      }
    }

    const entries = [];
    let expiredCount = 0;
    const expiredKeys = [];
    for (const [key, serialized] of values) {
      try {
        const entry = sanitizeEntry(JSON.parse(serialized));
        if (entry.checkedAt <= cutoff) { expiredCount += 1; expiredKeys.push(key); continue; }
        entries.push({ key, entry });
      } catch { expiredCount += 1; }
    }
    if (expiredCount) log('info', 'iptv.cache.entries_expired', { count: expiredCount });
    if (redisClient?.isReady && expiredKeys.length) {
      try { await redisClient.hDel(redisKey, expiredKeys); }
      catch (error) { log('warn', 'iptv.cache.redis_expiry_cleanup_failed', { errorName: String(error?.name || 'Error').slice(0, 80) }); }
    }
    await pruneExpired(ttlMs);
    return entries;
  }

  async function save(key, entry, ttlMs) {
    const safeKey = String(key || '');
    if (!safeKey) return false;
    const durable = sanitizeEntry(entry);
    const serialized = JSON.stringify(durable);
    const expiresAt = durable.checkedAt + Math.max(0, Number(ttlMs) || 0);
    await dbRun('INSERT INTO iptv_health_cache(cache_key,result_json,checked_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET result_json=excluded.result_json,checked_at=excluded.checked_at,expires_at=excluded.expires_at', [safeKey, serialized, durable.checkedAt, expiresAt]);
    if (redisClient) {
      try {
        await redisReady;
        if (redisClient.isReady) {
          await redisClient.hSet(redisKey, safeKey, serialized);
          await redisClient.expire(redisKey, Math.max(1, Math.ceil(Number(ttlMs) / 1000)));
        }
      } catch (error) {
        log('warn', 'iptv.cache.redis_write_failed', { errorName: String(error?.name || 'Error').slice(0, 80) });
      }
    }
    return true;
  }

  async function pruneExpired(ttlMs = 0) {
    const cutoff = now() - Math.max(0, Number(ttlMs) || 0);
    const result = await dbRun('DELETE FROM iptv_health_cache WHERE expires_at <= ? OR checked_at <= ?', [now(), cutoff]);
    return Number(result?.changes || 0);
  }

  return { load, pruneExpired, save };
}

module.exports = { createIptvValidationRepository, sanitizeEntry };
