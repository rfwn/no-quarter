// BoxAPI (boxapi.ir) client: Instagram Data API (public posts) + official DM API.
// Disabled unless BOXAPI_TOKEN is set — the agent then reports the channel as unavailable; it never
// simulates a shop's answer.
//
// NOTE: BoxAPI's docs omit the DM host and response bodies; the DM base URL is configurable and
// responses are parsed defensively. Verify against a live account before relying on it.
import { createHmac, timingSafeEqual } from 'node:crypto';

const cfg = {
  token: process.env.BOXAPI_TOKEN || '',
  accountId: process.env.BOXAPI_ACCOUNT_ID || '',
  webhookSecret: process.env.BOXAPI_WEBHOOK_SECRET || '',
  dataBase: process.env.BOXAPI_DATA_BASE_URL || 'https://boxapi.ir/api/instagram',
  dmBase: process.env.BOXAPI_DM_BASE_URL || 'https://boxapi.ir/api/instagram/dm',
  timeoutMs: 20_000,
};

export const boxapiStatus = () => ({
  data_api: !!cfg.token,
  dm: !!(cfg.token && cfg.accountId),
  webhook_verified: !!cfg.webhookSecret,
});

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}`, 'X-Api-Key': cfg.token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error') throw new Error(`BoxAPI ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// ---------- Data API: a shop's recent public posts ----------

/** @returns {Promise<{taken_at:number, caption:string, url:string}[]>} */
export async function recentPosts(username, count = 12) {
  if (!cfg.token) throw new Error('BoxAPI is not configured (BOXAPI_TOKEN).');
  const data = await post(`${cfg.dataBase}/user/get_media_by_username`, { username, count });
  const items = data?.response?.body?.items || data?.items || [];
  return items.map((it) => ({
    taken_at: it.taken_at || it.timestamp || null,
    caption: it.caption?.text || (typeof it.caption === 'string' ? it.caption : '') || '',
    url: it.code ? `https://www.instagram.com/p/${it.code}/` : null,
  }));
}

// ---------- DM API ----------

export async function sendDm(recipientId, message) {
  if (!cfg.token || !cfg.accountId) throw new Error('BoxAPI DM is not configured (BOXAPI_TOKEN, BOXAPI_ACCOUNT_ID).');
  return post(`${cfg.dmBase}/service/actions/send_message`, { account_id: cfg.accountId, recipient_id: String(recipientId), message });
}

/** Username for a page-scoped sender id (best effort; webhook payloads carry only the id). */
export async function profileOf(senderId) {
  if (!cfg.token || !cfg.accountId) return null;
  try {
    const data = await post(`${cfg.dmBase}/service/actions/get_profile`, { account_id: cfg.accountId, user_id: String(senderId) });
    const body = data?.response?.body || data?.data || data;
    return body?.username || body?.user?.username || null;
  } catch {
    return null;
  }
}

// ---------- Webhook ----------

/** HMAC-SHA256("{timestamp}." + rawBody) with the webhook secret, ±300s clock skew. */
export function verifyWebhook(rawBody, headers, now = Date.now()) {
  if (!cfg.webhookSecret) return { ok: false, reason: 'no_secret' };
  const sig = headers['x-boxapi-signature'];
  const ts = headers['x-boxapi-timestamp'];
  if (!sig || !ts || !/^\d+$/.test(ts)) return { ok: false, reason: 'missing_headers' };
  if (Math.abs(now / 1000 - Number(ts)) > 300) return { ok: false, reason: 'stale' };
  const want = Buffer.from(`sha256=${createHmac('sha256', cfg.webhookSecret).update(`${ts}.${rawBody}`).digest('hex')}`);
  const got = Buffer.from(String(sig));
  return { ok: got.length === want.length && timingSafeEqual(got, want), reason: 'signature' };
}

/** Normalise a BoxAPI messaging webhook into {eventId, accountId, messages:[{senderId, text, mid, at}]}. */
export function parseWebhook(payload) {
  if (payload?.event_type !== 'messaging') return null;
  const messages = (payload.data?.messaging || [])
    .filter((m) => m.message && !m.message.is_echo)
    .map((m) => ({ senderId: String(m.sender?.id), text: m.message.text || '', mid: m.message.mid, at: m.timestamp || Date.now() }));
  return { eventId: payload.event_id, accountId: payload.account_id, messages };
}
