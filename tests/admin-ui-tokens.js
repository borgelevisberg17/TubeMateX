'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const css = fs.readFileSync(path.join(__dirname, '..', 'frontend/css/admin.css'), 'utf8');
for (const token of [
  '--tmx-bg', '--tmx-surface', '--tmx-surface-raised', '--tmx-border',
  '--tmx-text-primary', '--tmx-text-secondary', '--tmx-accent-entertainment',
  '--tmx-state-success', '--tmx-state-warning', '--tmx-state-error',
  '--tmx-accent-creative'
]) {
  assert.ok(css.includes(`var(${token})`), `admin console should consume ${token}`);
}
assert.match(css, /\.admin-page\s*\{[^}]*var\(--admin-bg\)/s, 'admin page should use its semantic background alias');
assert.match(css, /\.admin-form input[^}]*background:var\(--admin-surface\)/s, 'form controls should use the semantic surface');
assert.match(css, /\.admin-notice\[data-kind=error\][^}]*var\(--admin-danger\)/s, 'error notices should use semantic error colors');
assert.ok(!/#(?:090a0f|11131b|171a24|f04450|3ddc97|f3b642)\b/i.test(css), 'admin CSS should not reintroduce its former hard-coded palette');

console.log('ADMIN_UI_TOKENS_OK — surfaces, text, accents and status colors use semantic tokens');
