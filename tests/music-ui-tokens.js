'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const css = fs.readFileSync(path.join(__dirname, '..', 'frontend/css/music-ui.css'), 'utf8');
assert.match(css, /var\(--space-lime\)/, 'music workspace should consume the shared accent token');
assert.match(css, /var\(--space-muted\)/, 'music workspace should consume the shared secondary text token');
assert.match(css, /var\(--space-line\)/, 'music workspace should consume the shared border token');
assert.match(css, /var\(--tmx-state-warning\)/, 'volume mute state should use the semantic warning token');
assert.match(css, /\.music-player\s*\{[^}]*background:\s*var\(--space-panel\)/s, 'player surface should adapt to the active theme');
assert.match(css, /\.music-player\s*\{[^}]*color:\s*var\(--space-text\)/s, 'player text should adapt to the active theme');
assert.ok(!/#b6e77b/i.test(css), 'music accent should not be hard-coded instead of using the shared token');
assert.ok(!/#ffd28a/i.test(css), 'warning state should not use a hard-coded yellow color');
assert.ok(!/#f4fff8/i.test(css), 'player text should not be hard-coded for dark mode');

console.log('MUSIC_UI_TOKENS_OK — shared accent, text, border, warning and theme-aware player');
