const crypto = require('node:crypto');

const MIN_SECRET_BYTES = 32;
const KNOWN_PLACEHOLDERS = new Set([
  'change-this-session-secret-in-production',
  'gera-uma-string-aleatoria-longa-com-pelo-menos-32-caracteres'
]);

function resolveSessionSecret({ isProduction, configuredSecret } = {}) {
  const secret = typeof configuredSecret === 'string' ? configuredSecret : '';

  if (!isProduction) {
    return secret || crypto.randomBytes(32).toString('hex');
  }

  if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error('SESSION_SECRET must be configured in production with at least 32 bytes.');
  }

  if (KNOWN_PLACEHOLDERS.has(secret.trim().toLowerCase())) {
    throw new Error('SESSION_SECRET must not use a documented placeholder value.');
  }

  return secret;
}

module.exports = { resolveSessionSecret, MIN_SECRET_BYTES };
