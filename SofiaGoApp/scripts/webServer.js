const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const BASE_URL = 'https://www.sofiatraffic.bg';
const LOCALE = 'bg';

let cachedCsrf = null;
let cachedCookies = null;
let sessionExpiresAt = 0;
const SESSION_TTL_MS = 15 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function ensureSession() {
  if (cachedCsrf && cachedCookies && Date.now() < sessionExpiresAt) {
    return { csrf: cachedCsrf, cookies: cachedCookies };
  }

  const res = await fetch(`${BASE_URL}/${LOCALE}/public-transport`);
  const html = await res.text();
  const csrfMatch = html.match(/meta name="csrf-token" content="([^"]+)"/);
  if (!csrfMatch) {
    throw new Error('Failed to obtain CSRF token for proxy session');
  }

  const setCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [];

  cachedCsrf = csrfMatch[1];
  cachedCookies = setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
  sessionExpiresAt = Date.now() + SESSION_TTL_MS;

  return { csrf: cachedCsrf, cookies: cachedCookies };
}

async function proxyTripRequest(targetPath, body) {
  const { csrf, cookies } = await ensureSession();
  const xsrfMatch = (cookies || '').match(/XSRF-TOKEN=([^;]+)/);
  const xsrf = xsrfMatch ? decodeURIComponent(xsrfMatch[1]) : '';

  const response = await fetch(`${BASE_URL}/${LOCALE}${targetPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-CSRF-TOKEN': csrf,
      'X-XSRF-TOKEN': xsrf,
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookies,
      Referer: `${BASE_URL}/${LOCALE}/trip/search`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 419) {
    cachedCsrf = null;
    cachedCookies = null;
    sessionExpiresAt = 0;
  }

  const text = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || 'application/json; charset=utf-8',
    body: text,
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function serveStatic(req, res) {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const candidate = path.normalize(path.join(DIST_DIR, safePath));

  if (!candidate.startsWith(DIST_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  let filePath = candidate;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && (req.url || '').startsWith('/api/')) {
      const targetPath = (req.url || '').replace(/^\/api/, '');
      const body = await readJsonBody(req);
      const proxied = await proxyTripRequest(targetPath, body);
      res.writeHead(proxied.status, {
        'Content-Type': proxied.contentType,
      });
      res.end(proxied.body);
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    sendJson(res, 500, { error: error?.message || 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`SofiaNow web server running at http://localhost:${PORT}`);
});
