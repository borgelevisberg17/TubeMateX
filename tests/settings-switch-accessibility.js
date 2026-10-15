const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const css = fs.readFileSync(path.join(__dirname, '..', 'frontend/css/user-rebuild.css'), 'utf8');
assert.match(css, /\.switch input:focus-visible \+ \.switch-track/, 'settings toggle must expose a visible keyboard focus indicator');
assert.ok(css.includes('forced-colors: active'), 'settings toggle should support high-contrast forced-colors mode');

console.log('SETTINGS_SWITCH_ACCESSIBILITY_OK — keyboard focus and forced-colors support');
