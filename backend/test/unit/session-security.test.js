const test = require('node:test');
const assert = require('node:assert/strict');
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
  assert.equal(
    resolveSessionSecret({ isProduction: true, configuredSecret: 'a'.repeat(MIN_SECRET_BYTES) }),
    'a'.repeat(MIN_SECRET_BYTES)
  );
});

test('rejeita o segredo de fallback conhecido e o placeholder do exemplo', () => {
  assert.throws(
    () => resolveSessionSecret({ isProduction: true, configuredSecret: 'change-this-session-secret-in-production' }),
    /placeholder/
  );
  assert.throws(
    () => resolveSessionSecret({ isProduction: true, configuredSecret: 'gera-uma-string-aleatoria-longa-com-pelo-menos-32-caracteres' }),
    /placeholder/
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
