const express = require('express');

function createMediaRouter({
  apiLimiter,
  validateUrl,
  fetchPlaylistInfo,
  fetchInfo,
  ytdlp,
  ytdlpCommonOptions,
  errorCode,
  translateError
}) {
  const router = express.Router();

  router.get('/api/media/playlist', apiLimiter, async (req, res) => {
    const url = await validateUrl(req.query.url);
    if (!url) return res.status(400).json({ error: 'Indica um URL público válido começado por http:// ou https://.' });
    try {
      res.json(await fetchPlaylistInfo(url));
    } catch (error) {
      console.error('[playlist]', error?.stderr || error?.message || error);
      res.status(422).json({ error: 'Esta fonte não expõe uma lista pública de episódios compatível.', errorCode: errorCode(error) });
    }
  });

  router.get('/api/media/info', apiLimiter, async (req, res) => {
    const url = await validateUrl(req.query.url);
    if (!url) return res.status(400).json({ error: 'Indica um URL público válido começado por http:// ou https://.' });
    try {
      res.json(await fetchInfo(url));
    } catch (error) {
      res.status(422).json({ error: translateError(error) });
    }
  });

  router.get('/api/media/stream', apiLimiter, async (req, res) => {
    const url = await validateUrl(req.query.url);
    const type = String(req.query.type || 'audio').toLowerCase() === 'video' ? 'video' : 'audio';
    if (!url) return res.status(400).json({ error: 'Indica um URL público válido começado por http:// ou https://.' });
    try {
      const result = await ytdlp(url, {
        ...ytdlpCommonOptions,
        dumpSingleJson: true,
        skipDownload: true,
        noWarnings: true,
        noPlaylist: true,
        noCheckCertificates: true,
        socketTimeout: 15,
        format: type === 'video' ? 'bv*+ba/bv*' : 'bestaudio/best'
      });
      const requestedFormats = Array.isArray(result.requested_formats) ? result.requested_formats : [];
      const combined = result.url && result.vcodec !== 'none' && result.acodec !== 'none' ? result : null;
      const selected = type === 'video'
        ? (combined || requestedFormats.find(item => item.url && item.vcodec !== 'none' && item.acodec !== 'none') || requestedFormats.find(item => item.url && item.vcodec !== 'none') || result)
        : (result.url && result.acodec !== 'none' ? result : requestedFormats.find(item => item.url && item.acodec !== 'none') || result);
      const streamUrl = selected.url;
      if (!streamUrl) return res.status(422).json({ error: 'Esta fonte não disponibilizou uma URL de reprodução compatível. Tenta outra qualidade ou fonte.' });
      res.json({
        url: streamUrl,
        title: result.title || 'Pré-visualização',
        thumbnail: result.thumbnail || null,
        duration: Number(result.duration || 0),
        mimeType: selected.mime || (type === 'video' ? 'video/mp4' : 'audio/mpeg'),
        type
      });
    } catch (error) {
      console.error('[stream]', error?.stderr || error?.message || error);
      res.status(422).json({ error: translateError(error), errorCode: errorCode(error) });
    }
  });

  return router;
}

module.exports = { createMediaRouter };
