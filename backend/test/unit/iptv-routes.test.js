'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createIptvRouter } = require('../../routes/iptv-routes');

async function withServer(handler, run) {
  const app = express();
  app.use('/api/iptv', createIptvRouter(handler));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('router IPTV regista leitura agregada sem o termo e devolve request ID', async () => {
  const audit = [];
  const suppliedId = 'test-request-123';
  await withServer({
    catalogService: {
      getPage: async (_limit, filters) => ({ results: [], total: 0, candidateCount: 8, pendingValidationCount: 0, remainingValidationCount: 8, excludedCount: 0, offset: filters.offset, limit: 24, hasMore: true }),
      getMeta: async () => ({ countries: [], categories: [] })
    },
    log: (level, event, fields) => audit.push({ level, event, fields })
  }, async base => {
    const response = await fetch(`${base}/api/iptv/channels?q=private-search&limit=24`, { headers: { 'X-Request-ID': suppliedId } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), suppliedId);
    assert.equal(body.limit, 24);
    assert.equal(audit.at(-1).event, 'iptv.catalog.page_served');
    assert.equal(audit.at(-1).fields.queryLength, 14);
    assert.equal(JSON.stringify(audit).includes('private-search'), false);
  });
});

test('router IPTV converte erro interno em resposta temporária saneada e audita o correlation ID', async () => {
  const audit = [];
  await withServer({
    catalogService: { getPage: async () => { throw new Error('upstream secret url https://private.example'); }, getMeta: async () => { throw new Error('metadata offline'); } },
    log: (level, event, fields) => audit.push({ level, event, fields }),
    errorCode: () => 'UPSTREAM_UNAVAILABLE'
  }, async base => {
    const response = await fetch(`${base}/api/iptv/channels`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.retryable, true);
    assert.equal(body.errorCode, 'UPSTREAM_UNAVAILABLE');
    assert.equal(response.headers.get('x-request-id'), body.requestId);
    assert.equal(JSON.stringify(body).includes('private.example'), false);
    assert.equal(audit.at(-1).event, 'iptv.catalog.page_failed');
    assert.equal(audit.at(-1).fields.requestId, body.requestId);
  });
});
