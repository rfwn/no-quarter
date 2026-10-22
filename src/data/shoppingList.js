// Several items in one trip ("یه گوشی، یه قاب براش و یه شارژر"): which product each line means, and three
// honest ways to buy them nearby — one shop, one passage, or the cheapest mix — with totals and stops.
// Listed prices only; stock is never confirmed.
import { findOffers, searchProducts } from './catalog.js';
import { normalizeText, queryTokens } from './normalize.js';

const MAX_KM = 5; // an in-person trip; further sellers aren't "nearby" options

/** The product a list line means: one that matches every word and that the most shops list. */
export function resolveItem(query) {
  const results = searchProducts(query, { limit: 10 }).results.filter((p) => p.shops > 0);
  if (!results.length) return null;
  const toks = queryTokens(query);
  const full = results.filter((p) => toks.every((alts) => alts.some((a) => normalizeText(`${p.title} ${p.model || ''}`).includes(a))));
  const pool = full.length ? full : results;
  return [...pool].sort((a, b) => b.shops - a.shops)[0];
}

const cheapest = (offers) => offers.reduce((m, o) => (m == null || o.price < m.price ? o : m), null);

function stop(offers) {
  const o = offers[0];
  return {
    shop_id: o.shop_id,
    shop_name: o.shop_name,
    passage: o.passage,
    floor_unit: o.floor_unit,
    lat: o.lat,
    lon: o.lon,
    distance_km: o.distance_km,
    open: o.open?.status || 'unknown',
    items: offers.map((x) => ({ product_id: x.product_id, offer_id: x.offer_id, price: x.price, price_age_days: x.price_age_days })),
  };
}

function option(kind, title, picks, products) {
  const chosen = picks.filter(Boolean);
  const byShop = new Map();
  for (const o of chosen) byShop.set(o.shop_id, [...(byShop.get(o.shop_id) || []), o]);
  const stops = [...byShop.values()].map(stop).sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
  return {
    kind,
    title,
    stops,
    stop_count: stops.length,
    covered: chosen.length,
    missing: products.filter((p) => !chosen.some((o) => o.product_id === p.product_id)).map((p) => p.title),
    total: chosen.reduce((s, o) => s + o.price, 0),
    offer_ids: chosen.map((o) => o.offer_id),
  };
}

/**
 * @param {Array<{product_id:string, title:string}>} products  the resolved list (2–5 items)
 * @param {{lat:number, lon:number}|null} origin
 */
export function planShoppingList(products, origin) {
  // Priced offers per product, within reach when we know where they are.
  const per = products.map((p) => ({
    product: p,
    offers: findOffers(p.product_id, { origin, limit: 300 }).offers.filter((o) => o.price != null && (!origin || o.distance_km == null || o.distance_km <= MAX_KM)),
  }));
  const options = [];

  // 1) One shop that lists the most items (then cheapest, then nearest).
  const shops = new Map();
  for (const { product, offers } of per) {
    for (const o of offers) {
      const s = shops.get(o.shop_id) || new Map();
      const cur = s.get(product.product_id);
      if (!cur || o.price < cur.price) s.set(product.product_id, o);
      shops.set(o.shop_id, s);
    }
  }
  const bestShop = [...shops.values()]
    .map((m) => [...m.values()])
    .sort((a, b) => b.length - a.length || a.reduce((s, o) => s + o.price, 0) - b.reduce((s, o) => s + o.price, 0) || (a[0].distance_km ?? 0) - (b[0].distance_km ?? 0))[0];
  if (bestShop && bestShop.length >= 2) options.push(option('one_shop', bestShop.length === products.length ? 'همه از یه مغازه' : `${bestShop.length.toLocaleString('fa-IR')} تا از یه مغازه`, bestShop, products));

  // 2) One passage: the cheapest of each item among that passage's shops.
  const passages = new Map();
  for (const { product, offers } of per) {
    for (const o of offers) {
      if (!o.passage) continue;
      const m = passages.get(o.passage) || new Map();
      const cur = m.get(product.product_id);
      if (!cur || o.price < cur.price) m.set(product.product_id, o);
      passages.set(o.passage, m);
    }
  }
  const bestPassage = [...passages.entries()]
    .map(([name, m]) => ({ name, picks: [...m.values()] }))
    .filter((x) => new Set(x.picks.map((o) => o.shop_id)).size > 1 || x.picks.length > (bestShop?.length || 0))
    .sort((a, b) => b.picks.length - a.picks.length || a.picks.reduce((s, o) => s + o.price, 0) - b.picks.reduce((s, o) => s + o.price, 0))[0];
  if (bestPassage && bestPassage.picks.length >= 2) {
    const all = bestPassage.picks.length === products.length;
    options.push(option('one_passage', all ? `همه توی ${bestPassage.name}` : `${bestPassage.picks.length.toLocaleString('fa-IR')} تا توی ${bestPassage.name}`, bestPassage.picks, products));
  }

  // 3) Cheapest mix: the cheapest nearby offer of each item, however many stops.
  const mix = per.map(({ offers }) => cheapest(offers));
  if (mix.filter(Boolean).length >= 1) options.push(option('cheapest', 'ارزون‌ترین ترکیب', mix, products));

  // Drop options that are the same set of offers as an earlier one.
  const seen = new Set();
  const unique = options.filter((o) => {
    const key = [...o.offer_ids].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { items: per.map(({ product, offers }) => ({ product_id: product.product_id, title: product.title, image: product.image || null, sellers_nearby: new Set(offers.map((o) => o.shop_id)).size })), options: unique };
}
