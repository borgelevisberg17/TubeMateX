'use strict';

const crypto = require('node:crypto');
const express = require('express');

function requestIdFor(req) {
  const supplied = String(req.get('X-Request-ID') || '');
  return /^[a-zA-Z0-9._-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function createIptvRouter({ apiLimiter, catalogService, log = () => {}, errorCode = () => 'IPTV_UNAVAILABLE' } = {}) {
  if (!catalogService) throw new TypeError('catalogService is required');
  const router = express.Router();
  if (apiLimiter) router.use(apiLimiter);

  router.get('/channels', async (req, res) => {
    const requestId = requestIdFor(req);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 48, 1), 60);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const filters = {
      country: String(req.query.country || '').trim().toUpperCase().slice(0, 3) || null,
      language: String(req.query.language || '').trim().toLowerCase().slice(0, 8) || null,
      category: String(req.query.category || '').trim().toLowerCase().slice(0, 40) || null,
      query: String(req.query.q || '').trim().slice(0, 80) || null,
      batchSize: Math.min(Math.max(Number.parseInt(req.query.batchSize, 10) || 12, 1), 60),
      offset
    };
    try {
      const page = await catalogService.getPage(limit, filters);
      log('info', 'iptv.catalog.page_served', {
        requestId,
        country: filters.country,
        language: filters.language,
        category: filters.category,
        queryLength: filters.query?.length || 0,
        offset,
        limit,
        returned: page.results.length,
        available: page.total,
        hasMore: page.hasMore
      });
      res.set('X-Request-ID', requestId).json({
        ...page,
        filters,
        source: 'iptv-org',
        note: 'Lista apenas streams públicas HTTPS acessíveis; autenticação, DRM e bloqueios regionais não são contornados.'
      });
    } catch (error) {
      const code = errorCode(error) || 'IPTV_CATALOG_UNAVAILABLE';
      log('error', 'iptv.catalog.page_failed', { requestId, code, errorName: String(error?.name || 'Error').slice(0, 80) });
      res.status(503).set('X-Request-ID', requestId).json({
        error: 'Não foi possível carregar o catálogo neste momento.',
        errorCode: code,
        requestId,
        retryable: true
      });
    }
  });

  router.get('/meta', async (req, res) => {
    const requestId = requestIdFor(req);
    try {
      const meta = await catalogService.getMeta();
      log('info', 'iptv.catalog.meta_served', { requestId, countries: meta.countries.length, categories: meta.categories.length });
      res.set('X-Request-ID', requestId).json({ ...meta, source: 'iptv-org' });
    } catch (error) {
      const code = errorCode(error) || 'IPTV_META_UNAVAILABLE';
      log('error', 'iptv.catalog.meta_failed', { requestId, code, errorName: String(error?.name || 'Error').slice(0, 80) });
      res.status(503).set('X-Request-ID', requestId).json({
        error: 'Não foi possível carregar os filtros agora.',
        errorCode: code,
        requestId,
        retryable: true
      });
    }
  });

  return router;
}

module.exports = { createIptvRouter, requestIdFor };
