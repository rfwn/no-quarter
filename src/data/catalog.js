// Read-only access to the Starcoach dataset (data/torob.db, built by scripts/build-db.js).
// Shops (6.5k) live in memory for fast geo filtering; products/offers are queried from SQLite.
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { bargainRange, phoneSignals, timeAdvice, warrantyKind } from './buying.js';
import { normalizeText, queryTokens } from './normalize.js';

const DB_PATH = process.env.DB_PATH || 'data/torob.db';
if (!existsSync(DB_PATH)) throw new Error(`${DB_PATH} not found. Run: npm run db:build`);
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

const parse = (s, d) => {
  try {
    return s ? JSON.parse(s) : d;
  } catch {
    return d;
  }
};

// ---------- time & opening hours (Asia/Tehran) ----------

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_FA = { sat: 'شنبه', sun: 'یکشنبه', mon: 'دوشنبه', tue: 'سه‌شنبه', wed: 'چهارشنبه', thu: 'پنج‌شنبه', fri: 'جمعه' };

export function tehranNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const day = parts.weekday.toLowerCase().slice(0, 3);
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};
const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Opening status from the declared weekly schedule. `unknown` when the shop never declared hours. */
export function openStatus(hours, at = tehranNow()) {
  if (!hours) return { status: 'unknown', today: null };
  const d = hours[at.day];
  if (!d || d.status === 'unsupported') return { status: 'unknown', today: null };
  const shifts = (d.shifts || []).map((s) => [toMin(s.start_time), toMin(s.end_time)]).filter(([a, b]) => !(a === 0 && b === 0));
  if (d.status === 'closed' || !shifts.length) return { status: 'closed_today', today: 'تعطیل' };
  const today = shifts.map(([a, b]) => `${fmt(a)}–${fmt(b)}`).join('، ');
  const open = shifts.find(([a, b]) => at.minutes >= a && at.minutes < (b === 0 ? 1440 : b));
  if (open) return { status: 'open', today, closes: fmt(open[1]), closes_in_min: (open[1] === 0 ? 1440 : open[1]) - at.minutes };
  const next = shifts.find(([a]) => a > at.minutes);
  return next ? { status: 'opens_later', today, opens: fmt(next[0]) } : { status: 'closed_now', today };
}

export function weekSchedule(hours) {
  if (!hours) return null;
  return ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].map((k) => {
    const d = hours[k];
    const shifts = (d?.shifts || []).filter((s) => !(s.start_time === '00:00:00' && s.end_time === '00:00:00'));
    return { day: DAY_FA[k], text: !d || d.status === 'unsupported' ? 'نامشخص' : d.status === 'closed' || !shifts.length ? 'تعطیل' : shifts.map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`).join('، ') };
  });
}

// ---------- shops (in memory) ----------

const INSTALLMENT_PROVIDERS = ['ترب‌پی', 'اسنپ‌پی', 'دیجی پی', 'تارا', 'ازکی‌وام'];

const SHOPS = new Map();
for (const r of db.prepare('SELECT * FROM shops').all()) {
  const payment = parse(r.payment, []);
  SHOPS.set(r.shop_id, {
    shop_id: r.shop_id,
    name: r.name,
    address: r.address,
    area: r.area,
    lat: r.lat,
    lon: r.lon,
    categories: parse(r.categories, []),
    phone: r.phone,
    instagram: r.instagram,
    website: r.website,
    fast_delivery: r.fast_delivery == null ? null : !!r.fast_delivery,
    hours: parse(r.hours, null),
    offer_count: r.offer_count,
    torobpay_in_person: payment.some((p) => p.provider_name === 'ترب‌پی' && p.channel === 'in_person'),
    installments: [...new Set(payment.filter((p) => INSTALLMENT_PROVIDERS.includes(p.provider_name)).map((p) => p.provider_name))],
    passage: (r.address || '').match(/(پاساژ|مجتمع|بازار|مرکز خرید|ساختمان)\s+[^،,]+/)?.[0] || null,
    floor_unit: (r.address || '').match(/(طبقه\s+[^،,]+)(?:[،,]\s*)?(واحد\s+[^،,]+|پلاک\s+[^،,]+)?/)?.slice(1).filter(Boolean).join('، ') || null,
  });
}

export const getShop = (id) => SHOPS.get(id) || null;
export const instagramShopIds = () => [...SHOPS.values()].filter((s) => s.instagram).map((s) => s.shop_id);

export function distanceKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Areas (location_label) with their shop centroid: "محدوده" choices that actually have shops.
export const AREAS = (() => {
  const by = new Map();
  for (const s of SHOPS.values()) {
    if (!s.area || s.lat == null) continue;
    const a = by.get(s.area) || { name: s.area, lat: 0, lon: 0, shops: 0 };
    a.lat += s.lat;
    a.lon += s.lon;
    a.shops++;
    by.set(s.area, a);
  }
  return [...by.values()].map((a) => ({ name: a.name, lat: +(a.lat / a.shops).toFixed(5), lon: +(a.lon / a.shops).toFixed(5), shops: a.shops })).sort((a, b) => b.shops - a.shops);
})();

/** Resolve a place the user named (area, street, passage) to coordinates using shop addresses. */
export function resolvePlace(text) {
  const q = normalizeText(text);
  if (!q) return null;
  const area = AREAS.find((a) => normalizeText(a.name) === q || q.includes(normalizeText(a.name)));
  if (area) return { name: area.name, lat: area.lat, lon: area.lon, source: 'area' };
  const hits = [...SHOPS.values()].filter((s) => s.lat != null && normalizeText(s.address).includes(q));
  if (hits.length < 3) return null; // one or two addresses are too thin to place a neighbourhood
  // Median, not mean: a street name also appears in far-off addresses ("نبش ونک" across town).
  const mid = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const lat = mid(hits.map((s) => s.lat));
  const lon = mid(hits.map((s) => s.lon));
  return { name: text, lat: +lat.toFixed(5), lon: +lon.toFixed(5), source: 'address', matched_shops: hits.length };
}

/** Nearest known area to a point — names a spot picked on the map ("نزدیک فردوسی"). */
export function nearestArea(lat, lon) {
  let best = null;
  for (const a of AREAS) {
    const d = distanceKm({ lat, lon }, a);
    if (!best || d < best.d) best = { name: a.name, d };
  }
  return best ? { name: best.name, km: Math.round(best.d * 10) / 10 } : null;
}

// ---------- products ----------

const ftsQuery = (tokens, mode) =>
  tokens
    .map((alts) => `(${alts.map((t) => `"${t.replace(/"/g, '')}"${t.length >= 2 ? '*' : ''}`).join(' OR ')})`)
    .join(mode === 'all' ? ' AND ' : ' OR ');

const searchStmt = db.prepare(`
  SELECT p.product_id, p.title, p.brand, p.category, p.model, p.images, p.offer_count, p.min_price, p.max_price,
         bm25(products_fts) AS score
  FROM products_fts f JOIN products p ON p.rowid = f.rowid
  WHERE products_fts MATCH ?
  ORDER BY score - (p.offer_count * 0.15)
  LIMIT 400`);

function toProduct(r) {
  const images = parse(r.images, []);
  return {
    product_id: r.product_id,
    title: r.title,
    brand: r.brand,
    category: r.category,
    shops: r.offer_count,
    min_price: r.min_price,
    max_price: r.max_price,
    image: images[0] || null,
  };
}

/**
 * Full-text product search with brand/category facets — facets let the agent help users who don't
 * know the exact model ("which brand / which type?").
 */
// Accessories and spare parts share the model name ("کاور Galaxy A55") and would otherwise outrank the
// product itself. Demote them unless the query is about an accessory.
const ACCESSORY = /کیف|کاور|قاب|محافظ|باتری|فلت|برد|تاچ|ال سی دی|لوازم جانبی|کابل|شاسی|درب|گلس|بند|قطعات|اسپیکر|دوربین گوشی|آویز|استند|پایه/;

// Product types people name directly. "گوشی ساده" means a basic phone, not a «قاب گوشی طرح ساده»:
// when the query names one of these and no accessory, results come from its category.
const CORE_TYPES = [
  [/گوشی|موبایل|تلفن همراه|آیفون|ایفون|iphone|گلکسی|galaxy/i, 'گوشی موبایل'],
  [/لپ ?تاپ|نوت ?بوک/, 'لپ تاپ و نوت بوک'],
  [/تبلت/, 'تبلت'],
  [/هدفون|هندزفری|هدست|ایرپاد/, 'هدفون، هدست و هندزفری'],
];

const inCategoryStmt = db.prepare(`
  SELECT p.product_id, p.title, p.brand, p.category, p.model, p.images, p.offer_count, p.min_price, p.max_price,
         bm25(products_fts) AS score
  FROM products_fts f JOIN products p ON p.rowid = f.rowid
  WHERE products_fts MATCH ? AND p.category = ?
  ORDER BY score - (p.offer_count * 0.15)
  LIMIT 400`);

const popularInCategoryStmt = db.prepare(`
  SELECT product_id, title, brand, category, model, images, offer_count, min_price, max_price, 0 AS score
  FROM products
  WHERE category = ? AND offer_count > 0 AND (? IS NULL OR min_price <= ?) AND (? IS NULL OR max_price >= ?)
  ORDER BY offer_count DESC
  LIMIT 60`);

export function searchProducts(query, { category, brand, maxPrice, minPrice, limit = 10 } = {}) {
  const tokens = queryTokens(query);
  if (!tokens.length) return { results: [], facets: { categories: [], brands: [] }, match: 'none' };
  const wantsAccessory = ACCESSORY.test(normalizeText(query));
  const core = !category && !wantsAccessory ? CORE_TYPES.find(([re]) => re.test(normalizeText(query)))?.[1] : null;
  let rows = searchStmt.all(ftsQuery(tokens, 'all'));
  let match = 'all_words';
  if (!rows.length && tokens.length > 1) {
    rows = searchStmt.all(ftsQuery(tokens, 'any'));
    match = 'some_words';
  }
  if (core) {
    // Same words inside the type's own category; if the extra words ("ساده", "خوب") match nothing there,
    // fall back to the type's most-offered products in budget — the agent then narrows with ask_user.
    let coreRows = inCategoryStmt.all(ftsQuery(tokens, 'all'), core);
    // Then any of the other words ("سامسونگ" from "گوشی سامسونگ A15"), without the type word itself.
    const rest = tokens.filter((alts) => !alts.some((t) => CORE_TYPES.some(([re]) => re.test(t))));
    if (!coreRows.length && rest.length) {
      coreRows = inCategoryStmt.all(ftsQuery(rest, 'any'), core);
      if (coreRows.length) match = 'some_words';
    }
    if (!coreRows.length) {
      coreRows = popularInCategoryStmt.all(core, maxPrice ?? null, maxPrice ?? null, minPrice ?? null, minPrice ?? null);
      match = 'category_popular';
    }
    if (coreRows.length) {
      rows = coreRows;
      category = core;
    }
  }
  const rank = (r) => r.score - r.offer_count * 0.15 + (!wantsAccessory && ACCESSORY.test(r.category || '') ? 6 : 0);
  rows.sort((a, b) => rank(a) - rank(b));
  const facetCount = (key) => {
    const m = new Map();
    for (const r of rows) if (r[key]) m.set(r[key], (m.get(r[key]) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, products]) => ({ name, products }));
  };
  const facets = { categories: facetCount('category'), brands: facetCount('brand') };
  const filtered = rows.filter(
    (r) =>
      (!category || r.category === category) &&
      (!brand || r.brand === brand) &&
      (!maxPrice || (r.min_price != null && r.min_price <= maxPrice)) &&
      (!minPrice || (r.max_price != null && r.max_price >= minPrice)),
  );
  return { results: filtered.slice(0, limit).map(toProduct), total_matches: filtered.length, facets, match, ...(core && rows.length ? { category_used: core } : {}) };
}

const productStmt = db.prepare('SELECT * FROM products WHERE product_id = ?');

export function getProduct(productId, { specs = 12 } = {}) {
  const r = productStmt.get(productId);
  if (!r) return null;
  const allSpecs = parse(r.specs, []);
  return {
    ...toProduct(r),
    model: r.model,
    images: parse(r.images, []).slice(0, 4),
    specs: allSpecs.slice(0, specs).map((s) => ({ key: s.key, value: s.value })),
    priced_offers: r.priced_count,
  };
}

// ---------- offers (product × shop) ----------

const offersStmt = db.prepare('SELECT * FROM offers WHERE product_id = ?');
const offerStmt = db.prepare('SELECT * FROM offers WHERE offer_id = ?');
const DAY_MS = 86_400_000;

export function priceAgeDays(iso, now = Date.now()) {
  return iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / DAY_MS)) : null;
}

/** Transparency: listed price, price age and stock are separate facts. Stock is never "confirmed" from the dataset. */
function toOffer(o, origin, at, category = null) {
  const s = SHOPS.get(o.shop_id);
  if (!s) return null;
  const warranty = parse(o.warranty, null);
  const age = priceAgeDays(o.price_changed_at);
  return {
    offer_id: o.offer_id,
    product_id: o.product_id,
    shop_id: s.shop_id,
    shop_name: s.name,
    seller_title: o.seller_title,
    description: o.description ? o.description.slice(0, 300) : null,
    price: o.price, // null = no price listed
    price_changed_at: o.price_changed_at,
    price_age_days: age,
    price_freshness: age == null ? 'unknown' : age <= 7 ? 'fresh' : age <= 30 ? 'recent' : 'stale',
    stock: 'unconfirmed', // the dataset lists offers, not inventory
    warranty: warranty ? { provider: warranty.provider, months: warranty.period_months } : null,
    warranty_kind: warrantyKind(warranty ? { provider: warranty.provider, months: warranty.period_months } : null),
    // What the seller's own listing claims (نات اکتیو، رجیستر…) — phones only; seller-written.
    seller_claims: category === 'گوشی موبایل' ? phoneSignals(`${o.seller_title || ''} ${o.description || ''}`) : [],
    area: s.area,
    address: s.address,
    passage: s.passage,
    floor_unit: s.floor_unit,
    lat: s.lat,
    lon: s.lon,
    distance_km: origin && s.lat != null ? Math.round(distanceKm(origin, s) * 10) / 10 : null,
    open: openStatus(s.hours, at),
    torobpay_in_person: s.torobpay_in_person,
    installments: s.installments,
    fast_delivery: s.fast_delivery,
    has_instagram: !!s.instagram,
    has_website: !!s.website,
    has_hours: !!s.hours,
  };
}

export const getOffer = (offerId, origin) => {
  const o = offerStmt.get(offerId);
  return o ? toOffer(o, origin, tehranNow()) : null;
};

/**
 * Sellers of a product near an origin, with filters the UI can change without the agent:
 * radius, budget, open now, TorobPay in person, installments, fast delivery, warranty.
 */
// ---------- one shop's page ----------

const shopOffersStmt = db.prepare(`
  SELECT o.*, p.title, p.brand, p.category, p.images
  FROM offers o JOIN products p ON p.product_id = o.product_id
  WHERE o.shop_id = ?`);

/**
 * What a shop lists (up to 300 products in the export): searchable, filterable by category, freshest price
 * first. The dataset lists offers, not inventory — every row's stock stays "unconfirmed".
 */
export function shopCatalog(shopId, { query = '', category = null, origin = null, offset = 0, limit = 12 } = {}) {
  if (!SHOPS.has(shopId)) return null;
  const at = tehranNow();
  const all = shopOffersStmt.all(shopId);
  const cats = new Map();
  for (const r of all) if (r.category) cats.set(r.category, (cats.get(r.category) || 0) + 1);
  const words = normalizeText(query).split(' ').filter((w) => w.length > 1);
  const rows = all
    .filter((r) => (!category || r.category === category) && words.every((w) => normalizeText(`${r.title} ${r.brand || ''} ${r.seller_title || ''}`).includes(w)))
    .sort((a, b) => (b.price != null) - (a.price != null) || String(b.price_changed_at || '').localeCompare(String(a.price_changed_at || '')));
  return {
    total: all.length,
    matched: rows.length,
    categories: [...cats].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, n]) => ({ name, n })),
    items: rows.slice(offset, offset + limit).map((r) => ({ ...toOffer(r, origin, at), title: r.title, brand: r.brand, category: r.category, image: parse(r.images, [])[0] || null })),
  };
}

/** Shops whose name contains the text (names are unique enough in this export to pick the first few). */
export function findShopsByName(text, limit = 3) {
  const q = normalizeText(text);
  if (q.length < 2) return [];
  return [...SHOPS.values()].filter((s) => normalizeText(s.name).includes(q)).slice(0, limit).map((s) => ({ shop_id: s.shop_id, name: s.name, area: s.area, passage: s.passage }));
}

/** A shop's page: profile, where each fact comes from, and the first page of what it lists. */
export function shopPage(shopId, { origin = null, query = '', category = null, offset = 0 } = {}) {
  const profile = shopProfile(shopId);
  if (!profile) return null;
  const s = SHOPS.get(shopId);
  const listed = shopCatalog(shopId, { origin, query, category, offset });
  const listedCats = new Set(listed.categories.map((c) => c.name));
  return {
    ...profile,
    distance_km: origin && s.lat != null ? Math.round(distanceKm(origin, s) * 10) / 10 : null,
    has_hours: !!s.hours,
    // Declared activity categories it lists nothing in: a hint, never a sign the product is there.
    declared_only_categories: s.categories.filter((c) => !listedCats.has(c)).slice(0, 8),
    catalog: listed,
  };
}

export function findOffers(productId, { origin, radiusKm, maxPrice, openNow, torobpay, installments, fastDelivery, warranty, sort = 'auto', limit = 20 } = {}) {
  const at = tehranNow();
  const category = productStmt.get(productId)?.category || null;
  const all = offersStmt.all(productId).map((o) => toOffer(o, origin, at, category)).filter(Boolean);
  const passes = (o) =>
    (!radiusKm || o.distance_km == null || o.distance_km <= radiusKm) &&
    (!maxPrice || (o.price != null && o.price <= maxPrice)) &&
    (!openNow || o.open.status === 'open') &&
    (!torobpay || o.torobpay_in_person) &&
    (!installments || o.installments.length > 0) &&
    (!fastDelivery || o.fast_delivery === true) &&
    (!warranty || o.warranty_kind.kind === 'company' || o.warranty_kind.kind === 'named'); // «تست و تحویل» is not a warranty
  const matched = all.filter(passes);
  const by = sort === 'price' || (sort === 'auto' && !origin) ? (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) : (a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
  matched.sort(by);
  const prices = all.map((o) => o.price).filter(Boolean).sort((a, b) => a - b);
  return {
    total: all.length,
    matched: matched.length,
    excluded_by_filters: all.length - matched.length,
    price_range: prices.length ? { min: prices[0], max: prices[prices.length - 1] } : null,
    // Median over every listed price (not just the filtered page): the reference for "below market".
    price_median: prices.length ? prices[Math.floor(prices.length / 2)] : null,
    bargain: bargainRange(prices),
    time: timeAdvice(matched.slice(0, Math.max(limit, 15)), { day: at.day }),
    offers: matched.slice(0, limit),
  };
}

const catShopsStmt = db.prepare('SELECT shop_id FROM shop_categories WHERE category = ?');

/**
 * Shops whose declared category matches but that list no offer for this product.
 * Category alone is NOT availability — these are "may have it, ask first".
 */
export function categoryShopsNear(category, { origin, radiusKm = 3, exclude = [], limit = 6 } = {}) {
  if (!category) return [];
  const skip = new Set(exclude);
  const at = tehranNow();
  return catShopsStmt
    .all(category)
    .map((r) => SHOPS.get(r.shop_id))
    .filter((s) => s && !skip.has(s.shop_id) && s.lat != null)
    .map((s) => ({ shop_id: s.shop_id, shop_name: s.name, area: s.area, address: s.address, distance_km: origin ? Math.round(distanceKm(origin, s) * 10) / 10 : null, open: openStatus(s.hours, at), has_instagram: !!s.instagram, has_website: !!s.website }))
    .filter((s) => !origin || s.distance_km <= radiusKm)
    .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
    .slice(0, limit);
}

// ---------- shops by kind ("nearest phone shop") ----------

const SHOP_CATEGORIES = db.prepare('SELECT category, COUNT(*) n FROM shop_categories GROUP BY category').all();
// Words that describe the request, not the kind of shop.
const SHOP_STOP = new Set(['مغازه', 'فروشگاه', 'فروشی', 'فروش', 'نزدیک', 'نزدیکترین', 'ترین', 'به', 'من', 'کجاست', 'کجا', 'یه', 'یک', 'های', 'ها', 'لوازم', 'و', 'با', 'برای']);
const SHOP_ALIASES = { موبایل: 'گوشی موبایل', گوشی: 'گوشی موبایل', لپتاپ: 'لپ تاپ و نوت بوک', لپ: 'لپ تاپ و نوت بوک', هدفون: 'هدفون، هدست و هندزفری', ساعت: 'ساعت مچی عقربه‌ ای و دیجیتالی' };

/** Shop categories that best match free text ("موبایل فروشی" → «گوشی موبایل», …), most shops first. */
export function matchShopCategories(text, limit = 4) {
  const words = normalizeText(text)
    .replace(/فروشی|ترین/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !SHOP_STOP.has(w));
  if (!words.length) return [];
  const alias = words.map((w) => SHOP_ALIASES[w]).find(Boolean);
  // The request as a phrase ("لوازم تحریر"), so whole-phrase matches beat single-word ones.
  const phrase = normalizeText(text)
    .replace(/فروشی|ترین/g, ' ')
    .split(' ')
    .filter((w) => w && !['مغازه', 'فروشگاه', 'نزدیک', 'به', 'من', 'کجاست', 'کجا', 'یه', 'یک'].includes(w))
    .join(' ');
  return SHOP_CATEGORIES.map((c) => {
    const name = normalizeText(c.category);
    const hits = words.filter((w) => name.includes(w)).length;
    const exact = alias && c.category === alias ? 2 : 0;
    const whole = phrase.includes(' ') && name.includes(phrase) ? 1 : 0;
    return { category: c.category, shops: c.n, score: hits / words.length + exact + whole };
  })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || b.shops - a.shops)
    .slice(0, limit);
}

/** Shops of a kind near a point, nearest first. Includes coordinates — callers strip them for the model. */
export function shopsOfKindNear(categories, { origin, radiusKm = 3, openNow = false, limit = 12 } = {}) {
  const at = tehranNow();
  const ids = new Set([categories].flat().flatMap((c) => catShopsStmt.all(c).map((r) => r.shop_id)));
  let rows = [...ids]
    .map((id) => SHOPS.get(id))
    .filter((s) => s && s.lat != null)
    .map((s) => ({ shop_id: s.shop_id, shop_name: s.name, area: s.area, address: s.address, lat: s.lat, lon: s.lon, distance_km: origin ? Math.round(distanceKm(origin, s) * 10) / 10 : null, open: openStatus(s.hours, at), has_instagram: !!s.instagram, has_website: !!s.website, offer_count: s.offer_count || 0 }));
  if (openNow) rows = rows.filter((s) => s.open?.status === 'open');
  const near = origin ? rows.filter((s) => s.distance_km <= radiusKm) : rows;
  // Too few inside the radius: widen to the nearest ones anywhere, so the answer is never empty.
  const pool = near.length >= 3 ? near : rows;
  return pool.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0) || b.offer_count - a.offer_count).slice(0, limit);
}

const altStmt = db.prepare(`
  SELECT p.product_id, p.title, p.brand, p.category, p.model, p.images, p.offer_count, p.min_price, p.max_price, bm25(products_fts) AS score
  FROM products_fts f JOIN products p ON p.rowid = f.rowid
  WHERE products_fts MATCH ? AND p.category = ? AND p.product_id != ? AND p.offer_count > 0
  ORDER BY score LIMIT 60`);

/** Similar products (same category, overlapping title words) that are actually offered — for "not available" cases. */
export function findAlternatives(productId, { origin, radiusKm, maxPrice, limit = 6 } = {}) {
  const base = productStmt.get(productId);
  if (!base) return [];
  const words = normalizeText(`${base.title} ${base.brand || ''}`)
    .split(' ')
    .filter((w) => w.length > 1)
    .slice(0, 10);
  if (!words.length) return [];
  const rows = altStmt.all(words.map((w) => `"${w}"`).join(' OR '), base.category, productId);
  const out = [];
  for (const r of rows) {
    const near = findOffers(r.product_id, { origin, radiusKm, maxPrice, limit: 1, sort: origin ? 'distance' : 'price' });
    if (!near.matched) continue;
    out.push({ ...toProduct(r), nearest_km: near.offers[0].distance_km, cheapest_near: Math.min(...near.offers.map((o) => o.price ?? Infinity)) });
    if (out.length >= limit) break;
  }
  return out;
}

export function shopProfile(shopId) {
  const s = SHOPS.get(shopId);
  if (!s) return null;
  return {
    shop_id: s.shop_id,
    name: s.name,
    area: s.area,
    address: s.address,
    passage: s.passage,
    floor_unit: s.floor_unit,
    lat: s.lat,
    lon: s.lon,
    phone: s.phone,
    instagram: s.instagram,
    website: s.website,
    week: weekSchedule(s.hours),
    open: openStatus(s.hours),
    torobpay_in_person: s.torobpay_in_person,
    installments: s.installments,
    fast_delivery: s.fast_delivery,
    categories: s.categories.slice(0, 8),
  };
}

/**
 * How well the dataset covers a point. Torob's export holds ~10% of Tehran's shops, from selected areas,
 * so a location can simply be outside it — say so instead of showing far-away shops as "near you".
 */
export function coverageAt(lat, lon) {
  let within2 = 0;
  let nearest = Infinity;
  for (const s of SHOPS.values()) {
    if (s.lat == null) continue;
    const d = distanceKm({ lat, lon }, s);
    if (d <= 2) within2++;
    if (d < nearest) nearest = d;
  }
  const busy = AREAS.filter((a) => a.shops >= 40)
    .map((a) => ({ name: a.name, lat: a.lat, lon: a.lon, shops: a.shops, km: Math.round(distanceKm({ lat, lon }, a) * 10) / 10 }))
    .sort((a, b) => a.km - b.km)[0];
  const level = within2 >= 25 ? 'good' : within2 >= 5 ? 'some' : 'low';
  return { level, shops_within_2km: within2, nearest_shop_km: Math.round(nearest * 10) / 10, nearest_busy_area: level === 'good' ? null : busy || null };
}

export const dataAsOf = () => db.prepare('SELECT MAX(price_changed_at) d FROM offers').get().d;

export const datasetInfo = () => ({
  shops: SHOPS.size,
  products: db.prepare('SELECT COUNT(*) n FROM products').get().n,
  offers: db.prepare('SELECT COUNT(*) n FROM offers').get().n,
  newest_price_change: db.prepare('SELECT MAX(price_changed_at) d FROM offers').get().d,
});
