const fs = require('node:fs');
const path = require('node:path');
const ytdlp = require('@openanime/youtube-dl-exec');
const cases = [
  { platform: 'TikTok', url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173', format: 'mp4' },
  { platform: 'SoundCloud', url: 'https://soundcloud.com/kevin-manthei/egg-101-everything-is-going-wrong', format: 'mp3' }
];
(async () => {
  const outputDir = '/tmp/tubematex-platform-smoke'; fs.rmSync(outputDir, { recursive: true, force: true }); fs.mkdirSync(outputDir, { recursive: true });
  const report = [];
  for (const item of cases) {
    const prefix = path.join(outputDir, item.platform.toLowerCase());
    try {
      const info = await ytdlp(item.url, { dumpSingleJson: true, skipDownload: true, noWarnings: true, noPlaylist: true, socketTimeout: 25 });
      if (!info?.title) throw new Error('Extractor retornou metadata sem título.');
      const downloadOptions = { noWarnings: true, noPlaylist: true, maxFilesize: 25 * 1024 * 1024, output: `${prefix}.%(ext)s`, format: item.format === 'mp3' ? 'ba/b' : 'bv*+ba/bv*' }; if (item.format === 'mp3') Object.assign(downloadOptions, { extractAudio: true, audioFormat: 'mp3', audioQuality: '5' }); await ytdlp(item.url, downloadOptions);
      const files = fs.readdirSync(outputDir).filter(file => file.startsWith(path.basename(prefix)));
      report.push({ platform: item.platform, status: files.length ? 'download-ok' : 'download-empty', title: info.title, files });
    } catch (error) { report.push({ platform: item.platform, status: 'failed', reason: String(error.stderr || error.message || error).split('\n').find(Boolean)?.slice(0, 240) }); }
  }
  console.log(JSON.stringify(report, null, 2)); fs.rmSync(outputDir, { recursive: true, force: true });
  if (report.some(item => item.status === 'download-empty')) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
