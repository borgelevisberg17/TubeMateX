const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ytdlp = require('@openanime/youtube-dl-exec');

const cases = [
  { platform: 'TikTok', url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173', format: 'mp4', selector: 'bv*+ba/bv*', extra: {} },
  { platform: 'SoundCloud', url: 'https://soundcloud.com/kevin-manthei/egg-101-everything-is-going-wrong', format: 'mp3', selector: 'ba/b', extra: { extractAudio: true, audioFormat: 'mp3', audioQuality: '5' } }
];

(async () => {
  const dir = '/tmp/tubematex-codec-smoke';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const report = [];
  for (const item of cases) {
    const prefix = path.join(dir, item.platform.toLowerCase());
    try {
      await ytdlp(item.url, { dumpSingleJson: true, skipDownload: true, noWarnings: true, noPlaylist: true, socketTimeout: 25 });
      await ytdlp(item.url, { noWarnings: true, noPlaylist: true, maxFilesize: 25 * 1024 * 1024, output: `${prefix}.%(ext)s`, format: item.selector, ...item.extra });
      const file = fs.readdirSync(dir).find(name => name.startsWith(path.basename(prefix)));
      if (!file) throw new Error('Nenhum ficheiro final.');
      const full = path.join(dir, file);
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name:stream=codec_name,codec_type', '-of', 'json', full], { encoding: 'utf8' }));
      const container = probe.format?.format_name || '';
      const codecs = (probe.streams || []).map(stream => `${stream.codec_type}:${stream.codec_name}`).join(',');
      const expected = item.format === 'mp3'
        ? file.endsWith('.mp3') && container.includes('mp3') && codecs.includes('audio:mp3')
        : file.endsWith('.mp4') && container.includes('mp4') && codecs.includes('video:');
      if (!expected) throw new Error(`Saída incompatível: ${file}; ${container}; ${codecs}`);
      report.push({ platform: item.platform, file, container, codecs, status: 'codec-ok' });
    } catch (error) {
      report.push({ platform: item.platform, status: 'failed', reason: String(error.stderr || error.message || error).split('\n').find(Boolean)?.slice(0, 240) });
    }
  }
  console.log(JSON.stringify(report, null, 2));
  fs.rmSync(dir, { recursive: true, force: true });
  if (report.some(item => item.status !== 'codec-ok')) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
