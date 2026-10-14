const express = require('express');
const fs = require('fs');
const path = require('path');

function createDownloadRouter(deps) {
  const {
    downloadLimiter, validateUrl, allowedFormats, videoQualities, getVisitorId,
    createJob, publicJob, jobs, loadDistributedJob, cancelledJobIds, queue,
    distributedQueue, emit, redisClient, jobStateKey, bullmqRetentionSeconds,
    jobEventChannel, jobCancelChannel, eventSubscriber, jobEventClients,
    processQueue, conversionFormats, loadHistory, storedPath, downloadDir,
    convertMedia, addHistory, clientHistory, pausedOwners
  } = deps;
  const router = express.Router();

  router.post('/api/downloads', downloadLimiter, async (req, res) => {
      const url = await validateUrl(req.body?.url);
      const format = String(req.body?.format || 'mp4').toLowerCase();
      const quality = String(req.body?.quality || 'auto').toLowerCase();
      if (!url) return res.status(400).json({ error: 'Indica um URL público válido começado por http:// ou https://.' });
      if (!allowedFormats[format]) return res.status(400).json({ error: 'Formato de saída não suportado.' });
      if (allowedFormats[format].type === 'video' && !videoQualities[quality]) return res.status(400).json({ error: 'Qualidade de vídeo não suportada.' });
      const ownerId = getVisitorId(req, res);
      const job = await createJob(ownerId, url, format, quality);
      res.status(202).json({ job: publicJob(job), message: 'Download adicionado à fila.' });
  });

  router.get('/api/downloads', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      const activeStatuses = new Set(['queued', 'fetching', 'downloading', 'paused']);
      const owned = [...jobs.values()].filter(job => job.ownerId === ownerId);
      const active = owned.filter(job => activeStatuses.has(job.status)).map(publicJob);
      const counts = owned.reduce((acc, job) => { const status = job.status || 'unknown'; acc[status] = (acc[status] || 0) + 1; return acc; }, { queued: 0, fetching: 0, downloading: 0, paused: 0, completed: 0, failed: 0, cancelled: 0 });
      res.json({ jobs: active, counts, activeCount: active.length, paused: pausedOwners.has(ownerId) });
  });
  router.get('/api/downloads/:id', async (req, res) => {
      const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
      if (!job) return res.status(404).json({ error: 'Download não encontrado ou já expirou.' });
      const ownerId = getVisitorId(req, res);
      if (job.ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este download.' });
      res.json(jobs.has(req.params.id) ? publicJob(job) : job);
  });

  router.delete('/api/downloads/:id', async (req, res) => {
      const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
      if (!job) return res.status(404).json({ error: 'Download não encontrado.' });
      const ownerId = getVisitorId(req, res);
      if (job.ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este download.' });
      if (['completed', 'failed', 'cancelled'].includes(job.status)) return res.json(jobs.has(req.params.id) ? publicJob(job) : job);
      const patch = { status: 'cancelled', error: 'Download cancelado.', progress: { percent: 0, label: 'Download cancelado' } };
      cancelledJobIds.add(req.params.id);
      job.cancelled = true;
      if (job.process?.kill) job.process.kill('SIGTERM');
      if (job.status === 'queued') {
          const index = queue.indexOf(job);
          if (index >= 0) queue.splice(index, 1);
      }
      if (distributedQueue) {
          const bullJob = await distributedQueue.getJob(req.params.id);
          if (bullJob && ['waiting', 'delayed', 'paused'].includes(await bullJob.getState())) await bullJob.remove().catch(() => {});
      }
      if (jobs.has(req.params.id)) emit(job, patch);
      else if (redisClient?.isReady) {
          const nextState = { ...job, ...patch };
          await redisClient.set(jobStateKey(req.params.id), JSON.stringify(nextState), { EX: bullmqRetentionSeconds });
          await redisClient.publish(jobEventChannel(req.params.id), `event: update\\ndata: ${JSON.stringify(nextState)}\\n\\n`);
      }
      if (redisClient?.isReady) await redisClient.publish(jobCancelChannel(req.params.id), 'cancel');
      res.json(jobs.has(req.params.id) ? publicJob(jobs.get(req.params.id)) : { ...job, ...patch });
  });

  async function setJobPaused(job, paused) {
      if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) return job;
      if (paused) {
          if (job.status === 'queued') {
              const index = queue.indexOf(job);
              if (index >= 0) queue.splice(index, 1);
          }
          if (job.process?.kill && ['fetching', 'downloading'].includes(job.status)) job.process.kill('SIGSTOP');
          emit(job, { status: 'paused', paused: true, progress: job.progress || { percent: 0, label: 'Pausado' } });
          return job;
      }
      if (job.status !== 'paused') return job;
      if (job.process?.kill) {
          job.process.kill('SIGCONT');
          emit(job, { status: 'downloading', paused: false, progress: { ...(job.progress || {}), label: 'A retomar…' } });
      } else {
          job.status = 'queued';
          job.paused = false;
          queue.push(job);
          emit(job, { status: 'queued', progress: { ...(job.progress || {}), label: 'Na fila…' } });
          processQueue();
      }
      return job;
  }

  async function setAllDownloadsPaused(ownerId, paused) {
      if (paused) pausedOwners.add(ownerId); else pausedOwners.delete(ownerId);
      const owned = [...jobs.values()].filter(job => job.ownerId === ownerId);
      await Promise.all(owned.map(job => setJobPaused(job, paused)));
      if (!paused) processQueue();
      return owned.map(publicJob);
  }

  router.post('/api/downloads/pause-all', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      res.json({ paused: true, jobs: await setAllDownloadsPaused(ownerId, true) });
  });

  router.post('/api/downloads/resume-all', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      res.json({ paused: false, jobs: await setAllDownloadsPaused(ownerId, false) });
  });

  router.post('/api/downloads/:id/pause', async (req, res) => {
      const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
      if (!job) return res.status(404).json({ error: 'Download não encontrado.' });
      const ownerId = getVisitorId(req, res);
      if (job.ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este download.' });
      res.json(publicJob(await setJobPaused(job, true)));
  });

  router.post('/api/downloads/:id/resume', async (req, res) => {
      const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
      if (!job) return res.status(404).json({ error: 'Download não encontrado.' });
      const ownerId = getVisitorId(req, res);
      if (job.ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este download.' });
      res.json(publicJob(await setJobPaused(job, false)));
  });

  router.get('/api/downloads/:id/events', async (req, res) => {
      const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
      if (!job) return res.status(404).end();
      const ownerId = getVisitorId(req, res);
      if (job.ownerId !== ownerId) return res.status(403).end();
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      const initial = jobs.has(req.params.id) ? publicJob(job) : job;
      res.write(`event: update\ndata: ${JSON.stringify(initial)}\n\n`);
      if (!jobEventClients.has(req.params.id)) jobEventClients.set(req.params.id, new Set());
      jobEventClients.get(req.params.id).add(res);
      if (!eventSubscriber && jobs.has(req.params.id)) job.clients.push(res);
      const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
      req.on('close', () => {
          clearInterval(heartbeat);
          jobEventClients.get(req.params.id)?.delete(res);
          if (jobEventClients.get(req.params.id)?.size === 0) jobEventClients.delete(req.params.id);
          if (jobs.has(req.params.id)) job.clients = job.clients.filter(client => client !== res);
      });
  });

  router.post('/api/downloads/:id/convert', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      const requested = String(req.body?.format || '').toLowerCase();
      const preset = conversionFormats[requested];
      if (!preset) return res.status(400).json({ error: 'Formato de conversão não suportado.' });
      const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
      const historyItem = (await loadHistory(ownerId)).find(item => item.id === req.params.id);
      if (!job && !historyItem) return res.status(404).json({ error: 'Download não encontrado.' });
      if ((job || historyItem).ownerId && (job || historyItem).ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este ficheiro.' });
      if (job && job.status !== 'completed') return res.status(409).json({ error: 'A conversão só está disponível após o download terminar.' });
      const inputPath = job?.filePath || storedPath(historyItem?.storedName);
      if (!inputPath || !fs.existsSync(inputPath)) return res.status(404).json({ error: 'O ficheiro original já não está disponível.' });
      const conversionId = `${req.params.id}-convert-${requested}-${Date.now()}`;
      const outputName = `${path.basename(inputPath, path.extname(inputPath))}.${preset.extension}`;
      const outputPath = path.join(downloadDir, `${conversionId}.${preset.extension}`);
      try {
          await convertMedia(inputPath, outputPath, preset);
          const entry = { id: conversionId, title: `${job?.title || historyItem?.title || 'Ficheiro'} · ${preset.extension.toUpperCase()}`, thumbnail: job?.thumbnail || historyItem?.thumbnail, format: requested, formatLabel: requested.toUpperCase(), quality: historyItem?.quality || job?.quality, qualityLabel: historyItem?.qualityLabel || job?.qualityLabel, site: job?.site || historyItem?.site, size: fs.statSync(outputPath).size, fileName: outputName, storedName: path.basename(outputPath), createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), downloadUrl: `/api/downloads/${conversionId}/file` };
          await addHistory(ownerId, entry);
          res.status(201).json({ ...clientHistory([entry])[0], downloadUrl: `/api/downloads/${conversionId}/file` });
      } catch (error) { if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true }); res.status(422).json({ error: error.message || 'A conversão falhou.' }); }
  });

  router.get('/api/downloads/:id/file', async (req, res) => {
      const ownerId = getVisitorId(req, res);
      const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
      const historyItem = (await loadHistory(ownerId)).find(item => item.id === req.params.id);
      if (job && job.ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este ficheiro.' });
      const filePath = job?.filePath || storedPath(job?.storedName) || storedPath(historyItem?.storedName);
      if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'O ficheiro já não está disponível.' });
      const fileName = job?.fileName || historyItem?.fileName || 'tubematex-download';
      res.download(filePath, fileName);
  });

  return router;
}

module.exports = { createDownloadRouter };
