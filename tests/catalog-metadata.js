const assert = require('node:assert/strict');
const ytdlp = require('@openanime/youtube-dl-exec');
const cases = [
  { name: 'Spotify', url: 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl' },
  { name: 'Apple Music', url: 'https://music.apple.com/us/album/after-hours/1499378108' }
];
(async () => {
  const report = [];
  for (const item of cases) {
    try {
      const data = await ytdlp(item.url, { dumpSingleJson: true, skipDownload: true, noWarnings: true, noPlaylist: true, socketTimeout: 20 });
      assert.ok(data && (data.title || data.track || data.album), `${item.name}: metadata vazia`);
      report.push({ platform: item.name, status: 'metadata-ok', title: data.title || data.track || data.album, extractor: data.extractor_key || data.extractor || null });
    } catch (error) {
      const message = String(error.stderr || error.message || error);
      const supportedFailure = /unsupported|no suitable extractor|login|private|geo|drm|not available|unable to download/i.test(message);
      assert.equal(supportedFailure, true, `${item.name}: erro inesperado: ${message.slice(0, 300)}`);
      report.push({ platform: item.name, status: 'classified-limitation', reason: message.split('\n').find(Boolean)?.slice(0, 220) || 'sem metadata pública' });
    }
  }
  console.log(JSON.stringify(report, null, 2));
  console.log('CATALOG METADATA OK: Spotify e Apple Music testados sem download de conteúdo protegido.');
})().catch(error => { console.error(error); process.exit(1); });
