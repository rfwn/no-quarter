// ترب‌چیدن: every search is a basket (سبد) to fill; real progress earns ترب (points), levels, badges
// and a savings ledger.
// Per-viewer state in localStorage (a convenience; the app works without it).
// Savings are always measured against the median *listed* price of the product — never invented.

const KEY = 'torobchin-game-v1';

export const LEVELS = [
  { min: 0, name: 'ترب‌چین تازه‌کار' },
  { min: 60, name: 'ترب‌چین بازارگرد' },
  { min: 160, name: 'ترب‌چین زبر و زرنگ' },
  { min: 320, name: 'استاد ترب‌چینی' },
  { min: 600, name: 'افسانه‌ی ترب‌چین‌ها' },
];

// Points per real action. Repeats of the same action on the same mission don't stack.
const XP = { search: 10, shops: 15, filter: 5, map: 5, pick: 5, compare: 20, plan: 30, ask_shop: 25, verdict: 15, alternatives: 10 };

export const BADGES = [
  { id: 'first_hunt', name: 'اولین ترب', hint: 'اولین جست‌وجو را بزن', got: 'اولین تربت را چیدی!', when: (s) => s.counts.search >= 1 },
  { id: 'map_reader', name: 'نقشه‌ی مزرعه', hint: 'مغازه‌ها را روی نقشه ببین', got: 'مزرعه را از بالا دیدی.', when: (s) => s.counts.map >= 1 },
  { id: 'comparer', name: 'ترب‌سنج', hint: 'دو مغازه را مقایسه کن', got: 'اولین مقایسه‌ات را کردی.', when: (s) => s.counts.compare >= 1 },
  { id: 'detective', name: 'قیمت‌سنج', hint: 'قیمتی که پیشنهاد شده را بسنج', got: 'قیمت فروشنده را با بازار سنجیدی.', when: (s) => s.counts.verdict >= 1 },
  { id: 'asker', name: 'پرس‌وجوگر', hint: 'از یک مغازه موجودی را بپرس', got: 'از مغازه موجودی را پرسیدی.', when: (s) => s.counts.ask_shop >= 1 },
  { id: 'route_maker', name: 'مسیرساز', hint: 'برنامه‌ی رفتن بچین', got: 'اولین مسیر خریدت آماده شد.', when: (s) => s.counts.plan >= 1 },
  { id: 'saver', name: 'ترب درشت', hint: '۱۰ میلیون زیر میانه‌ی بازار پیدا کن', got: 'بیش از ۱۰ میلیون زیر میانه‌ی بازار چیدی!', when: (s) => s.savingsTotal >= 10_000_000 },
  { id: 'veteran', name: 'سه سبد پر', hint: '۳ سبد را پر کن', got: 'سه سبد خرید را پر کردی.', when: (s) => s.missionsDone >= 3 },
];

export const MISSION_STEPS = [
  { id: 'product', label: 'کالا' },
  { id: 'shops', label: 'مغازه‌ها' },
  { id: 'compare', label: 'مقایسه' },
  { id: 'plan', label: 'مسیر' },
];

const fresh = () => ({ xp: 0, counts: {}, badges: [], savings: {}, savingsTotal: 0, missionsDone: 0, mission: null });

function load() {
  try {
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return fresh();
  }
}

let state = load();
const listeners = new Set();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
};
const emit = (event) => listeners.forEach((l) => l(state, event));

export const getGame = () => state;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function levelOf(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1];
  return { index: i, name: LEVELS[i].name, min: LEVELS[i].min, next: next?.min ?? null, progress: next ? (xp - LEVELS[i].min) / (next.min - LEVELS[i].min) : 1 };
}

/**
 * A basket (سبد) starts only when the agent actually finds products or shops — not on every message —
 * so small talk or "where am I?" never fills a step. Titled by the product found, not the user's words.
 */
export function startBasket(title) {
  const m = state.mission;
  // Keep the open basket — and a just-filled one for the same product (a board shown after its plan).
  if (m && (!m.done || m.title === title)) return;
  state = { ...state, mission: { id: crypto.randomUUID(), title, steps: [], done: false, awarded: [] } };
  record('search');
}

/**
 * Record a real action. Returns nothing; listeners get {xp, step, badges, missionDone} for celebration.
 * Each action type earns points once per mission (except picks, which earn per distinct shop).
 */
export function record(action, { key } = {}) {
  const m = state.mission;
  const awardKey = `${action}:${key ?? ''}`;
  if (m && m.awarded.includes(awardKey)) return;
  const gained = XP[action] || 0;
  const before = levelOf(state.xp).index;
  const counts = { ...state.counts, [action]: (state.counts[action] || 0) + 1 };
  let mission = m ? { ...m, awarded: [...m.awarded, awardKey] } : null;

  const stepFor = { search: 'product', alternatives: 'product', shops: 'shops', verdict: 'shops', compare: 'compare', plan: 'plan' }[action];
  let step = null;
  if (mission && stepFor && !mission.steps.includes(stepFor)) {
    mission = { ...mission, steps: [...mission.steps, stepFor] };
    step = stepFor;
  }
  let missionDone = false;
  let missionsDone = state.missionsDone;
  if (mission && !mission.done && mission.steps.includes('plan')) {
    mission = { ...mission, done: true };
    missionDone = true;
    missionsDone += 1;
  }

  state = { ...state, xp: state.xp + gained + (missionDone ? 40 : 0), counts, mission, missionsDone };
  const newBadges = BADGES.filter((b) => !state.badges.includes(b.id) && b.when(state));
  if (newBadges.length) state = { ...state, badges: [...state.badges, ...newBadges.map((b) => b.id)] };
  save();
  emit({ action, xp: gained + (missionDone ? 40 : 0), step, missionDone, badges: newBadges, levelUp: levelOf(state.xp).index > before ? levelOf(state.xp) : null });
}

/**
 * The user picked a shop priced under the product's median listed price.
 * Savings per product count once, at the best pick — so re-picking can't inflate the total.
 */
export function recordSaving(productId, amount, shopName) {
  if (!(amount > 0)) return;
  const prev = state.savings[productId] || 0;
  if (amount <= prev) return;
  const savings = { ...state.savings, [productId]: amount };
  const savingsTotal = Object.values(savings).reduce((a, b) => a + b, 0);
  state = { ...state, savings, savingsTotal };
  const newBadges = BADGES.filter((b) => !state.badges.includes(b.id) && b.when(state));
  if (newBadges.length) state = { ...state, badges: [...state.badges, ...newBadges.map((b) => b.id)] };
  save();
  emit({ action: 'saving', saving: amount - prev, shopName, badges: newBadges });
}

/** Abandon the current mission (new search from scratch). Earned points and badges stay. */
export function clearMission() {
  state = { ...state, mission: null };
  save();
  emit({ action: 'reset' });
}

export function resetGame() {
  state = fresh();
  save();
  emit({ action: 'reset' });
}
