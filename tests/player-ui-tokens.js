'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const css = fs.readFileSync(path.join(__dirname, '..', 'frontend/css/stream-player.css'), 'utf8');
assert.match(css, /var\(--tmx-accent-entertainment\)/, 'cinematic player should use the shared entertainment accent');
assert.match(css, /\.yt-player-seek\s*\{[^}]*accent-color:var\(--tmx-accent-entertainment\)/s, 'seek bar should use the semantic accent');
assert.match(css, /\.ent-player-error button\s*\{[^}]*background:var\(--tmx-accent-entertainment\)/s, 'player error action should use the semantic accent');
for (const color of ['#f21b35', '#e50914', '#dc1529', '#ff3345']) {
  assert.ok(!css.toLowerCase().includes(color), `player should not hard-code accent ${color}`);
}
assert.match(css, /\.ent-video-drawer \.video-drawer-card\s*\{[^}]*background:radial-gradient/s, 'cinematic drawer background should remain intentional');
console.log('PLAYER_UI_TOKENS_OK — cinematic accent is semantic and overlay contrast remains intentional');
