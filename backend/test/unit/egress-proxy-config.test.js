const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('egress proxy denies private/reserved destinations before allowing public traffic', () => {
  const configPath = path.join(__dirname, '../../../deploy/egress-proxy/squid.conf');
  const config = fs.readFileSync(configPath, 'utf8');
  const denyPrivate = config.indexOf('http_access deny private_dst');
  const allowAll = config.indexOf('http_access allow all');
  assert.notEqual(denyPrivate, -1, 'private destination ACL must exist');
  assert.notEqual(allowAll, -1, 'public egress rule must exist');
  assert.ok(denyPrivate < allowAll, 'private destination denial must precede allow rule');
  for (const range of ['10.0.0.0/8', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7', 'fe80::/10']) {
    assert.ok(config.includes(range), `missing blocked range ${range}`);
  }
});

test('egress proxy only permits HTTP/HTTPS destination ports and HTTPS CONNECT', () => {
  const config = fs.readFileSync(path.join(__dirname, '../../../deploy/egress-proxy/squid.conf'), 'utf8');
  assert.match(config, /acl Safe_ports port 80 443/);
  assert.match(config, /acl SSL_ports port 443/);
  assert.match(config, /http_access deny !Safe_ports/);
  assert.match(config, /http_access deny CONNECT !SSL_ports/);
});
