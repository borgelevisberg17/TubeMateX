#!/usr/bin/env node
const crypto = require('crypto');
const password = process.argv[2];
if (!password) {
  console.error('Uso: node scripts/admin-password-hash.js "senha"');
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString('hex');
const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
process.stdout.write(`scrypt$16384$8$1$${salt}$${derived}\n`);
