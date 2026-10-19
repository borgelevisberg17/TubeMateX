'use strict';

function normalizedLanguage(value) {
  const language = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  if (/^(por|pt)(?:$|[-\s])/.test(language) || /portugu[eê]s/.test(language)) return 'por';
  if (/^(eng|en)(?:$|[-\s])/.test(language) || /english|ingl[eê]s/.test(language)) return 'eng';
  return null;
}

function createIptvCatalogService({ loadCatalog, healthService, defaultBatchSize = 12, maxPageSize = 60 } = {}) {
  if (typeof loadCatalog !== 'function' || !healthService) throw new TypeError('loadCatalog and healthService are required');

  function filter(items, filters = {}) {
    const query = String(filters.query || '').trim().toLowerCase();
    const language = normalizedLanguage(filters.language);
    return items.filter(item =>
      (!filters.country || item.country === String(filters.country).toUpperCase()) &&
      (!language || item.languages.includes(language)) &&
      (!filters.category || item.categories.includes(String(filters.category).toLowerCase())) &&
      (!query || `${item.channelName} ${item.title} ${(item.altNames || []).join(' ')} ${(item.categories || []).join(' ')}`.toLowerCase().includes(query))
    ).sort((a, b) => `${a.channelName} ${a.title}`.localeCompare(`${b.channelName} ${b.title}`, 'pt'));
  }

  async function getPage(limit, filters = {}) {
    const candidates = filter(await loadCatalog(), filters);
    const offset = Math.max(0, Math.floor(Number(filters.offset) || 0));
    const pageLimit = Math.max(1, Math.min(maxPageSize, Math.floor(Number(limit) || 12)));
    let snapshot = healthService.snapshot(candidates, { scheduleValidation: false });

    if (filters.scheduleValidation !== false && snapshot.pendingCount === 0) {
      const batchSize = Math.max(1, Math.min(pageLimit, Math.floor(Number(filters.batchSize) || defaultBatchSize)));
      const unverified = candidates.filter(item => !healthService.statusOf(item) && !healthService.isPending(item)).slice(0, batchSize);
      healthService.schedule(unverified);
      snapshot = healthService.snapshot(candidates, { scheduleValidation: false });
    }

    const results = snapshot.items.slice(offset, offset + pageLimit);
    const validation = candidates.slice(offset, offset + pageLimit).map(item => {
      const status = healthService.statusOf(item);
      const state = status?.status || (healthService.isPending(item) ? 'checking' : 'unverified');
      return {
        channelId: item.channelId,
        channelName: item.channelName,
        language: item.language,
        categories: item.categories,
        status: state,
        label: status?.label || (state === 'checking' ? 'Verificação em curso' : 'A aguardar validação'),
        checkedAt: status?.checkedAt ? new Date(status.checkedAt).toISOString() : null,
        expiresAt: status?.checkedAt ? new Date(status.checkedAt + healthService.ttlMs).toISOString() : null,
        latencyMs: status?.latencyMs ?? null
      };
    });
    const hasMore = offset + results.length < snapshot.items.length || snapshot.pendingCount > 0 || snapshot.unknownCount > 0;
    return {
      results,
      validation,
      total: snapshot.items.length,
      candidateCount: snapshot.totalCandidates,
      pendingValidationCount: snapshot.pendingCount,
      remainingValidationCount: snapshot.unknownCount,
      excludedCount: snapshot.failedCount,
      offset,
      limit: pageLimit,
      hasMore
    };
  }

  async function getMeta() {
    const items = await loadCatalog();
    const countries = new Map();
    const categories = new Map();
    for (const item of items) {
      if (item.country) countries.set(item.country, (countries.get(item.country) || 0) + 1);
      for (const category of item.categories || []) categories.set(category, (categories.get(category) || 0) + 1);
    }
    return {
      countries: [...countries].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
      categories: [...categories].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count)
    };
  }

  return { filter, getMeta, getPage };
}

module.exports = { createIptvCatalogService, normalizedLanguage };
