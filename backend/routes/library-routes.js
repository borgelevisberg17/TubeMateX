const express = require('express');
const fs = require('fs');

function createLibraryRouter({ getVisitorId, loadHistory, libraryQuery, clientHistory, dbGet, dbRun, jobs, storedPath, clearHistory }) {
  const router = express.Router();

  router.get('/api/library', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      const allItems = await loadHistory(ownerId);
      const filtered = libraryQuery(allItems, req.query);
      const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const items = clientHistory(filtered.slice(offset, offset + limit));
      const formats = [...new Set(allItems.map(item => item.format).filter(Boolean))].sort();
      const sites = [...new Set(allItems.map(item => item.site).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
      res.json({ items, total: filtered.length, offset, limit, hasMore: offset + items.length < filtered.length, facets: { formats, sites } });
  });

  router.get('/api/favorites', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      res.json(clientHistory(libraryQuery(await loadHistory(ownerId), { favorite: 'true', sort: 'recent' })));
  });

  router.patch('/api/library/:id/favorite', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      const item = await dbGet('SELECT id, favorite FROM downloads WHERE id = ? AND owner_id = ?', [req.params.id, ownerId]);
      if (!item) return res.status(404).json({ error: 'Download não encontrado no histórico.' });
      const value = typeof req.body?.favorite === 'boolean' ? req.body.favorite : !Boolean(item.favorite);
      await dbRun('UPDATE downloads SET favorite = ?, favorite_at = ? WHERE id = ? AND owner_id = ?', [value ? 1 : 0, value ? new Date().toISOString() : null, item.id, ownerId]);
      res.json({ id: item.id, favorite: value });
  });

  router.get('/api/history', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      res.json(clientHistory(await loadHistory(ownerId)));
  });

  function csvValue(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
  router.get('/api/history/export.json', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      res.setHeader('Content-Disposition', 'attachment; filename="tubematex-history.json"');
      res.json(clientHistory(await loadHistory(ownerId)));
  });
  router.get('/api/history/export.csv', async (req, res) => {
      const ownerId = getVisitorId(req, res); const items = clientHistory(await loadHistory(ownerId));
      const columns = ['id','title','format','formatLabel','quality','qualityLabel','site','size','createdAt','completedAt','downloadUrl','favorite'];
      const csv = [columns.join(','), ...items.map(item => columns.map(column => csvValue(item[column])).join(','))].join('\\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="tubematex-history.csv"'); res.send(`\\ufeff${csv}`);
  });
  router.get('/api/user/downloads', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      res.json(clientHistory(await loadHistory(ownerId)));
  });

  router.delete('/api/history/:id', async (req, res) => {
      const ownerId = getVisitorId(req, res); const item = (await loadHistory(ownerId)).find(entry => entry.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'Item não encontrado no histórico.' });
      const job = jobs.get(item.id); const filePath = job?.filePath || storedPath(item.storedName); if (filePath && fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
      await dbRun('DELETE FROM downloads WHERE id = ? AND owner_id = ?', [req.params.id, ownerId]); res.json({ message: 'Item removido.' });
  });

  router.delete('/api/history', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      await clearHistory(ownerId);
      res.json({ message: 'Histórico eliminado.' });
  });

  // Compatibilidade com a API original do repositório.
  router.get('/history', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      res.json(clientHistory(await loadHistory(ownerId)));
  });
  router.post('/clear-history', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      await clearHistory(ownerId);
      res.json({ message: 'Histórico eliminado.' });
  });

  return router;
}

module.exports = { createLibraryRouter };
