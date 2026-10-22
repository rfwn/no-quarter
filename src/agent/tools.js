// The agent's tools over the Starcoach dataset, in three kinds (see harness/registry.js):
//   data  — dataset lookups and Instagram evidence; produce grounded facts
//   ui    — generative UI: the model picks a component and passes ids; the harness hydrates real data,
//           so a component can never show a price, phone or distance the data didn't contain
//   human — human-in-the-loop: pause the graph for a choice, a location, or approval to contact a shop
import { z } from 'zod';
import { defineTool, ToolError } from '../harness/registry.js';
import * as catalog from '../data/catalog.js';
import { normalizeText } from '../data/normalize.js';
import { instagramEvidence, followupsForThread, recentAnswer, outreachMessage, createFollowup, shopChannels } from '../followups.js';
import { sanitizeSellerText } from '../governance/untrusted.js';
import { websiteEvidence } from '../integrations/website.js';
import { emptyFacts, mergeFacts } from '../governance/grounding.js';
import { phoneKey } from '../governance/privacy.js';

const id = z.string().min(1).max(80);
// Models send 0 to mean "no limit": accepted here, cleared to unset by the registry (UNSET_WHEN_ZERO).
const toman = () => z.number().int().nonnegative().optional();
const km = () => z.number().nonnegative().max(40).optional();
const origin = (state) => (state.ctx?.lat != null ? { lat: state.ctx.lat, lon: state.ctx.lon } : null);

/**
 * offer_ids → known offers. Models sometimes pass shop_ids: those resolve to that shop's latest offer.
 * Too few → a ToolError that lists valid ids, so the model can correct itself instead of giving up.
 */
function resolveOffers(state, ids, min) {
  const known = Object.values(state.offers || {});
  const resolve = (x) => state.offers?.[x] || known.filter((o) => o.shop_id === x).at(-1);
  const offers = [...new Map(ids.map(resolve).filter(Boolean).map((o) => [o.offer_id, o])).values()];
  if (offers.length < min) {
    const valid = known.slice(-10).map((o) => `${o.offer_id} (${o.shop_name})`).join(', ');
    throw new ToolError(`Need at least ${min} offer_ids from find_sellers. Valid ones: ${valid || 'none yet — call find_sellers first'}.`);
  }
  return offers;
}

const pricesFacts = (offers) => ({ prices: offers.map((o) => o.price).filter(Boolean), phones: [] });

/** What the model sees of an offer: no coordinates or links; seller text marked untrusted. */
function offerForModel(o) {
  return {
    offer_id: o.offer_id,
    shop_id: o.shop_id,
    shop_name: o.shop_name,
    price_toman: o.price,
    price_age_days: o.price_age_days,
    price_freshness: o.price_freshness,
    stock: o.stock,
    distance_km: o.distance_km,
    area: o.area,
    passage: o.passage,
    open: o.open.status,
    hours_today: o.open.today,
    warranty: o.warranty ? `${o.warranty.provider}${o.warranty.months ? ` ${o.warranty.months} ماه` : ''}` : null,
    torobpay_in_person: o.torobpay_in_person,
    installments: o.installments,
    has_instagram: o.has_instagram,
    has_website: o.has_website,
    untrusted_seller_note: sanitizeSellerText(o.description),
  };
}

const FILTERS = z.object({
  radius_km: km().describe('Only shops within this distance'),
  max_price: toman().describe('Budget in Toman'),
  open_now: z.boolean().optional(),
  torobpay: z.boolean().optional().describe('Accepts TorobPay in person'),
  installments: z.boolean().optional().describe('Offers installment payment (اقساط)'),
  fast_delivery: z.boolean().optional(),
  warranty: z.boolean().optional().describe('Has a warranty'),
});

function filtersFromArgs(a) {
  return { radiusKm: a.radius_km, maxPrice: a.max_price, openNow: a.open_now, torobpay: a.torobpay, installments: a.installments, fastDelivery: a.fast_delivery, warranty: a.warranty };
}

export function shopBoardBlock({ product, result, filters, maybe = [], highlights = [], curatedIds }) {
  return {
    type: 'shop_board',
    data_as_of: catalog.dataAsOf(),
    product: product ? { product_id: product.product_id, title: product.title, image: product.image, category: product.category } : null,
    filters,
    total: result.total,
    matched: result.matched,
    excluded_by_filters: result.excluded_by_filters,
    price_range: result.price_range,
    price_median: result.price_median ?? null,
    offers: result.offers,
    maybe_shops: maybe,
    highlights,
    curated: !!curatedIds,
  };
}

// ---------- step 1: understand & find the product ----------

const search_products = defineTool({
  name: 'search_products',
  kind: 'data',
  description:
    'Search the Tehran product catalogue. Returns products (product_id, title, brand, category, how many shops offer it, price range) plus facets: the categories and brands that matched. Use facets to help users who do not know the exact model or brand. Narrow with category/brand/max_price.',
  schema: z.object({
    query: z.string().min(1).max(120).describe('Persian or English, e.g. "آیفون 13 128" or "airpods pro 2"'),
    category: z.string().max(80).optional().describe('Exact category name from a previous facets list'),
    brand: z.string().max(60).optional().describe('Exact brand name from a previous facets list'),
    max_price: toman(),
  }),
  async run({ query, category, brand, max_price }) {
    const r = catalog.searchProducts(query, { category, brand, maxPrice: max_price, limit: 10 });
    return {
      model: { match: r.match, total_matches: r.total_matches, results: r.results.map(({ image, ...p }) => p), facets: r.facets },
      update: {
        products: Object.fromEntries(r.results.map((p) => [p.product_id, p])),
        facts: { prices: r.results.flatMap((p) => [p.min_price, p.max_price]).filter(Boolean), phones: [] },
      },
    };
  },
});

const get_product_details = defineTool({
  name: 'get_product_details',
  kind: 'data',
  description: 'Specs, images and price range for one product — use to explain differences between models.',
  schema: z.object({ product_id: id }),
  async run({ product_id }) {
    const p = catalog.getProduct(product_id);
    if (!p) throw new ToolError('Unknown product_id.');
    return {
      model: { ...p, images: undefined },
      update: { products: { [product_id]: p }, facts: { prices: [p.min_price, p.max_price].filter(Boolean), phones: [] } },
    };
  },
});

// ---------- step 2: where, and which shops ----------

const resolve_place = defineTool({
  name: 'resolve_place',
  kind: 'data',
  description: 'When the user names a place in Tehran (area, street, passage like "پاساژ علاءالدین", "جمهوری"), turn it into the search origin.',
  schema: z.object({ text: z.string().min(2).max(60) }),
  async run({ text }) {
    const place = catalog.resolvePlace(text);
    if (!place) throw new ToolError(`Couldn't place "${text}" in the dataset. Known areas: ${catalog.AREAS.slice(0, 12).map((a) => a.name).join('، ')}. Or call request_location.`);
    return { model: place, update: { ctx: { lat: place.lat, lon: place.lon, place: place.name } } };
  },
});

const find_sellers = defineTool({
  name: 'find_sellers',
  kind: 'data',
  description:
    'Shops in Tehran that list this product, nearest first (or cheapest when location is unknown), with listed price, price age, opening status and payment options. Stock is NEVER confirmed by this data. Also returns nearby shops in the same category that do not list it ("may have it"). Results render to the user automatically as a board with filters.',
  schema: FILTERS.extend({ product_id: id }),
  async run(args, { state }) {
    const o = origin(state);
    if (!o && !state.ctx?.locationAsked) throw new ToolError("The user's location is unknown. Call request_location first (or resolve_place if they named a place).");
    const product = state.products?.[args.product_id] || catalog.getProduct(args.product_id);
    if (!product) throw new ToolError('Unknown product_id. Use one from search_products.');
    const filters = filtersFromArgs(args);
    const result = catalog.findOffers(args.product_id, { origin: o, ...filters, limit: 15 });
    const maybe = catalog.categoryShopsNear(product.category, { origin: o, radiusKm: args.radius_km || 2, exclude: result.offers.map((x) => x.shop_id), limit: 5 });
    const followed = Object.fromEntries(result.offers.map((x) => [x.offer_id, recentAnswer(x.shop_id, x.product_id)?.extracted || null]).filter(([, v]) => v));
    // Nobody lists it at all: alternatives that ARE offered nearby, found here rather than left to the model.
    const alts = result.total === 0 ? catalog.findAlternatives(product.product_id, { origin: o, maxPrice: args.max_price, radiusKm: args.radius_km }) : [];
    return {
      model: {
        product: product.title,
        total_offers: result.total,
        matched: result.matched,
        excluded_by_filters: result.excluded_by_filters,
        price_range: result.price_range,
        offers: result.offers.slice(0, 10).map(offerForModel),
        shops_answered_recently: followed,
        maybe_have_it_nearby: maybe.map((m) => ({ shop_id: m.shop_id, shop_name: m.shop_name, distance_km: m.distance_km })),
        ...(alts.length ? { no_sellers_alternatives_shown: alts.map(({ image, ...a }) => a) } : {}),
      },
      update: {
        products: { [product.product_id]: { ...product, image: product.image || product.images?.[0] } },
        offers: Object.fromEntries(result.offers.map((x) => [x.offer_id, x])),
        facts: { prices: [...pricesFacts(result.offers).prices, ...alts.flatMap((a) => [a.min_price, a.cheapest_near]).filter(Number.isFinite)], phones: [] },
        fetchedOfferIds: result.offers.map((x) => x.offer_id),
        ...(alts.length ? { products: { [product.product_id]: { ...product, image: product.image || product.images?.[0] }, ...Object.fromEntries(alts.map((a) => [a.product_id, a])) } } : {}),
      },
      blocks: [
        { ...shopBoardBlock({ product, result, filters, maybe }), id: `auto-${product.product_id}` },
        ...(alts.length ? [{ type: 'product_list', id: `alts-${product.product_id}`, title: 'اینو کسی نداره؛ این‌ها نزدیکت هست', reason: 'alternatives', products: alts }] : []),
      ],
    };
  },
});

const find_shops_nearby = defineTool({
  name: 'find_shops_nearby',
  kind: 'data',
  description:
    'Shops of a KIND near the user ("nearest phone shop", "a stationery store around here"), no specific product needed. Pass what kind of shop in Persian (e.g. "گوشی موبایل", "لوازم تحریر"). Returns the matched shop category and nearby shops with distance and opening status; renders as a list with a map automatically.',
  schema: z.object({ kind: z.string().min(2).max(60), open_now: z.boolean().optional(), radius_km: km() }),
  async run({ kind, open_now, radius_km }, { state }) {
    const o = origin(state);
    if (!o && !state.ctx?.locationAsked) throw new ToolError("The user's location is unknown. Call request_location first (or resolve_place if they named a place).");
    const cats = catalog.matchShopCategories(kind, 8);
    if (!cats.length) throw new ToolError(`No shop category matches "${kind}". Try a simpler Persian word for the kind of shop (e.g. "گوشی موبایل").`);
    // Equally good matches are one kind of shop (عینک آفتابی + عینک طبی …); weaker ones are just mentioned.
    const used = cats.filter((c) => c.score === cats[0].score).map((c) => c.category);
    const category = used.length > 1 ? kind : used[0];
    const shops = catalog.shopsOfKindNear(used, { origin: o, radiusKm: radius_km || 3, openNow: open_now, limit: 12 });
    return {
      model: {
        category,
        categories_included: used,
        other_categories: cats.filter((c) => !used.includes(c.category)).slice(0, 3).map((c) => c.category),
        shops: shops.slice(0, 8).map(({ lat, lon, address, ...s }) => s),
        note: 'Listed shops declare this category; stock of any specific item is not confirmed.',
      },
      blocks: [{ type: 'nearby_shops', id: `kind-${category}`, coverage: o ? catalog.coverageAt(o.lat, o.lon) : null, category, open_now: !!open_now, origin: o, shops }],
    };
  },
});

const find_alternatives = defineTool({
  name: 'find_alternatives',
  kind: 'data',
  description: 'Similar products (same category) that ARE offered near the user — use when the product has no/too few/too expensive sellers, or a shop says it is out of stock.',
  schema: z.object({ product_id: id, max_price: toman(), radius_km: km() }),
  async run({ product_id, max_price, radius_km }, { state }) {
    const alts = catalog.findAlternatives(product_id, { origin: origin(state), maxPrice: max_price, radiusKm: radius_km });
    return {
      model: { alternatives: alts.map(({ image, ...a }) => a) },
      update: { products: Object.fromEntries(alts.map((a) => [a.product_id, a])), facts: { prices: alts.flatMap((a) => [a.min_price, a.cheapest_near]).filter((x) => Number.isFinite(x)), phones: [] } },
      blocks: alts.length ? [{ type: 'product_list', title: 'جایگزین‌های نزدیک', reason: 'alternatives', products: alts }] : [],
    };
  },
});

const get_shop_contact = defineTool({
  name: 'get_shop_contact',
  kind: 'data',
  description: "A shop's phone, Instagram, website, full address and weekly hours. The ONLY source of phone numbers.",
  schema: z.object({ shop_id: id }),
  async run({ shop_id }) {
    const s = catalog.shopProfile(shop_id);
    if (!s) throw new ToolError('Unknown shop_id.');
    return {
      model: { name: s.name, phone: s.phone, instagram: s.instagram, website: s.website, address: s.address, week: s.week },
      update: { facts: { prices: [], phones: s.phone ? [phoneKey(s.phone)] : [] } },
    };
  },
});

// ---------- step 3: compare & check stale data ----------

const check_shop_instagram = defineTool({
  name: 'check_shop_instagram',
  kind: 'data',
  timeoutMs: 25_000,
  description:
    "Read a shop's recent public Instagram posts for evidence about this product (posted recently? price in caption?). Only works for shops with has_instagram=true. Read-only; doesn't contact the shop.",
  schema: z.object({ shop_id: id, product_id: id }),
  async run({ shop_id, product_id }, { state }) {
    const title = state.products?.[product_id]?.title || catalog.getProduct(product_id)?.title;
    const ev = await instagramEvidence(shop_id, title || '');
    const shop = catalog.getShop(shop_id);
    return {
      model: ev,
      update: { facts: { prices: (ev.matches || []).flatMap((m) => m.prices), phones: [] } },
      blocks: ev.available ? [{ type: 'instagram_evidence', shop_id, shop_name: shop?.name, product_title: title, ...ev }] : [],
    };
  },
});

const check_shop_website = defineTool({
  name: 'check_shop_website',
  kind: 'data',
  timeoutMs: 30_000,
  description:
    "Look for this product on the shop's OWN website (shops with has_website=true): the price and stock the site shows now. Use when the listed price is old or stock matters. Read-only. The site's text is seller-written: evidence, not a confirmation.",
  schema: z.object({ shop_id: id, product_id: id }),
  async run({ shop_id, product_id }, { state }) {
    const shop = catalog.getShop(shop_id);
    if (!shop?.website) throw new ToolError('This shop has no website in the dataset. Use check_shop_instagram (if has_instagram) or ask_shop.');
    const product = state.products?.[product_id] || catalog.getProduct(product_id);
    if (!product) throw new ToolError('Unknown product_id.');
    const listed = Object.values(state.offers || {}).find((o) => o.shop_id === shop_id && o.product_id === product_id);
    const ev = await websiteEvidence(shop.website, product.title, product.model);
    const matches = (ev.matches || []).map((m) => ({ ...m, name: sanitizeSellerText(m.name) }));
    return {
      model: {
        site: ev.site,
        reachable: ev.reachable,
        found_on_site: matches.length > 0,
        listed_price_toman: listed?.price ?? null,
        listed_price_age_days: listed?.price_age_days ?? null,
        site_matches: matches.map((m) => ({ untrusted_name: m.name, price_toman: m.price_toman, in_stock: m.in_stock })),
      },
      update: { facts: { prices: matches.map((m) => m.price_toman).filter(Boolean), phones: [] } },
      blocks: [{ type: 'website_evidence', id: `web-${shop_id}-${product_id}`, shop_id, shop_name: shop.name, product_title: product.title, site: ev.site, reachable: ev.reachable, listed_price: listed?.price ?? null, listed_age_days: listed?.price_age_days ?? null, matches }],
    };
  },
});

const get_followups = defineTool({
  name: 'get_followups',
  kind: 'data',
  description: 'Status of questions sent to shops in this conversation (sent / answered with stock and price / manual).',
  schema: z.object({}),
  async run(_, { threadId }) {
    const list = followupsForThread(threadId);
    return {
      model: list.map((f) => ({ shop_id: f.shop_id, product: f.product_title, status: f.status, channel: f.channel, answer: f.extracted, asked_minutes_ago: Math.round((Date.now() - f.created_at) / 60000) })),
      update: { facts: { prices: list.map((f) => f.extracted?.price_toman).filter(Boolean), phones: [] } },
    };
  },
});

// ---------- generative UI ----------

const show_shops = defineTool({
  name: 'show_shops',
  kind: 'ui',
  description: 'Re-curate the shop board: find_sellers already shows its shops; call this only to narrow the list (offer_ids best-first) and/or highlight up to 3 with a short reason.',
  schema: z.object({
    offer_ids: z.array(id).min(1).max(12),
    highlights: z.array(z.object({ offer_id: id, reason: z.string().max(40) })).max(3).optional(),
  }),
  async run({ offer_ids, highlights = [] }, { state }) {
    const offers = offer_ids.map((o) => state.offers?.[o]).filter(Boolean);
    if (!offers.length) throw new ToolError('Unknown offer_ids. Use offer_id values from find_sellers.');
    const product = state.products?.[offers[0].product_id];
    const result = { total: offers.length, matched: offers.length, excluded_by_filters: 0, price_range: null, offers };
    return {
      model: { shown: offers.length },
      blocks: [{ ...shopBoardBlock({ product, result, filters: {}, highlights: highlights.filter((h) => offers.some((o) => o.offer_id === h.offer_id)), curatedIds: offer_ids }), replaces: [`auto-${offers[0].product_id}`] }],
    };
  },
});

const show_products = defineTool({
  name: 'show_products',
  kind: 'ui',
  description: 'Show product cards (image, title, price range, number of shops) the user can tap to find shops. Use to let the user browse/choose models.',
  schema: z.object({ product_ids: z.array(id).min(1).max(8), title: z.string().max(60).optional() }),
  async run({ product_ids, title }, { state }) {
    const products = product_ids.map((p) => state.products?.[p] || catalog.getProduct(p)).filter(Boolean);
    if (!products.length) throw new ToolError('Unknown product_ids.');
    return { model: { shown: products.length }, blocks: [{ type: 'product_list', title: title || null, products }] };
  },
});

const compare_offers = defineTool({
  name: 'compare_offers',
  kind: 'ui',
  description: 'Side-by-side comparison of 2-4 offers (price, distance, open, price age, warranty, payment). The harness marks the best per row; use it to explain your recommendation.',
  schema: z.object({ offer_ids: z.array(id).min(1).max(4) }), // too few → resolveOffers lists the valid ids
  async run({ offer_ids }, { state }) {
    const offers = resolveOffers(state, offer_ids, 2);
    // A "best" only when one offer strictly wins; ties mark nothing (claiming a winner would be false).
    const best = (key, fn) => {
      const vals = offers.map(fn).filter((v) => v != null);
      if (!vals.length) return null;
      const target = key === 'min' ? Math.min(...vals) : Math.max(...vals);
      const winners = offers.filter((o) => fn(o) === target);
      return winners.length === 1 ? winners[0].offer_id : null;
    };
    const wins = {
      price: best('min', (o) => o.price),
      distance: best('min', (o) => o.distance_km),
      freshness: best('min', (o) => o.price_age_days),
      warranty: best('max', (o) => o.warranty?.months ?? null),
    };
    const answers = Object.fromEntries(offers.map((o) => [o.offer_id, recentAnswer(o.shop_id, o.product_id)?.extracted || null]));
    return {
      model: { compared: offers.map(offerForModel), best: wins, shop_answers: answers },
      blocks: [{ type: 'compare', offers, best: wins, answers }],
    };
  },
});

const price_verdict = defineTool({
  name: 'price_verdict',
  kind: 'ui',
  description: 'The user is in a shop and was offered a price: judge it against listed prices for this product (good / fair / high / suspicious) as a card. Use its numbers in your reply.',
  schema: z.object({ product_id: id, offered_price_toman: z.number().int().positive() }),
  async run({ product_id, offered_price_toman }, { state }) {
    const r = catalog.findOffers(product_id, { origin: origin(state), limit: 200 });
    const prices = r.offers.map((o) => o.price).filter(Boolean).sort((a, b) => a - b);
    if (!prices.length) throw new ToolError('No listed prices for this product.');
    const med = prices[Math.floor(prices.length / 2)];
    const low = prices[0];
    const ratio = offered_price_toman / med;
    const verdict = offered_price_toman < low * 0.7 ? 'suspicious' : offered_price_toman <= low * 1.02 || ratio <= 0.97 ? 'good' : ratio <= 1.06 ? 'fair' : 'high';
    const cheaperNearby = r.offers.filter((o) => o.price && o.price < offered_price_toman && o.distance_km != null && o.distance_km <= 1.5).slice(0, 3);
    const product = state.products?.[product_id] || catalog.getProduct(product_id);
    const result = {
      product_title: product?.title,
      offered_price_toman,
      verdict,
      listed: { count: prices.length, min: low, median: med, max: prices[prices.length - 1] },
      diff_vs_median_toman: offered_price_toman - med,
      cheaper_within_1_5km: cheaperNearby.map(offerForModel),
    };
    return {
      model: result,
      blocks: [{ type: 'price_verdict', ...result, cheaper_within_1_5km: cheaperNearby }],
      update: {
        offers: Object.fromEntries(cheaperNearby.map((o) => [o.offer_id, o])),
        facts: mergeFacts(pricesFacts(r.offers), { prices: [med, Math.abs(offered_price_toman - med)], phones: [] }),
      },
    };
  },
});

// ---------- step 4: plan the trip ----------

const WALK_KMH = 4.5;
const DRIVE_KMH = 18; // central Tehran traffic

const IN_SHOP_MIN = 15;

/** Every visiting order of up to 5 stops (≤120), so the planner can pick the best one, not just the nearest-next. */
function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Walk an order from `start`: arrival times, opening status on arrival, waits; and its cost. */
function simulate(order, start, departAt) {
  let here = start || { lat: order[0].lat, lon: order[0].lon };
  let t = departAt;
  let cost = 0;
  const stops = [];
  for (const o of order) {
    const km = catalog.distanceKm(here, o);
    const mode = km <= 1.5 ? 'walk' : 'drive';
    const minutes = Math.max(2, Math.round((km / (mode === 'walk' ? WALK_KMH : DRIVE_KMH)) * 60));
    t += minutes * 60_000;
    const open = catalog.openStatus(catalog.getShop(o.shop_id)?.hours, catalog.tehranNow(new Date(t)));
    let wait = 0;
    if (open.status === 'opens_later' && open.opens) {
      const [h, m] = open.opens.split(':').map(Number);
      wait = h * 60 + m - catalog.tehranNow(new Date(t)).minutes;
    }
    // Arriving to a closed shop is the worst outcome; unknown hours are a small risk; waiting costs its minutes.
    cost += open.status === 'closed_now' || open.status === 'closed_today' ? 1000 : open.status === 'unknown' ? 20 : 0;
    cost += minutes + Math.max(0, wait);
    stops.push({ o, km, mode, minutes, arrive: t, open, wait: Math.max(0, wait) });
    t += (Math.max(0, wait) + IN_SHOP_MIN) * 60_000;
    here = o;
  }
  return { stops, cost, end: t };
}

const plan_visit = defineTool({
  name: 'plan_visit',
  kind: 'ui',
  description:
    'Plan an in-person trip to 1-5 shops (offer_ids): the best visiting order (never arriving at a closed shop when avoidable), walking/driving time, time left before each closes, the latest time to leave, and what to check/bring at each. Use as the final step when the user is ready to go.',
  schema: z.object({ offer_ids: z.array(id).min(1).max(5), leave_in_minutes: z.number().int().min(0).max(1440).optional() }),
  async run({ offer_ids, leave_in_minutes = 15 }, { state }) {
    const offers = resolveOffers(state, offer_ids, 1);
    const start = origin(state);
    const departAt = Date.now() + leave_in_minutes * 60_000;
    const best = permutations(offers)
      .map((order) => simulate(order, start, departAt))
      .sort((a, b) => a.cost - b.cost)[0];

    const stops = best.stops.map(({ o, km, mode, minutes, arrive, open, wait }) => {
      const answer = recentAnswer(o.shop_id, o.product_id)?.extracted;
      const stale = o.price_freshness === 'stale' || o.price_freshness === 'unknown';
      return {
        offer_id: o.offer_id,
        shop_id: o.shop_id,
        shop_name: o.shop_name,
        passage: o.passage,
        floor_unit: o.floor_unit,
        address: o.address,
        lat: o.lat,
        lon: o.lon,
        leg_km: Math.round(km * 10) / 10,
        leg_minutes: minutes,
        mode,
        arrive_at: new Date(arrive).toISOString(),
        open_at_arrival: open.status,
        closes: open.closes || null,
        minutes_before_close: open.closes_in_min ?? null,
        opens: open.opens || null,
        wait_minutes: wait,
        hours_today: open.today,
        price: o.price,
        price_age_days: o.price_age_days,
        checks: [
          answer ? `خود مغازه گفته: ${answer.in_stock === false ? 'موجود نداره' : answer.in_stock ? 'موجوده' : 'موجودی نامعلوم'}${answer.price_toman ? `، ${answer.price_toman.toLocaleString('fa-IR')} تومان` : ''}` : null,
          !answer && stale ? `قیمت ثبت‌شده ${o.price_age_days != null ? `${o.price_age_days.toLocaleString('fa-IR')} روز پیشه` : 'تاریخ نداره'}؛ قبل از رفتن بپرس` : null,
          o.warranty?.provider ? `گارانتی «${o.warranty.provider}» رو روی جعبه چک کن` : 'گارانتی ثبت نشده؛ حضوری بپرس',
          o.installments.length ? `اقساط (${o.installments.join('، ')}): کارت ملی همراهت باشه` : null,
          o.torobpay_in_person ? 'ترب‌پی حضوری قبول می‌کنه' : null,
        ].filter(Boolean),
      };
    });

    // Latest departure that still finds every open-on-arrival shop open (minus the time spent inside).
    const slack = Math.min(...stops.filter((s) => s.open_at_arrival === 'open' && s.minutes_before_close != null).map((s) => s.minutes_before_close - IN_SHOP_MIN));
    const leaveBy = Number.isFinite(slack) && slack < 240 ? new Date(departAt + Math.max(0, slack) * 60_000).toISOString() : null;
    const block = {
      type: 'visit_plan',
      stops,
      leave_at: new Date(departAt).toISOString(),
      leave_by: leaveBy,
      total_minutes: Math.round((best.end - departAt) / 60_000),
    };
    return {
      model: {
        stops: stops.map(({ lat, lon, address, ...s }) => s),
        total_minutes: block.total_minutes,
        leave_by: leaveBy,
        closed_on_arrival: stops.filter((s) => s.open_at_arrival === 'closed_now' || s.open_at_arrival === 'closed_today').map((s) => s.shop_name),
      },
      blocks: [block],
    };
  },
});

// ---------- human-in-the-loop ----------

const ask_user = defineTool({
  name: 'ask_user',
  kind: 'human',
  description:
    'Ask ONE multiple-choice question and wait (which model/variant, budget range, new vs used, brand). Options may carry a product_id to show the product card. Use when the answer changes what you do next.',
  schema: z.object({
    question: z.string().min(3).max(140),
    options: z.array(z.object({ label: z.string().min(1).max(60), product_id: id.optional() })).min(2).max(6),
    allow_free_text: z.boolean().optional(),
  }),
  run: () => ({}),
});

const request_location = defineTool({
  name: 'request_location',
  kind: 'human',
  description: 'Ask where the user is (share location, or pick a Tehran area) so shops are sorted by distance. Use once, only if location is unknown and they did not name a place.',
  schema: z.object({ reason: z.string().max(100).optional() }),
  run: () => ({}),
});

const ask_shop = defineTool({
  name: 'ask_shop',
  kind: 'ui',
  description:
    "Help the USER ask a shop about stock and today's price: shows the shop's channels (Instagram DM, website, WhatsApp, phone), a ready message to copy, and a box to paste the shop's reply. ترب‌چین never sends anything itself. Use when a promising shop's price is stale or the user wants certainty before going. If a fresh answer from this shop exists, it is shown instead.",
  schema: z.object({ shop_id: id, product_id: id }),
  async run({ shop_id, product_id }, { state, threadId }) {
    const shop = catalog.getShop(shop_id);
    const product = state.products?.[product_id] || catalog.getProduct(product_id);
    if (!shop || !product) throw new ToolError('Unknown shop_id or product_id.');
    const f = createFollowup({ threadId, shopId: shop_id, productId: product_id, productTitle: product.title, message: outreachMessage(product.title) });
    const channels = shopChannels(shop);
    return {
      model: { followup_id: f.id, status: f.status, channels: channels.map((c) => c.kind), answer: f.extracted || null, note: 'The user sends the message and pastes the reply here. Never say a message was sent or that you asked the shop.' },
      update: f.extracted?.price_toman ? { facts: { prices: [f.extracted.price_toman], phones: [] } } : {},
      blocks: [{ type: 'followup', id: `followup-${f.id}`, followup_id: f.id, shop_id, shop_name: shop.name, product_title: product.title, channels, status: f.status, message: f.message, extracted: f.extracted || null, reply: f.reply || null, created_at: f.created_at }],
    };
  },
});


export const TOOLS = [
  search_products,
  get_product_details,
  resolve_place,
  find_sellers,
  find_shops_nearby,
  find_alternatives,
  get_shop_contact,
  check_shop_instagram,
  check_shop_website,
  get_followups,
  show_shops,
  show_products,
  compare_offers,
  price_verdict,
  plan_visit,
  ask_user,
  request_location,
  ask_shop,
];
export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/** What the UI renders while the graph is paused for the user. */
export function humanBlock(call, state) {
  if (call.name === 'request_location') {
    return { type: 'request_location', call_id: call.id, reason: call.args?.reason || null, areas: catalog.AREAS.slice(0, 12).map((a) => a.name) };
  }

  // Options the model wrote as plain labels ("نوکیا ۱۰۵") are linked to a product it just found, so picking
  // one leads to its shops instead of another search.
  const found = Object.values(state.products || {});
  const linkLabel = (label) => {
    const words = normalizeText(label).split(' ').filter((w) => w.length > 1);
    if (!words.length) return null;
    const hits = found.filter((p) => { const t = normalizeText(p.title); return words.every((w) => t.includes(w)); });
    return hits.sort((a, b) => (b.shops || 0) - (a.shops || 0))[0]?.product_id || null;
  };
  const options = (call.args?.options || []).map((o, i) => {
    const pid = o.product_id || linkLabel(o.label || '');
    const p = pid ? state.products?.[pid] || catalog.getProduct(pid) : null;
    return { value: String(i), label: o.label, product_id: p ? pid : null, image: p?.image || null, min_price: p?.min_price || null, shops: p?.shops ?? null };
  });
  return { type: 'ask_user', call_id: call.id, question: call.args?.question || '', options, allow_free_text: call.args?.allow_free_text !== false };
}

export { emptyFacts };
