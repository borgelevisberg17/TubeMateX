'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const musicPage = path.join(root, 'frontend', 'music.html');
const routes = config.routes || [];

assert.ok(fs.existsSync(musicPage), 'the real music HTML page must exist');
const musicRouteIndex = routes.findIndex(route => route.src === '/(.*)\\.html' && route.dest === 'frontend/$1.html');
const catchAllIndex = routes.findIndex(route => route.src === '/(.*)' && route.dest === 'frontend/index.html');

assert.notEqual(musicRouteIndex, -1, 'Vercel must route requested HTML paths to their matching frontend files');
assert.notEqual(catchAllIndex, -1, 'the existing homepage fallback should remain configured');
assert.ok(musicRouteIndex < catchAllIndex, 'the specific HTML route must run before the homepage catch-all');
assert.equal(routes[musicRouteIndex].dest, 'frontend/$1.html', 'music.html must map to frontend/music.html, not index.html');

console.log('VERCEL_MUSIC_HTML_ROUTE_OK — /music.html resolves to its real HTML file before the homepage fallback');
