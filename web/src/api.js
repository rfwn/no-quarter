const THREAD_KEY = 'torob-agent-thread';

const newId = () => crypto.randomUUID();

export function getThreadId() {
  try {
    let id = localStorage.getItem(THREAD_KEY);
    if (!id) localStorage.setItem(THREAD_KEY, (id = newId()));
    return id;
  } catch {
    return (getThreadId.fallback ||= newId());
  }
}

/** Switch the current conversation (its history lives on the server, keyed by thread id). */
export function setCurrentThread(id) {
  try {
    localStorage.setItem(THREAD_KEY, id);
  } catch {
    getThreadId.fallback = id;
  }
  return id;
}

// ---------- chat list (per browser) ----------

const CHATS_KEY = 'torobchin-chats';

export function loadChats() {
  try {
    return JSON.parse(localStorage.getItem(CHATS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveChats(list) {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
  return list;
}

/** Record activity in a chat; the first message becomes its title. */
export function touchChat(id, firstMessage) {
  const list = loadChats();
  const existing = list.find((c) => c.id === id);
  const chat = { id, title: existing?.title || firstMessage.slice(0, 80), updatedAt: Date.now() };
  return saveChats([chat, ...list.filter((c) => c.id !== id)]);
}

export const removeChat = (id) => saveChats(loadChats().filter((c) => c.id !== id));

export function newThreadId() {
  const id = newId();
  try {
    localStorage.setItem(THREAD_KEY, id);
  } catch {
    getThreadId.fallback = id;
  }
  return id;
}

async function postJson(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ارتباط با سرور برقرار نشد.');
  return data;
}

/**
 * POST /api/chat streams NDJSON events from the agent runtime:
 * step · token · text_reset · ui · interrupt · done. Resolves with the final `done` or `interrupt` event.
 */
export async function streamChat({ threadId, message, resume, ctx }, onEvent) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, message, resume, ctx }),
  });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || 'ارتباط با سرور برقرار نشد.');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let last = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      onEvent(event);
      if (event.type === 'done' || event.type === 'interrupt') last = event;
    }
  }
  if (!last) throw new Error('پاسخ کامل دریافت نشد. دوباره تلاش کنید.');
  return last;
}

export async function fetchThread(threadId) {
  const res = await fetch(`/api/thread?threadId=${encodeURIComponent(threadId)}`);
  if (!res.ok) return { transcript: [], pending: null };
  return res.json();
}

export const fetchShop = (threadId, shopId) => postJson('/api/shop', { threadId, shopId });

/** Re-run a shop board with new filters — no agent turn. */
export const refilterOffers = (threadId, productId, filters, ctx) => postJson('/api/offers', { threadId, productId, filters, ctx });

export async function fetchFollowups(threadId) {
  const res = await fetch(`/api/followups?threadId=${encodeURIComponent(threadId)}`);
  return res.ok ? res.json() : [];
}

export const markShopAsked = (threadId, followupId) => postJson('/api/followups/sent', { threadId, followupId });

export const reportShopAnswer = (threadId, followupId, text) => postJson('/api/followups/answer', { threadId, followupId, text });

export async function fetchAreas() {
  const res = await fetch('/api/areas');
  return res.ok ? res.json() : [];
}

export async function searchPlaces(q) {
  const res = await fetch(`/api/place?q=${encodeURIComponent(q)}`);
  return res.ok ? res.json() : [];
}

export async function reversePlace(lat, lon) {
  const res = await fetch(`/api/place/reverse?lat=${lat}&lon=${lon}`);
  return res.ok ? res.json() : { name: 'نقطه‌ی انتخابی' };
}

export async function fetchCoverage(lat, lon) {
  const res = await fetch(`/api/coverage?lat=${lat}&lon=${lon}`);
  return res.ok ? res.json() : null;
}
