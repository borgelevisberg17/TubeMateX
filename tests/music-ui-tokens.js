'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const css = fs.readFileSync(path.join(__dirname, '..', 'frontend/css/music-ui.css'), 'utf8');
assert.match(css, /--music-accent:\s*#1db954/i, 'music accent should match the requested brand green');
assert.match(css, /--space-lime:\s*var\(--music-accent\)/, 'music should map its accent through the shared space token');
assert.match(css, /--space-muted:\s*var\(--music-muted\)/, 'music should map secondary text through the shared space token');
assert.match(css, /--space-line:\s*var\(--music-border\)/, 'music should map borders through the shared space token');
assert.match(css, /\.music-player\s*\{[^}]*background:\s*#181818/i, 'persistent player should use the requested elevated surface');
assert.match(css, /\.music-player\s*\{[^}]*color:\s*var\(--music-text\)/s, 'player text should use the scoped music text token');
assert.match(css, /--music-bg:\s*#121212/i, 'main music background should use the requested neutral charcoal');
assert.match(css, /--music-sidebar:\s*#000000/i, 'music sidebar should use black');
assert.match(css, /--music-surface-hover:\s*#282828/i, 'interactive surfaces should use the requested hover color');
assert.ok(!/#b6e77b/i.test(css), 'obsolete accent should not be hard-coded');
assert.ok(!/#ffd28a/i.test(css), 'obsolete warning color should not be hard-coded');

console.log('MUSIC_UI_TOKENS_OK — scoped Spotify-inspired palette and shared token aliases');
