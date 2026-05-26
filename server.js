import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 8080);
const frameAncestors = process.env.FRAME_ANCESTORS || '';
const geoProvider = (process.env.GEOIP_PROVIDER || 'ipapi').toLowerCase();
const dashdotUrl = (process.env.DASHDOT_URL || 'http://dashdot:3001').replace(/\/+$/, '');
const dashdotTimeoutMs = Number(process.env.DASHDOT_TIMEOUT_MS || 5000);
const widgetPublicBaseUrl = (process.env.WIDGET_PUBLIC_BASE_URL || `http://homarr-iframes:${port}`).replace(/\/+$/, '');
const isProduction = process.env.NODE_ENV === 'production';
const geoCache = new Map();
const logPrefix = '[homarr-iframes]';

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon']
]);

function baseHeaders(contentType = 'text/plain; charset=utf-8') {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' https://ipapi.co",
    "base-uri 'none'",
    "form-action 'none'"
  ];

  if (frameAncestors.trim()) {
    csp.push(`frame-ancestors ${frameAncestors.trim()}`);
  }

  return {
    'Content-Type': contentType,
    'Content-Security-Policy': csp.join('; '),
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'geolocation=(self)'
  };
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, { ...baseHeaders(headers['Content-Type']), ...headers });
  res.end(body);
}

function sendJson(res, statusCode, payload) {
  send(res, statusCode, JSON.stringify(payload), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
}

async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'homarr-custom-widgets/0.1' }
    });

    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeClientIp(req) {
  const forwarded = req.headers['cf-connecting-ip']
    || req.headers['x-real-ip']
    || String(req.headers['x-forwarded-for'] || '').split(',')[0]
    || req.socket.remoteAddress
    || '';

  const value = forwarded
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/^::ffff:/, '');

  const bracketed = forwarded.trim().match(/^\[([^\]]+)](?::\d+)?$/);
  if (bracketed) return bracketed[1].replace(/^::ffff:/, '');

  const colonCount = (value.match(/:/g) || []).length;
  if (colonCount === 1 && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) {
    return value.replace(/:\d+$/, '');
  }

  return value;
}

function isPrivateIp(ip) {
  if (!ip || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;

  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;

  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127);
}

async function handleGeoIp(req, res) {
  if (geoProvider === 'disabled') {
    sendJson(res, 503, { error: 'IP geolocation is disabled on this widget server.' });
    return;
  }

  const ip = normalizeClientIp(req);
  if (isPrivateIp(ip)) {
    sendJson(res, 422, {
      error: 'No public client IP was forwarded to the widget server.',
      hint: 'Use browser geolocation or pass fixed coordinates with ?lat=...&lon=....'
    });
    return;
  }

  const cached = geoCache.get(ip);
  if (cached && cached.expires > Date.now()) {
    sendJson(res, 200, cached.payload);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'homarr-custom-widgets/0.1' }
    });

    if (!response.ok) {
      throw new Error(`ipapi returned ${response.status}`);
    }

    const data = await response.json();
    if (data.error || data.latitude == null || data.longitude == null) {
      throw new Error(data.reason || 'ipapi did not return coordinates');
    }

    const payload = {
      source: 'ipapi',
      accuracy: 'approximate',
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      timezone: data.timezone || null,
      label: [data.city, data.region_code || data.region, data.country_code]
        .filter(Boolean)
        .join(', ')
    };

    geoCache.set(ip, { expires: Date.now() + 60 * 60 * 1000, payload });
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 502, {
      error: 'IP geolocation lookup failed.',
      detail: error instanceof Error ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleDashdotSummary(res) {
  try {
    const endpoints = {
      info: `${dashdotUrl}/info`,
      cpu: `${dashdotUrl}/load/cpu`,
      storage: `${dashdotUrl}/load/storage`,
      ram: `${dashdotUrl}/load/ram`,
      network: `${dashdotUrl}/load/network`
    };
    const entries = await Promise.all(
      Object.entries(endpoints).map(async ([name, url]) => {
        try {
          return [name, { ok: true, data: await fetchJson(url, dashdotTimeoutMs) }];
        } catch (error) {
          return [name, { ok: false, error: error instanceof Error ? error.message : String(error) }];
        }
      })
    );
    const results = Object.fromEntries(entries);
    const errors = Object.fromEntries(
      Object.entries(results)
        .filter(([, result]) => !result.ok)
        .map(([name, result]) => [name, result.error])
    );
    const okCount = Object.values(results).filter((result) => result.ok).length;

    if (okCount === 0) {
      console.error(`${logPrefix} Dashdot is unreachable`, {
        source: dashdotUrl,
        errors
      });
      sendJson(res, 502, {
        error: 'Dashdot is unreachable from the widget server.',
        source: dashdotUrl,
        errors
      });
      return;
    }

    sendJson(res, 200, {
      ok: Object.keys(errors).length === 0,
      source: dashdotUrl,
      fetchedAt: new Date().toISOString(),
      errors,
      info: results.info.data ?? {},
      loads: {
        cpu: results.cpu.data ?? {},
        storage: results.storage.data ?? {},
        ram: results.ram.data ?? {},
        network: results.network.data ?? {}
      }
    });

    if (Object.keys(errors).length > 0) {
      console.warn(`${logPrefix} Dashdot returned partial data`, {
        source: dashdotUrl,
        errors
      });
    }
  } catch (error) {
    console.error(`${logPrefix} Dashdot summary lookup failed`, error);
    sendJson(res, 502, {
      error: 'Dashdot summary lookup failed.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

async function serveStatic(req, res, requestUrl) {
  let pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === '/') {
    pathname = '/widgets/daylight/';
  }

  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }

  const filePath = path.resolve(publicRoot, `.${pathname}`);
  if (!filePath.startsWith(publicRoot)) {
    send(res, 403, 'Forbidden');
    return;
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      send(res, 404, 'Not found');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes.get(extension) || 'application/octet-stream';
    const body = await readFile(filePath);

    send(res, 200, body, {
      'Content-Type': contentType,
      'Cache-Control': isProduction && extension !== '.html'
        ? 'public, max-age=3600'
        : 'no-store'
    });
  } catch {
    send(res, 404, 'Not found');
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/healthz') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/geoip') {
    await handleGeoIp(req, res);
    return;
  }

  if (pathname === '/api/dashdot/summary') {
    await handleDashdotSummary(res);
    return;
  }

  await serveStatic(req, res, requestUrl);
});

server.listen(port, () => {
  console.log(`${logPrefix} listening on 0.0.0.0:${port}`);
  console.log(`${logPrefix} browser URLs:`);
  console.log(`  ${widgetPublicBaseUrl}/ping/`);
  console.log(`  ${widgetPublicBaseUrl}/debug/`);
  console.log(`  ${widgetPublicBaseUrl}/widgets/dashdot/`);
  console.log(`  ${widgetPublicBaseUrl}/widgets/daylight/`);
  console.log(`${logPrefix} Docker service URL: http://homarr-iframes:${port}/`);
});
