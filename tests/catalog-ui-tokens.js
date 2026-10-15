'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const css = fs.readFileSync(path.join(__dirname, '..', 'frontend/css/catalog-ui.css'), 'utf8');
const scope = css.match(/\.entertainment-page\s*\{([^}]*)\}/);
assert.ok(scope, 'entertainment catalog must declare its scoped design tokens');
assert.match(scope[1], /--catalog-accent:\s*var\(--tmx-accent-entertainment\)/, 'catalog accent must use the semantic entertainment token');
assert.match(scope[1], /--catalog-panel:\s*var\(--tmx-surface\)/, 'catalog panel must use the shared surface token');
assert.match(scope[1], /--catalog-line:\s*var\(--tmx-border\)/, 'catalog borders must use the shared border token');
assert.match(scope[1], /--catalog-muted:\s*var\(--tmx-text-secondary\)/, 'catalog muted text must use the shared secondary text token');
assert.ok(!/#e50914(?![0-9a-f])/i.test(css), 'catalog should not repeat the hard-coded entertainment accent');
assert.ok(!/#ff5260(?![0-9a-f])/i.test(css), 'catalog should not repeat a hard-coded accent variant');

console.log('CATALOG_UI_TOKENS_OK — entertainment accent and shared surface tokens');
