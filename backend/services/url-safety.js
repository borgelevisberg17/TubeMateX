const net = require('node:net');
const dns = require('node:dns').promises;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'host.docker.internal'
]);

function ipv4Octets(address) {
  if (net.isIP(address) !== 4) return null;
  return address.split('.').map(Number);
}

function isUnsafeIPv4(address) {
  const octets = ipv4Octets(address);
  if (!octets) return true;
  const [a, b, c] = octets;

  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224;
}

function isUnsafeIPv6(address) {
  const normalized = String(address || '').toLowerCase().split('%')[0];
  if (net.isIP(normalized) !== 6) return true;

  // IPv4-mapped IPv6 addresses can disguise a blocked IPv4 destination.
  if (normalized.startsWith('::ffff:')) return true;

  // Permit only global-unicast 2000::/3, excluding special-use ranges.
  if (!/^[23]/.test(normalized)) return true;
  if (normalized.startsWith('2001:db8:') || normalized === '2001:db8') return true;
  if (normalized.startsWith('2001:0:') || normalized.startsWith('2002:')) return true;
  return false;
}

function isUnsafeAddress(address) {
  const normalized = String(address || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const version = net.isIP(normalized);
  if (version === 4) return isUnsafeIPv4(normalized);
  if (version === 6) return isUnsafeIPv6(normalized);
  return true;
}

async function validatePublicHttpUrl(value, { lookup = dns.lookup } = {}) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 2048) return null;

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password) return null;

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) ||
      hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      hostname.endsWith('.localhost') || (net.isIP(hostname) !== 0 && isUnsafeAddress(hostname))) {
    return null;
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!Array.isArray(addresses) || addresses.length === 0 ||
        addresses.some(item => isUnsafeAddress(item.address))) return null;
  } catch {
    return null;
  }

  return parsed.toString();
}

module.exports = { validatePublicHttpUrl, isUnsafeAddress };
