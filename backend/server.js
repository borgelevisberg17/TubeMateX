require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const net = require('net');
const dns = require('dns').promises;
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const SQLiteStore = require('connect-sqlite3')(session);
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');
const { Queue, Worker } = require('bullmq');
const rateLimit = require('express-rate-limit');
const ytdlp = require('@openanime/youtube-dl-exec');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_DIR = path.join(__dirname, '../frontend');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(DATA_DIR, 'downloads');
const HISTORY_DIR = process.env.HISTORY_DIR || path.join(DATA_DIR, 'history');
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 50);
const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS || 2);
const MAX_DOWNLOAD_SIZE = Number(process.env.MAX_DOWNLOAD_SIZE || 2 * 1024 * 1024 * 1024);
const JOB_RETENTION_MS = 2 * 60 * 60 * 1000;

for (const directory of [DATA_DIR, DOWNLOAD_DIR, HISTORY_DIR]) {
    fs.mkdirSync(directory, { recursive: true });
}

const DATABASE_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'tubematex.sqlite');
const database = new sqlite3.Database(DATABASE_PATH);
const redisConfigured = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
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
const sessionStore = redisClient ? new RedisStore({ client: redisClient, prefix: 'tubematex:sess:' }) : new SQLiteStore({ db: 'sessions.sqlite', dir: process.env.SESSION_DB_DIR || DATA_DIR });
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
`, error => error ? reject(error) : resolve()));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => database.run(sql, params, function onRun(error) { if (error) reject(error); else resolve(this); }));
const dbGet = (sql, params = []) => new Promise((resolve, reject) => database.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
const dbAll = (sql, params = []) => new Promise((resolve, reject) => database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));

const jobs = new Map();
const cancelledJobIds = new Set();
const jobEventClients = new Map();
const infoCache = new Map();
const queue = [];
let activeJobs = 0;
let allDownloadsPaused = false;
const INFO_CACHE_MS = 5 * 60 * 1000;

const SEARCH_PROVIDER_LABELS = { ytsearch: 'YouTube', scsearch: 'SoundCloud', vimeo: 'Vimeo', twitch: 'Twitch' };
const SUPPORTED_PLATFORMS = [
    { id: 'youtube', label: 'YouTube', mode: 'download' }, { id: 'youtube-music', label: 'YouTube Music', mode: 'download' },
    { id: 'soundcloud', label: 'SoundCloud', mode: 'download' }, { id: 'vimeo', label: 'Vimeo', mode: 'download' },
    { id: 'twitch', label: 'Twitch', mode: 'download' }, { id: 'dailymotion', label: 'Dailymotion', mode: 'download' },
    { id: 'bandcamp', label: 'Bandcamp', mode: 'download' }, { id: 'audiomack', label: 'Audiomack', mode: 'download' },
    { id: 'mixcloud', label: 'Mixcloud', mode: 'download' }, { id: 'apple-podcasts', label: 'Apple Podcasts', mode: 'download' },
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
app.use(express.json({ limit: '32kb' }));
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
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'change-this-session-secret-in-production',
    resave: false,
    saveUninitialized: false,
    proxy: IS_PRODUCTION,
    cookie: {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: IS_PRODUCTION ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
    }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
    res.cookie = (name, value, options = {}) => {
        const attributes = [`${name}=${encodeURIComponent(value)}`];
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
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: IS_PRODUCTION ? 'None' : 'Lax'
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
        const process = spawn('ffmpeg', ['-y', '-i', inputPath, ...preset.args, outputPath], { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = ''; process.stderr.on('data', chunk => { stderr += chunk.toString(); });
        process.on('error', reject); process.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-500) || 'A conversão falhou.')));
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

function isPrivateAddress(address) {
    const normalized = String(address || '').toLowerCase();
    const ipVersion = net.isIP(normalized);
    if (ipVersion === 4) return /^(0|10|127|169\.254|192\.0\.0|192\.168|172\.(1[6-9]|2\d|3[0-1]))\./.test(normalized);
    if (ipVersion === 6) return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:') || normalized.startsWith('::ffff:192.168.');
    return false;
}

async function validateUrl(value) {
    if (typeof value !== 'string' || value.length < 8 || value.length > 2048) return null;
    let parsed;
    try {
        parsed = new URL(value.trim());
    } catch {
        return null;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    const hostname = parsed.hostname.toLowerCase();
    const blocked = [
        'localhost', 'localhost.localdomain', '0.0.0.0', '127.0.0.1', '::1',
        '169.254.169.254', 'metadata.google.internal', 'host.docker.internal'
    ];
    if (blocked.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal') || isPrivateAddress(hostname)) return null;
    try {
        const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
        if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) return null;
    } catch {
        return null;
    }
    return parsed.toString();
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
        .filter(file => fs.statSync(file).isFile());
    return candidates[0] || null;
}

function optionsFor(job) {
    const format = allowedFormats[job.format] || allowedFormats.mp4;
    const cap = format.type === 'video' && job.quality && job.quality !== 'auto' && videoQualities[job.quality] ? `[height<=${job.quality}]` : '';
    const options = {
        noWarnings: true,
        noColor: true,
        newline: true,
        noPlaylist: true,
        restrictFilenames: true,
        maxFilesize: MAX_DOWNLOAD_SIZE,
        output: path.join(DOWNLOAD_DIR, `${job.id}.%(ext)s`)
    };
    if (format.type === 'audio') {
        return { ...options, format: 'ba/b', extractAudio: true, audioFormat: job.format, audioQuality: '0' };
    }
    return {
        ...options,
        format: job.format === 'webm'
            ? `bv*${cap}[ext=webm]+ba[ext=webm]/b${cap}[ext=webm]/b`
            : job.format === 'best'
                ? `bv*${cap}+ba/b`
                : `bv*${cap}[ext=mp4]+ba[ext=m4a]/b${cap}[ext=mp4]/b`,
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
    const result = await ytdlp(`${provider}${limit}:${query}`, { flatPlaylist: true, dumpSingleJson: true, skipDownload: true, noWarnings: true, socketTimeout: 15 });
    const entries = Array.isArray(result?.entries) ? result.entries : [];
    return entries.filter(entry => entry && (entry.id || entry.url)).map(entry => ({
        id: `${provider}-${entry.id || crypto.createHash('sha1').update(String(entry.url)).digest('hex').slice(0, 12)}`,
        title: entry.title || 'Resultado sem título',
        url: entry.webpage_url || entry.original_url || entry.url || null,
        thumbnail: entry.thumbnail || (provider === 'ytsearch' && entry.id ? `https://i.ytimg.com/vi/${encodeURIComponent(entry.id)}/hqdefault.jpg` : null),
        duration: Number(entry.duration || 0),
        site: provider === 'scsearch' ? 'SoundCloud' : 'YouTube',
        uploader: entry.uploader || entry.channel || null,
        kind: type
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

async function fetchInfo(url) {
    const cached = infoCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const result = await ytdlp(url, {
        dumpSingleJson: true,
        skipDownload: true,
        noWarnings: true,
        noPlaylist: true,
        noCheckCertificates: true,
        socketTimeout: 15
    });
    const value = {
        title: result.title || result.fulltitle || 'Download sem título',
        thumbnail: result.thumbnail || null,
        duration: Number(result.duration || 0),
        site: result.extractor_key || result.extractor || new URL(url).hostname,
        uploader: result.uploader || null
    };
    infoCache.set(url, { value, expiresAt: Date.now() + INFO_CACHE_MS });
    return value;
}

function translateError(error) {
    const raw = String(error?.stderr || error?.message || error || 'Erro desconhecido');
    if (/Unsupported URL|no suitable extractor/i.test(raw)) return 'Este site ou URL não é suportado pelo motor de download.';
    if (/Video unavailable|not available|removed|private video/i.test(raw)) return 'O conteúdo não está disponível, foi removido ou é privado.';
    if (/Sign in|age-restricted|login required|members-only/i.test(raw)) return 'Este conteúdo exige autenticação na plataforma de origem.';
    if (/copyright|blocked in your country|not available in your country/i.test(raw)) return 'O conteúdo está bloqueado por direitos ou região.';
    if (/File is larger than/i.test(raw)) return 'O ficheiro excede o limite de tamanho permitido.';
    return 'Não foi possível processar este download. Confirma o link e tenta novamente.';
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
        const onLine = line => {
            const text = String(line || '').trim();
            const progress = parseProgress(text);
            if (progress) emit(job, { status: 'downloading', progress: { ...progress, label: progress.percent >= 100 ? 'A finalizar…' : 'A descarregar…' } });
        };
        child.stdout?.on('data', data => String(data).split(/\r?\n/).forEach(onLine));
        child.stderr?.on('data', data => String(data).split(/\r?\n/).forEach(onLine));
        await child;

        const output = findOutputFile(job);
        if (!output) throw new Error('O motor terminou sem criar um ficheiro.');
        const finalName = safeFileName(job.title, job.format === 'best' ? path.extname(output).slice(1) || 'mp4' : job.format);
        const finalPath = path.join(DOWNLOAD_DIR, `${job.id}-${finalName}`);
        fs.renameSync(output, finalPath);
        job.filePath = finalPath;
        job.fileName = finalName;
        job.size = fs.statSync(finalPath).size;
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
        emit(job, { status: 'completed', progress: { percent: 100, label: 'Download concluído' } });
    } catch (error) {
        console.error(`[download:${job.id}]`, error?.stderr || error?.message || error);
        if (job.cancelled) {
            emit(job, { status: 'cancelled', error: 'Download cancelado.', progress: { percent: 0, label: 'Download cancelado' } });
        } else {
            emit(job, { status: 'failed', error: translateError(error), progress: { percent: 0, label: 'O download falhou' } });
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
    if (allDownloadsPaused) return;
    while (activeJobs < MAX_CONCURRENT_DOWNLOADS && queue.length) {
        const job = queue.shift();
        if (!job || job.status !== 'queued') continue;
        runJob(job).catch(error => console.error('[queue]', error));
    }
}

async function createJob(ownerId, url, format, quality = 'auto') {
    const job = {
        id: crypto.randomBytes(12).toString('hex'),
        ownerId,
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

app.get('/health', async (req, res) => {
    let distributed = null;
    if (distributedQueue) {
        try { distributed = await distributedQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'); } catch { distributed = { error: 'indisponível' }; }
    }
    res.json({ status: 'ok', service: 'TubeMateX', role: BULLMQ_ROLE, queue: queue.length, active: activeJobs, distributed });
});

app.get('/api/platforms', (req, res) => res.json({ platforms: SUPPORTED_PLATFORMS }));

app.get('/api/capabilities', (req, res) => res.json({
    formats: Object.entries(allowedFormats).map(([id, item]) => ({ id, label: item.label, type: item.type })),
    qualities: Object.entries(videoQualities).map(([id, label]) => ({ id, label })),
    maxConcurrentDownloads: MAX_CONCURRENT_DOWNLOADS,
    maxDownloadSize: MAX_DOWNLOAD_SIZE,
    platforms: SUPPORTED_PLATFORMS
}));

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

app.get('/api/media/info', apiLimiter, async (req, res) => {
    const url = await validateUrl(req.query.url);
    if (!url) return res.status(400).json({ error: 'Indica um URL público válido começado por http:// ou https://.' });
    try {
        const info = await fetchInfo(url);
        res.json(info);
    } catch (error) {
        res.status(422).json({ error: translateError(error) });
    }
});

app.get('/api/media/stream', apiLimiter, async (req, res) => {
    const url = await validateUrl(req.query.url);
    const type = String(req.query.type || 'audio').toLowerCase() === 'video' ? 'video' : 'audio';
    if (!url) return res.status(400).json({ error: 'Indica um URL público válido começado por http:// ou https://.' });
    try {
        const result = await ytdlp(url, {
            dumpSingleJson: true,
            skipDownload: true,
            noWarnings: true,
            noPlaylist: true,
            noCheckCertificates: true,
            socketTimeout: 15,
            format: type === 'video' ? 'best[ext=mp4]/best' : 'bestaudio/best'
        });
        const requestedFormats = Array.isArray(result.requested_formats) ? result.requested_formats : [];
        const combined = result.url && result.vcodec !== 'none' && result.acodec !== 'none' ? result : null;
        const selected = type === 'video'
            ? (combined || requestedFormats.find(item => item.url && item.vcodec !== 'none' && item.acodec !== 'none') || requestedFormats.find(item => item.url && item.vcodec !== 'none') || result)
            : (result.url && result.acodec !== 'none' ? result : requestedFormats.find(item => item.url && item.acodec !== 'none') || result);
        const streamUrl = selected.url;
        if (!streamUrl) return res.status(422).json({ error: 'Esta fonte não disponibilizou uma URL de reprodução compatível. Tenta outra qualidade ou fonte.' });
        res.json({
            url: streamUrl,
            title: result.title || 'Pré-visualização',
            thumbnail: result.thumbnail || null,
            duration: Number(result.duration || 0),
            mimeType: selected.mime || (type === 'video' ? 'video/mp4' : 'audio/mpeg'),
            type
        });
    } catch (error) {
        console.error('[stream]', error?.stderr || error?.message || error);
        res.status(422).json({ error: translateError(error) });
    }
});

app.post('/api/downloads', downloadLimiter, async (req, res) => {
    const url = await validateUrl(req.body?.url);
    const format = String(req.body?.format || 'mp4').toLowerCase();
    const quality = String(req.body?.quality || 'auto').toLowerCase();
    if (!url) return res.status(400).json({ error: 'Indica um URL público válido começado por http:// ou https://.' });
    if (!allowedFormats[format]) return res.status(400).json({ error: 'Formato de saída não suportado.' });
    if (allowedFormats[format].type === 'video' && !videoQualities[quality]) return res.status(400).json({ error: 'Qualidade de vídeo não suportada.' });
    const ownerId = getVisitorId(req, res);
    const job = await createJob(ownerId, url, format, quality);
    res.status(202).json({ job: publicJob(job), message: 'Download adicionado à fila.' });
});

app.get('/api/downloads/:id', async (req, res) => {
    const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Download não encontrado ou já expirou.' });
    const ownerId = getVisitorId(req, res);
    if (job.ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este download.' });
    res.json(jobs.has(req.params.id) ? publicJob(job) : job);
});

app.delete('/api/downloads/:id', async (req, res) => {
    const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Download não encontrado.' });
    const ownerId = getVisitorId(req, res);
    if (job.ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este download.' });
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return res.json(jobs.has(req.params.id) ? publicJob(job) : job);
    const patch = { status: 'cancelled', error: 'Download cancelado.', progress: { percent: 0, label: 'Download cancelado' } };
    cancelledJobIds.add(req.params.id);
    if (job.process?.kill) job.process.kill('SIGTERM');
    if (job.status === 'queued') {
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
    }
    if (distributedQueue) {
        const bullJob = await distributedQueue.getJob(req.params.id);
        if (bullJob && ['waiting', 'delayed', 'paused'].includes(await bullJob.getState())) await bullJob.remove().catch(() => {});
    }
    if (jobs.has(req.params.id)) emit(job, patch);
    else if (redisClient?.isReady) {
        const nextState = { ...job, ...patch };
        await redisClient.set(jobStateKey(req.params.id), JSON.stringify(nextState), { EX: BULLMQ_RETENTION_SECONDS });
        await redisClient.publish(jobEventChannel(req.params.id), `event: update\\ndata: ${JSON.stringify(nextState)}\\n\\n`);
    }
    if (redisClient?.isReady) await redisClient.publish(jobCancelChannel(req.params.id), 'cancel');
    res.json(jobs.has(req.params.id) ? publicJob(jobs.get(req.params.id)) : { ...job, ...patch });
});

async function setJobPaused(job, paused) {
    if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) return job;
    if (paused) {
        if (job.status === 'queued') {
            const index = queue.indexOf(job);
            if (index >= 0) queue.splice(index, 1);
        }
        if (job.process?.kill && ['fetching', 'downloading'].includes(job.status)) job.process.kill('SIGSTOP');
        emit(job, { status: 'paused', paused: true, progress: job.progress || { percent: 0, label: 'Pausado' } });
        return job;
    }
    if (job.status !== 'paused') return job;
    if (job.process?.kill) {
        job.process.kill('SIGCONT');
        emit(job, { status: 'downloading', paused: false, progress: { ...(job.progress || {}), label: 'A retomar…' } });
    } else {
        job.status = 'queued';
        job.paused = false;
        queue.push(job);
        emit(job, { status: 'queued', progress: { ...(job.progress || {}), label: 'Na fila…' } });
        processQueue();
    }
    return job;
}

async function setAllDownloadsPaused(ownerId, paused) {
    allDownloadsPaused = paused;
    const owned = [...jobs.values()].filter(job => job.ownerId === ownerId);
    await Promise.all(owned.map(job => setJobPaused(job, paused)));
    if (!paused) processQueue();
    return owned.map(publicJob);
}

app.post('/api/downloads/pause-all', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    res.json({ paused: true, jobs: await setAllDownloadsPaused(ownerId, true) });
});

app.post('/api/downloads/resume-all', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    res.json({ paused: false, jobs: await setAllDownloadsPaused(ownerId, false) });
});

app.post('/api/downloads/:id/pause', async (req, res) => {
    const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Download não encontrado.' });
    const ownerId = getVisitorId(req, res);
    if (job.ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este download.' });
    res.json(publicJob(await setJobPaused(job, true)));
});

app.post('/api/downloads/:id/resume', async (req, res) => {
    const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Download não encontrado.' });
    const ownerId = getVisitorId(req, res);
    if (job.ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este download.' });
    res.json(publicJob(await setJobPaused(job, false)));
});

app.get('/api/downloads/:id/events', async (req, res) => {
    const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
    if (!job) return res.status(404).end();
    const ownerId = getVisitorId(req, res);
    if (job.ownerId !== ownerId) return res.status(403).end();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const initial = jobs.has(req.params.id) ? publicJob(job) : job;
    res.write(`event: update\ndata: ${JSON.stringify(initial)}\n\n`);
    if (!jobEventClients.has(req.params.id)) jobEventClients.set(req.params.id, new Set());
    jobEventClients.get(req.params.id).add(res);
    if (!eventSubscriber && jobs.has(req.params.id)) job.clients.push(res);
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    req.on('close', () => {
        clearInterval(heartbeat);
        jobEventClients.get(req.params.id)?.delete(res);
        if (jobEventClients.get(req.params.id)?.size === 0) jobEventClients.delete(req.params.id);
        if (jobs.has(req.params.id)) job.clients = job.clients.filter(client => client !== res);
    });
});

app.post('/api/downloads/:id/convert', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    const requested = String(req.body?.format || '').toLowerCase();
    const preset = conversionFormats[requested];
    if (!preset) return res.status(400).json({ error: 'Formato de conversão não suportado.' });
    const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
    const historyItem = (await loadHistory(ownerId)).find(item => item.id === req.params.id);
    if (!job && !historyItem) return res.status(404).json({ error: 'Download não encontrado.' });
    if ((job || historyItem).ownerId && (job || historyItem).ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este ficheiro.' });
    if (job && job.status !== 'completed') return res.status(409).json({ error: 'A conversão só está disponível após o download terminar.' });
    const inputPath = job?.filePath || storedPath(historyItem?.storedName);
    if (!inputPath || !fs.existsSync(inputPath)) return res.status(404).json({ error: 'O ficheiro original já não está disponível.' });
    const conversionId = `${req.params.id}-convert-${requested}-${Date.now()}`;
    const outputName = `${path.basename(inputPath, path.extname(inputPath))}.${preset.extension}`;
    const outputPath = path.join(DOWNLOAD_DIR, `${conversionId}.${preset.extension}`);
    try {
        await convertMedia(inputPath, outputPath, preset);
        const entry = { id: conversionId, title: `${job?.title || historyItem?.title || 'Ficheiro'} · ${preset.extension.toUpperCase()}`, thumbnail: job?.thumbnail || historyItem?.thumbnail, format: requested, formatLabel: requested.toUpperCase(), quality: historyItem?.quality || job?.quality, qualityLabel: historyItem?.qualityLabel || job?.qualityLabel, site: job?.site || historyItem?.site, size: fs.statSync(outputPath).size, fileName: outputName, storedName: path.basename(outputPath), createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), downloadUrl: `/api/downloads/${conversionId}/file` };
        await addHistory(ownerId, entry);
        res.status(201).json({ ...clientHistory([entry])[0], downloadUrl: `/api/downloads/${conversionId}/file` });
    } catch (error) { if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true }); res.status(422).json({ error: error.message || 'A conversão falhou.' }); }
});

app.get('/api/downloads/:id/file', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    const job = jobs.get(req.params.id) || await loadDistributedJob(req.params.id);
    const historyItem = (await loadHistory(ownerId)).find(item => item.id === req.params.id);
    if (job && job.ownerId !== ownerId) return res.status(403).json({ error: 'Sem acesso a este ficheiro.' });
    const filePath = job?.filePath || storedPath(job?.storedName) || storedPath(historyItem?.storedName);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'O ficheiro já não está disponível.' });
    const fileName = job?.fileName || historyItem?.fileName || 'tubematex-download';
    res.download(filePath, fileName);
});

app.get('/api/library', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    const allItems = await loadHistory(ownerId);
    const filtered = libraryQuery(allItems, req.query);
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const items = clientHistory(filtered.slice(offset, offset + limit));
    const formats = [...new Set(allItems.map(item => item.format).filter(Boolean))].sort();
    const sites = [...new Set(allItems.map(item => item.site).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    res.json({ items, total: filtered.length, offset, limit, hasMore: offset + items.length < filtered.length, facets: { formats, sites } });
});

app.get('/api/favorites', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    res.json(clientHistory(libraryQuery(await loadHistory(ownerId), { favorite: 'true', sort: 'recent' })));
});

app.patch('/api/library/:id/favorite', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    const item = await dbGet('SELECT id, favorite FROM downloads WHERE id = ? AND owner_id = ?', [req.params.id, ownerId]);
    if (!item) return res.status(404).json({ error: 'Download não encontrado no histórico.' });
    const value = typeof req.body?.favorite === 'boolean' ? req.body.favorite : !Boolean(item.favorite);
    await dbRun('UPDATE downloads SET favorite = ?, favorite_at = ? WHERE id = ? AND owner_id = ?', [value ? 1 : 0, value ? new Date().toISOString() : null, item.id, ownerId]);
    res.json({ id: item.id, favorite: value });
});

app.get('/api/history', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    res.json(clientHistory(await loadHistory(ownerId)));
});

function csvValue(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
app.get('/api/history/export.json', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    res.setHeader('Content-Disposition', 'attachment; filename="tubematex-history.json"');
    res.json(clientHistory(await loadHistory(ownerId)));
});
app.get('/api/history/export.csv', async (req, res) => {
    const ownerId = getVisitorId(req, res); const items = clientHistory(await loadHistory(ownerId));
    const columns = ['id','title','format','formatLabel','quality','qualityLabel','site','size','createdAt','completedAt','downloadUrl','favorite'];
    const csv = [columns.join(','), ...items.map(item => columns.map(column => csvValue(item[column])).join(','))].join('\\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="tubematex-history.csv"'); res.send(`\\ufeff${csv}`);
});
app.get('/api/user/downloads', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    res.json(clientHistory(await loadHistory(ownerId)));
});

app.delete('/api/history/:id', async (req, res) => {
    const ownerId = getVisitorId(req, res); const item = (await loadHistory(ownerId)).find(entry => entry.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado no histórico.' });
    const job = jobs.get(item.id); const filePath = job?.filePath || storedPath(item.storedName); if (filePath && fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    await dbRun('DELETE FROM downloads WHERE id = ? AND owner_id = ?', [req.params.id, ownerId]); res.json({ message: 'Item removido.' });
});

app.delete('/api/history', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    await clearHistory(ownerId);
    res.json({ message: 'Histórico eliminado.' });
});

// Compatibilidade com a API original do repositório.
app.get('/video-info', apiLimiter, async (req, res) => {
    const url = await validateUrl(req.query.url);
    if (!url) return res.status(400).json({ error: 'URL não fornecida ou inválida.' });
    fetchInfo(url).then(info => res.json(info)).catch(error => res.status(422).json({ error: translateError(error) }));
});
app.get('/history', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    res.json(clientHistory(await loadHistory(ownerId)));
});
app.post('/clear-history', async (req, res) => {
    const ownerId = getVisitorId(req, res);
    await clearHistory(ownerId);
    res.json({ message: 'Histórico eliminado.' });
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
    res.json({ message: 'Sessão terminada.' });
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

app.use(express.static(FRONTEND_DIR, { maxAge: IS_PRODUCTION ? '1d' : 0 }));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'terms.html')));
app.get('/policy', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'privacy.html')));
app.get('/legacy', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'legacy.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'settings.html')));
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
    console.error('[http]', error);
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
