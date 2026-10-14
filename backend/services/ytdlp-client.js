'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function defaultProbe(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
  return !result.error && result.status === 0;
}

function resolveYtDlpBinary({
  preferredBinary,
  bundledBinary,
  systemBinary = 'yt-dlp',
  pythonBinary = 'python3',
  platform = process.platform,
  probe = defaultProbe
} = {}) {
  const candidates = [...new Set([preferredBinary, bundledBinary, systemBinary].filter(Boolean))];
  for (const candidate of candidates) {
    if (probe(candidate, ['--version'])) return { kind: 'binary', command: candidate };
  }
  if (platform !== 'win32' && probe(pythonBinary, ['-m', 'yt_dlp', '--version'])) {
    return { kind: 'python-module', command: pythonBinary };
  }
  throw new Error('yt-dlp não está disponível ou o binário não é compatível com esta arquitetura. Define YTDLP_BINARY, instala yt-dlp no PATH ou instala o módulo yt_dlp para Python.');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function createYtDlpClient({ ytdlpModule, env = process.env, platform = process.platform, probe = defaultProbe } = {}) {
  if (!ytdlpModule?.create || !ytdlpModule?.constants?.YOUTUBE_DL_PATH) {
    throw new TypeError('É necessário fornecer o módulo @openanime/youtube-dl-exec.');
  }
  const resolved = resolveYtDlpBinary({
    preferredBinary: env.YTDLP_BINARY,
    bundledBinary: ytdlpModule.constants.YOUTUBE_DL_PATH,
    systemBinary: 'yt-dlp',
    pythonBinary: env.PYTHON || 'python3',
    platform,
    probe
  });
  if (resolved.kind === 'binary') {
    return resolved.command === ytdlpModule.constants.YOUTUBE_DL_PATH
      ? ytdlpModule
      : ytdlpModule.create(resolved.command);
  }

  const shimPath = path.join(os.tmpdir(), `tubematex-yt-dlp-${process.pid}.sh`);
  fs.writeFileSync(shimPath, `#!/bin/sh\nexec ${shellQuote(resolved.command)} -m yt_dlp "$@"\n`, { mode: 0o700 });
  fs.chmodSync(shimPath, 0o700);
  process.once('exit', () => { try { fs.unlinkSync(shimPath); } catch {} });
  return ytdlpModule.create(shimPath);
}

module.exports = { createYtDlpClient, resolveYtDlpBinary };
