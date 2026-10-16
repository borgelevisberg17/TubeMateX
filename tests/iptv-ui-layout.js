const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('frontend/entertainment.html', 'utf8');
const js = fs.readFileSync('frontend/js/spaces.js', 'utf8');
const css = fs.readFileSync('frontend/css/catalog-ui.css', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.match(html, /id="iptvFeatured"/, 'the IPTV featured panel must exist in the real page');
assert.match(html, /id="iptvFeaturedPlay"/, 'featured action must be present');
assert.match(html, /id="iptvResults"/, 'existing channel results container must be preserved');
assert.match(js, /function renderIptvFeatured\(item\)/, 'featured panel must be rendered from a real API item');
assert.match(js, /renderIptvFeatured\(items\[0\] \|\| null\)/, 'featured panel must use the current API result set');
assert.match(js, /iptvFeaturedPlay\?\.addEventListener\('click'/, 'featured action must be wired to the existing player');
assert.match(js, /fetch\(`\/api\/iptv\/channels\?/, 'existing IPTV endpoint contract must remain in use');
assert.match(js, /function playItem\(item, returnFocus = null\)/, 'existing playback flow must remain in place');
assert.match(css, /--iptv-accent:\s*#3978e8/, 'IPTV visual tokens must be defined');
assert.match(css, /@media \(max-width: 700px\)/, 'mobile layout rules must exist');
assert.match(css, /prefers-reduced-motion:\s*reduce/, 'reduced-motion preference must be respected');
assert.equal(packageJson.scripts['test:iptv-ui'], 'node --check frontend/js/spaces.js && node tests/iptv-ui-layout.js');

console.log('IPTV UI static checks passed.');
