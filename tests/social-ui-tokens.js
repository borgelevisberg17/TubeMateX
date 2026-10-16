'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const css = fs.readFileSync(path.join(__dirname, '..', 'frontend/css/spaces.css'), 'utf8');
assert.match(css, /body\[data-space=social\]\s*\{[^}]*--space-lime:var\(--tmx-accent-social\)/s, 'social workspace should use the shared semantic social accent');
assert.match(css, /body\[data-space=social\]\s*\{[^}]*--space-cyan:var\(--tmx-accent-social\)/s, 'social workspace should use the semantic accent consistently');
assert.match(css, /body\[data-space=social\] \.space-bar\s*\{[^}]*background:var\(--space-panel\)/s, 'social header should adapt to the active theme');
assert.match(css, /body\[data-space=social\].*\.space-button\.primary\s*\{[^}]*background:var\(--space-lime\)/s, 'social primary actions should use the semantic accent');
assert.ok(!/body\[data-space=social\]\s*\{--space-lime:#59d9e8/.test(css), 'social accent should not be hard-coded in the workspace override');
assert.ok(!/body\[data-space=social\] \.space-bar\{background:#071721\}/.test(css), 'social header should not force a fixed dark surface');
console.log('SOCIAL_UI_TOKENS_OK — semantic social accent and theme-aware header');
