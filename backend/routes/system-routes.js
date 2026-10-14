const express = require('express');

function createSystemRouter({
  distributedQueue,
  getQueueSize,
  getActiveJobs,
  bullmqRole,
  listYtDlpPlugins,
  ytdlpPluginDir,
  allowedFormats,
  videoQualities,
  maxConcurrentDownloads,
  maxDownloadSize,
  searchProviders,
  searchProviderLabels,
  youtubeAuthConfigured,
  supportedPlatforms,
  apiLimiter
}) {
  const router = express.Router();

  router.get('/health', async (req, res) => {
    let distributed = null;
    if (distributedQueue) {
      try {
        distributed = await distributedQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      } catch {
        distributed = { error: 'indisponível' };
      }
    }
    res.json({ status: 'ok', service: 'TubeMateX', role: bullmqRole, queue: getQueueSize(), active: getActiveJobs(), distributed });
  });

  router.get('/api/platforms', (req, res) => res.json({ platforms: supportedPlatforms, plugins: listYtDlpPlugins() }));

  router.get('/api/plugins', (req, res) => res.json({
    enabled: Boolean(ytdlpPluginDir),
    directoryConfigured: Boolean(ytdlpPluginDir),
    plugins: listYtDlpPlugins(),
    policy: 'Plugins devem ser instalados e revisados pelo administrador; não são baixados pela UI.'
  }));

  router.get('/api/capabilities', (req, res) => res.json({
    formats: Object.entries(allowedFormats).map(([id, item]) => ({ id, label: item.label, type: item.type })),
    qualities: Object.entries(videoQualities).map(([id, label]) => ({ id, label })),
    maxConcurrentDownloads,
    maxDownloadSize,
    searchProviders: searchProviders.map(provider => searchProviderLabels[provider] || provider),
    youtubeAuthConfigured,
    platforms: supportedPlatforms
  }));

  return router;
}

module.exports = { createSystemRouter };
