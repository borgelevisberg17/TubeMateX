const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePublicHttpUrl, isUnsafeAddress } = require('../../services/url-safety');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('aceita URL HTTP(S) com DNS público', async () => {
  assert.equal(
    await validatePublicHttpUrl('https://media.example/video?id=1', { lookup: publicLookup }),
    'https://media.example/video?id=1'
  );
});

test('rejeita protocolos não HTTP, credenciais e URLs malformadas', async () => {
  for (const value of [
    'file:///etc/passwd',
    'ftp://example.com/file',
    'javascript:alert(1)',
    'https://user:password@example.com/video',
    'not a url',
    'https://'
  ]) {
    assert.equal(await validatePublicHttpUrl(value, { lookup: publicLookup }), null, value);
  }
});

test('rejeita hosts locais e endereços IPv4 não públicos', async () => {
  for (const host of [
    'localhost', 'service.local', 'service.internal',
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1',
    '169.254.169.254', '172.16.0.1', '192.168.1.1',
    '192.0.2.1', '198.18.0.1', '203.0.113.10', '224.0.0.1'
  ]) {
    assert.equal(isUnsafeAddress(host), true, host);
  }
});

test('rejeita IPv6 privado, reservado e IPv4-mapped', () => {
  for (const address of ['::', '::1', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '2001:db8::1', '2002::1']) {
    assert.equal(isUnsafeAddress(address), true, address);
  }
  assert.equal(isUnsafeAddress('2606:4700:4700::1111'), false);
});

test('rejeita DNS que resolve para qualquer endereço não público', async () => {
  const lookups = [
    async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.8', family: 4 }],
    async () => [{ address: '::ffff:127.0.0.1', family: 6 }],
    async () => []
  ];
  for (const lookup of lookups) {
    assert.equal(await validatePublicHttpUrl('https://attacker.example/path', { lookup }), null);
  }
});

test('rejeita falhas de resolução DNS', async () => {
  assert.equal(await validatePublicHttpUrl('https://missing.example', { lookup: async () => { throw new Error('NXDOMAIN'); } }), null);
});
