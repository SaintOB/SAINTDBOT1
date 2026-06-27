/**
 * OAuth redirect bridge — listens on localhost:8443 and redirects to localhost:5000.
 *
 * The Deriv developer app (app_id 36300) has "localhost:8443" registered as its OAuth
 * redirect URI. The Rsbuild dev server runs on port 5000. This tiny server bridges the
 * two: when Deriv sends the user back to localhost:8443 with their auth tokens, we
 * immediately redirect them to localhost:5000 (with the full path and query string
 * preserved) so the AuthWrapper can process the tokens normally.
 */

'use strict';

const http = require('http');

const LISTEN_PORT = 8443;
const TARGET_PORT = 5000;

const server = http.createServer((req, res) => {
    const target = `http://localhost:${TARGET_PORT}${req.url}`;

    res.writeHead(302, {
        Location: target,
        'Cache-Control': 'no-store',
        'Content-Length': '0',
    });
    res.end();
});

server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`[oauth-redirect] Port ${LISTEN_PORT} already in use — skipping redirect bridge.`);
    } else {
        console.error('[oauth-redirect] Server error:', err.message);
    }
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
    console.log(`[oauth-redirect] localhost:${LISTEN_PORT} → localhost:${TARGET_PORT}`);
});
