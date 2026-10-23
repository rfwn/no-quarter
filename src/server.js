import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { runTurn, getThread, getShopForThread, refilterBoard } from './agent/runtime.js';
import { recentTraces } from './harness/tracer.js';
import { readAudit, audit } from './governance/audit.js';
import { agentEnabled } from './governance/policy.js';
import { AREAS, coverageAt, dataAsOf, datasetInfo, nearestArea, resolvePlace } from './data/catalog.js';
import { mapConfig, neshanReverse, neshanSearch } from './integrations/neshan.js';

const TEHRAN_VIEWBOX = '51.09,35.84,51.65,35.55';
const placeCache = new Map();

/** A human name for a point: OSM's street/neighbourhood, else "near <dataset area>". */
async function namePoint(lat, lon) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (placeCache.has(key)) return placeCache.get(key);
  const near = nearestArea(lat, lon);
  let name = near ? (near.km < 1.5 ? `نزدیک ${near.name}` : `حدود ${near.km.toLocaleString('fa-IR')} کیلومتری ${near.name}`) : 'نقطه‌ی انتخابی';
  const fromNeshan = await neshanReverse(lat, lon);
  if (fromNeshan) {
    const out = { name: fromNeshan, near };
    placeCache.set(key, out);
    return out;
  }
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=fa&lat=${lat}&lon=${lon}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'torobchin/1.0 (hackathon demo)' }, signal: AbortSignal.timeout(5000) });
    const a = r.ok ? (await r.json()).address || {} : {};
    const area = a.neighbourhood || a.suburb || a.quarter;
    const street = a.road;
    if (street || area) name = [street, area].filter(Boolean).join('، ');
  } catch {}
  const out = { name, near };
  placeCache.set(key, out);
  return out;
}

/** Up to 6 places for a free-text query. Never throws: OSM being unreachable just means dataset-only results. */
async function searchPlaces(q) {
  if (placeCache.has(q)) return placeCache.get(q);
  const results = [];
  const local = resolvePlace(q);
  const neshan = await neshanSearch(q);
  if (neshan?.length) {
    const out = [...(local?.source === 'area' ? [{ name: local.name, detail: 'محدوده‌ی پرمغازه', lat: local.lat, lon: local.lon, source: 'dataset' }] : []), ...neshan].slice(0, 6);
    placeCache.set(q, out);
    return out;
  }
  if (local?.source === 'area') results.push({ name: local.name, detail: 'محدوده‌ی پرمغازه', lat: local.lat, lon: local.lon, source: 'dataset' });
  try {
    const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=fa&countrycodes=ir&bounded=1&viewbox=${TEHRAN_VIEWBOX}&q=${encodeURIComponent(q)}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'torobchin/1.0 (hackathon demo)' }, signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      for (const p of await r.json()) {
        results.push({ name: String(p.display_name || q).split('،')[0].split(',')[0].trim(), detail: String(p.display_name || '').split(/[،,]/).slice(1, 3).join('، ').trim(), lat: +Number(p.lat).toFixed(5), lon: +Number(p.lon).toFixed(5), source: 'osm' });
      }
    }
  } catch {}
  if (local && local.source !== 'area') results.push({ name: local.name, detail: `${local.matched_shops} مغازه با این نشانی`, lat: local.lat, lon: local.lon, source: 'dataset' });
  // OSM often returns one square as several nodes; keep one per name within ~300 m.
  const out = results.filter((r, i) => !results.slice(0, i).some((p) => p.name === r.name && Math.abs(p.lat - r.lat) < 0.003 && Math.abs(p.lon - r.lon) < 0.003)).slice(0, 6);
  placeCache.set(q, out);
  return out;
}
import { followupsForThread, markFollowupSent, recordManualAnswer, seenEvent, rememberContact, usernameForSender, recordShopReply, isShopUsername } from './followups.js';
import { verifyWebhook, parseWebhook, profileOf, sendDm, boxapiStatus } from './integrations/boxapi.js';
import { renderText } from './channels/text.js';

const PORT = Number(process.env.PORT) || 3000;
const DEV = process.argv.includes('--dev'); // `npm run dev`: Vite serves the web app with hot reload
const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url));
const ADMIN_PAGE = fileURLToPath(new URL('./admin.html', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const THREAD_RE = /^[\w-]{8,80}$/;
const FILTER_KEYS = { radius_km: 'radiusKm', max_price: 'maxPrice', open_now: 'openNow', torobpay: 'torobpay', installments: 'installments', fast_delivery: 'fastDelivery', warranty: 'warranty', visit: 'visit' };

if (!config.model.apiKey) {
  console.error('Missing LLM_API_KEY. Copy .env.example to .env and set it.');
  process.exit(1);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readRaw(req, max = 20_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > max) throw Object.assign(new Error('Body too large'), { status: 413 });
  }
  return raw;
}

async function readJson(req, max) {
  try {
    return JSON.parse((await readRaw(req, max)) || '{}');
  } catch (err) {
    throw err.status ? err : Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

const clientId = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
const validThread = (id) => THREAD_RE.test(String(id || ''));

function isAdmin(req, url) {
  if (!config.adminToken) return false;
  const given = Buffer.from(String(req.headers['x-admin-token'] || url.searchParams.get('token') || ''));
  const want = Buffer.from(config.adminToken);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function serveFile(res, file, type) {
  try {
    const body = await readFile(file);
    const cache = file.includes(`${DIST_DIR}assets`) || file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': type || MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

/**
 * BoxAPI webhook. Two kinds of senders reach our Instagram account:
 *  - a shop (one of the dataset's Instagram handles) answering a follow-up → record & extract the answer
 *  - a shopper → this is the Instagram channel of the same agent: run a turn and reply as text
 */
async function handleWebhook(req, res) {
  const raw = await readRaw(req, 200_000);
  const check = verifyWebhook(raw, req.headers);
  if (!check.ok) {
    await audit('webhook_rejected', { reason: check.reason });
    return sendJson(res, 401, { error: 'invalid signature' });
  }
  const event = parseWebhook(JSON.parse(raw || '{}'));
  sendJson(res, 200, { ok: true }); // acknowledge fast; BoxAPI retries otherwise
  if (!event || seenEvent(event.eventId)) return;

  for (const m of event.messages) {
    if (!m.text) continue;
    let username = usernameForSender(m.senderId);
    if (!username) {
      username = await profileOf(m.senderId);
      if (username) rememberContact(username, m.senderId);
    }
    if (username && isShopUsername(username)) {
      const n = await recordShopReply(username, m.text);
      await audit('shop_reply', { shop_username: username, matched_followups: n });
      continue;
    }
    // Shopper on Instagram: same agent, text rendering. Thread = Instagram sender.
    const threadId = `ig-${m.senderId}`;
    let resume;
    try {
      const p = JSON.parse(m.text);
      if (p && typeof p === 'object') resume = p; // postback payloads from our buttons
    } catch {}
    const result = await runTurn({ threadId, userId: threadId, channel: 'instagram', message: resume ? undefined : m.text, resume });
    const out = renderText(result);
    await sendDm(m.senderId, out.text).catch((err) => audit('dm_send_failed', { detail: err.message }));
  }
}

// Security headers on every response. The CSP lists exactly what the page loads: our own bundle, Torob
// product images, OpenStreetMap tiles, and Neshan's map SDK/tiles/API (used when its key works).
// In dev, Vite adds one inline script (React's hot-reload preamble); nothing else differs.
const CSP = [
  "default-src 'self'",
  `script-src 'self'${DEV ? " 'unsafe-inline'" : ''} https://static.neshan.org`,
  "style-src 'self' 'unsafe-inline' https://static.neshan.org",
  "img-src 'self' data: blob: https://*.torob.com https://tile.openstreetmap.org https://*.neshan.org",
  "connect-src 'self' https://api.neshan.org",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function securityHeaders(req, res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Behind Liara's HTTPS proxy only; never on plain localhost.
  if (req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

let vite = null;
const server = createServer(async (req, res) => {
  securityHeaders(req, res);
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      // Up to ~1.5 MB so a resized photo fits; anything else stays small.
      const { threadId, message, resume, ctx, image } = await readJson(req, 1_600_000);
      if (!validThread(threadId)) return sendJson(res, 400, { error: 'threadId is required' });
      const photo = typeof image === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) && image.length <= 1_500_000 ? image : null;
      if (image && !photo) return sendJson(res, 400, { error: 'عکس باید JPEG/PNG/WebP و کمتر از ۱ مگابایت باشه.' });
      if (!message?.trim?.() && !resume && !photo) return sendJson(res, 400, { error: 'message or resume is required' });
      // Newline-delimited JSON: progress, tokens, UI blocks, interrupts, then `done`.
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
      let closed = false;
      res.on('close', () => (closed = true));
      await runTurn({ threadId, userId: clientId(req), channel: 'web', message, resume, ctx, image: photo }, (event) => {
        if (!closed) res.write(JSON.stringify(event) + '\n');
      });
      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/api/thread') {
      const threadId = url.searchParams.get('threadId');
      if (!validThread(threadId)) return sendJson(res, 400, { error: 'threadId is required' });
      return sendJson(res, 200, await getThread(threadId));
    }

    // Filters on a shop board — changes results without another agent turn.
    if (req.method === 'POST' && url.pathname === '/api/offers') {
      const { threadId, productId, filters = {}, ctx } = await readJson(req);
      if (!validThread(threadId)) return sendJson(res, 400, { error: 'threadId is required' });
      const f = Object.fromEntries(Object.entries(filters).filter(([k, v]) => FILTER_KEYS[k] && v != null && v !== false).map(([k, v]) => [FILTER_KEYS[k], v]));
      const block = await refilterBoard(threadId, String(productId), f, ctx);
      return block ? sendJson(res, 200, block) : sendJson(res, 404, { error: 'محصول پیدا نشد.' });
    }

    if (req.method === 'POST' && url.pathname === '/api/shop') {
      const { threadId, shopId, query, category, offset, ctx } = await readJson(req);
      if (!validThread(threadId)) return sendJson(res, 400, { error: 'threadId is required' });
      const shop = await getShopForThread(threadId, String(shopId), { query: query || '', category: category || null, offset, ctx });
      return shop ? sendJson(res, 200, shop) : sendJson(res, 404, { error: 'این مغازه پیدا نشد.' });
    }

    if (req.method === 'GET' && url.pathname === '/api/followups') {
      const threadId = url.searchParams.get('threadId');
      if (!validThread(threadId)) return sendJson(res, 400, { error: 'threadId is required' });
      return sendJson(res, 200, followupsForThread(threadId));
    }

    // The user reports what the shop said on phone/WhatsApp.
    if (req.method === 'POST' && url.pathname === '/api/followups/sent') {
      const { threadId, followupId } = await readJson(req);
      if (!validThread(threadId) || !followupsForThread(threadId).some((f) => f.id === followupId)) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, markFollowupSent(followupId));
    }

    if (req.method === 'POST' && url.pathname === '/api/followups/answer') {
      const { threadId, followupId, text } = await readJson(req);
      if (!validThread(threadId) || !text?.trim()) return sendJson(res, 400, { error: 'threadId and text are required' });
      const own = followupsForThread(threadId).some((f) => f.id === followupId);
      if (!own) return sendJson(res, 404, { error: 'پیگیری پیدا نشد.' });
      return sendJson(res, 200, await recordManualAnswer(followupId, text.trim().slice(0, 500)));
    }

    if (req.method === 'GET' && url.pathname === '/api/areas') {
      return sendJson(res, 200, AREAS.slice(0, 16));
    }

    // Any place in Tehran by name: dataset areas/passages first, then OpenStreetMap (Nominatim).
    if (req.method === 'GET' && url.pathname === '/api/place') {
      const q = String(url.searchParams.get('q') || '').trim().slice(0, 80);
      if (q.length < 2) return sendJson(res, 400, { error: 'اسم جا را بنویس.' });
      return sendJson(res, 200, await searchPlaces(q));
    }

    // How well the dataset covers a point (it holds ~10% of Tehran's shops, from selected areas).
    if (req.method === 'GET' && url.pathname === '/api/coverage') {
      const lat = Number(url.searchParams.get('lat'));
      const lon = Number(url.searchParams.get('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return sendJson(res, 400, { error: 'bad point' });
      return sendJson(res, 200, { ...coverageAt(lat, lon), data_as_of: dataAsOf() });
    }

    if (req.method === 'GET' && url.pathname === '/api/maps') {
      return sendJson(res, 200, await mapConfig());
    }

    if (req.method === 'GET' && url.pathname === '/api/place/reverse') {
      const lat = Number(url.searchParams.get('lat'));
      const lon = Number(url.searchParams.get('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return sendJson(res, 400, { error: 'bad point' });
      return sendJson(res, 200, await namePoint(lat, lon));
    }

    if (req.method === 'POST' && url.pathname === '/webhooks/boxapi') {
      return handleWebhook(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, enabled: agentEnabled(), version: config.version, model: config.model.name, prompt: config.promptVersion, dataset: datasetInfo(), boxapi: boxapiStatus() });
    }

    if (url.pathname.startsWith('/admin')) {
      if (!isAdmin(req, url)) return sendJson(res, 401, { error: 'Set ADMIN_TOKEN and pass ?token=' });
      if (url.pathname === '/admin') return serveFile(res, ADMIN_PAGE);
      if (url.pathname === '/admin/api/traces') return sendJson(res, 200, recentTraces());
      if (url.pathname === '/admin/api/audit') return sendJson(res, 200, await readAudit());
      return sendJson(res, 404, { error: 'Not found' });
    }

    if (vite) return vite.middlewares(req, res, () => sendJson(res, 404, { error: 'Not found' }));

    if (req.method === 'GET') {
      const path = url.pathname === '/' ? 'index.html' : url.pathname;
      const file = normalize(join(DIST_DIR, path));
      if (!file.startsWith(normalize(DIST_DIR))) return sendJson(res, 403, { error: 'Forbidden' });
      return serveFile(res, file);
    }
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.status ? err.message : 'خطایی رخ داد. دوباره تلاش کنید.' });
    else res.end();
  }
});

// web/ only exists in the source tree, not in the production image, so it's imported only in dev.
if (DEV) vite = await (await import('../web/dev-server.js')).createDevServer(server);
server.listen(PORT, () => console.log(`Torob in-store agent ${config.version}${DEV ? ' (dev, hot reload)' : ''} → http://localhost:${PORT}`));
