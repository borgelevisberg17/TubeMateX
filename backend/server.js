const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const { resolveSessionSecret } = require('./config/session-security');
const { spawn } = require('child_process');
const { validatePublicHttpUrl } = require('./services/url-safety');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const SQLiteStore = require('connect-sqlite3')(session);
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');
const { Queue, Worker } = require('bullmq');
const rateLimit = require('express-rate-limit');
const ytdlpPackage = require('@openanime/youtube-dl-exec');
const { createYtDlpClient } = require('./services/ytdlp-client');
const ytdlp = createYtDlpClient({ ytdlpModule: ytdlpPackage });
const sqlite3 = require('sqlite3').verbose();
const { createSystemRouter } = require('./routes/system-routes');
const { createMediaRouter } = require('./routes/media-routes');
const { createMediaService } = require('./services/media-service');
const { createDownloadRouter } = require('./routes/download-routes');
const { createLibraryRouter } = require('./routes/library-routes');
const { createStreamValidator } = require('./services/stream-validator');
const { createIptvHealthService } = require('./services/iptv-health-service');
const { createCatalogSourceHealth } = require('./services/catalog-source-health');

// Plugins oficiais do yt-dlp são opt-in: o administrador aponta para um diretório
// previamente revisado que contém o namespace yt_dlp_plugins.
const resolveBackendPath = value => value ? (path.isAbsolute(value) ? value : path.resolve(__dirname, value)) : null;
const YT_DLP_PLUGIN_DIR = resolveBackendPath(process.env.YT_DLP_PLUGIN_DIR);
const YT_DLP_COMMON_OPTIONS = {};
const FFMPEG_LOCATION = resolveBackendPath(process.env.FFMPEG_PATH);
if (FFMPEG_LOCATION) YT_DLP_COMMON_OPTIONS.ffmpegLocation = FFMPEG_LOCATION;
if (process.env.YTDLP_COOKIES_FILE) { const cookiesFile = resolveBackendPath(process.env.YTDLP_COOKIES_FILE); if (fs.existsSync(cookiesFile)) YT_DLP_COMMON_OPTIONS.cookies = cookiesFile; else console.warn(`[yt-dlp] YTDLP_COOKIES_FILE não encontrado: ${cookiesFile}`); }
if (process.env.YTDLP_COOKIES_FROM_BROWSER) YT_DLP_COMMON_OPTIONS.cookiesFromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER;
if (YT_DLP_PLUGIN_DIR) process.env.PYTHONPATH = [YT_DLP_PLUGIN_DIR, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
function listYtDlpPlugins() {
    if (!YT_DLP_PLUGIN_DIR) return [];
    const extractorDir = path.join(YT_DLP_PLUGIN_DIR, 'yt_dlp_plugins', 'extractor');
    if (!fs.existsSync(extractorDir)) return [];
    return fs.readdirSync(extractorDir, { withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith('.py') && entry.name !== '__init__.py').map(entry => ({ name: entry.name.replace(/\.py$/, ''), type: 'extractor', source: 'configured-directory' }));
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const requestMetrics = { total: 0, errors4xx: 0, errors5xx: 0, durationTotalMs: 0, durationMaxMs: 0, downloadsCompleted: 0, downloadsFailed: 0, downloadsTimedOut: 0, bytesDownloaded: 0 };
function logEvent(level, event, fields = {}) {
    const record = { timestamp: new Date().toISOString(), level, service: 'tubematex', event, ...fields };
    const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    writer(JSON.stringify(record));
}
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = resolveSessionSecret({ isProduction: IS_PRODUCTION, configuredSecret: process.env.SESSION_SECRET });
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_DIR = path.join(__dirname, '../frontend');
const resolveConfiguredPath = (value, fallback) => value ? (path.isAbsolute(value) ? value : path.resolve(__dirname, value)) : fallback;
const DATA_DIR = resolveConfiguredPath(process.env.DATA_DIR, path.join(__dirname, 'data'));
const DOWNLOAD_DIR = resolveConfiguredPath(process.env.DOWNLOAD_DIR, path.join(DATA_DIR, 'downloads'));
const HISTORY_DIR = resolveConfiguredPath(process.env.HISTORY_DIR, path.join(DATA_DIR, 'history'));
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 50);
const MAX_CONCURRENT_DOWNLOADS = Math.max(1, Number(process.env.MAX_CONCURRENT_DOWNLOADS || 2));
const MAX_DOWNLOAD_SIZE = Math.max(1024 * 1024, Number(process.env.MAX_DOWNLOAD_SIZE || 2 * 1024 * 1024 * 1024));
const MAX_ACTIVE_JOBS_PER_OWNER = Math.max(1, Number(process.env.MAX_ACTIVE_JOBS_PER_OWNER || 3));
const MAX_PENDING_DOWNLOADS = Math.max(1, Number(process.env.MAX_PENDING_DOWNLOADS || 100));
const DOWNLOAD_TIMEOUT_MS = Math.max(60_000, Number(process.env.DOWNLOAD_TIMEOUT_MS || 30 * 60 * 1000));
const CONVERSION_TIMEOUT_MS = Math.max(60_000, Number(process.env.CONVERSION_TIMEOUT_MS || 10 * 60 * 1000));
const SESSION_MAX_AGE_MS = Math.max(15 * 60 * 1000, Number(process.env.SESSION_MAX_AGE_MS || 8 * 60 * 60 * 1000));
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'tubematex.sid';
const SESSION_COOKIE_SAME_SITE = String(process.env.SESSION_COOKIE_SAME_SITE || 'lax').toLowerCase();
const JOB_RETENTION_MS = 2 * 60 * 60 * 1000;
if (IS_PRODUCTION && !process.env.YTDLP_PROXY_URL) throw new Error('YTDLP_PROXY_URL é obrigatório em produção para impor a fronteira de saída SSRF.');
if (!['lax', 'strict', 'none'].includes(SESSION_COOKIE_SAME_SITE)) throw new Error('SESSION_COOKIE_SAME_SITE deve ser lax, strict ou none.');
if (SESSION_COOKIE_SAME_SITE === 'none' && !IS_PRODUCTION) throw new Error('SameSite=None só pode ser usado com cookies Secure em produção.');

for (const directory of [DATA_DIR, DOWNLOAD_DIR, HISTORY_DIR]) {
    fs.mkdirSync(directory, { recursive: true });
}

const DATABASE_PATH = resolveConfiguredPath(process.env.DATABASE_PATH, path.join(DATA_DIR, 'tubematex.sqlite'));
const database = new sqlite3.Database(DATABASE_PATH);
const redisDisabled = /^(1|true|yes)$/i.test(String(process.env.REDIS_DISABLED || ''));
const redisConfigured = !redisDisabled && Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
const QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME || 'tubematex-downloads';
const BULLMQ_ROLE = process.env.BULLMQ_ROLE || 'both';
const BULLMQ_RETENTION_SECONDS = 2 * 60 * 60;
const BULL_CONNECTION = process.env.REDIS_URL ? { url: process.env.REDIS_URL, maxRetriesPerRequest: null } : { host: process.env.REDIS_HOST || 'redis', port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined, username: process.env.REDIS_USERNAME || undefined, maxRetriesPerRequest: null };
const distributedQueue = redisConfigured ? new Queue(QUEUE_NAME, { connection: BULL_CONNECTION, defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 24 * 60 * 60, count: 2000 }, removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 } } }) : null;
const redisClient = redisConfigured ? createClient(process.env.REDIS_URL ? { url: process.env.REDIS_URL } : {
    socket: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379) },
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined
}) : null;
if (redisClient) redisClient.on('error', error => console.error('[redis]', error.message));
const redisReady = redisClient ? redisClient.connect() : Promise.resolve();
const eventSubscriber = redisClient && ['api', 'both'].includes(BULLMQ_ROLE) ? redisClient.duplicate() : null;
const cancelSubscriber = redisClient && ['worker', 'both'].includes(BULLMQ_ROLE) ? redisClient.duplicate() : null;
const redisChannelsReady = Promise.all([eventSubscriber?.connect(), cancelSubscriber?.connect()].filter(Boolean));
const sessionStore = redisClient ? new RedisStore({ client: redisClient, prefix: 'tubematex:sess:' }) : new SQLiteStore({ db: 'sessions.sqlite', dir: resolveConfiguredPath(process.env.SESSION_DB_DIR, DATA_DIR) });
const databaseReady = new Promise((resolve, reject) => database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        display_name TEXT,
        email TEXT,
        avatar TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider, provider_id)
    );
    CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        title TEXT,
        thumbnail TEXT,
        format TEXT,
        format_label TEXT,
        quality TEXT,
        quality_label TEXT,
        site TEXT,
        size INTEGER,
        file_name TEXT,
        stored_name TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        download_url TEXT,
        favorite INTEGER NOT NULL DEFAULT 0,
        favorite_at TEXT
    );
    CREATE INDEX IF NOT EXISTS downloads_owner_created_idx ON downloads(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS downloads_owner_favorite_idx ON downloads(owner_id, favorite);
    CREATE TABLE IF NOT EXISTS admin_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        base_url TEXT NOT NULL,
        allowed_domains_json TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'vod',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_catalog_items (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        thumbnail_url TEXT,
        external_url TEXT NOT NULL,
        media_url TEXT,
        stream_type TEXT NOT NULL DEFAULT 'auto',
        country TEXT,
        language TEXT,
        categories_json TEXT NOT NULL DEFAULT '[]',
        feed_name TEXT,
        is_live INTEGER NOT NULL DEFAULT 0,
        is_featured INTEGER NOT NULL DEFAULT 0,
        approval_status TEXT NOT NULL DEFAULT 'pending',
        health_status TEXT NOT NULL DEFAULT 'unknown',
        health_code INTEGER,
        health_label TEXT,
        health_checked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(source_id) REFERENCES admin_sources(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS admin_catalog_public_idx ON admin_catalog_items(approval_status, is_featured, updated_at DESC);
    CREATE INDEX IF NOT EXISTS admin_catalog_source_idx ON admin_catalog_items(source_id);
`, error => error ? reject(error) : resolve()));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => database.run(sql, params, function onRun(error) { if (error) reject(error); else resolve(this); }));
const dbGet = (sql, params = []) => new Promise((resolve, reject) => database.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const dbAll = (sql, params = []) => new Promise((resolve, reject) => database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));

function adminHashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const derived = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
    return `scrypt$16384$8$1$${salt}$${derived}`;
}
function adminVerifyHash(password, encoded) {
    const parts = String(encoded || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, salt, expected] = parts;
    try {
        const actual = crypto.scryptSync(String(password), salt, 64, { N: Number(n), r: Number(r), p: Number(p) }).toString('hex');
        return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
    } catch { return false; }
}
async function verifyAdminPassword(password) {
    if (ADMIN_PASSWORD_HASH) return adminVerifyHash(password, ADMIN_PASSWORD_HASH);
    if (IS_PRODUCTION || !ADMIN_PASSWORD) return false;
    const actual = Buffer.from(String(password)); const expected = Buffer.from(ADMIN_PASSWORD);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function adminConfigured() { return Boolean(ADMIN_USERNAME && (ADMIN_PASSWORD_HASH || (!IS_PRODUCTION && ADMIN_PASSWORD))); }
function adminSessionValid(req) { return Boolean(req.session?.admin?.username && req.session.admin.expiresAt > Date.now()); }
function requireAdmin(req, res, next) { if (!adminSessionValid(req)) return res.status(401).json({ error: 'Sessão administrativa necessária.' }); next(); }
function requireAdminCsrf(req, res, next) { const token = req.get('X-Admin-CSRF'); if (!token || token !== req.session?.admin?.csrf) return res.status(403).json({ error: 'Token administrativo inválido.' }); next(); }
function jsonArray(value, fallback = []) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : fallback; } catch { return fallback; } }
function adminSourceRow(row) { return { id: row.id, name: row.name, description: row.description || '', baseUrl: row.base_url, allowedDomains: jsonArray(row.allowed_domains_json), kind: row.kind, enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at }; }
function adminCatalogRow(row) { return { id: row.id, sourceId: row.source_id, sourceName: row.source_name || '', contentType: row.content_type, title: row.title, description: row.description || '', thumbnailUrl: row.thumbnail_url || '', externalUrl: row.external_url, mediaUrl: row.media_url || '', streamType: row.stream_type, country: row.country || '', language: row.language || '', categories: jsonArray(row.categories_json), feedName: row.feed_name || '', isLive: Boolean(row.is_live), isFeatured: Boolean(row.is_featured), approvalStatus: row.approval_status, healthStatus: row.health_status, healthCode: row.health_code || null, healthLabel: row.health_label || '', healthCheckedAt: row.health_checked_at || null, createdAt: row.created_at, updatedAt: row.updated_at }; }
function cleanText(value, max = 5000) { return String(value || '').trim().slice(0, max); }
function adminAllowedHostname(url, domains) { try { const hostname = new URL(url).hostname.toLowerCase(); return domains.some(domain => { const normalized = String(domain || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, ''); return normalized && (hostname === normalized || hostname.endsWith(`.${normalized}`)); }); } catch { return false; } }
async function adminValidateUrl(url, domains, label) { const safe = await validateUrl(url); if (!safe || (IS_PRODUCTION && !safe.startsWith('https://'))) throw new Error(`${label} inválida, insegura ou bloqueada.`); if (!adminAllowedHostname(safe, domains)) throw new Error(`${label} não pertence à allowlist da fonte.`); return safe; }
async function validateAdminMedia({ mediaUrl, streamType, allowedDomains }) {
    if (!mediaUrl) return { status: 'not-configured', code: null, label: 'Sem media configurada' };
    const safe = await adminValidateUrl(mediaUrl, allowedDomains, 'URL de media');
    let response = await fetch(safe, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (response.status === 405) {
        response = await fetch(safe, { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
        response.body?.cancel().catch(() => {});
    }
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const type = String(streamType || 'auto').toLowerCase();
    const expected = type === 'hls' || /mpegurl|\.m3u8/i.test(safe) ? 'hls' : type === 'dash' || /dash|\.mpd/i.test(safe) ? 'dash' : type;
    const compatible = response.ok && (expected === 'hls' ? /mpegurl|m3u8|octet-stream/.test(contentType) : expected === 'dash' ? /dash|xml|octet-stream/.test(contentType) : expected === 'mp4' ? /mp4|video|octet-stream/.test(contentType) : expected === 'webm' ? /webm|video|octet-stream/.test(contentType) : /video|audio|mpegurl|dash|octet-stream/.test(contentType));
    const redirected = response.status >= 300 && response.status < 400;
    return { status: redirected ? 'redirect' : compatible ? 'online' : response.ok ? 'incompatible' : 'offline', code: response.status, label: redirected ? `Redirect bloqueado · ${response.status}` : compatible ? `${expected === 'auto' ? 'media' : expected.toUpperCase()} online` : `HTTP ${response.status} · ${contentType || 'tipo desconhecido'}` };
}

let adminCatalogCache = { expiresAt: 0, value: [] };
async function loadApprovedAdminCatalog() {
    if (adminCatalogCache.expiresAt > Date.now()) return adminCatalogCache.value;
    await databaseReady;
    const rows = await dbAll(`SELECT i.*, s.name AS source_name FROM admin_catalog_items i JOIN admin_sources s ON s.id = i.source_id WHERE i.approval_status = 'approved' AND s.enabled = 1 ORDER BY i.is_featured DESC, i.updated_at DESC LIMIT 500`);
    adminCatalogCache = { expiresAt: Date.now() + 30 * 1000, value: rows.map(adminCatalogRow) };
    return adminCatalogCache.value;
}
function clearAdminCatalogCache() { adminCatalogCache = { expiresAt: 0, value: [] }; }
function publicAdminCatalogItem(item) {
    const url = item.mediaUrl || item.externalUrl;
    const isLive = Boolean(item.isLive || item.contentType === 'channel');
    return { id: `admin-${item.id}`, title: item.title, url, externalUrl: item.externalUrl, thumbnail: item.thumbnailUrl || null, description: item.description || '', duration: 0, site: item.sourceName || 'Fonte autorizada', uploader: item.feedName || item.country || '', kind: item.contentType === 'channel' ? 'live' : (item.contentType === 'film' ? 'film' : 'series'), metadataOnly: !item.mediaUrl, publicPlayback: Boolean(item.mediaUrl && item.healthStatus === 'online'), live: isLive, directStream: Boolean(item.mediaUrl && item.healthStatus === 'online'), country: item.country || '', language: item.language || '', categories: item.categories || [], quality: '', availabilityLabel: item.healthLabel || '', sourceId: item.sourceId, feedName: item.feedName || '', streamType: item.streamType, streamAvailable: Boolean(item.mediaUrl && item.healthStatus === 'online') };
}
async function fetchApprovedAdminDiscovery(query = '', limit = 18, filters = {}) {
    const items = await loadApprovedAdminCatalog(); const term = String(query || '').trim().toLowerCase();
    return items.filter(item => item.mediaUrl && item.healthStatus === 'online' && ['por', 'eng'].includes(normalizedLanguage(item.language)) && (!filters.type || item.contentType === filters.type) && (!filters.category || item.categories.includes(filters.category)) && (!term || `${item.title} ${item.description} ${(item.categories || []).join(' ')} ${item.sourceName}`.toLowerCase().includes(term))).slice(0, Math.min(Number(limit) || 18, 60)).map(publicAdminCatalogItem);
}

const jobs = new Map();
const cancelledJobIds = new Set();
const jobEventClients = new Map();
const infoCache = new Map();
const queue = [];
let activeJobs = 0;
const pausedOwners = new Set();
const INFO_CACHE_MS = 5 * 60 * 1000;
const { fetchInfo, fetchPlaylistInfo, errorCode, translateError } = createMediaService({ ytdlp, ytdlpCommonOptions: YT_DLP_COMMON_OPTIONS, infoCache, infoCacheMs: INFO_CACHE_MS });

const SEARCH_PROVIDER_LABELS = { ytsearch: 'YouTube', scsearch: 'SoundCloud', vimeo: 'Vimeo', twitch: 'Twitch' };
const IPTV_PLAYLIST_SOURCES = [
    { id: 'iptv-org-verified', label: 'IPTV-org · canais PT/EN', url: 'https://iptv-org.github.io/api/', safety: 'filtered', note: 'Todas as categorias, desde que o idioma seja português ou inglês e a stream HTTPS passe validação; DRM, autenticação, bloqueios e headers externos não são contornados.' }
];
const TMDB_API_KEY = String(process.env.TMDB_API_KEY || '').trim();
const TMDB_LANGUAGE = String(process.env.TMDB_LANGUAGE || 'pt-PT').trim();
const TMDB_REGION = String(process.env.TMDB_REGION || 'PT').trim().toUpperCase();
const TMDB_BEARER = String(process.env.TMDB_BEARER_TOKEN || '').trim();
const CATALOG_CACHE_MS = 10 * 60 * 1000;
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim();
const ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH || '').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;
const ADMIN_ALLOWED_TYPES = new Set(['channel', 'film', 'series', 'anime', 'dorama', 'documentary', 'vod']);
const ADMIN_STREAM_TYPES = new Set(['auto', 'hls', 'dash', 'mp4', 'webm']);
const ADMIN_APPROVAL_STATUSES = new Set(['pending', 'needs-review', 'rejected', 'approved']);
const ENTERTAINMENT_CATALOG_SOURCES = [
    { id: 'iptv-org', label: 'IPTV-org', mode: 'live', policy: 'Canais públicos submetidos pela comunidade; disponibilidade e direitos devem ser verificados na origem.', url: 'https://github.com/iptv-org/iptv' },
    { id: 'internet-archive', label: 'Internet Archive', mode: 'vod', policy: 'VOD público apenas quando o item expõe ficheiro de media e metadata/licença na origem.', url: 'https://archive.org/' },
    { id: 'tmdb', label: 'TMDB', mode: 'metadata', configured: Boolean(TMDB_API_KEY || TMDB_BEARER), policy: 'Metadata, popularidade e provedores oficiais; não redistribui filmes ou séries.', url: 'https://www.themoviedb.org/' },
    { id: 'anilist', label: 'AniList', mode: 'metadata', configured: true, policy: 'Metadata pública de anime; reprodução depende da fonte oficial.', url: 'https://anilist.co/' },
    { id: 'tvmaze', label: 'TVmaze', mode: 'metadata', configured: true, policy: 'Metadata pública de séries e episódios; não fornece streams de terceiros.', url: 'https://www.tvmaze.com/' }
];
const SUPPORTED_PLATFORMS = [
    { id: 'youtube', label: 'YouTube', mode: 'download' }, { id: 'youtube-music', label: 'YouTube Music', mode: 'download' },
    { id: 'soundcloud', label: 'SoundCloud', mode: 'download' }, { id: 'vimeo', label: 'Vimeo', mode: 'download' },
    { id: 'twitch', label: 'Twitch', mode: 'download' }, { id: 'dailymotion', label: 'Dailymotion', mode: 'download' },
    { id: 'bandcamp', label: 'Bandcamp', mode: 'download' }, { id: 'audiomack', label: 'Audiomack', mode: 'download' },
    { id: 'mixcloud', label: 'Mixcloud', mode: 'download' }, { id: 'tiktok', label: 'TikTok', mode: 'download' },
    { id: 'instagram', label: 'Instagram', mode: 'download', note: 'Pode exigir URL pública ou autenticação.' },
    { id: 'facebook', label: 'Facebook', mode: 'download', note: 'Pode exigir URL pública ou autenticação.' },
    { id: 'reddit', label: 'Reddit', mode: 'download' }, { id: 'bilibili', label: 'Bilibili', mode: 'download' },
    { id: 'kick', label: 'Kick', mode: 'download' }, { id: 'archive', label: 'Archive.org', mode: 'download' },
    { id: 'audius', label: 'Audius', mode: 'download' }, { id: 'apple-podcasts', label: 'Apple Podcasts', mode: 'download' },
    { id: 'spotify', label: 'Spotify', mode: 'metadata-only', note: 'O catálogo usa áudio protegido; pesquisa numa fonte autorizada é necessária.' },
    { id: 'apple-music', label: 'Apple Music', mode: 'metadata-only', note: 'As faixas do catálogo usam proteção; Apple Music Connect pode ser compatível.' }
];
const SEARCH_PROVIDERS = [...new Set(String(process.env.SEARCH_PROVIDERS || 'ytsearch,scsearch,vimeo,twitch').split(',').map(value => value.trim().toLowerCase()).filter(value => SEARCH_PROVIDER_LABELS[value]))];
const videoQualities = {
    auto: 'Automática',
    1080: 'Até 1080p',
    720: 'Até 720p',
    480: 'Até 480p'
};

const allowedFormats = {
    mp4: { label: 'MP4', type: 'video', args: ['-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4'] },
    webm: { label: 'WEBM', type: 'video', args: ['-f', 'bv*[ext=webm]+ba[ext=webm]/b[ext=webm]/b', '--merge-output-format', 'webm'] },
    best: { label: 'Melhor qualidade', type: 'video', args: ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4'] },
    mp3: { label: 'MP3', type: 'audio', args: ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0'] },
    opus: { label: 'OPUS', type: 'audio', args: ['-f', 'ba/b', '-x', '--audio-format', 'opus', '--audio-quality', '0'] }
};

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT || 180),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados pedidos. Tenta novamente dentro de alguns minutos.' }
});

const downloadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: Number(process.env.DOWNLOAD_RATE_LIMIT || 20),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Atingiste o limite de downloads por hora. Tenta novamente mais tarde.' }
});

app.set('trust proxy', 1);
app.use((req, res, next) => {
    const supplied = String(req.get('X-Request-Id') || '');
    req.requestId = /^[a-zA-Z0-9._:-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const startedAt = process.hrtime.bigint();
    requestMetrics.total += 1;
    res.once('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        requestMetrics.durationTotalMs += durationMs;
        requestMetrics.durationMaxMs = Math.max(requestMetrics.durationMaxMs, durationMs);
        if (res.statusCode >= 400 && res.statusCode < 500) requestMetrics.errors4xx += 1;
        if (res.statusCode >= 500) requestMetrics.errors5xx += 1;
        logEvent(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http.request', { requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs * 100) / 100, ip: req.ip });
    });
    next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.ALLOWED_ORIGIN) {
        res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    next();
});

app.use(session({
    name: SESSION_COOKIE_NAME,
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: IS_PRODUCTION,
    cookie: { path: '/', httpOnly: true, secure: IS_PRODUCTION, sameSite: SESSION_COOKIE_SAME_SITE, maxAge: SESSION_MAX_AGE_MS }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
    res.cookie = (name, value, options = {}) => {
        const attributes = [`${name}=${encodeURIComponent(value)}`];
        attributes.push(`Path=${options.path || '/'}`);
        if (options.maxAge) attributes.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
        if (options.httpOnly) attributes.push('HttpOnly');
        if (options.secure) attributes.push('Secure');
        attributes.push(`SameSite=${options.sameSite || 'Lax'}`);
        const existing = res.getHeader('Set-Cookie');
        const cookies = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
        res.setHeader('Set-Cookie', [...cookies, attributes.join('; ')]);
    };
    next();
});

async function upsertGoogleUser(profile) {
    await databaseReady;
    const now = new Date().toISOString();
    const id = `google-${String(profile.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const displayName = profile.displayName || profile.name?.givenName || 'Utilizador Google';
    const email = profile.emails?.[0]?.value || null;
    const avatar = profile.photos?.[0]?.value || null;
    await dbRun(`INSERT INTO users (id, provider, provider_id, display_name, email, avatar, created_at, updated_at)
        VALUES (?, 'google', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_id) DO UPDATE SET display_name=excluded.display_name, email=excluded.email, avatar=excluded.avatar, updated_at=excluded.updated_at`, [id, profile.id, displayName, email, avatar, now, now]);
    return { id, displayName, email, avatar, provider: 'google' };
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        await databaseReady;
        const user = await dbGet('SELECT id, display_name AS displayName, email, avatar, provider FROM users WHERE id = ?', [id]);
        done(null, user || false);
    } catch (error) { done(error); }
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/auth/google/callback`
    }, async (accessToken, refreshToken, profile, done) => {
        try { done(null, await upsertGoogleUser(profile)); } catch (error) { done(error); }
    }));
}

function parseCookies(req) {
    const header = req.headers.cookie || '';
    return header.split(';').reduce((cookies, part) => {
        const index = part.indexOf('=');
        if (index === -1) return cookies;
        const key = part.slice(0, index).trim();
        const value = decodeURIComponent(part.slice(index + 1).trim());
        cookies[key] = value;
        return cookies;
    }, {});
}

function getVisitorId(req, res) {
    const cookies = parseCookies(req);
    const authenticatedId = req.isAuthenticated && req.isAuthenticated() && req.user?.id;
    if (authenticatedId) return `user-${String(authenticatedId).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    if (cookies.tubematex_visitor && /^[a-f0-9]{32}$/.test(cookies.tubematex_visitor)) return cookies.tubematex_visitor;
    const visitorId = crypto.randomBytes(16).toString('hex');
    res.cookie('tubematex_visitor', visitorId, {
        path: '/',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: 'Lax'
    });
    return visitorId;
}

function historyRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        title: row.title,
        thumbnail: row.thumbnail,
        format: row.format,
        formatLabel: row.format_label,
        quality: row.quality,
        qualityLabel: row.quality_label,
        site: row.site,
        size: row.size,
        fileName: row.file_name,
        storedName: row.stored_name,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        downloadUrl: row.download_url,
        favorite: Boolean(row.favorite),
        favoriteAt: row.favorite_at
    };
}

async function loadHistory(ownerId) {
    await databaseReady;
    const rows = await dbAll('SELECT * FROM downloads WHERE owner_id = ? ORDER BY COALESCE(completed_at, created_at) DESC LIMIT ?', [ownerId, MAX_HISTORY]);
    return rows.map(historyRow);
}

async function saveHistory(ownerId, items) {
    await databaseReady;
    await dbRun('DELETE FROM downloads WHERE owner_id = ?', [ownerId]);
    for (const entry of items.slice(0, MAX_HISTORY)) await addHistory(ownerId, entry);
}

async function addHistory(ownerId, entry) {
    await databaseReady;
    const previous = await dbGet('SELECT favorite, favorite_at FROM downloads WHERE id = ? AND owner_id = ?', [entry.id, ownerId]);
    const favorite = entry.favorite ?? Boolean(previous?.favorite);
    await dbRun(`INSERT INTO downloads (id, owner_id, title, thumbnail, format, format_label, quality, quality_label, site, size, file_name, stored_name, created_at, completed_at, download_url, favorite, favorite_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, title=excluded.title, thumbnail=excluded.thumbnail, format=excluded.format, format_label=excluded.format_label, quality=excluded.quality, quality_label=excluded.quality_label, site=excluded.site, size=excluded.size, file_name=excluded.file_name, stored_name=excluded.stored_name, created_at=excluded.created_at, completed_at=excluded.completed_at, download_url=excluded.download_url, favorite=excluded.favorite, favorite_at=excluded.favorite_at`, [
        entry.id, ownerId, entry.title || null, entry.thumbnail || null, entry.format || null, entry.formatLabel || null, entry.quality || null, entry.qualityLabel || null, entry.site || null, entry.size || null, entry.fileName || null, entry.storedName || null, entry.createdAt || new Date().toISOString(), entry.completedAt || null, entry.downloadUrl || `/api/downloads/${entry.id}/file`, favorite ? 1 : 0, favorite ? (entry.favoriteAt || previous?.favorite_at || new Date().toISOString()) : null
    ]);
}

function clientHistory(items) {
    return items.map(({ storedName, ...entry }) => entry);
}

const conversionFormats = {
    mp3: { extension: 'mp3', type: 'audio', args: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'] },
    opus: { extension: 'opus', type: 'audio', args: ['-vn', '-c:a', 'libopus', '-b:a', '160k'] },
    mp4: { extension: 'mp4', type: 'video', args: ['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart'] },
    webm: { extension: 'webm', type: 'video', args: ['-c:v', 'libvpx-vp9', '-c:a', 'libopus', '-deadline', 'good'] }
};

function convertMedia(inputPath, outputPath, preset) {
    return new Promise((resolve, reject) => {
        const child = spawn(FFMPEG_LOCATION ? path.join(FFMPEG_LOCATION, 'ffmpeg.exe') : 'ffmpeg', ['-y', '-i', inputPath, ...preset.args, '-fs', String(MAX_DOWNLOAD_SIZE), outputPath], { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = ''; let settled = false;
        const timer = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 5000).unref(); }, CONVERSION_TIMEOUT_MS);
        const finish = error => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(); };
        child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
        child.on('error', finish);
        child.on('close', code => code === 0 ? finish() : finish(new Error(stderr.slice(-500) || (code === null ? 'Tempo limite de conversão excedido.' : 'A conversão falhou.'))));
    });
}

function storedPath(storedName) {
    if (!storedName || path.basename(storedName) !== storedName) return null;
    const candidate = path.join(DOWNLOAD_DIR, storedName);
    return candidate.startsWith(`${DOWNLOAD_DIR}${path.sep}`) ? candidate : null;
}

async function clearHistory(ownerId) {
    const items = await loadHistory(ownerId);
    for (const item of items) {
        const job = jobs.get(item.id);
        const filePath = job?.filePath || storedPath(item.storedName);
        if (filePath && fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    }
    await databaseReady;
    await dbRun('DELETE FROM downloads WHERE owner_id = ?', [ownerId]);
}

async function migrateLegacyHistory() {
    await databaseReady;
    const files = fs.readdirSync(HISTORY_DIR).filter(file => file.endsWith('.json'));
    for (const file of files) {
        const ownerId = path.basename(file, '.json');
        try {
            const value = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), 'utf8'));
            if (Array.isArray(value) && value.length) {
                const existing = await dbGet('SELECT COUNT(*) AS count FROM downloads WHERE owner_id = ?', [ownerId]);
                if (!existing?.count) for (const entry of value) await addHistory(ownerId, entry);
            }
            fs.renameSync(path.join(HISTORY_DIR, file), path.join(HISTORY_DIR, `${file}.migrated`));
        } catch (error) { console.error('[history:migrate]', file, error.message); }
    }
}

async function mergeOwnerHistory(visitorOwnerId, accountOwnerId) {
    if (!visitorOwnerId || visitorOwnerId === accountOwnerId) return;
    const visitorItems = await loadHistory(visitorOwnerId);
    for (const item of visitorItems) await addHistory(accountOwnerId, item);
    if (visitorItems.length) await dbRun('DELETE FROM downloads WHERE owner_id = ?', [visitorOwnerId]);
}

function libraryQuery(items, params = {}) {
    const query = String(params.q || '').trim().toLowerCase();
    const format = String(params.format || 'all').toLowerCase();
    const site = String(params.site || 'all').trim().toLowerCase();
    const favorite = String(params.favorite || 'all').toLowerCase();
    const sort = String(params.sort || 'recent').toLowerCase();
    const filtered = items.filter(item => {
        const haystack = [item.title, item.site, item.format, item.formatLabel, item.qualityLabel].filter(Boolean).join(' ').toLowerCase();
        const formatMatches = format === 'all' || (format === 'video' ? !['mp3', 'opus'].includes(String(item.format).toLowerCase()) : format === 'audio' ? ['mp3', 'opus'].includes(String(item.format).toLowerCase()) : String(item.format).toLowerCase() === format);
        const siteMatches = site === 'all' || String(item.site || '').toLowerCase() === site;
        const favoriteMatches = favorite !== 'true' || item.favorite === true;
        return (!query || haystack.includes(query)) && formatMatches && siteMatches && favoriteMatches;
    });
    filtered.sort((a, b) => {
        if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'pt');
        if (sort === 'oldest') return new Date(a.completedAt || a.createdAt) - new Date(b.completedAt || b.createdAt);
        return new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt);
    });
    return filtered;
}

async function validateUrl(value) {
    return validatePublicHttpUrl(value);
}

function publicJob(job) {
    return {
        id: job.id,
        status: job.status,
        progress: job.progress,
        title: job.title,
        thumbnail: job.thumbnail,
        format: job.format,
        formatLabel: allowedFormats[job.format]?.label || job.format,
        quality: job.quality || 'auto',
        qualityLabel: allowedFormats[job.format]?.type === 'video' ? (videoQualities[job.quality] || videoQualities.auto) : null,
        site: job.site,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        downloadUrl: job.status === 'completed' ? `/api/downloads/${job.id}/file` : null
    };
}

function jobStateKey(id) { return `tubematex:job:${id}`; }
function jobEventChannel(id) { return `tubematex:job-events:${id}`; }
function jobCancelChannel(id) { return `tubematex:job-cancel:${id}`; }

function persistJobState(job) {
    if (!redisClient?.isReady) return;
    const state = { ...publicJob(job), ownerId: job.ownerId, filePath: job.filePath || null, fileName: job.fileName || null, storedName: job.filePath ? path.basename(job.filePath) : null };
    redisClient.set(jobStateKey(job.id), JSON.stringify(state), { EX: BULLMQ_RETENTION_SECONDS }).catch(error => console.error('[redis:job-state]', error.message));
}

function emit(job, patch = {}) {
    Object.assign(job, patch, { updatedAt: Date.now() });
    const publicState = publicJob(job);
    const payload = `event: update\ndata: ${JSON.stringify(publicState)}\n\n`;
    if (!eventSubscriber) for (const client of job.clients || []) client.write(payload);
    persistJobState(job);
    if (redisClient?.isReady) redisClient.publish(jobEventChannel(job.id), payload).catch(error => console.error('[redis:job-event]', error.message));
}

async function loadDistributedJob(id) {
    if (!redisClient?.isReady) return null;
    try { return JSON.parse(await redisClient.get(jobStateKey(id)) || 'null'); } catch (error) { console.error('[redis:job-read]', error.message); return null; }
}

function eventState(message) {
    const line = String(message).split('\n').find(item => item.startsWith('data: '));
    try { return line ? JSON.parse(line.slice(6)) : null; } catch { return null; }
}

async function configureRedisChannels() {
    if (eventSubscriber) await eventSubscriber.pSubscribe('tubematex:job-events:*', (message, channel) => {
        const id = channel.slice('tubematex:job-events:'.length);
        const state = eventState(message);
        const localJob = jobs.get(id);
        if (localJob && state) Object.assign(localJob, state, { updatedAt: Date.now() });
        for (const client of jobEventClients.get(id) || []) client.write(message);
    });
    if (cancelSubscriber) await cancelSubscriber.pSubscribe('tubematex:job-cancel:*', (message, channel) => {
        const id = channel.slice('tubematex:job-cancel:'.length);
        cancelledJobIds.add(id);
        const job = jobs.get(id);
        if (job) {
            job.cancelled = true;
            if (job.process?.kill) job.process.kill('SIGTERM');
        }
    });
}

function parseProgress(line) {
    const match = line.match(/(?:\[download\]\s*)?(\d+(?:\.\d+)?)%.*?(?:at\s+([^\s]+))?.*?(?:ETA\s+([^\s]+))?/i);
    if (!match) return null;
    const percent = Math.max(0, Math.min(100, Number(match[1])));
    return { percent, speed: match[2] || null, eta: match[3] || null };
}

function safeFileName(title, format) {
    const clean = String(title || 'tubematex-download')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._ -]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 110) || 'tubematex-download';
    return `${clean}.${format}`;
}

function findOutputFile(job) {
    const candidates = fs.readdirSync(DOWNLOAD_DIR)
        .filter(file => file.startsWith(`${job.id}.`))
        .map(file => path.join(DOWNLOAD_DIR, file))
        .filter(file => fs.statSync(file).isFile())
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const expectedExt = job.format === 'mp3' || job.format === 'opus' ? job.format : job.format === 'webm' ? 'webm' : job.format === 'mp4' ? 'mp4' : null;
    return (expectedExt && candidates.find(file => path.extname(file).slice(1).toLowerCase() === expectedExt)) || candidates[0] || null;
}

function optionsFor(job) {
    const format = allowedFormats[job.format] || allowedFormats.mp4;
    const cap = format.type === 'video' && job.quality && job.quality !== 'auto' && videoQualities[job.quality] ? `[height<=${job.quality}]` : '';
    const options = {
        ...YT_DLP_COMMON_OPTIONS,
        noWarnings: true,
        noColor: true,
        newline: true,
        noPlaylist: true,
        restrictFilenames: true,
        maxFilesize: MAX_DOWNLOAD_SIZE,
        output: path.join(DOWNLOAD_DIR, `${job.id}.%(ext)s`),
        retries: 3,
        fragmentRetries: 3,
        extractorRetries: 2,
        socketTimeout: 20,
        ...(process.env.YTDLP_PROXY_URL ? { proxy: process.env.YTDLP_PROXY_URL } : {})
    };
    if (format.type === 'audio') {
        return { ...options, format: 'ba/b', extractAudio: true, audioFormat: job.format, audioQuality: '0' };
    }
    return {
        ...options,
        format: job.format === 'webm'
            ? `bv*${cap}[ext=webm]+ba/bv*${cap}[ext=webm]/bv*${cap}+ba/bv*${cap}`
            : job.format === 'best'
                ? `bv*${cap}+ba/bv*${cap}`
                : `bv*${cap}[ext=mp4]+ba/bv*${cap}[ext=mp4]/bv*${cap}+ba/bv*${cap}`,
        mergeOutputFormat: job.format === 'webm' ? 'webm' : 'mp4'
    };
}

function providerAvailable(provider) {
    return provider === 'vimeo' ? Boolean(process.env.VIMEO_ACCESS_TOKEN) : provider === 'twitch' ? Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_APP_ACCESS_TOKEN) : true;
}

async function searchVimeo(query, limit) {
    if (!process.env.VIMEO_ACCESS_TOKEN) return [];
    const response = await fetch(`https://api.vimeo.com/videos?query=${encodeURIComponent(query)}&per_page=${limit}&sort=relevant`, { headers: { Authorization: `Bearer ${process.env.VIMEO_ACCESS_TOKEN}`, Accept: 'application/vnd.vimeo.*+json;version=3.4' } });
    if (!response.ok) throw new Error(`Vimeo API respondeu HTTP ${response.status}`);
    const payload = await response.json();
    return (payload.data || []).map(item => ({ id: `vimeo-${item.uri || item.link}`, title: item.name || 'Resultado Vimeo', url: item.link, thumbnail: item.pictures?.sizes?.at(-1)?.link || null, duration: Number(item.duration || 0), site: 'Vimeo', uploader: item.user?.name || null, kind: 'video' }));
}

async function searchTwitch(query, limit) {
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_APP_ACCESS_TOKEN) return [];
    const response = await fetch(`https://api.twitch.tv/helix/search/channels?query=${encodeURIComponent(query)}&first=${limit}`, { headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${process.env.TWITCH_APP_ACCESS_TOKEN}` } });
    if (!response.ok) throw new Error(`Twitch API respondeu HTTP ${response.status}`);
    const payload = await response.json();
    return (payload.data || []).map(item => ({ id: `twitch-${item.id}`, title: item.display_name || item.broadcaster_name || 'Canal Twitch', url: `https://www.twitch.tv/${item.broadcaster_login}`, thumbnail: item.thumbnail_url || null, duration: 0, site: 'Twitch', uploader: item.display_name || null, kind: 'video', live: Boolean(item.is_live) }));
}

async function searchYtdlpProvider(provider, query, limit, type) {
    const result = await ytdlp(`${provider}${limit}:${query}`, { ...YT_DLP_COMMON_OPTIONS, flatPlaylist: true, dumpSingleJson: true, skipDownload: true, noWarnings: true, socketTimeout: 15 });
    const entries = Array.isArray(result?.entries) ? result.entries : [];
    return entries.filter(entry => entry && (entry.id || entry.url)).map(entry => ({
        id: `${provider}-${entry.id || crypto.createHash('sha1').update(String(entry.url)).digest('hex').slice(0, 12)}`,
        title: entry.title || 'Resultado sem título',
        url: entry.webpage_url || entry.original_url || entry.url || null,
        thumbnail: entry.thumbnail || (provider === 'ytsearch' && entry.id ? `https://i.ytimg.com/vi/${encodeURIComponent(entry.id)}/hqdefault.jpg` : null),
        duration: Number(entry.duration || 0),
        site: provider === 'scsearch' ? 'SoundCloud' : 'YouTube',
        uploader: entry.uploader || entry.channel || null,
        kind: type,
        playlistUrl: entry.playlist_webpage_url || entry.playlist_url || null
    })).filter(entry => entry.url);
}

async function runSearchProvider(provider, query, limit, type) {
    if (provider === 'vimeo') return searchVimeo(query, limit);
    if (provider === 'twitch') return searchTwitch(query, limit);
    return searchYtdlpProvider(provider, query, limit, type);
}

async function searchMedia(query, type = 'all', limit = 8, source = 'all') {
    const cleanQuery = String(query || '').trim().slice(0, 120);
    if (cleanQuery.length < 2) throw new Error('A pesquisa precisa de pelo menos 2 caracteres.');
    const providers = source === 'soundcloud' ? ['scsearch'] : source === 'youtube' ? ['ytsearch'] : source === 'vimeo' ? ['vimeo'] : source === 'twitch' ? ['twitch'] : (SEARCH_PROVIDERS.length ? SEARCH_PROVIDERS : ['ytsearch']);
    const perProvider = Math.min(8, Math.max(2, Math.ceil(limit / providers.length) + 2));
    const unavailableSources = providers.filter(provider => !providerAvailable(provider));
    const results = await Promise.allSettled(providers.map(provider => runSearchProvider(provider, cleanQuery, perProvider, type)));
    const grouped = results.map((result, index) => result.status === 'fulfilled' ? result.value : []);
    const merged = [];
    const seenUrls = new Set();
    for (let index = 0; merged.length < limit && index < Math.max(...grouped.map(group => group.length), 0); index += 1) {
        for (const group of grouped) {
            const item = group[index];
            const canonicalUrl = item?.url ? item.url.split('#')[0].replace(/\/$/, '').toLowerCase() : null;
            if (item && canonicalUrl && !seenUrls.has(canonicalUrl) && merged.length < limit) {
                seenUrls.add(canonicalUrl);
                merged.push(item);
            }
        }
    }
    return { results: merged, unavailableSources };
}

const DISCOVERY_TERMS = {
    music: ['lofi music', 'live acoustic session', 'indie music', 'jazz session', 'podcast'],
    social: ['creative short video', 'street food', 'dance performance', 'travel vlog'],
    entertainment: ['classic film', 'short film', 'anime opening', 'dorama trailer'],
    home: ['music live session', 'creative video', 'short documentary', 'film trailer']
};
const discoverCache = new Map();
let publicIptvCatalogCache = { expiresAt: 0, items: [] }; let publicIptvCatalogPromise = null;
const streamValidator = createStreamValidator();
const iptvHealthService = createIptvHealthService({ probeStream: streamValidator.probeStream, concurrency: Number(process.env.IPTV_VALIDATION_CONCURRENCY || 4), ttlMs: Number(process.env.IPTV_VALIDATION_TTL_MS || 30 * 60 * 1000) });
const archiveHealthService = createIptvHealthService({ probeStream: streamValidator.probeStream, concurrency: 3, ttlMs: 30 * 60 * 1000 });
const catalogSourceHealth = createCatalogSourceHealth({ env: process.env });
function normalizedLanguage(value) {
    const language = String(value || '').trim().toLowerCase().replace(/_/g, '-');
    if (/^(por|pt)(?:$|[-\s])/.test(language) || /portugu[eê]s/.test(language)) return 'por';
    if (/^(eng|en)(?:$|[-\s])/.test(language) || /english|ingl[eê]s/.test(language)) return 'eng';
    return null;
}
function shuffled(items) { return [...items].sort(() => Math.random() - 0.5); }
async function fetchSpotifyDiscovery(term, limit) {
    if (!process.env.SPOTIFY_ACCESS_TOKEN) return [];
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}&type=track&limit=${Math.min(limit, 10)}&market=${encodeURIComponent(process.env.SPOTIFY_MARKET || 'US')}`, { headers: { Authorization: `Bearer ${process.env.SPOTIFY_ACCESS_TOKEN}` } });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.tracks?.items || []).map(item => ({ id: `spotify-${item.id}`, title: item.name || 'Faixa Spotify', url: item.external_urls?.spotify, externalUrl: item.external_urls?.spotify, thumbnail: item.album?.images?.[0]?.url || null, duration: Math.round(Number(item.duration_ms || 0) / 1000), site: 'Spotify', uploader: item.artists?.map(artist => artist.name).join(', ') || null, kind: 'music', metadataOnly: true })).filter(item => item.url);
}
async function fetchAppleMusicDiscovery(term, limit) {
    if (!process.env.APPLE_MUSIC_DEVELOPER_TOKEN) return [];
    const storefront = process.env.APPLE_MUSIC_STOREFRONT || 'us';
    const response = await fetch(`https://api.music.apple.com/v1/catalog/${storefront}/search?term=${encodeURIComponent(term)}&types=songs&limit=${Math.min(limit, 10)}`, { headers: { Authorization: `Bearer ${process.env.APPLE_MUSIC_DEVELOPER_TOKEN}` } });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.results?.songs?.data || []).map(item => ({ id: `apple-music-${item.id}`, title: item.attributes?.name || 'Faixa Apple Music', url: item.attributes?.url, externalUrl: item.attributes?.url, thumbnail: item.attributes?.artwork?.url?.replace('{w}', '640').replace('{h}', '640') || null, duration: Math.round(Number(item.attributes?.durationInMillis || 0) / 1000), site: 'Apple Music', uploader: item.attributes?.artistName || null, kind: 'music', metadataOnly: true })).filter(item => item.url);
}
async function loadPublicIptvCatalog() {
    if (publicIptvCatalogCache.expiresAt > Date.now()) return publicIptvCatalogCache.items;
    if (publicIptvCatalogPromise) return publicIptvCatalogPromise;
    publicIptvCatalogPromise = (async () => {
        const previous = publicIptvCatalogCache.items;
        try {
            const urls = ['channels', 'streams', 'feeds', 'blocklist'].map(name => `https://iptv-org.github.io/api/${name}.json`);
            const timeoutMs = Math.max(1000, Number(process.env.IPTV_CATALOG_TIMEOUT_MS) || 45000);
            const [responses, logos] = await Promise.all([
                Promise.all(urls.map(url => fetch(url, { signal: AbortSignal.timeout(timeoutMs) }))),
                fetch('https://iptv-org.github.io/api/logos.json', { signal: AbortSignal.timeout(Math.min(timeoutMs, 8000)) })
                    .then(async response => response.ok ? response.json() : [])
                    .then(payload => Array.isArray(payload) ? payload : [])
                    .catch(() => [])
            ]);
            if (responses.some(response => !response.ok)) throw new Error(`IPTV-org respondeu HTTP ${responses.find(response => !response.ok)?.status || 'inválido'}`);
            const [channels, streams, feeds, blocklist] = await Promise.all(responses.map(response => response.json()));
            if (![channels, streams, feeds, blocklist].every(Array.isArray)) throw new Error('IPTV-org devolveu dados com formato inválido.');
            const blocked = new Set(blocklist.filter(item => item.reason === 'dmca' || item.reason === 'nsfw').map(item => item.channel));
            const logoByKey = new Map(logos.filter(logo => logo?.url && logo.in_use !== false).map(logo => [`${logo.channel}::${logo.feed || ''}`, logo.url]));
            const streamsByChannel = new Map(); for (const stream of streams) { const list = streamsByChannel.get(stream.channel) || []; list.push(stream); streamsByChannel.set(stream.channel, list); }
            const feedsByChannel = new Map(); for (const feed of feeds) { const list = feedsByChannel.get(feed.channel) || []; list.push(feed); feedsByChannel.set(feed.channel, list); }
            const items = channels.filter(channel => channel?.id && channel.country && !channel.is_nsfw && !blocked.has(channel.id)).map(channel => {
                const country = channel.country === 'UK' ? 'GB' : channel.country;
                const channelFeeds = feedsByChannel.get(channel.id) || [];
                const supportedFeeds = channelFeeds.filter(feed => (feed.languages || []).some(language => normalizedLanguage(language)));
                const supportedFeedIds = new Set(supportedFeeds.map(feed => feed.id));
                const channelStreams = (streamsByChannel.get(channel.id) || []).filter(stream => /^https?:\/\//i.test(stream.url || '') && !blocked.has(stream.channel) && supportedFeedIds.has(stream.feed));
                const categories = (Array.isArray(channel.categories) && channel.categories.length ? channel.categories : ['general']).map(value => String(value).toLowerCase());
                if (!supportedFeeds.length || !channelStreams.length) return null;
                const mainFeed = supportedFeeds.find(feed => feed.is_main) || supportedFeeds[0];
                const primaryStream = channelStreams.find(stream => stream.feed === mainFeed.id) || channelStreams[0];
                const primaryFeed = supportedFeeds.find(feed => feed.id === primaryStream.feed) || mainFeed;
                const languages = [...new Set((primaryFeed.languages || []).map(normalizedLanguage).filter(Boolean))];
                const logo = logoByKey.get(`${channel.id}::${primaryStream.feed || mainFeed.id}`) || logoByKey.get(`${channel.id}::`) || null;
                const streamAlternatives = channelStreams.map(stream => ({ url: stream.url, feed: stream.feed || null, label: stream.label || null, quality: stream.quality || null, referrer: stream.referrer || stream.referrer_url || null, userAgent: stream.user_agent || stream.userAgent || null, requiresExternalPlayer: Boolean(stream.referrer || stream.referrer_url || stream.user_agent || stream.userAgent) }));
                return { id: `iptv-${channel.id}`, channelId: channel.id, channelName: channel.name || channel.id, title: channel.name || channel.id, altNames: Array.isArray(channel.alt_names) ? channel.alt_names : [], url: primaryStream.url, externalUrl: channel.website || 'https://iptv-org.github.io/', thumbnail: logo, duration: 0, site: 'IPTV público · iptv-org', uploader: country, country, language: languages[0] || null, languages, categories, quality: primaryStream.quality || null, availabilityLabel: 'A aguardar verificação', feedCount: supportedFeeds.length, streamCount: streamAlternatives.length, feeds: supportedFeeds.map(feed => ({ id: feed.id, name: feed.name || null, languages: feed.languages || [], alt: feed.alt || null })), streams: streamAlternatives, referrer: primaryStream.referrer || primaryStream.referrer_url || null, userAgent: primaryStream.user_agent || primaryStream.userAgent || null, requiresExternalPlayer: Boolean(primaryStream.referrer || primaryStream.referrer_url || primaryStream.user_agent || primaryStream.userAgent), streamAvailable: true, kind: 'live', live: true, directStream: true };
            }).filter(Boolean);
            publicIptvCatalogCache = { expiresAt: Date.now() + 10 * 60 * 1000, items };
            return items;
        } catch (error) {
            if (previous.length) { publicIptvCatalogCache = { expiresAt: Date.now() + 30000, items: previous }; return previous; }
            throw error;
        }
    })();
    try { return await publicIptvCatalogPromise; } finally { publicIptvCatalogPromise = null; }
}
function filterPublicIptvCatalog(items, filters = {}) {
    const query = String(filters.query || '').trim().toLowerCase();
    const language = normalizedLanguage(filters.language);
    return items.filter(item => (!filters.country || item.country === String(filters.country).toUpperCase()) && (!language || item.languages.includes(language)) && (!filters.category || item.categories.includes(String(filters.category).toLowerCase())) && (!query || `${item.channelName} ${item.title} ${(item.altNames || []).join(' ')} ${(item.categories || []).join(' ')}`.toLowerCase().includes(query))).sort((a, b) => `${a.channelName} ${a.title}`.localeCompare(`${b.channelName} ${b.title}`, 'pt'));
}
async function getValidatedPublicIptvPage(limit, filters = {}) {
    const candidates = filterPublicIptvCatalog(await loadPublicIptvCatalog(), filters);
    const offset = Math.max(0, Number(filters.offset) || 0);
    const pageLimit = Math.max(1, Math.min(60, Number(limit) || 12));
    let snapshot = iptvHealthService.snapshot(candidates, { scheduleValidation: false });
    if (filters.scheduleValidation !== false) {
        if (snapshot.pendingCount === 0) {
            const batchSize = Math.max(1, Math.min(pageLimit, Number(filters.batchSize) || Number(process.env.IPTV_VALIDATION_BATCH_SIZE || 12)));
            const unverified = candidates.filter(item => !iptvHealthService.statusOf(item) && !iptvHealthService.isPending(item)).slice(0, batchSize);
            iptvHealthService.schedule(unverified);
            snapshot = iptvHealthService.snapshot(candidates, { scheduleValidation: false });
        }
    }
    const results = snapshot.items.slice(offset, offset + pageLimit);
    const validation = candidates.slice(offset, offset + pageLimit).map(item => {
        const status = iptvHealthService.statusOf(item);
        const state = status?.status || (iptvHealthService.isPending(item) ? 'checking' : 'unverified');
        return { channelId: item.channelId, channelName: item.channelName, language: item.language, categories: item.categories, status: state, label: status?.label || (state === 'checking' ? 'Verificação em curso' : 'A aguardar validação'), checkedAt: status?.checkedAt ? new Date(status.checkedAt).toISOString() : null, latencyMs: status?.latencyMs ?? null };
    });
    return { results, validation, total: snapshot.items.length, candidateCount: snapshot.totalCandidates, pendingValidationCount: snapshot.pendingCount, remainingValidationCount: snapshot.unknownCount, excludedCount: snapshot.failedCount, offset, limit: pageLimit, hasMore: offset + results.length < snapshot.items.length || snapshot.pendingCount > 0 || snapshot.unknownCount > 0 };
}
async function fetchPublicIptvDiscovery(limit, filters = {}) {
    return (await getValidatedPublicIptvPage(limit, { ...filters, scheduleValidation: false })).results;
}
async function fetchPublicIptvCount(filters = {}) {
    return (await getValidatedPublicIptvPage(60, { ...filters, scheduleValidation: false })).total;
}
async function fetchArchiveDiscovery(term, limit) {
    const query = encodeURIComponent(`mediatype:movies AND title:(${term})`);
    const signal = AbortSignal.timeout(8000);
    const response = await fetch(`https://archive.org/advancedsearch.php?q=${query}&fl[]=identifier&fl[]=title&rows=${Math.min(limit, 4)}&output=json`, { signal });
    if (!response.ok) return [];
    const docs = ((await response.json()).response?.docs || []).filter(doc => !/you[-_ ]?tube|youtubedl/i.test(`${doc.identifier || ''} ${doc.title || ''}`));
    const items = await Promise.all(docs.map(async doc => { try { const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, { signal }); if (!metadataResponse.ok) return null; const metadata = await metadataResponse.json(); const rawLanguages = Array.isArray(metadata.metadata?.language) ? metadata.metadata.language : [metadata.metadata?.language || metadata.metadata?.languagecode || '']; const languages = [...new Set(rawLanguages.map(normalizedLanguage).filter(Boolean))]; if (!languages.length) return null; const file = (metadata.files || []).find(entry => /\.(mp4|webm|ogv|m4v)$/i.test(entry.name || '') && !entry.private); if (!file) return null; return { id: `archive-${doc.identifier}`, title: doc.title || doc.identifier, url: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(file.name)}`, externalUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`, thumbnail: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`, duration: 0, site: 'Internet Archive', uploader: 'Catálogo público', language: languages[0], languages, kind: 'film', publicPlayback: true }; } catch { return null; } }));
    const candidates = items.filter(Boolean);
    if (!candidates.length) return [];
    archiveHealthService.snapshot(candidates);
    await archiveHealthService.waitForIdle({ timeoutMs: 12000 }).catch(() => {});
    return archiveHealthService.snapshot(candidates, { scheduleValidation: false }).items;
}
async function fetchTmdbDiscovery(kind, limit, query = '') {
    if (!TMDB_API_KEY && !TMDB_BEARER) return [];
    const mediaType = kind === 'tv' ? 'tv' : 'movie';
    const endpoint = query ? `https://api.themoviedb.org/3/search/${mediaType}?query=${encodeURIComponent(query)}&include_adult=false&page=1` : `https://api.themoviedb.org/3/trending/${mediaType}/week`;
    const headers = { accept: 'application/json' }; if (TMDB_BEARER) headers.Authorization = `Bearer ${TMDB_BEARER}`;
    const authQuery = TMDB_BEARER ? '' : `&api_key=${encodeURIComponent(TMDB_API_KEY)}`;
    const response = await fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}language=${encodeURIComponent(TMDB_LANGUAGE)}&region=${encodeURIComponent(TMDB_REGION)}${authQuery}`, { headers });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.results || []).slice(0, Math.min(limit, 20)).map(item => ({
        id: `tmdb-${mediaType}-${item.id}`, title: item.title || item.name || 'Título TMDB', url: `https://www.themoviedb.org/${mediaType}/${item.id}`, externalUrl: `https://www.themoviedb.org/${mediaType}/${item.id}`, thumbnail: item.poster_path ? `https://image.tmdb.org/t/p/w780${item.poster_path}` : (item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null), duration: 0, site: 'TMDB', uploader: item.release_date || item.first_air_date || '', description: item.overview || '', kind: mediaType === 'tv' ? 'series' : 'film', metadataOnly: true, popularity: Number(item.popularity || 0), rating: Number(item.vote_average || 0), publicPlayback: false
    }));
}
async function fetchAniListDiscovery(query = '', limit = 12) {
    const document = `query($search:String,$perPage:Int!){Page(perPage:$perPage){media(type:ANIME,search:$search,sort:POPULARITY_DESC){id title{romaji english native} coverImage{extraLarge large} description episodes averageScore popularity seasonYear genres siteUrl}}}`;
    const response = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ query: document, variables: { search: query || null, perPage: Math.min(Math.max(limit, 1), 20) } }) });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.data?.Page?.media || []).map(item => ({ id: `anilist-${item.id}`, title: item.title?.english || item.title?.romaji || item.title?.native || 'Anime', url: item.siteUrl || `https://anilist.co/anime/${item.id}`, externalUrl: item.siteUrl || `https://anilist.co/anime/${item.id}`, thumbnail: item.coverImage?.extraLarge || item.coverImage?.large || null, duration: 0, site: 'AniList', uploader: item.seasonYear ? String(item.seasonYear) : '', description: String(item.description || '').replace(/<[^>]+>/g, '').slice(0, 500), kind: 'series', metadataOnly: true, categories: item.genres || [], episodes: Number(item.episodes || 0), popularity: Number(item.popularity || 0), rating: Number(item.averageScore || 0), publicPlayback: false }));
}
async function fetchTvmazeDiscovery(query = '', limit = 12) {
    const endpoint = query ? `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}` : 'https://api.tvmaze.com/shows?page=0';
    const response = await fetch(endpoint);
    if (!response.ok) return [];
    const payload = await response.json();
    const rows = query ? payload.map(item => item.show).filter(Boolean) : payload.slice(0, Math.min(limit * 2, 40));
    return rows.sort((a, b) => Number(b.rating?.average || 0) - Number(a.rating?.average || 0)).slice(0, Math.min(limit, 20)).map(item => ({ id: `tvmaze-${item.id}`, title: item.name || 'Série TVmaze', url: item.url || `https://www.tvmaze.com/shows/${item.id}`, externalUrl: item.url || `https://www.tvmaze.com/shows/${item.id}`, thumbnail: item.image?.original || item.image?.medium || null, duration: 0, site: 'TVmaze', uploader: item.premiered ? String(item.premiered).slice(0, 4) : '', description: String(item.summary || '').replace(/<[^>]+>/g, '').slice(0, 500), kind: 'series', metadataOnly: true, rating: Number(item.rating?.average || 0), genres: item.genres || [], publicPlayback: false }));
}
async function fetchLegalEntertainmentDiscovery(query = '', limit = 18) {
    const [archive, custom] = await Promise.all([
        fetchArchiveDiscovery(query || 'film', Math.min(limit, 4)).catch(() => []),
        fetchApprovedAdminDiscovery(query, limit).catch(() => [])
    ]);
    return uniqueMedia(interleaveMedia([custom, archive]).filter(item => item.publicPlayback && item.streamAvailable && !item.metadataOnly), limit);
}
const searchDiscovery = (...args) => searchMedia(...args).then(payload => payload.results || []).catch(() => []);
const entertainmentHomeCache = { expiresAt: 0, value: null };
function uniqueMedia(items, limit = 18) {
    const seen = new Set();
    return (items || []).filter(item => item?.url && !seen.has(item.url) && seen.add(item.url)).slice(0, limit);
}
function interleaveMedia(groups) {
    const output = []; const max = Math.max(0, ...(groups || []).map(group => group.length));
    for (let index = 0; index < max; index += 1) for (const group of groups || []) if (group[index]) output.push(group[index]);
    return output;
}
async function buildEntertainmentHome() {
    if (entertainmentHomeCache.expiresAt > Date.now() && entertainmentHomeCache.value) return entertainmentHomeCache.value;
    const jobs = [
        ['featured', 'Em destaque no Cine', Promise.all([fetchLegalEntertainmentDiscovery('', 8).catch(() => []), fetchPublicIptvDiscovery(8, { category: 'entertainment' }).catch(() => [])])],
        ['custom', 'Fontes autorizadas', fetchApprovedAdminDiscovery('', 18).catch(() => [])],
        ['films', 'Filmes reproduzíveis', Promise.all([fetchArchiveDiscovery('film', 4).catch(() => []), fetchApprovedAdminDiscovery('', 8, { type: 'film' }).catch(() => []), fetchPublicIptvDiscovery(8, { category: 'movies' }).catch(() => [])]).then(groups => interleaveMedia(groups))],
        ['series', 'Séries reproduzíveis', Promise.all([fetchApprovedAdminDiscovery('', 8, { type: 'series' }).catch(() => []), fetchPublicIptvDiscovery(8, { category: 'series' }).catch(() => [])]).then(groups => interleaveMedia(groups))],
        ['anime', 'Canais de animação', fetchPublicIptvDiscovery(8, { category: 'animation' }).catch(() => [])],
        ['dorama', 'Doramas e drama asiático', fetchApprovedAdminDiscovery('', 8, { category: 'dorama' }).catch(() => [])],
        ['documentary', 'Documentários e factual', fetchArchiveDiscovery('documentary', 10).catch(() => [])],
        ['news', 'Notícias ao vivo', fetchPublicIptvDiscovery(14, { category: 'news' }).catch(() => [])],
        ['live', 'Canais ao vivo públicos', fetchPublicIptvDiscovery(18, { category: 'entertainment' }).catch(() => [])],
        ['sports', 'Desporto ao vivo', fetchPublicIptvDiscovery(18, { category: 'sports' }).catch(() => [])],
        ['portugal', 'Portugal em direto', fetchPublicIptvDiscovery(18, { country: 'PT' }).catch(() => [])],
        ['brands', 'Cinema, ação e infantil', Promise.all(['AXN', 'Sony', 'Universal', 'Cine', 'Disney', 'FOX', 'Cartoon Network'].map(query => fetchPublicIptvDiscovery(8, { query }).catch(() => []))).then(groups => interleaveMedia(groups))]
    ];
    const settled = await Promise.all(jobs.map(async ([id, title, promise]) => {
        try {
            const value = await promise;
            const groups = Array.isArray(value) && value.every(item => Array.isArray(item)) ? value.flat() : value;
            return { id, title, items: uniqueMedia(groups, id === 'featured' ? 12 : 18) };
        } catch { return { id, title, items: [] }; }
    }));
    const featured = settled.find(row => row.id === 'featured')?.items || [];
    const hero = featured.find(item => item.thumbnail) || featured[0] || null;
    const value = { hero, rows: settled.filter(row => row.items.length), generatedAt: new Date().toISOString() };
    entertainmentHomeCache.expiresAt = Date.now() + 5 * 60 * 1000;
    entertainmentHomeCache.value = value;
    return value;
}
async function discoverMedia(area, limit) {
    const cacheKey = `${area}:${limit}`; const cached = discoverCache.get(cacheKey); if (cached && cached.expiresAt > Date.now()) return cached.value;
    const term = shuffled(DISCOVERY_TERMS[area] || DISCOVERY_TERMS.home)[0]; let results = [];
    if (area === 'music') { const groups = await Promise.all([searchDiscovery(term, 'music', limit, 'soundcloud'), searchDiscovery(term, 'music', limit, 'youtube'), fetchSpotifyDiscovery(term, limit).catch(() => []), fetchAppleMusicDiscovery(term, limit).catch(() => [])]); results = shuffled(groups.flat()).slice(0, limit); }
    else if (area === 'social') { const youtube = await searchDiscovery(term, 'video', limit, 'youtube'); const tiktokUrls = String(process.env.TIKTOK_DISCOVERY_URLS || '').split(',').map(value => value.trim()).filter(value => /^https?:\/\//i.test(value)).slice(0, limit); const tiktok = await Promise.all(tiktokUrls.map(async url => { try { const item = await fetchInfo(url); return { ...item, url, externalUrl: url, kind: 'video', site: 'TikTok' }; } catch { return null; } })); results = shuffled([...youtube, ...tiktok.filter(Boolean)]).slice(0, limit); }
    else if (area === 'entertainment') { const [archive, iptv] = await Promise.all([fetchArchiveDiscovery(term, Math.ceil(limit / 2)).catch(() => []), fetchPublicIptvDiscovery(Math.ceil(limit / 2)).catch(() => [])]); results = shuffled([...archive, ...iptv]).slice(0, limit); }
    else { const [video, music, archive] = await Promise.all([searchDiscovery(term, 'video', Math.ceil(limit / 3), 'youtube'), searchDiscovery(term, 'music', Math.ceil(limit / 3), 'soundcloud'), fetchArchiveDiscovery('short documentary', Math.ceil(limit / 3)).catch(() => [])]); results = shuffled([...video, ...music, ...archive]).slice(0, limit); }
    const value = { term, results }; discoverCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, value }); return value;
}

async function runJob(job) {
    activeJobs += 1;
    emit(job, { status: 'fetching', progress: { percent: 0, label: 'A analisar o conteúdo…' } });
    let info;
    try {
        info = await fetchInfo(job.url);
        if (job.cancelled || cancelledJobIds.has(job.id)) throw new Error('Download cancelado pelo utilizador.');
        Object.assign(job, info);
        emit(job, { status: 'queued', progress: { percent: 0, label: 'Preparado para descarregar' } });
        if (job.cancelled || cancelledJobIds.has(job.id)) throw new Error('Download cancelado pelo utilizador.');

        const child = ytdlp.exec(job.url, optionsFor(job));
        job.process = child;
        const downloadTimer = setTimeout(() => {
            job.timedOut = true;
            logEvent('warn', 'download.timeout', { requestId: job.requestId || null, jobId: job.id, ownerId: job.ownerId, timeoutMs: DOWNLOAD_TIMEOUT_MS });
            child.kill('SIGTERM');
            setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 5000).unref();
        }, DOWNLOAD_TIMEOUT_MS);
        const onLine = line => {
            const text = String(line || '').trim();
            const progress = parseProgress(text);
            if (progress) emit(job, { status: 'downloading', progress: { ...progress, label: progress.percent >= 100 ? 'A finalizar…' : 'A descarregar…' } });
        };
        child.stdout?.on('data', data => String(data).split(/\r?\n/).forEach(onLine));
        child.stderr?.on('data', data => String(data).split(/\r?\n/).forEach(onLine));
        try { await child; } finally { clearTimeout(downloadTimer); }

        const output = findOutputFile(job);
        if (!output) throw new Error('O motor terminou sem criar um ficheiro.');
        const finalName = safeFileName(job.title, job.format === 'best' ? path.extname(output).slice(1) || 'mp4' : job.format);
        const finalPath = path.join(DOWNLOAD_DIR, `${job.id}-${finalName}`);
        fs.renameSync(output, finalPath);
        job.filePath = finalPath;
        job.fileName = finalName;
        job.size = fs.statSync(finalPath).size;
        if (job.size > MAX_DOWNLOAD_SIZE) { fs.rmSync(finalPath, { force: true }); job.filePath = null; throw new Error('O ficheiro excedeu o limite máximo permitido.'); }
        requestMetrics.bytesDownloaded += job.size;
        job.completedAt = new Date().toISOString();
        await addHistory(job.ownerId, {
            id: job.id,
            title: job.title,
            thumbnail: job.thumbnail,
            format: job.format,
            formatLabel: allowedFormats[job.format]?.label,
            quality: job.quality,
            qualityLabel: allowedFormats[job.format]?.type === 'video' ? (videoQualities[job.quality] || videoQualities.auto) : null,
            site: job.site,
            size: job.size,
            fileName: job.fileName,
            storedName: path.basename(finalPath),
            createdAt: job.createdAt,
            completedAt: job.completedAt,
            downloadUrl: `/api/downloads/${job.id}/file`
        });
        requestMetrics.downloadsCompleted += 1;
        emit(job, { status: 'completed', progress: { percent: 100, label: 'Download concluído' } });
    } catch (error) {
        logEvent('error', 'download.failed', { requestId: job.requestId || null, jobId: job.id, ownerId: job.ownerId, timedOut: Boolean(job.timedOut), message: String(error?.stderr || error?.message || error).slice(0, 500) });
        if (job.timedOut) requestMetrics.downloadsTimedOut += 1;
        if (job.cancelled) {
            emit(job, { status: 'cancelled', error: 'Download cancelado.', progress: { percent: 0, label: 'Download cancelado' } });
        } else {
            requestMetrics.downloadsFailed += 1;
            emit(job, { status: 'failed', error: translateError(error), errorCode: errorCode(error), progress: { percent: 0, label: 'O download falhou' } });
        }
        if (job.filePath && fs.existsSync(job.filePath)) fs.rmSync(job.filePath, { force: true });
    } finally {
        activeJobs -= 1;
        job.process = null;
        setTimeout(() => {
            const current = jobs.get(job.id);
            if (current && current.status !== 'downloading' && current.status !== 'fetching') {
                current.clients.forEach(client => client.end());
                jobs.delete(job.id);
            }
        }, JOB_RETENTION_MS);
        processQueue();
        cancelledJobIds.delete(job.id);
    }
}

function hydrateJob(data) {
    const job = {
        id: data.id,
        ownerId: data.ownerId,
        url: data.url,
        format: data.format,
        quality: data.quality || 'auto',
        status: data.status || 'queued',
        progress: data.progress || { percent: 0, label: 'Na fila…' },
        title: data.title || 'A preparar o download',
        thumbnail: data.thumbnail || null,
        site: data.site || (() => { try { return new URL(data.url).hostname.replace(/^www\\./, ''); } catch { return 'plataforma'; } })(),
        error: data.error || null,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: Date.now(),
        clients: [],
        process: null,
        filePath: data.filePath || null,
        fileName: data.fileName || null
    };
    jobs.set(job.id, job);
    return job;
}

async function processDistributedJob(data) {
    const job = hydrateJob(data);
    await runJob(job);
    return publicJob(job);
}

async function startDistributedWorker() {
    if (!distributedQueue || !['worker', 'both'].includes(BULLMQ_ROLE)) return null;
    const worker = new Worker(QUEUE_NAME, bullJob => processDistributedJob(bullJob.data), { connection: BULL_CONNECTION, concurrency: MAX_CONCURRENT_DOWNLOADS, autorun: true });
    worker.on('error', error => console.error('[bullmq:worker]', error.message));
    worker.on('failed', (bullJob, error) => console.error('[bullmq:failed]', bullJob?.id, error.message));
    return worker;
}

function processQueue() {
    let attempts = queue.length;
    while (activeJobs < MAX_CONCURRENT_DOWNLOADS && queue.length && attempts > 0) {
        const job = queue.shift(); attempts -= 1;
        if (!job || job.status !== 'queued') continue;
        if (pausedOwners.has(job.ownerId)) { queue.push(job); continue; }
        runJob(job).catch(error => console.error('[queue]', error));
    }
}

async function createJob(ownerId, url, format, quality = 'auto', requestId = null) {
    const activeForOwner = [...jobs.values()].filter(job => job.ownerId === ownerId && ['queued', 'fetching', 'downloading', 'paused'].includes(job.status)).length;
    if (activeForOwner >= MAX_ACTIVE_JOBS_PER_OWNER) { const error = new Error('Atingiste o limite de downloads ativos. Termina ou cancela um download antes de iniciar outro.'); error.statusCode = 429; throw error; }
    if (distributedQueue) {
        const counts = await distributedQueue.getJobCounts('waiting', 'delayed', 'paused');
        if ((counts.waiting || 0) + (counts.delayed || 0) + (counts.paused || 0) >= MAX_PENDING_DOWNLOADS) { const error = new Error('A fila de downloads está cheia. Tenta novamente mais tarde.'); error.statusCode = 503; throw error; }
    } else if (queue.length >= MAX_PENDING_DOWNLOADS) { const error = new Error('A fila de downloads está cheia. Tenta novamente mais tarde.'); error.statusCode = 503; throw error; }
    const job = {
        id: crypto.randomBytes(12).toString('hex'),
        ownerId,
        requestId,
        url,
        format,
        quality,
        status: 'queued',
        progress: { percent: 0, label: 'Na fila…' },
        title: 'A preparar o download',
        thumbnail: null,
        site: new URL(url).hostname.replace(/^www\./, ''),
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: Date.now(),
        clients: [],
        process: null,
        filePath: null,
        fileName: null
    };
    jobs.set(job.id, job);
    emit(job);
    if (distributedQueue) {
        await distributedQueue.add('download', { id: job.id, ownerId: job.ownerId, url: job.url, format: job.format, quality: job.quality, createdAt: job.createdAt }, { jobId: job.id });
    } else {
        queue.push(job);
        processQueue();
    }
    return job;
}

app.use(createSystemRouter({
    distributedQueue,
    getQueueSize: () => queue.length,
    getActiveJobs: () => activeJobs,
    bullmqRole: BULLMQ_ROLE,
    listYtDlpPlugins,
    ytdlpPluginDir: YT_DLP_PLUGIN_DIR,
    allowedFormats,
    videoQualities,
    maxConcurrentDownloads: MAX_CONCURRENT_DOWNLOADS,
    maxDownloadSize: MAX_DOWNLOAD_SIZE,
    searchProviders: SEARCH_PROVIDERS,
    searchProviderLabels: SEARCH_PROVIDER_LABELS,
    youtubeAuthConfigured: Boolean(YT_DLP_COMMON_OPTIONS.cookies || YT_DLP_COMMON_OPTIONS.cookiesFromBrowser),
    supportedPlatforms: SUPPORTED_PLATFORMS
}));

const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiadas tentativas administrativas.' } });
function adminId(value) { return String(value || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80); }
function adminDomains(value, baseUrl) { const input = Array.isArray(value) ? value : String(value || '').split(/[,\\n]/); const domains = [...new Set(input.map(domain => String(domain || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(domain => /^[a-z0-9.-]+$/.test(domain) && !isPrivateAddress(domain) && !domain.endsWith('.local') && !domain.endsWith('.internal')))]; try { const hostname = new URL(baseUrl).hostname.toLowerCase(); if (hostname && !domains.includes(hostname)) domains.push(hostname); } catch {} return domains.slice(0, 30); }
async function getAdminSource(sourceId) { await databaseReady; const row = await dbGet('SELECT * FROM admin_sources WHERE id = ?', [sourceId]); return row ? adminSourceRow(row) : null; }
async function getAdminCatalogRow(itemId) { await databaseReady; return dbGet('SELECT i.*, s.name AS source_name FROM admin_catalog_items i JOIN admin_sources s ON s.id = i.source_id WHERE i.id = ?', [itemId]); }
async function adminPayload(req, res) { if (!adminConfigured()) return res.status(503).json({ error: 'Admin não configurado. Define ADMIN_USERNAME e ADMIN_PASSWORD_HASH no ambiente.' }); }
app.get('/api/admin/session', (req, res) => res.json({ configured: adminConfigured(), authenticated: adminSessionValid(req), username: adminSessionValid(req) ? req.session.admin.username : null, csrf: adminSessionValid(req) ? req.session.admin.csrf : null }));
app.post('/api/admin/login', adminLoginLimiter, async (req, res) => { if (!adminConfigured()) return res.status(503).json({ error: 'Admin não configurado. Define ADMIN_USERNAME e ADMIN_PASSWORD_HASH no ambiente.' }); const username = String(req.body?.username || '').trim(); const password = String(req.body?.password || ''); const sameUser = username.length === ADMIN_USERNAME.length && crypto.timingSafeEqual(Buffer.from(username), Buffer.from(ADMIN_USERNAME)); if (!sameUser || !(await verifyAdminPassword(password))) return res.status(401).json({ error: 'Credenciais administrativas inválidas.' }); req.session.admin = { username: ADMIN_USERNAME, csrf: crypto.randomBytes(24).toString('hex'), expiresAt: Date.now() + ADMIN_SESSION_TTL }; res.json({ authenticated: true, username: ADMIN_USERNAME, csrf: req.session.admin.csrf }); });
app.post('/api/admin/logout', requireAdmin, (req, res) => { delete req.session.admin; req.session.save(error => error ? res.status(500).json({ error: 'Não foi possível terminar a sessão.' }) : res.json({ authenticated: false })); });
app.get('/api/admin/overview', requireAdmin, async (req, res) => { await databaseReady; const [sources, pending, approved, offline] = await Promise.all([dbGet('SELECT COUNT(*) AS count FROM admin_sources'), dbGet("SELECT COUNT(*) AS count FROM admin_catalog_items WHERE approval_status IN ('pending','needs-review')"), dbGet("SELECT COUNT(*) AS count FROM admin_catalog_items WHERE approval_status = 'approved'"), dbGet("SELECT COUNT(*) AS count FROM admin_catalog_items WHERE health_status IN ('offline','incompatible')")]); res.json({ sources: Number(sources.count), pending: Number(pending.count), approved: Number(approved.count), offline: Number(offline.count) }); });
app.get('/api/admin/sources', requireAdmin, async (req, res) => { await databaseReady; const rows = await dbAll('SELECT * FROM admin_sources ORDER BY updated_at DESC LIMIT 200'); res.json({ sources: rows.map(adminSourceRow) }); });
app.post('/api/admin/sources', requireAdmin, requireAdminCsrf, async (req, res) => { try { const name = cleanText(req.body?.name, 160); const baseUrl = await validateUrl(cleanText(req.body?.baseUrl, 2048)); const domains = adminDomains(req.body?.allowedDomains, baseUrl); const id = adminId(req.body?.id || name) || `source-${crypto.randomBytes(6).toString('hex')}`; const kind = ['vod', 'live', 'metadata', 'mixed'].includes(req.body?.kind) ? req.body.kind : 'vod'; if (!name || !baseUrl || !domains.length) return res.status(400).json({ error: 'Nome, base URL e allowlist são obrigatórios.' }); const now = new Date().toISOString(); await dbRun('INSERT INTO admin_sources (id,name,description,base_url,allowed_domains_json,kind,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', [id, name, cleanText(req.body?.description), baseUrl, JSON.stringify(domains), kind, req.body?.enabled === false ? 0 : 1, now, now]); res.status(201).json({ source: await getAdminSource(id) }); } catch (error) { res.status(400).json({ error: error.message.includes('UNIQUE') ? 'Já existe uma fonte com esse ID.' : error.message }); } });
app.patch('/api/admin/sources/:id', requireAdmin, requireAdminCsrf, async (req, res) => { try { const current = await getAdminSource(req.params.id); if (!current) return res.status(404).json({ error: 'Fonte não encontrada.' }); const baseUrl = req.body?.baseUrl ? await validateUrl(cleanText(req.body.baseUrl, 2048)) : current.baseUrl; const domains = adminDomains(req.body?.allowedDomains ?? current.allowedDomains, baseUrl); const kind = req.body?.kind && ['vod', 'live', 'metadata', 'mixed'].includes(req.body.kind) ? req.body.kind : current.kind; await dbRun('UPDATE admin_sources SET name=?,description=?,base_url=?,allowed_domains_json=?,kind=?,enabled=?,updated_at=? WHERE id=?', [cleanText(req.body?.name ?? current.name, 160), cleanText(req.body?.description ?? current.description), baseUrl, JSON.stringify(domains), kind, req.body?.enabled === undefined ? (current.enabled ? 1 : 0) : (req.body.enabled ? 1 : 0), new Date().toISOString(), req.params.id]); clearAdminCatalogCache(); res.json({ source: await getAdminSource(req.params.id) }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.delete('/api/admin/sources/:id', requireAdmin, requireAdminCsrf, async (req, res) => { await databaseReady; const result = await dbRun('DELETE FROM admin_sources WHERE id = ?', [req.params.id]); clearAdminCatalogCache(); res.json({ deleted: Boolean(result.changes) }); });
app.post('/api/admin/sources/:id/validate', requireAdmin, requireAdminCsrf, async (req, res) => { try { const source = await getAdminSource(req.params.id); if (!source) return res.status(404).json({ error: 'Fonte não encontrada.' }); const url = cleanText(req.body?.mediaUrl || source.baseUrl, 2048); const safe = await adminValidateUrl(url, source.allowedDomains, 'URL de validação'); const result = await validateAdminMedia({ mediaUrl: safe, streamType: req.body?.streamType || 'auto', allowedDomains: source.allowedDomains }); res.json({ url: safe, validation: result }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.get('/api/admin/catalog', requireAdmin, async (req, res) => { await databaseReady; const params = []; const where = []; if (req.query.status && ADMIN_APPROVAL_STATUSES.has(String(req.query.status))) { where.push('i.approval_status = ?'); params.push(String(req.query.status)); } if (req.query.type) { where.push('i.content_type = ?'); params.push(String(req.query.type)); } if (req.query.sourceId) { where.push('i.source_id = ?'); params.push(String(req.query.sourceId)); } const rows = await dbAll(`SELECT i.*, s.name AS source_name FROM admin_catalog_items i JOIN admin_sources s ON s.id = i.source_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.updated_at DESC LIMIT 500`, params); res.json({ items: rows.map(adminCatalogRow) }); });
app.post('/api/admin/catalog', requireAdmin, requireAdminCsrf, async (req, res) => { try { const source = await getAdminSource(req.body?.sourceId); if (!source) return res.status(400).json({ error: 'Fonte não encontrada.' }); const contentType = String(req.body?.contentType || 'vod'); if (!ADMIN_ALLOWED_TYPES.has(contentType)) return res.status(400).json({ error: 'Tipo de conteúdo inválido.' }); const streamType = ADMIN_STREAM_TYPES.has(req.body?.streamType) ? req.body.streamType : 'auto'; const title = cleanText(req.body?.title, 240); const externalUrl = await adminValidateUrl(cleanText(req.body?.externalUrl, 2048), source.allowedDomains, 'URL de origem'); const mediaUrl = req.body?.mediaUrl ? await adminValidateUrl(cleanText(req.body.mediaUrl, 2048), source.allowedDomains, 'URL de media') : null; const thumbnailUrl = req.body?.thumbnailUrl ? await adminValidateUrl(cleanText(req.body.thumbnailUrl, 2048), source.allowedDomains, 'URL de imagem') : null; if (!title) return res.status(400).json({ error: 'Título obrigatório.' }); const health = mediaUrl ? await validateAdminMedia({ mediaUrl, streamType, allowedDomains: source.allowedDomains }) : { status: 'not-configured', code: null, label: 'Sem media configurada' }; const requestedStatus = String(req.body?.approvalStatus || '').toLowerCase(); const approvalStatus = requestedStatus === 'needs-review' || !mediaUrl || !cleanText(req.body?.country, 8) || !cleanText(req.body?.language, 16) ? 'needs-review' : 'pending'; const id = `admin-${crypto.randomBytes(10).toString('hex')}`; const now = new Date().toISOString(); const categories = Array.isArray(req.body?.categories) ? req.body.categories.map(value => cleanText(value, 40).toLowerCase()).filter(Boolean).slice(0, 12) : String(req.body?.categories || '').split(',').map(value => cleanText(value, 40).toLowerCase()).filter(Boolean).slice(0, 12); await dbRun('INSERT INTO admin_catalog_items (id,source_id,content_type,title,description,thumbnail_url,external_url,media_url,stream_type,country,language,categories_json,feed_name,is_live,is_featured,approval_status,health_status,health_code,health_label,health_checked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, source.id, contentType, title, cleanText(req.body?.description), thumbnailUrl, externalUrl, mediaUrl, streamType, cleanText(req.body?.country, 8).toUpperCase(), cleanText(req.body?.language, 16).toLowerCase(), JSON.stringify(categories), cleanText(req.body?.feedName, 160), req.body?.isLive ? 1 : 0, req.body?.isFeatured ? 1 : 0, approvalStatus, health.status, health.code, health.label, new Date().toISOString(), now, now]); clearAdminCatalogCache(); res.status(201).json({ item: adminCatalogRow(await getAdminCatalogRow(id)) }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.patch('/api/admin/catalog/:id', requireAdmin, requireAdminCsrf, async (req, res) => { try { const row = await getAdminCatalogRow(req.params.id); if (!row) return res.status(404).json({ error: 'Item não encontrado.' }); const source = await getAdminSource(row.source_id); if (!source) return res.status(400).json({ error: 'Fonte do item não encontrada.' }); const contentType = req.body?.contentType || row.content_type; if (!ADMIN_ALLOWED_TYPES.has(contentType)) return res.status(400).json({ error: 'Tipo de conteúdo inválido.' }); const externalUrl = req.body?.externalUrl ? await adminValidateUrl(cleanText(req.body.externalUrl, 2048), source.allowedDomains, 'URL de origem') : row.external_url; const mediaUrl = req.body?.mediaUrl === '' ? null : (req.body?.mediaUrl ? await adminValidateUrl(cleanText(req.body.mediaUrl, 2048), source.allowedDomains, 'URL de media') : row.media_url); const thumbnailUrl = req.body?.thumbnailUrl === '' ? null : (req.body?.thumbnailUrl ? await adminValidateUrl(cleanText(req.body.thumbnailUrl, 2048), source.allowedDomains, 'URL de imagem') : row.thumbnail_url); const streamType = req.body?.streamType && ADMIN_STREAM_TYPES.has(req.body.streamType) ? req.body.streamType : row.stream_type; const health = mediaUrl ? await validateAdminMedia({ mediaUrl, streamType, allowedDomains: source.allowedDomains }) : { status: 'not-configured', code: null, label: 'Sem media configurada' }; const categories = Array.isArray(req.body?.categories) ? req.body.categories.map(value => cleanText(value, 40).toLowerCase()).filter(Boolean).slice(0, 12) : jsonArray(row.categories_json); await dbRun('UPDATE admin_catalog_items SET content_type=?,title=?,description=?,thumbnail_url=?,external_url=?,media_url=?,stream_type=?,country=?,language=?,categories_json=?,feed_name=?,is_live=?,is_featured=?,approval_status=?,health_status=?,health_code=?,health_label=?,health_checked_at=?,updated_at=? WHERE id=?', [contentType, cleanText(req.body?.title ?? row.title, 240), cleanText(req.body?.description ?? row.description), thumbnailUrl, externalUrl, mediaUrl, streamType, cleanText(req.body?.country ?? row.country, 8).toUpperCase(), cleanText(req.body?.language ?? row.language, 16).toLowerCase(), JSON.stringify(categories), cleanText(req.body?.feedName ?? row.feed_name, 160), req.body?.isLive === undefined ? row.is_live : (req.body.isLive ? 1 : 0), req.body?.isFeatured === undefined ? row.is_featured : (req.body.isFeatured ? 1 : 0), 'pending', health.status, health.code, health.label, new Date().toISOString(), new Date().toISOString(), req.params.id]); clearAdminCatalogCache(); res.json({ item: adminCatalogRow(await getAdminCatalogRow(req.params.id)) }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.post('/api/admin/catalog/:id/validate', requireAdmin, requireAdminCsrf, async (req, res) => { try { const row = await getAdminCatalogRow(req.params.id); if (!row) return res.status(404).json({ error: 'Item não encontrado.' }); const source = await getAdminSource(row.source_id); if (!source) return res.status(400).json({ error: 'Fonte do item não encontrada.' }); const validation = await validateAdminMedia({ mediaUrl: row.media_url, streamType: row.stream_type, allowedDomains: source.allowedDomains }); await dbRun('UPDATE admin_catalog_items SET health_status=?,health_code=?,health_label=?,health_checked_at=?,updated_at=? WHERE id=?', [validation.status, validation.code, validation.label, new Date().toISOString(), new Date().toISOString(), req.params.id]); clearAdminCatalogCache(); res.json({ validation, item: adminCatalogRow(await getAdminCatalogRow(req.params.id)) }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.post('/api/admin/catalog/:id/approve', requireAdmin, requireAdminCsrf, async (req, res) => { const row = await getAdminCatalogRow(req.params.id); if (!row) return res.status(404).json({ error: 'Item não encontrado.' }); if (row.media_url && row.health_status === 'offline') return res.status(409).json({ error: 'Valida a media antes de aprovar um item offline.' }); await dbRun("UPDATE admin_catalog_items SET approval_status='approved',updated_at=? WHERE id=?", [new Date().toISOString(), req.params.id]); clearAdminCatalogCache(); res.json({ item: adminCatalogRow(await getAdminCatalogRow(req.params.id)) }); });
app.post('/api/admin/catalog/:id/reject', requireAdmin, requireAdminCsrf, async (req, res) => { const row = await getAdminCatalogRow(req.params.id); if (!row) return res.status(404).json({ error: 'Item não encontrado.' }); await dbRun("UPDATE admin_catalog_items SET approval_status='rejected',updated_at=? WHERE id=?", [new Date().toISOString(), req.params.id]); clearAdminCatalogCache(); res.json({ item: adminCatalogRow(await getAdminCatalogRow(req.params.id)) }); });
app.delete('/api/admin/catalog/:id', requireAdmin, requireAdminCsrf, async (req, res) => { const result = await dbRun('DELETE FROM admin_catalog_items WHERE id=?', [req.params.id]); clearAdminCatalogCache(); res.json({ deleted: Boolean(result.changes) }); });
function parsePlaylistAttributes(value) {
    const attributes = {};
    const pattern = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
    for (const match of value.matchAll(pattern)) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    return attributes;
}
function parseM3uPlaylist(content) {
    const rows = []; let meta = {};
    for (const rawLine of String(content || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const value = rawLine.trim(); if (!value) continue;
        if (/^#EXTINF\s*:/i.test(value)) {
            const comma = value.indexOf(','); const attributes = parsePlaylistAttributes(value.slice(8, comma >= 0 ? comma : undefined));
            meta = { title: comma >= 0 ? value.slice(comma + 1).trim() : '', country: attributes['tvg-country'] || '', language: attributes['tvg-language'] || '', group: attributes['group-title'] || '', logo: attributes['tvg-logo'] || '' };
            continue;
        }
        if (/^#EXTGRP:/i.test(value)) { meta.group = value.slice(value.indexOf(':') + 1).trim(); continue; }
        if (value.startsWith('#')) continue;
        const url = value.replace(/[),;]}>'"]+$/, ''); let parsed;
        try { parsed = new URL(url); } catch { meta = {}; continue; }
        if (!['http:', 'https:'].includes(parsed.protocol)) { meta = {}; continue; }
        rows.push({ url, title: meta.title || parsed.hostname, country: meta.country, language: meta.language, group: meta.group, logo: meta.logo }); meta = {};
        if (rows.length >= 1000) break;
    }
    return rows;
}
app.post('/api/admin/import-playlist', requireAdmin, requireAdminCsrf, async (req, res) => {
    try {
        const source = await getAdminSource(req.body?.sourceId); if (!source) return res.status(400).json({ error: 'Seleciona uma fonte autorizada antes de importar.' });
        const content = cleanText(req.body?.content, 1900000); if (!content) return res.status(400).json({ error: 'O arquivo está vazio.' });
        const rows = parseM3uPlaylist(content);
        if (!rows.length) return res.status(400).json({ error: 'Nenhuma URL HTTP/HTTPS foi encontrada.' });
        const now = new Date().toISOString(); let imported = 0; let skipped = 0; const skippedReasons = {};
        for (const row of rows) {
            try {
                const mediaUrl = await adminValidateUrl(row.url, source.allowedDomains, 'URL importada'); const id = `admin-${crypto.createHash('sha256').update(`${source.id}:${mediaUrl}`).digest('hex').slice(0, 20)}`; const title = cleanText(row.title, 240) || 'Canal importado'; const streamType = /\.m3u8(?:$|\?)/i.test(mediaUrl) ? 'hls' : /\.mpd(?:$|\?)/i.test(mediaUrl) ? 'dash' : 'auto';
                const thumbnailUrl = row.logo ? await adminValidateUrl(row.logo, source.allowedDomains, 'URL de imagem').catch(() => null) : null;
                await dbRun(`INSERT INTO admin_catalog_items (id,source_id,content_type,title,description,thumbnail_url,external_url,media_url,stream_type,country,language,categories_json,feed_name,is_live,is_featured,approval_status,health_status,health_code,health_label,health_checked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,thumbnail_url=excluded.thumbnail_url,external_url=excluded.external_url,media_url=excluded.media_url,stream_type=excluded.stream_type,country=excluded.country,language=excluded.language,categories_json=excluded.categories_json,feed_name=excluded.feed_name,updated_at=excluded.updated_at`, [id, source.id, 'channel', title, 'Importado de playlist; requer revisão e validação.', thumbnailUrl, mediaUrl, mediaUrl, streamType, cleanText(row.country, 8).toUpperCase(), cleanText(row.language, 16).toLowerCase(), JSON.stringify(row.group ? [row.group.toLowerCase()] : ['general']), row.group, 1, 0, 'needs-review', 'pending', null, 'A aguardar validação', now, now, now]); imported++;
            } catch (error) { skipped++; const reason = error.message.includes('allowlist') ? 'domínio fora da allowlist' : error.message.includes('DNS') || error.message.includes('bloqueada') ? 'URL bloqueada ou DNS inválido' : 'URL inválida'; skippedReasons[reason] = (skippedReasons[reason] || 0) + 1; }
        }
        clearAdminCatalogCache(); res.status(201).json({ imported, skipped, skippedReasons, found: rows.length, truncated: content.split(/\r?\n/).filter(line => /^https?:\/\//i.test(line.trim())).length > rows.length });
    } catch (error) { res.status(400).json({ error: error.message }); }
});
app.get('/api/iptv/playlists', apiLimiter, (req, res) => res.json({ sources: IPTV_PLAYLIST_SOURCES, policy: 'Só canais em português ou inglês de qualquer categoria aparecem após uma validação de stream HTTPS; fontes que exigem DRM, autenticação ou headers externos não são contornadas.' }));
app.get('/api/entertainment/sources', apiLimiter, async (req, res) => { try { const rows = await dbAll("SELECT id,name,base_url,kind FROM admin_sources WHERE enabled=1 ORDER BY name LIMIT 100"); const sources = [...ENTERTAINMENT_CATALOG_SOURCES, ...rows.map(row => ({ id: `admin-${row.id}`, label: row.name, mode: row.kind, configured: true, policy: 'Fonte administrada, aprovada e allowlisted pelo proprietário do TubeMateX.', url: row.base_url }))]; res.json({ sources, policy: 'Metadata não concede direitos de reprodução. O TubeMateX só reproduz ou descarrega media pública/autorizada fornecida pela origem.' }); } catch { res.json({ sources: ENTERTAINMENT_CATALOG_SOURCES, policy: 'Metadata não concede direitos de reprodução.' }); } });
app.get('/api/entertainment/sources/health', apiLimiter, async (_req, res) => {
    try { res.json({ sources: await catalogSourceHealth.checkAll(), policy: 'Estado mede reachability da API, não direitos de reprodução, disponibilidade regional ou compatibilidade de cada media.' }); }
    catch { res.status(502).json({ error: 'Não foi possível verificar as APIs de catálogo agora.' }); }
});
app.get('/api/entertainment/home', apiLimiter, async (req, res) => {
    try {
        const home = await buildEntertainmentHome();
        res.json({ ...home, note: 'Rails gerados a partir de fontes públicas e auditadas; cada item mantém a sua origem e limitações.' });
    } catch (error) {
        console.error('[entertainment-home]', error.message);
        res.status(502).json({ error: 'Não foi possível carregar a home de Entretenimento agora.', errorCode: errorCode(error) });
    }
});
app.get('/api/entertainment/search', apiLimiter, async (req, res) => {
    const query = String(req.query.q || '').trim().slice(0, 80);
    if (query.length < 2) return res.status(400).json({ error: 'Indica pelo menos 2 caracteres para pesquisar.' });
    try {
        const [catalog, channels, custom] = await Promise.all([fetchLegalEntertainmentDiscovery(query, 24), fetchPublicIptvDiscovery(24, { query }).catch(() => []), fetchApprovedAdminDiscovery(query, 24).catch(() => [])]);
        const results = uniqueMedia([...custom, ...catalog, ...channels].filter(item => item.publicPlayback && item.streamAvailable && !item.metadataOnly), 36);
        res.json({ query, results, sources: ['IPTV-org (streams verificadas)', 'Internet Archive (media pública validada)', 'Fontes administradas e aprovadas'], note: 'Só são devolvidos streams validados como acessíveis; DRM, autenticação e bloqueios geográficos não são contornados.' });
    } catch (error) { res.status(502).json({ error: 'Não foi possível pesquisar o catálogo Cine agora.', errorCode: errorCode(error) }); }
});
app.get('/api/discover', apiLimiter, async (req, res) => {
    const area = ['home', 'music', 'social', 'entertainment'].includes(String(req.query.area || '').toLowerCase()) ? String(req.query.area).toLowerCase() : 'home';
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 12);
    const sourceStatus = { youtube: { mode: 'search', configured: SEARCH_PROVIDERS.includes('ytsearch'), note: 'Pesquisa pública via provider configurado.' }, soundcloud: { mode: 'search', configured: SEARCH_PROVIDERS.includes('scsearch'), note: 'Pesquisa pública via provider configurado.' }, tiktok: { mode: 'direct-link', configured: Boolean(process.env.TIKTOK_DISCOVERY_URLS), note: 'URL público direto ou URLs editoriais configurados.' }, instagram: { mode: 'direct-link', configured: true, note: 'URL público direto; a API oficial exige conta profissional/autorização.' }, facebook: { mode: 'direct-link', configured: true, note: 'URL público direto; pode exigir autenticação.' }, spotify: { mode: 'metadata-only', configured: Boolean(process.env.SPOTIFY_ACCESS_TOKEN), note: 'Catálogo e links oficiais; conteúdo não descarregável.' }, 'apple-music': { mode: 'metadata-only', configured: Boolean(process.env.APPLE_MUSIC_DEVELOPER_TOKEN), note: 'Catálogo e links oficiais; playback depende de autorização.' }, 'internet-archive': { mode: 'public-video', configured: true, note: 'Itens de vídeo públicos com metadata e media disponíveis.' }, 'iptv-org': { mode: 'public-live', configured: area === 'entertainment', note: 'Canais submetidos publicamente; disponibilidade deve ser verificada.' } };
    try { const discovery = await discoverMedia(area, limit); res.json({ area, term: discovery.term, results: discovery.results, sources: sourceStatus, note: 'Resultados obtidos de fontes públicas e configurações disponíveis; cada item mantém a sua origem.' }); }
    catch (error) { console.error('[discover]', error.message); res.status(502).json({ error: 'Não foi possível carregar a descoberta agora.', errorCode: errorCode(error), sources: sourceStatus }); }
});
app.get('/api/iptv/channels', apiLimiter, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 48, 1), 60); const offset = Math.max(Number(req.query.offset) || 0, 0); const filters = { country: String(req.query.country || '').toUpperCase() || null, language: String(req.query.language || '').toLowerCase() || null, category: String(req.query.category || '').toLowerCase() || null, query: String(req.query.q || '').trim().slice(0, 80) || null, batchSize: Math.min(Math.max(Number(req.query.batchSize) || 12, 1), 60) };
    try { const page = await getValidatedPublicIptvPage(limit, { ...filters, offset }); res.json({ ...page, filters, source: 'iptv-org', note: 'Lista apenas streams HTTPS acessíveis e estruturalmente válidas na última verificação; bloqueios de região, autenticação e DRM não são contornados.' }); }
    catch (error) { console.error('[iptv]', error.message); res.status(502).json({ error: 'Não foi possível consultar os canais IPTV públicos agora.', errorCode: errorCode(error) }); }
});
app.get('/api/iptv/meta', apiLimiter, async (req, res) => {
    try {
        const items = await loadPublicIptvCatalog(); const countries = new Map(); const categories = new Map();
        for (const item of items) { if (item.country) countries.set(item.country, (countries.get(item.country) || 0) + 1); for (const category of item.categories || []) categories.set(category, (categories.get(category) || 0) + 1); }
        res.json({ countries: [...countries].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count), categories: [...categories].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count), source: 'iptv-org' });
    } catch (error) { res.status(502).json({ error: 'Não foi possível carregar os filtros IPTV agora.', errorCode: errorCode(error) }); }
});
app.get('/api/search', apiLimiter, async (req, res) => {
    const query = String(req.query.q || '').trim();
    const type = ['all', 'music', 'video', 'film'].includes(String(req.query.type || 'all').toLowerCase()) ? String(req.query.type || 'all').toLowerCase() : 'all';
    const source = ['all', 'youtube', 'soundcloud', 'vimeo', 'twitch'].includes(String(req.query.source || 'all').toLowerCase()) ? String(req.query.source || 'all').toLowerCase() : 'all';
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 12);
    if (query.length < 2) return res.status(400).json({ error: 'Indica pelo menos 2 caracteres para pesquisar.' });
    try {
        const searchResult = await searchMedia(query, type, limit, source);
        res.json({ query, type, source, sources: (source === 'all' ? SEARCH_PROVIDERS : [source]).map(provider => SEARCH_PROVIDER_LABELS[provider] || provider), unavailableSources: searchResult.unavailableSources.map(provider => SEARCH_PROVIDER_LABELS[provider] || provider), results: searchResult.results });
    } catch (error) {
        console.error('[search]', error?.stderr || error?.message || error);
        res.status(422).json({ error: translateError(error) });
    }
});

app.use(createMediaRouter({
    apiLimiter,
    validateUrl,
    fetchPlaylistInfo,
    fetchInfo,
    ytdlp,
    ytdlpCommonOptions: YT_DLP_COMMON_OPTIONS,
    errorCode,
    translateError
}));

app.use(createDownloadRouter({
    downloadLimiter,
    validateUrl,
    allowedFormats,
    videoQualities,
    getVisitorId,
    createJob,
    publicJob,
    jobs,
    loadDistributedJob,
    cancelledJobIds,
    queue,
    distributedQueue,
    emit,
    redisClient,
    jobStateKey,
    bullmqRetentionSeconds: BULLMQ_RETENTION_SECONDS,
    jobEventChannel,
    jobCancelChannel,
    eventSubscriber,
    jobEventClients,
    processQueue,
    conversionFormats,
    loadHistory,
    storedPath,
    downloadDir: DOWNLOAD_DIR,
    convertMedia,
    addHistory,
    clientHistory,
    pausedOwners
}));

app.use(createLibraryRouter({
    getVisitorId,
    loadHistory,
    libraryQuery,
    clientHistory,
    dbGet,
    dbRun,
    jobs,
    storedPath,
    clearHistory
}));

// Compatibilidade com a API original do repositório.
app.get('/video-info', apiLimiter, async (req, res) => {
    const url = await validateUrl(req.query.url);
    if (!url) return res.status(400).json({ error: 'URL não fornecida ou inválida.' });
    fetchInfo(url).then(info => res.json(info)).catch(error => res.status(422).json({ error: translateError(error) }));
});
app.get('/auth/google', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.redirect('/?auth=unavailable');
    passport.authenticate('google', { scope: ['profile', 'email'], state: true })(req, res, next);
});
app.get('/auth/google/callback', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.redirect('/?auth=unavailable');
    passport.authenticate('google', { failureRedirect: '/?auth=failed' })(req, res, async error => {
        if (error) return next(error);
        try {
            const visitorId = parseCookies(req).tubematex_visitor;
            await mergeOwnerHistory(visitorId, `user-${req.user.id}`);
            res.redirect('/?auth=success');
        } catch (mergeError) { next(mergeError); }
    });
});
app.post('/auth/logout', (req, res, next) => req.logout(error => {
    if (error) return next(error);
    const clearCookie = () => res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly${IS_PRODUCTION ? '; Secure' : ''}; SameSite=${SESSION_COOKIE_SAME_SITE}; Max-Age=0`);
    if (!req.session) { clearCookie(); return res.json({ message: 'Sessão terminada.' }); }
    req.session.destroy(destroyError => {
        if (destroyError) return next(destroyError);
        clearCookie();
        res.json({ message: 'Sessão terminada.' });
    });
}));
app.get('/api/user', (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).json({ message: 'Não autenticado' });
    res.json({
        id: req.user.id,
        displayName: req.user.displayName,
        email: req.user.emails?.[0]?.value || null,
        avatar: req.user.photos?.[0]?.value || null
    });
});

app.get('/internal/metrics', (req, res) => {
    const token = String(process.env.METRICS_TOKEN || '');
    if (!token || req.get('Authorization') !== `Bearer ${token}`) return res.status(404).end();
    const activeJobsCount = [...jobs.values()].filter(job => ['fetching', 'downloading'].includes(job.status)).length;
    res.json({ ...requestMetrics, durationAverageMs: requestMetrics.total ? Math.round(requestMetrics.durationTotalMs / requestMetrics.total * 100) / 100 : 0, activeJobs: activeJobsCount, localQueueLength: queue.length, maxConcurrentDownloads: MAX_CONCURRENT_DOWNLOADS, maxActiveJobsPerOwner: MAX_ACTIVE_JOBS_PER_OWNER, maxPendingDownloads: MAX_PENDING_DOWNLOADS, maxDownloadSizeBytes: MAX_DOWNLOAD_SIZE, downloadTimeoutMs: DOWNLOAD_TIMEOUT_MS, uptimeSeconds: Math.floor(process.uptime()) });
});

app.use(express.static(FRONTEND_DIR, { maxAge: IS_PRODUCTION ? '1d' : 0 }));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms.html')));
app.get('/policy', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'privacy.html')));
app.get('/legacy', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'legacy.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'settings.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'admin.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'profile.html')));

setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) {
        if (now - job.updatedAt < JOB_RETENTION_MS) continue;
        if (job.filePath && fs.existsSync(job.filePath)) fs.rmSync(job.filePath, { force: true });
        job.clients.forEach(client => client.end());
        jobs.delete(id);
    }
}, 15 * 60 * 1000).unref();

app.use((error, req, res, next) => {
    logEvent('error', 'http.error', { requestId: req.requestId || null, method: req.method, path: req.path, message: String(error?.message || error).slice(0, 500) });
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
});

let httpServer;
let bullWorker;
Promise.all([databaseReady, redisReady, redisChannelsReady]).then(async () => {
    await configureRedisChannels();
    bullWorker = await startDistributedWorker();
    await migrateLegacyHistory();
    if (!['worker'].includes(BULLMQ_ROLE)) httpServer = app.listen(PORT, () => console.log(`TubeMateX a correr em http://localhost:${PORT} (${BULLMQ_ROLE})`));
    else console.log(`TubeMateX worker BullMQ ativo: ${QUEUE_NAME}`);
}).catch(error => {
    console.error('[database:init]', error);
    process.exitCode = 1;
});

function shutdown(signal) {
    console.log(`[shutdown] ${signal}`);
    for (const job of jobs.values()) {
        if (job.process?.kill) job.process.kill('SIGTERM');
        job.clients.forEach(client => client.end());
    }
    const closeWorker = bullWorker ? bullWorker.close() : Promise.resolve();
    if (!httpServer) return closeWorker.finally(() => database.close(() => redisClient ? redisClient.quit().finally(() => process.exit(0)) : process.exit(0)));
    httpServer.close(() => {
        closeWorker.finally(() => database.close(() => {
            if (redisClient) redisClient.quit().finally(() => process.exit(0));
            else process.exit(0);
        }));
    });
    setTimeout(() => process.exit(1), 8000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
