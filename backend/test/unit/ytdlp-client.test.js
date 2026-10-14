const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveYtDlpBinary } = require('../../services/ytdlp-client');

test('prefere um executável do bundle apenas quando ele inicia corretamente', () => {
  const calls = [];
  const result = resolveYtDlpBinary({
    preferredBinary: '/usr/local/bin/custom-yt-dlp',
    bundledBinary: '/app/node_modules/yt-dlp_linux',
    systemBinary: 'yt-dlp',
    probe: command => { calls.push(command); return command === 'yt-dlp'; }
  });
  assert.deepEqual(result, { kind: 'binary', command: 'yt-dlp' });
  assert.deepEqual(calls, ['/usr/local/bin/custom-yt-dlp', '/app/node_modules/yt-dlp_linux', 'yt-dlp']);
});

test('usa o módulo yt_dlp quando o bundle e o comando do sistema são incompatíveis', () => {
  const result = resolveYtDlpBinary({
    bundledBinary: '/app/node_modules/yt-dlp_linux',
    systemBinary: 'yt-dlp',
    pythonBinary: 'python3',
    platform: 'linux',
    probe: (command, args) => command === 'python3' && args[0] === '-m'
  });
  assert.deepEqual(result, { kind: 'python-module', command: 'python3' });
});

test('falha cedo com instrução útil se não existir um executável compatível', () => {
  assert.throws(
    () => resolveYtDlpBinary({ bundledBinary: '/wrong-arch/yt-dlp', probe: () => false }),
    /yt-dlp não está disponível ou o binário não é compatível.*YTDLP_BINARY/
  );
});
