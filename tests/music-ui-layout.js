'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/music.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/css/music-ui.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'frontend/js/spaces.js'), 'utf8');

for (const id of [
  'spaceSearch', 'spaceQuery', 'spaceSources', 'spaceResults', 'spaceStatus',
  'spacePlayerCover', 'spacePlayerEmpty', 'spacePlayerBody', 'spacePlayerTitle',
  'spacePlayerArtist', 'spacePlayerSeek', 'spacePlayerCurrent', 'spacePlayerDuration',
  'spacePlay', 'musicPrevious', 'musicNext', 'musicBack10', 'musicForward10', 'musicShuffle', 'musicRepeat',
  'musicMute', 'musicVolume', 'musicVolumeValue', 'spaceAudio'
]) {
  assert.match(html, new RegExp('id="' + id + '"'), 'music markup must preserve #' + id);
}

assert.match(html, /class="music-sidebar"/, 'desktop music sidebar should exist');
assert.match(html, /class="music-bottom-nav"/, 'mobile navigation should exist');
assert.match(html, /class="music-player"/, 'persistent player should exist');
assert.match(css, /position:\s*fixed[\s\S]{0,100}bottom:\s*0/, 'player should remain fixed to the viewport bottom');
assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'mobile results should use a two-column grid');
assert.match(css, /env\(safe-area-inset-bottom/, 'mobile fixed controls should respect the safe area');
assert.match(css, /prefers-reduced-motion:\s*reduce/, 'reduced-motion preferences should be supported');
assert.match(css, /forced-colors:\s*active/, 'forced-colors focus treatment should be supported');
assert.match(css, /@media \\(max-width: 520px\\)[\\s\\S]*?\.music-results-grid \.track-row \\{[\\s\\S]*?overflow: hidden/, 'phone cards must clip overflow within their own bounds');
assert.match(css, /\.music-results-grid \.track-actions \\{[\\s\\S]*?grid-template-columns: repeat\\(2, minmax\\(0, 1fr\\)\\)/, 'phone card actions must use equal-width columns');
assert.match(css, /@media \\(max-width: 380px\\)[\\s\\S]*?\.music-results-grid \.track-actions \\{[\\s\\S]*?display: flex/, 'very narrow phone card actions must stack vertically');
assert.match(css, /\.music-player \\{[\\s\\S]*?grid-template-columns: minmax\\(0, 1fr\\) minmax\\(0, 1\\.15fr\\)/, 'compact player must use shrinkable columns');

for (const endpoint of ['/api/search?', '/api/platforms', '/api/media/stream?', '/api/downloads']) {
  assert.ok(js.includes(endpoint), 'existing backend contract must remain: ' + endpoint);
}
assert.match(js, /musicNavSearch/, 'desktop search navigation should focus the existing search');
assert.match(js, /musicMobileSearch/, 'mobile search navigation should focus the existing search');
assert.match(js, /shuffleEnabled/, 'shuffle should operate on the real search results');
assert.match(js, /repeatMode/, 'repeat should operate on the real search results');
assert.match(js, /A fonte não permitiu iniciar a reprodução automaticamente/, 'failed autoplay must not be reported as successful playback');

console.log('MUSIC_UI_LAYOUT_OK — real endpoints, existing player IDs, responsive shell and accessibility hooks');
