// Neshan (neshan.org): Iranian maps, search and reverse geocoding. Used when the keys work; otherwise the
// app falls back to OpenStreetMap/Nominatim. Health is probed via the same quota call the web SDK makes,
// and a failing key (e.g. 481 "API Key limit exceeded") is retried at most every few minutes.
import { config } from '../config.js';

const API = 'https://api.neshan.org';
const RETRY_MS = 5 * 60_000;
const health = { web: { ok: null, at: 0 }, service: { ok: null, at: 0 } };

async function probe(which) {
  const key = which === 'web' ? config.neshan.webKey : config.neshan.serviceKey;
  const h = health[which];
  if (!key) return false;
  if (h.ok !== null && Date.now() - h.at < (h.ok ? 30 * 60_000 : RETRY_MS)) return h.ok;
  try {
    const r = await fetch(`${API}/v1/quota?t=${Date.now()}`, { method: 'PUT', headers: { 'Api-Key': key }, signal: AbortSignal.timeout(5000) });
    h.ok = r.ok;
  } catch {
    h.ok = false;
  }
  h.at = Date.now();
  if (!h.ok) console.warn(`[neshan] ${which} key not usable; using OpenStreetMap fallback`);
  return h.ok;
}

/** What the browser needs to draw Neshan maps — the web key is public by design (Neshan web SDK). */
export async function mapConfig() {
  return (await probe('web')) ? { provider: 'neshan', key: config.neshan.webKey } : { provider: 'osm' };
}

async function call(path) {
  if (!(await probe('service'))) return null;
  try {
    const r = await fetch(`${API}${path}`, { headers: { 'Api-Key': config.neshan.serviceKey }, signal: AbortSignal.timeout(6000) });
    if (r.status === 481 || r.status === 482 || r.status === 483) health.service = { ok: false, at: Date.now() };
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Places by name, near a point (Tehran centre by default). */
export async function neshanSearch(term, lat = 35.6953, lon = 51.4098) {
  const j = await call(`/v1/search?term=${encodeURIComponent(term)}&lat=${lat}&lng=${lon}`);
  if (!j?.items) return null;
  return j.items.slice(0, 5).map((p) => ({ name: p.title, detail: p.neighbourhood || p.region || p.address || '', lat: +p.location.y.toFixed(5), lon: +p.location.x.toFixed(5), source: 'neshan' }));
}

/** A street/neighbourhood name for a point. */
export async function neshanReverse(lat, lon) {
  const j = await call(`/v5/reverse?lat=${lat}&lng=${lon}`);
  if (!j || j.status !== 'OK') return null;
  return [j.route_name, j.neighbourhood].filter(Boolean).join('، ') || j.formatted_address || null;
}
