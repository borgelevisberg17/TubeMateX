const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { resolveSessionSecret, MIN_SECRET_BYTES } = require('../../config/session-security');

test('exige SESSION_SECRET com pelo menos 32 bytes em produção', () => {
  assert.throws(
    () => resolveSessionSecret({ isProduction: true, configuredSecret: '' }),
    /SESSION_SECRET.*at least 32 bytes/
  );
  assert.throws(
    () => resolveSessionSecret({ isProduction: true, configuredSecret: 'too-short' }),
    /SESSION_SECRET.*at least 32 bytes/
  );
  const strongSecret = crypto.randomBytes(MIN_SECRET_BYTES).toString('hex');
  assert.equal(
    resolveSessionSecret({ isProduction: true, configuredSecret: strongSecret }),
    strongSecret
  );
});

test('rejeita o segredo de fallback conhecido, o placeholder e valores repetitivos', () => {
  assert.throws(
    () => resolveSessionSecret({ isProduction: true, configuredSecret: 'change-this-session-secret-in-production' }),
    /placeholder/
  );
  assert.throws(
    () => resolveSessionSecret({ isProduction: true, configuredSecret: 'gera-uma-string-aleatoria-longa-com-pelo-menos-32-caracteres' }),
    /placeholder/
  );
  assert.throws(
    () => resolveSessionSecret({ isProduction: true, configuredSecret: 'a'.repeat(64) }),
    /repetitive/
  );
});

test('em desenvolvimento gera um segredo aleatório se não houver configuração', () => {
  const first = resolveSessionSecret({ isProduction: false, configuredSecret: '' });
  const second = resolveSessionSecret({ isProduction: false, configuredSecret: '' });
  assert.equal(Buffer.byteLength(first, 'utf8'), 64);
  assert.notEqual(first, second);
});

test('preserva um segredo explicitamente configurado em desenvolvimento', () => {
  assert.equal(
    resolveSessionSecret({ isProduction: false, configuredSecret: 'local-dev-secret' }),
    'local-dev-secret'
  );
});
