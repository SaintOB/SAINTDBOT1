'use strict';

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PRIVATE_BOTS_DIR = path.join(ROOT, 'private-bots');
const ALLOWED_CONFIG = path.join(ROOT, 'config', 'allowed-accounts.json');
const VISIBILITY_CONFIG = path.join(ROOT, 'config', 'bot-visibility.json');
const OWNER_ACCOUNTS = new Set(['CR2706667', 'CR2824740', 'VRTC4566944']);
const APP_ID = process.env.DERIV_APP_ID || '134138';

// ── PostgreSQL (persists across deploys in both dev and production) ─────────
const { Pool } = require('pg');
const DB_KEY_VISIBILITY   = 'saintfx_bot_visibility';
const DB_KEY_ACCOUNTS     = 'saintfx_allowed_accounts';
const DB_KEY_TSF_APP_ID   = 'saintfx_teamsaintfx_app_id';

let pgPool = null;
if (process.env.DATABASE_URL) {
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
} else {
    console.warn('[bot-api] DATABASE_URL not set — settings will not persist across restarts');
}

async function ensureTable() {
    if (!pgPool) return;
    await pgPool.query(
        `CREATE TABLE IF NOT EXISTS saintdbot_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now()
        )`
    );
}

async function dbGet(key) {
    if (!pgPool) return null;
    try {
        const r = await pgPool.query('SELECT value FROM saintdbot_settings WHERE key=$1', [key]);
        if (!r.rows.length) return null;
        return JSON.parse(r.rows[0].value);
    } catch { return null; }
}

async function dbSet(key, value) {
    if (!pgPool) return;
    try {
        await pgPool.query(
            `INSERT INTO saintdbot_settings(key, value, updated_at)
             VALUES($1, $2, now())
             ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
            [key, JSON.stringify(value)]
        );
    } catch (e) { console.warn('[bot-api] dbSet error:', e.message); }
}
// All known app IDs whose tokens we accept. Tokens are tried against each in
// order; the first successful authorize wins. This lets teamsaintfx.com (133598)
// and saintdbot.replit.app (134138) tokens both work against this single server.
const KNOWN_APP_IDS = ['133598', '134076', '134138'];

const TOKEN_CACHE_TTL = 5 * 60 * 1000;
const TOKEN_CACHE_MAX = 500;
const tokenCache = new Map();

function cacheSet(token, loginid) {
    if (tokenCache.size >= TOKEN_CACHE_MAX) {
        const firstKey = tokenCache.keys().next().value;
        if (firstKey !== undefined) tokenCache.delete(firstKey);
    }
    tokenCache.set(token, { loginid, expiresAt: Date.now() + TOKEN_CACHE_TTL });
}

function extractToken(req, url) {
    const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (auth && typeof auth === 'string') {
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (m) return m[1].trim();
    }
    const hdrToken = req.headers && (req.headers['x-deriv-token'] || req.headers['X-Deriv-Token']);
    if (hdrToken && typeof hdrToken === 'string') return hdrToken.trim();
    // Backwards-compat fallback (deprecated): query param. Logged but accepted.
    const q = url.searchParams.get('token');
    if (q) return q;
    return null;
}

function loadAllowedAccounts() {
    try {
        const raw = fs.readFileSync(ALLOWED_CONFIG, 'utf8');
        const cfg = JSON.parse(raw);
        return new Set((cfg.accounts || []).map(id => String(id).toUpperCase()));
    } catch (e) {
        console.error('[bot-api] Failed to load allowed-accounts.json:', e.message);
        return new Set();
    }
}

// Attempt to authorize a token against a single app_id via WebSocket.
// Resolves with loginid on success, rejects with an Error on failure.
function tryAuthorizeWithAppId(token, appId) {
    return new Promise((resolve, reject) => {
        const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
        let settled = false;
        const ws = new WebSocket(wsUrl);
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch {}
            reject(new Error('Deriv API timeout'));
        }, 8000);

        ws.on('open', () => {
            ws.send(JSON.stringify({ authorize: token }));
        });

        ws.on('message', data => {
            if (settled) return;
            try {
                const msg = JSON.parse(data.toString());
                if (msg.error) {
                    settled = true;
                    clearTimeout(timeout);
                    try { ws.close(); } catch {}
                    return reject(new Error(msg.error.message || 'Invalid token'));
                }
                if (msg.authorize && msg.authorize.loginid) {
                    settled = true;
                    clearTimeout(timeout);
                    const loginid = String(msg.authorize.loginid).toUpperCase();
                    try { ws.close(); } catch {}
                    return resolve(loginid);
                }
            } catch (e) {
                settled = true;
                clearTimeout(timeout);
                try { ws.close(); } catch {}
                return reject(e);
            }
        });

        ws.on('error', err => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(err);
        });
    });
}

// Try each known app_id in sequence until one succeeds (or all fail).
async function verifyToken(token) {
    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) return cached.loginid;

    let lastErr;
    for (const appId of KNOWN_APP_IDS) {
        try {
            const loginid = await tryAuthorizeWithAppId(token, appId);
            cacheSet(token, loginid);
            return loginid;
        } catch (e) {
            lastErr = e;
            // Only retry on app_id mismatch errors; bail immediately for others.
            const msg = (e.message || '').toLowerCase();
            if (!msg.includes('app') && !msg.includes('invalid token') && !msg.includes('not valid')) {
                break;
            }
        }
    }
    throw lastErr || new Error('Token verification failed');
}

function sendJson(res, code, obj) {
    res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(obj));
}

function safeFilename(name) {
    if (!name || typeof name !== 'string') return null;
    if (name.includes('/') || name.includes('\\') || name.includes('..')) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
    return name;
}

function getMime(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.xml') return 'application/xml; charset=utf-8';
    if (ext === '.mq5' || ext === '.mqh' || ext === '.csv' || ext === '.md') return 'text/plain; charset=utf-8';
    return 'application/octet-stream';
}

function loadVisibility() {
    try {
        const raw = fs.readFileSync(VISIBILITY_CONFIG, 'utf8');
        const cfg = JSON.parse(raw);
        return {
            public:   Array.isArray(cfg.public)   ? cfg.public.map(String)   : [],
            preview:  Array.isArray(cfg.preview)  ? cfg.preview.map(String)  : [],
            deleted:  Array.isArray(cfg.deleted)  ? cfg.deleted.map(String)  : [],
            _ts:      typeof cfg._ts === 'number'  ? cfg._ts                  : 0,
        };
    } catch (e) {
        return { public: [], preview: [], deleted: [], _ts: 0 };
    }
}

async function saveVisibility(publicIds, previewIds, deletedIds) {
    const data = { public: publicIds, preview: previewIds, deleted: deletedIds, _ts: Date.now() };
    fs.writeFileSync(VISIBILITY_CONFIG, JSON.stringify(data, null, 2) + '\n', 'utf8');
    let dbOk = false;
    try { await dbSet(DB_KEY_VISIBILITY, data); dbOk = true; } catch (e) {
        console.error('[bot-api] DB write failed for visibility:', e.message);
    }
    return dbOk;
}

function loadAccountList() {
    try {
        const raw = fs.readFileSync(ALLOWED_CONFIG, 'utf8');
        const cfg = JSON.parse(raw);
        return Array.isArray(cfg.accounts) ? cfg.accounts.map(id => String(id).toUpperCase()) : [];
    } catch (e) {
        return [];
    }
}

function loadAccountListWithTs() {
    try {
        const raw = fs.readFileSync(ALLOWED_CONFIG, 'utf8');
        const cfg = JSON.parse(raw);
        return {
            accounts: Array.isArray(cfg.accounts) ? cfg.accounts.map(id => String(id).toUpperCase()) : [],
            _ts: typeof cfg._ts === 'number' ? cfg._ts : 0,
        };
    } catch (e) {
        return { accounts: [], _ts: 0 };
    }
}

function saveAccountList(accounts) {
    const cfg = {
        _note: 'Add Deriv account IDs below to grant access to SaintDBot. One ID per line. Example: \'CR1234567\'',
        accounts,
        _ts: Date.now(),
    };
    fs.writeFileSync(ALLOWED_CONFIG, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    dbSet(DB_KEY_ACCOUNTS, { accounts, _ts: cfg._ts }).catch(() => {});
}

async function handleAccountsRequest(req, res) {
    const method = (req.method || 'GET').toUpperCase();

    const token = extractToken(req, new URL(req.url, 'http://localhost'));
    if (!token || token.length < 10) {
        sendJson(res, 401, { error: 'Missing or invalid token' });
        return true;
    }
    let loginid;
    try { loginid = await verifyToken(token); }
    catch (e) { sendJson(res, 401, { error: 'Token verification failed: ' + e.message }); return true; }
    if (!OWNER_ACCOUNTS.has(loginid.toUpperCase())) {
        sendJson(res, 403, { error: 'Owner account required' });
        return true;
    }

    if (method === 'GET') {
        sendJson(res, 200, { accounts: loadAccountList() });
        return true;
    }

    if (method === 'POST') {
        let body = '';
        await new Promise(resolve => { req.on('data', chunk => { body += chunk; }); req.on('end', resolve); });
        let parsed;
        try { parsed = JSON.parse(body); } catch (e) { sendJson(res, 400, { error: 'Invalid JSON' }); return true; }
        if (!Array.isArray(parsed.accounts)) {
            sendJson(res, 400, { error: 'Body must have { accounts: string[] }' }); return true;
        }
        const cleaned = parsed.accounts
            .map(id => String(id).trim().toUpperCase())
            .filter(id => /^[A-Z0-9]+$/.test(id));
        saveAccountList(cleaned);
        console.log('[bot-api] Accounts updated by', loginid, '→', cleaned.length, 'accounts');
        sendJson(res, 200, { ok: true, accounts: cleaned });
        return true;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
    return true;
}

async function handleVisibilityRequest(req, res) {
    const method = (req.method || 'GET').toUpperCase();

    if (method === 'GET') {
        const vis = loadVisibility();
        sendJson(res, 200, { public: vis.public, preview: vis.preview, deleted: vis.deleted });
        return true;
    }

    if (method === 'POST') {
        const token = extractToken(req, new URL(req.url, 'http://localhost'));
        if (!token || token.length < 10) {
            sendJson(res, 401, { error: 'Missing or invalid token' });
            return true;
        }

        let loginid;
        try {
            loginid = await verifyToken(token);
        } catch (e) {
            sendJson(res, 401, { error: 'Token verification failed: ' + e.message });
            return true;
        }

        if (!OWNER_ACCOUNTS.has(loginid.toUpperCase())) {
            sendJson(res, 403, { error: 'Owner account required' });
            return true;
        }

        let body = '';
        await new Promise(resolve => {
            req.on('data', chunk => { body += chunk; });
            req.on('end', resolve);
        });

        let parsed;
        try {
            parsed = JSON.parse(body);
        } catch (e) {
            sendJson(res, 400, { error: 'Invalid JSON body' });
            return true;
        }

        if (!Array.isArray(parsed.public)) {
            sendJson(res, 400, { error: 'Body must have { public: string[], preview?: string[] }' });
            return true;
        }

        const publicIds  = parsed.public.filter(id => typeof id === 'string');
        const previewIds = Array.isArray(parsed.preview)
            ? parsed.preview.filter(id => typeof id === 'string') : [];
        const deletedIds = Array.isArray(parsed.deleted)
            ? parsed.deleted.filter(id => typeof id === 'string') : [];
        const dbSaved = await saveVisibility(publicIds, previewIds, deletedIds);
        console.log('[bot-api] Visibility updated by', loginid, 'dbSaved:', dbSaved,
            '→ public:', publicIds, 'preview:', previewIds, 'deleted:', deletedIds);
        sendJson(res, 200, { ok: true, dbSaved, public: publicIds, preview: previewIds, deleted: deletedIds });
        return true;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
    return true;
}

async function handleBotRequest(req, res) {
    try {
        const url = new URL(req.url, 'http://localhost');
        const match = url.pathname.match(/^\/api\/bot\/(.+)$/);
        if (!match) {
            sendJson(res, 400, { error: 'Filename required' });
            return true;
        }

        const filename = safeFilename(match[1]);
        if (!filename) {
            sendJson(res, 400, { error: 'Invalid filename' });
            return true;
        }

        const token = extractToken(req, url);
        if (!token || token.length < 10) {
            sendJson(res, 401, { error: 'Missing or invalid token' });
            return true;
        }

        let loginid;
        try {
            loginid = await verifyToken(token);
        } catch (e) {
            sendJson(res, 401, { error: 'Token verification failed: ' + e.message });
            return true;
        }

        const allowed = loadAllowedAccounts();
        if (!allowed.has(loginid)) {
            sendJson(res, 403, { error: 'Account not authorized' });
            return true;
        }

        const filePath = path.join(PRIVATE_BOTS_DIR, filename);
        if (!filePath.startsWith(PRIVATE_BOTS_DIR + path.sep) && filePath !== PRIVATE_BOTS_DIR) {
            sendJson(res, 400, { error: 'Invalid path' });
            return true;
        }

        if (!fs.existsSync(filePath)) {
            sendJson(res, 404, { error: 'Bot file not found' });
            return true;
        }

        const data = fs.readFileSync(filePath);
        res.writeHead(200, {
            'Content-Type': getMime(filename),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        res.end(data);
        return true;
    } catch (e) {
        console.error('[bot-api] handler error:', e);
        sendJson(res, 500, { error: 'Internal error' });
        return true;
    }
}

// Public GET  → returns { app_id: number | null }
// Owner POST  → body { app_id: number } with Bearer token, stores in DB
async function handleTeamSaintFxAppIdRequest(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET') {
        const stored = await dbGet(DB_KEY_TSF_APP_ID);
        sendJson(res, 200, { app_id: stored || null });
        return true;
    }
    if (req.method === 'POST') {
        const token = extractToken(req, url);
        if (!token) { sendJson(res, 401, { error: 'Missing token' }); return true; }
        let loginid;
        try { loginid = await verifyToken(token); } catch { sendJson(res, 401, { error: 'Invalid token' }); return true; }
        if (!OWNER_ACCOUNTS.has(loginid)) { sendJson(res, 403, { error: 'Not authorized' }); return true; }
        let body = '';
        await new Promise(resolve => { req.on('data', c => { body += c; }); req.on('end', resolve); });
        let app_id;
        try { app_id = JSON.parse(body).app_id; } catch { sendJson(res, 400, { error: 'Bad JSON' }); return true; }
        if (!app_id || isNaN(Number(app_id))) { sendJson(res, 400, { error: 'Invalid app_id' }); return true; }
        await dbSet(DB_KEY_TSF_APP_ID, Number(app_id));
        console.log('[bot-api] teamsaintfx app_id set to', app_id, 'by', loginid);
        sendJson(res, 200, { ok: true, app_id: Number(app_id) });
        return true;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
    return true;
}

// Public endpoint — no auth needed. Returns { allowed: true/false } for a given account ID.
// Used by the frontend at runtime to check against the LIVE allowed-accounts.json so that
// accounts added after deployment are recognised without a redeployment.
function handleCheckAccountRequest(req, res) {
    try {
        const url = new URL(req.url, 'http://localhost');
        const id = (url.searchParams.get('id') || '').trim().toUpperCase();
        if (!id) { sendJson(res, 400, { error: 'Missing id param' }); return true; }
        const allowed = loadAllowedAccounts();
        sendJson(res, 200, { allowed: allowed.has(id) });
    } catch (e) {
        sendJson(res, 500, { error: 'Internal error' });
    }
    return true;
}

// OAuth relay for teamsaintfx.com visitors.
// Flow: teamsaintfx.com login → GET /api/oauth-relay
//       → server 302-redirects to Deriv OAuth (app 134138 / replit.app)
//         with state=https://teamsaintfx.com  (Deriv echoes state back verbatim)
//       → Deriv OAuth completes → browser lands on saintdbot--saintob.replit.app
//         with tokens AND ?state=https%3A%2F%2Fteamsaintfx.com in the URL
//       → AuthWrapper reads state param → 302 to https://teamsaintfx.com?acct1=...&token1=...
//       → teamsaintfx.com handles tokens normally
function handleOAuthRelayRequest(req, res) {
    // Do NOT include redirect_uri — Deriv validates it strictly against the
    // registered value for app 134138. Passing a mismatched URI causes Deriv
    // to fall back to app.deriv.com instead of our app. Let Deriv use its
    // registered redirect URI automatically (saintdbot--saintob.replit.app).
    // The state param is still included so AuthWrapper knows to forward tokens
    // back to teamsaintfx.com after OAuth completes.
    const OAUTH_URL =
        'https://oauth.deriv.com/oauth2/authorize' +
        '?app_id=134138' +
        '&l=en' +
        '&brand=deriv' +
        '&state=https%3A%2F%2Fteamsaintfx.com';

    res.writeHead(302, {
        'Location': OAUTH_URL,
        'Cache-Control': 'no-store',
    });
    res.end();
    return true;
}

// ── /api/fix-redirect — one-shot tool to update Deriv app redirect_uri ──────
// Accepts an admin-scope Deriv API token (from app.deriv.com/account/api-token)
// and calls app_register to create a new OAuth app so that
// OAuth login lands back on saintdbot--saintob.replit.app instead of app.deriv.com.
// Flow: authorize → app_get (see current state) → app_update (fix redirect_uri)
async function handleFixRedirectRequest(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token') || '';
    if (!token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing ?token= — get an Admin API token from https://app.deriv.com/account/api-token' }));
        return;
    }

    const TARGET_APP_ID = 134138;
    const CORRECT_REDIRECT = 'https://saintdbot--saintob.replit.app';

    try {
        const result = await new Promise((resolve, reject) => {
            const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1');
            const timeout = setTimeout(() => { ws.terminate(); reject(new Error('WebSocket timeout')); }, 20000);
            let step = 'authorize';
            let appBefore = null;

            ws.on('open', () => {
                ws.send(JSON.stringify({ authorize: token, req_id: 1 }));
            });

            ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.error) {
                    clearTimeout(timeout);
                    ws.close();
                    reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                    return;
                }

                if (step === 'authorize' && msg.msg_type === 'authorize') {
                    // Step 1: see what redirect_uri Deriv currently has stored
                    step = 'app_get';
                    ws.send(JSON.stringify({ app_get: TARGET_APP_ID, req_id: 2 }));

                } else if (step === 'app_get' && msg.msg_type === 'app_get') {
                    appBefore = msg.app_get;
                    // Step 2: update the redirect_uri to the correct value
                    step = 'app_update';
                    ws.send(JSON.stringify({
                        app_update: TARGET_APP_ID,
                        name: 'SaintDBot',
                        redirect_uri: CORRECT_REDIRECT,
                        scopes: ['read', 'trade'],
                        req_id: 3,
                    }));

                } else if (step === 'app_update' && msg.msg_type === 'app_update') {
                    clearTimeout(timeout);
                    ws.close();
                    resolve({ appBefore, appAfter: msg.app_update });
                }
            });

            ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ok: true,
            message: 'app_get + app_update completed for app_id 134138',
            redirect_uri_was: result.appBefore && result.appBefore.redirect_uri,
            redirect_uri_now: result.appAfter && result.appAfter.redirect_uri,
            app_before: result.appBefore,
            app_after: result.appAfter,
        }));
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
}

// ── /api/server-config — no-auth diagnostic: shows what app_id this server is using
function handleServerConfigRequest(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        ok: true,
        server_app_id: APP_ID,
        known_app_ids: KNOWN_APP_IDS,
        oauth_url: `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=en&brand=deriv`,
    }));
}

// ── /api/verify-app — lists all Deriv OAuth apps owned by your account ──
// Needs an Admin API token from app.deriv.com/account/api-token
// Usage: /api/verify-app?token=YOUR_API_TOKEN
async function handleVerifyAppRequest(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token') || '';

    if (!token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'Missing ?token= — create an Admin API token at https://app.deriv.com/account/api-token and pass it here',
        }));
        return;
    }

    try {
        const result = await new Promise((resolve, reject) => {
            const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1');
            const timeout = setTimeout(() => { ws.terminate(); reject(new Error('WebSocket timeout')); }, 15000);
            let step = 'authorize';

            ws.on('open', () => { ws.send(JSON.stringify({ authorize: token, req_id: 1 })); });
            ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.error) { clearTimeout(timeout); ws.close(); reject(new Error(msg.error.message)); return; }
                if (step === 'authorize' && msg.msg_type === 'authorize') {
                    step = 'app_list';
                    ws.send(JSON.stringify({ app_list: 1, req_id: 2 }));
                } else if (step === 'app_list' && msg.msg_type === 'app_list') {
                    clearTimeout(timeout); ws.close(); resolve(msg.app_list);
                }
            });
            ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
        });

        const apps = Array.isArray(result) ? result : [];
        const ourApp = apps.find(a => a.app_id === 134138);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, app_134138: ourApp || null, all_apps: apps }));
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
}

function isBotApiRequest(req) {
    return req.url && (
        req.url.startsWith('/api/bot/') ||
        req.url.startsWith('/api/bot-visibility') ||
        req.url.startsWith('/api/accounts') ||
        req.url.startsWith('/api/check-account') ||
        req.url.startsWith('/api/teamsaintfx-appid') ||
        req.url.startsWith('/api/oauth-relay') ||
        req.url.startsWith('/api/fix-redirect') ||
        req.url.startsWith('/api/verify-app') ||
        req.url.startsWith('/api/server-config')
    );
}

async function handleApiRequest(req, res) {
    if (req.url && req.url.startsWith('/api/check-account'))      return handleCheckAccountRequest(req, res);
    if (req.url && req.url.startsWith('/api/bot-visibility'))     return handleVisibilityRequest(req, res);
    if (req.url && req.url.startsWith('/api/accounts'))           return handleAccountsRequest(req, res);
    if (req.url && req.url.startsWith('/api/teamsaintfx-appid')) return handleTeamSaintFxAppIdRequest(req, res);
    if (req.url && req.url.startsWith('/api/oauth-relay'))        return handleOAuthRelayRequest(req, res);
    if (req.url && req.url.startsWith('/api/fix-redirect'))       return handleFixRedirectRequest(req, res);
    if (req.url && req.url.startsWith('/api/verify-app'))         return handleVerifyAppRequest(req, res);
    if (req.url && req.url.startsWith('/api/server-config'))      return handleServerConfigRequest(req, res);
    return handleBotRequest(req, res);
}

// On every startup: DB wins unconditionally if it has any data at all.
// This means Bot Manager / Account Manager changes made on the live site
// always survive a republish.  The source files are only used on the very
// first boot (empty DB) to give the server a reasonable starting state.
(async () => {
    try {
        // Ensure the settings table exists before any reads/writes
        await ensureTable();

        // ── Visibility ──
        const vis = await dbGet(DB_KEY_VISIBILITY);
        const dbHasVis = vis && typeof vis === 'object' && Array.isArray(vis.public);

        if (dbHasVis) {
            // DB has data → restore it unconditionally (preserves live changes)
            const data = {
                public:  Array.isArray(vis.public)  ? vis.public  : [],
                preview: Array.isArray(vis.preview) ? vis.preview : [],
                deleted: Array.isArray(vis.deleted) ? vis.deleted : [],
                _ts:     typeof vis._ts === 'number' ? vis._ts : Date.now(),
            };
            fs.writeFileSync(VISIBILITY_CONFIG, JSON.stringify(data, null, 2) + '\n', 'utf8');
            console.log('[bot-api] Visibility restored from DB →', data.public.length, 'public,', data.preview.length, 'preview');
        } else {
            // DB is empty (first boot) → seed from source file
            const fileVis = loadVisibility();
            await dbSet(DB_KEY_VISIBILITY, fileVis);
            console.log('[bot-api] Visibility seeded from file →', fileVis.public.length, 'public,', fileVis.preview.length, 'preview');
        }

        // ── Accounts ──
        // DB may store the old plain-array format (legacy) or new {accounts,_ts} object.
        const acctDb = await dbGet(DB_KEY_ACCOUNTS);
        const acctDbAccounts = Array.isArray(acctDb)
            ? acctDb
            : (acctDb && Array.isArray(acctDb.accounts) ? acctDb.accounts : null);
        const acctDbHasData = acctDbAccounts !== null;

        if (acctDbHasData) {
            // DB has data → restore it unconditionally
            const cfg = {
                _note: 'Add Deriv account IDs below to grant access to SaintDBot. One ID per line. Example: \'CR1234567\'',
                accounts: acctDbAccounts,
                _ts: (acctDb && typeof acctDb._ts === 'number') ? acctDb._ts : Date.now(),
            };
            fs.writeFileSync(ALLOWED_CONFIG, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
            console.log('[bot-api] Accounts restored from DB →', acctDbAccounts.length, 'accounts');
        } else {
            // DB is empty (first boot) → seed from source file
            const fileAcct = loadAccountListWithTs();
            await dbSet(DB_KEY_ACCOUNTS, { accounts: fileAcct.accounts, _ts: fileAcct._ts || Date.now() });
            console.log('[bot-api] Accounts seeded from file →', fileAcct.accounts.length, 'accounts');
        }
    } catch (e) {
        console.warn('[bot-api] DB startup sync failed (non-fatal):', e.message);
    }
})();

module.exports = { handleBotRequest: handleApiRequest, isBotApiRequest };
