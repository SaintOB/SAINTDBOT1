const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleBotRequest, isBotApiRequest } = require('./bot-api.cjs');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 5000;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.gz': 'application/gzip',
};

const CORS_HEADERS = {
    'Cross-Origin-Opener-Policy': 'unsafe-none',
    'Cross-Origin-Embedder-Policy': 'unsafe-none',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=31536000, immutable',
};

const HTML_HEADERS = {
    ...CORS_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Robots-Tag': 'index, follow',
};

function serveFile(res, filePath, mimeType) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Server Error');
            return;
        }
        const isHtml = mimeType && mimeType.includes('text/html');
        res.writeHead(200, {
            'Content-Type': mimeType || 'application/octet-stream',
            ...(isHtml ? HTML_HEADERS : CORS_HEADERS),
        });
        res.end(data);
    });
}

function serveIndex(res) {
    serveFile(res, path.join(DIST, 'index.html'), 'text/html; charset=utf-8');
}

const ROBOTS_TXT = `User-agent: *\nAllow: /\n\nSitemap: https://saintdbot--saintob.replit.app/sitemap.xml\n`;
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();

            if (body.length > 1000000) {
                req.destroy();
                reject(new Error('Request body too large'));
            }
        });

        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(new Error('Invalid JSON body'));
            }
        });

        req.on('error', reject);
    });
}

async function handleDerivOAuthToken(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        const body = await readJsonBody(req);
        const { code, code_verifier, redirect_uri, client_id } = body;

        if (!code || !code_verifier || !redirect_uri || !client_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required OAuth fields' }));
            return;
        }

        const tokenResponse = await fetch('https://auth.deriv.com/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                code_verifier,
                redirect_uri,
                client_id,
            }).toString(),
        });

        const tokenData = await tokenResponse.json();

        res.writeHead(tokenResponse.ok ? 200 : tokenResponse.status, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        });

        res.end(JSON.stringify(tokenData));
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                error: 'OAuth token exchange failed',
                message: error.message,
            })
        );
    }
}
const server = http.createServer(async (req, res) => {
    if (isBotApiRequest(req)) {
        await handleBotRequest(req, res);
        return;
    }
    const requestPath = req.url.split('?')[0];

    if (requestPath === '/api/deriv/oauth/token') {
        await handleDerivOAuthToken(req, res);
        return;
    }
    // Serve robots.txt explicitly so it is never blocked by CDN or proxy defaults
    const rawPath = req.url.split('?')[0];
    if (rawPath === '/robots.txt') {
        res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
            'X-Robots-Tag': 'index, follow',
        });
        res.end(ROBOTS_TXT);
        return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname.endsWith('/') && pathname !== '/') {
        pathname = pathname.slice(0, -1);
    }

    const filePath = path.join(DIST, pathname);

    const ext = path.extname(pathname).toLowerCase();

    if (!ext) {
        return serveIndex(res);
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            if (pathname === '/index.html') {
                res.writeHead(404);
                res.end('Not found');
            } else {
                serveIndex(res);
            }
            return;
        }
        serveFile(res, filePath, MIME[ext] || 'application/octet-stream');
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SaintDBot] Production server running on port ${PORT}`);
    console.log(`[SaintDBot] Serving dist/ with SPA fallback`);
});

server.on('error', err => {
    console.error('[SaintDBot] Server error:', err);
    process.exit(1);
});
