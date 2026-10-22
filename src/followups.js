// Seller follow-up (step 3). Instagram only allows a business to DM people who messaged it first, so
// ترب‌چین can't open a conversation with a shop. Instead the USER asks, and we make it one tap:
// the shop's channels (Instagram DM link, website, WhatsApp, phone), a ready message, and a place to paste
// the reply — which the agent then reads (in stock? today's price?) and acts on.
//
// Statuses: prepared (message ready) → waiting (user says they sent it) → answered.
// A fresh answer (24h) for the same shop+product is shared across chats instead of asking again.
// (The webhook path below stays for shops that DM our page first.)
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { recentPosts, boxapiStatus } from './integrations/boxapi.js';
import { extractPrices } from './governance/grounding.js';
import { normalizeText, toEnglishDigits } from './data/normalize.js';
import { getShop, instagramShopIds } from './data/catalog.js';
import { extractShopReply } from './agent/model.js';

mkdirSync(config.paths.data, { recursive: true });
const db = new Database(join(config.paths.data, 'app.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS ig_contacts (username TEXT PRIMARY KEY, sender_id TEXT, updated_at INTEGER);
  CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, at INTEGER);
  CREATE TABLE IF NOT EXISTS followups (
    id TEXT PRIMARY KEY, thread_id TEXT, shop_id TEXT, product_id TEXT, product_title TEXT,
    channel TEXT, status TEXT, message TEXT, reply TEXT, extracted TEXT, error TEXT,
    created_at INTEGER, updated_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS followups_thread ON followups(thread_id);
  CREATE INDEX IF NOT EXISTS followups_shop ON followups(shop_id, product_id);
`);

const DAY = 86_400_000;
const row = (r) => (r ? { ...r, shop_name: getShop(r.shop_id)?.name || null, phone: getShop(r.shop_id)?.phone || null, extracted: r.extracted ? JSON.parse(r.extracted) : null } : null);

/** In the user's own voice — they send it. */
export function outreachMessage(productTitle) {
  return `سلام، وقت بخیر 🌱 «${productTitle}» رو الان موجود دارید؟ قیمت امروزش چنده؟ می‌خوام امروز حضوری بیام. ممنون 🙏`;
}

/** Every way the user can reach this shop, best first. Phone numbers in the dataset are placeholders. */
export function shopChannels(shop) {
  const out = [];
  if (shop.instagram) out.push({ kind: 'instagram', handle: shop.instagram, dm_url: `https://ig.me/m/${shop.instagram}`, profile_url: `https://instagram.com/${shop.instagram}` });
  if (shop.website) out.push({ kind: 'website', url: shop.website });
  const mobile = toEnglishDigits(shop.phone || '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(mobile)) out.push({ kind: 'whatsapp', url: `https://wa.me/98${mobile.slice(1)}` });
  if (shop.phone) out.push({ kind: 'phone', number: shop.phone });
  return out;
}

/** The user wants to ask a shop: record a prepared follow-up (or reuse a fresh answer). Nothing is sent by us. */
export function createFollowup({ threadId, shopId, productId, productTitle, message }) {
  const cached = recentAnswer(shopId, productId);
  const open = db.prepare(`SELECT * FROM followups WHERE thread_id = ? AND shop_id = ? AND product_id = ? AND status IN ('prepared', 'waiting') ORDER BY created_at DESC LIMIT 1`).get(threadId, shopId, productId);
  if (open && !cached) return row(open);
  const now = Date.now();
  const rec = { id: crypto.randomUUID(), thread_id: threadId, shop_id: shopId, product_id: productId, product_title: productTitle, channel: 'user', status: cached ? 'answered' : 'prepared', message, reply: cached?.reply ?? null, extracted: cached?.extracted ? JSON.stringify(cached.extracted) : null, error: null, created_at: now, updated_at: cached?.updated_at ?? now };
  db.prepare(`INSERT INTO followups VALUES (@id, @thread_id, @shop_id, @product_id, @product_title, @channel, @status, @message, @reply, @extracted, @error, @created_at, @updated_at)`).run(rec);
  return { ...row(rec), reused: !!cached };
}

/** The user says they sent the message. */
export function markFollowupSent(id) {
  db.prepare(`UPDATE followups SET status = 'waiting', updated_at = ? WHERE id = ? AND status = 'prepared'`).run(Date.now(), id);
  return row(db.prepare('SELECT * FROM followups WHERE id = ?').get(id));
}

export function recentAnswer(shopId, productId) {
  return row(db.prepare(`SELECT * FROM followups WHERE shop_id = ? AND product_id = ? AND status = 'answered' AND updated_at > ? ORDER BY updated_at DESC LIMIT 1`).get(shopId, productId, Date.now() - DAY));
}

export const followupsForThread = (threadId) =>
  db.prepare('SELECT * FROM followups WHERE thread_id = ? ORDER BY created_at DESC').all(threadId).map((r) => {
    // A shop answers once; every thread that asked sees the shared answer.
    const shared = r.status !== 'answered' ? recentAnswer(r.shop_id, r.product_id) : null;
    return shared ? { ...row(r), status: 'answered', reply: shared.reply, extracted: shared.extracted, updated_at: shared.updated_at } : row(r);
  });

/** The user tells us what the shop said on a manual channel (phone/WhatsApp). */
export async function recordManualAnswer(id, text) {
  const r = db.prepare('SELECT * FROM followups WHERE id = ?').get(id);
  if (!r) return null;
  const extracted = await extractShopReply(r.product_title, text);
  db.prepare(`UPDATE followups SET status = 'answered', reply = ?, extracted = ?, updated_at = ? WHERE id = ?`).run(text, JSON.stringify({ ...extracted, source: 'user_reported' }), Date.now(), id);
  return row(db.prepare('SELECT * FROM followups WHERE id = ?').get(id));
}

// ---------- webhook side ----------

export function seenEvent(eventId) {
  if (!eventId) return false;
  const hit = db.prepare('SELECT 1 FROM webhook_events WHERE event_id = ?').get(eventId);
  if (!hit) db.prepare('INSERT INTO webhook_events VALUES (?, ?)').run(eventId, Date.now());
  return !!hit;
}

export function rememberContact(username, senderId) {
  if (!username || !senderId) return;
  db.prepare('INSERT INTO ig_contacts VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET sender_id = excluded.sender_id, updated_at = excluded.updated_at').run(username.toLowerCase(), senderId, Date.now());
}

export function usernameForSender(senderId) {
  return db.prepare('SELECT username FROM ig_contacts WHERE sender_id = ?').get(senderId)?.username || null;
}

/** A shop replied on Instagram: attach the reply to its open follow-ups and extract stock/price. */
export async function recordShopReply(username, text) {
  const shopIds = getShopIdsByInstagram(username);
  const open = shopIds.flatMap((id) => db.prepare(`SELECT * FROM followups WHERE shop_id = ? AND status IN ('prepared', 'waiting') AND created_at > ?`).all(id, Date.now() - 3 * DAY));
  for (const f of open) {
    const extracted = await extractShopReply(f.product_title, text);
    db.prepare(`UPDATE followups SET status = 'answered', reply = ?, extracted = ?, updated_at = ? WHERE id = ?`).run(text, JSON.stringify({ ...extracted, source: 'shop_instagram' }), Date.now(), f.id);
  }
  return open.length;
}

let igIndex;
function getShopIdsByInstagram(username) {
  if (!igIndex) {
    igIndex = new Map();
    for (const id of instagramShopIds()) {
      const key = getShop(id).instagram.toLowerCase();
      igIndex.set(key, [...(igIndex.get(key) || []), id]);
    }
  }
  return igIndex.get(String(username).toLowerCase()) || [];
}

export const isShopUsername = (username) => getShopIdsByInstagram(username).length > 0;

// ---------- Data API evidence ----------

const GENERIC = new Set(['گوشی', 'موبایل', 'مدل', 'حافظه', 'گیگابایت', 'رم', 'دو', 'سیم', 'برای', 'مناسب', 'با', 'و', 'اپل', 'سامسونگ', 'هدفون', 'بی', 'سیم']);

/** Recent public posts that mention the product, with any prices they state. Read-only, no consent needed. */
export async function instagramEvidence(shopId, productTitle) {
  const shop = getShop(shopId);
  if (!shop?.instagram) return { available: false, reason: 'no_instagram' };
  if (!boxapiStatus().data_api) return { available: false, reason: 'not_configured' };
  const posts = await recentPosts(shop.instagram);
  const words = normalizeText(productTitle).split(' ').filter((w) => w.length > 1 && !GENERIC.has(w));
  const keyWords = words.filter((w) => /\d|[a-z]/.test(w));
  const matches = posts
    .map((p) => {
      const cap = normalizeText(p.caption);
      const hits = words.filter((w) => cap.includes(w)).length;
      const keyHit = !keyWords.length || keyWords.some((w) => cap.includes(w));
      return { ...p, hits, keyHit };
    })
    .filter((p) => p.hits >= 2 && p.keyHit)
    .sort((a, b) => (b.taken_at || 0) - (a.taken_at || 0))
    .slice(0, 3)
    .map((p) => ({
      posted_at: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : null,
      age_days: p.taken_at ? Math.floor((Date.now() / 1000 - p.taken_at) / 86400) : null,
      snippet: p.caption.replace(/\s+/g, ' ').slice(0, 220),
      prices: extractPrices(p.caption),
      url: p.url,
    }));
  return { available: true, username: shop.instagram, posts_checked: posts.length, matches };
}
