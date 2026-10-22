// The agent's tools over the Starcoach dataset, in three kinds (see harness/registry.js):
//   data  — dataset lookups and Instagram evidence; produce grounded facts
//   ui    — generative UI: the model picks a component and passes ids; the harness hydrates real data,
//           so a component can never show a price, phone or distance the data didn't contain
//   human — human-in-the-loop: pause the graph for a choice, a location, or approval to contact a shop
import { z } from 'zod';
import { defineTool, ToolError } from '../harness/registry.js';
import * as catalog from '../data/catalog.js';
import { productCard, compareCards, familyOf, familyLabels } from '../data/families.js';
import { bargainTips, GLOSSARY } from '../data/buying.js';
import { planShoppingList, resolveItem } from '../data/shoppingList.js';
import { normalizeText, queryTokens } from '../data/normalize.js';
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

/** A product plus its type card (phone/laptop/shoes/…); `focus` puts the labels the user cares about first. */
function withCard(p, focus = []) {
  const full = catalog.getProduct(p.product_id, { specs: 80 });
  return { ...p, family: familyOf(p.category), card: full ? productCard(full, focus) : null };
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
    warranty: o.warranty_kind?.label || null,
    seller_claims: (o.seller_claims || []).map((c) => c.label),
    torobpay_in_person: o.torobpay_in_person,
    installments: o.installments,
    payment: (o.payment_methods || []).map((p) => `${p.provider} (${p.in_person ? 'in person' : 'channel not stated'})`),
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
  visit: z.enum(['now', 'evening', 'tomorrow']).optional().describe('When they will go: opening status is checked for that time'),
});

function filtersFromArgs(a) {
  return { radiusKm: a.radius_km, maxPrice: a.max_price, openNow: a.open_now, torobpay: a.torobpay, installments: a.installments, fastDelivery: a.fast_delivery, warranty: a.warranty, visit: a.visit };
}

export function shopBoardBlock({ product, result, filters, maybe = [], highlights = [], curatedIds }) {
  return {
    type: 'shop_board',
    data_as_of: catalog.dataAsOf(),
    product: product ? { product_id: product.product_id, title: product.title, image: product.image, category: product.category, card: withCard(product).card } : null,
    filters,
    total: result.total,
    matched: result.matched,
    excluded_by_filters: result.excluded_by_filters,
    price_range: result.price_range,
    price_median: result.price_median ?? null,
    bargain: result.bargain || null,
    time: result.time || null,
    visit: result.visit || null,
    offers: result.offers,
    maybe_shops: maybe,
    highlights,
    curated: !!curatedIds,
  };
}

// ---------- step 1: understand & find the product ----------

/**
 * The search found the one product they named ("آیفون ۱۳ ۱۲۸ گیگ استوک"): every query word, a model number,
 * a single full match that shops list. Not for price checks, "X or Y?" or photos — those need another step.
 */
// "یه گوشی، یه قاب و یه شارژر": two or more "یه/یک …" items in one message.
export const LIST_INTENT = /(یه|یک|یدونه)\s[^،,]+[،,]\s*(و\s*)?(یه|یک|یدونه)\s|(یه|یک)\s[^،,]+\sو\s(یه|یک)\s/;

function confidentPick(query, results, lastUser = '') {
  if (/\sیا\s|میلیون|تومان|\[عکس|مقایسه|فرق|بهتر/.test(lastUser)) return null;
  if (LIST_INTENT.test(lastUser)) return null; // several items → plan_list, not one product's shops
  const toks = queryTokens(query);
  if (toks.length < 2 || !toks.some((alts) => alts.some((t) => /\d/.test(t)))) return null;
  const full = results.filter((p) => p.shops > 0 && toks.every((alts) => alts.some((a) => normalizeText(`${p.title} ${p.model || ''}`).includes(a))));
  return full.length === 1 ? full[0] : null;
}

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
  async run({ query, category, brand, max_price }, { state, userTexts = [] }) {
    const r = catalog.searchProducts(query, { category, brand, maxPrice: max_price, limit: 10 });
    const results = r.results.map((p) => withCard(p));
    // One clear match and we know where they are: show its sellers now — saves a whole model round.
    const pick = (origin(state) || state.ctx?.locationAsked) && confidentPick(query, results, userTexts.at(-1));
    const sellers = pick ? sellersFor(pick, { max_price }, state) : null;
    const families = [...new Set(results.map((p) => p.family).filter((f) => f !== 'generic'))];
    return {
      model: {
        match: r.match,
        total_matches: r.total_matches,
        results: results.map(({ image, card, ...p }) => ({ ...p, key_specs: card?.facts.slice(0, 4).map((f) => `${f.label}: ${f.value}`) })),
        facets: r.facets,
        focus_labels_by_family: Object.fromEntries(families.map((f) => [f, familyLabels(f)])),
        ...(sellers ? { sellers_already_shown_for: pick.product_id, sellers: sellers.model, note: 'Its shop board is already on screen: do not call find_sellers again for it; summarise the sellers.' } : {}),
      },
      ...(sellers ? { blocks: sellers.blocks } : {}),
      update: {
        ...(sellers ? { offers: sellers.update.offers, fetchedOfferIds: sellers.update.fetchedOfferIds } : {}),
        products: { ...Object.fromEntries(results.map((p) => [p.product_id, p])), ...(sellers?.update.products || {}) },
        facts: { prices: [...r.results.flatMap((p) => [p.min_price, p.max_price]).filter(Boolean), ...(sellers?.update.facts.prices || [])], phones: [] },
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

/** Sellers of one product near the user: the board, alternatives when nobody lists it, and the model's view. */
function sellersFor(product, args, state) {
  const o = origin(state);
  const filters = filtersFromArgs(args);
  const result = catalog.findOffers(product.product_id, { origin: o, ...filters, limit: 15 });
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
      bargain_range: result.bargain,
      time_now: result.time ? { open_now: result.time.open_now, closing_soon: result.time.closing_soon, advice: result.time.advice } : null,
      visit_time: result.visit?.label || 'now',
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
}

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
    return sellersFor(product, args, state);
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

const show_shop = defineTool({
  name: 'show_shop',
  kind: 'ui',
  description:
    "Show a shop's page: what it lists (searchable), weekly hours, passage/floor/unit, payment options, channels — each fact labelled with its source. Use when the user asks about one shop (\"این مغازه چی داره؟\", \"«X» کجاست؟\", \"ساعت کاری «X»\"). Pass shop_id if you have it, else shop_name. Optional query searches inside the shop.",
  schema: z.object({ shop_id: id.optional(), shop_name: z.string().max(80).optional(), query: z.string().max(60).optional() }),
  async run({ shop_id, shop_name, query }, { state }) {
    let sid = shop_id && catalog.getShop(shop_id) ? shop_id : null;
    if (!sid && shop_name) {
      const known = Object.values(state.offers || {}).find((o) => o.shop_name.includes(shop_name) || shop_name.includes(o.shop_name));
      sid = known?.shop_id || catalog.findShopsByName(shop_name, 1)[0]?.shop_id || null;
    }
    if (!sid) throw new ToolError('Shop not found. Use a shop_id from earlier results, or the exact shop name.');
    const page = catalog.shopPage(sid, { origin: origin(state), query: query || '' });
    const { lat, lon, phone, ...pub } = page;
    return {
      model: {
        name: page.name,
        passage: page.passage,
        floor_unit: page.floor_unit,
        distance_km: page.distance_km,
        open_now: page.open.status,
        hours_today: page.open.today,
        listed_products: page.catalog.total,
        listed_categories: page.catalog.categories,
        declared_only_categories: page.declared_only_categories,
        first_items: page.catalog.items.slice(0, 6).map((i) => ({ title: i.title, price_toman: i.price, price_age_days: i.price_age_days })),
        has_instagram: !!page.instagram,
        has_website: !!page.website,
      },
      update: { facts: { prices: page.catalog.items.map((i) => i.price).filter(Boolean), phones: [] }, offers: Object.fromEntries(page.catalog.items.map((i) => [i.offer_id, i])) },
      blocks: [{ type: 'shop_profile', id: `shop-${sid}`, shop: { ...pub, lat, lon }, query: query || '' }],
    };
  },
});

const explain_term = defineTool({
  name: 'explain_term',
  kind: 'data',
  description: `Plain explanation of a Tehran shopping term the user asks about or should know: ${Object.keys(GLOSSARY).join('، ')}.`,
  schema: z.object({ term: z.string().max(40) }),
  async run({ term }) {
    const key = Object.keys(GLOSSARY).find((k) => term.includes(k) || k.includes(term));
    if (!key) throw new ToolError(`Known terms: ${Object.keys(GLOSSARY).join('، ')}.`);
    return { model: { term: key, explanation: GLOSSARY[key] } };
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
  description:
    "Show product cards (image, title, price range, number of shops, and the type's key specs — sizes/colours for clothes and shoes) the user can tap to find shops. Use to let the user browse/choose models. focus: up to 3 labels from focus_labels_by_family that matter for THIS user (e.g. «باتری», «صفحه» for a simple phone for mom), shown first.",
  schema: z.object({ product_ids: z.array(id).min(1).max(8), title: z.string().max(60).optional(), focus: z.array(z.string().max(30)).max(3).optional() }),
  async run({ product_ids, title, focus = [] }, { state }) {
    const products = product_ids.map((p) => state.products?.[p] || catalog.getProduct(p)).filter(Boolean).map((p) => withCard(p, focus));
    if (!products.length) throw new ToolError('Unknown product_ids.');
    return { model: { shown: products.length }, blocks: [{ type: 'product_list', title: title || null, products, focus }] };
  },
});

const plan_list = defineTool({
  name: 'plan_list',
  kind: 'ui',
  description:
    'Several DIFFERENT items in one trip ("یه گوشی، یه قاب براش و یه شارژر"): resolves each item and shows up to three ways to buy them all nearby — one shop, one passage, or the cheapest mix — with totals, stops and anything missing. Pass each item as a short search query (or a product_id you already have). Needs the location (request_location first if unknown).',
  schema: z.object({ items: z.array(z.object({ query: z.string().max(80).optional(), product_id: id.optional() })).min(2).max(5) }),
  async run({ items }, { state }) {
    const o = origin(state);
    if (!o && !state.ctx?.locationAsked) throw new ToolError("The user's location is unknown. Call request_location first.");
    const products = [];
    const unresolved = [];
    for (const it of items) {
      const p = (it.product_id && (state.products?.[it.product_id] || catalog.getProduct(it.product_id))) || (it.query ? resolveItem(it.query) : null);
      if (p) products.push(p);
      else unresolved.push(it.query || it.product_id);
    }
    if (products.length < 2) throw new ToolError(`Could not find enough of these items in the data: ${unresolved.join('، ')}. Search them separately.`);
    const plan = planShoppingList(products, o);
    const offers = plan.options.flatMap((op) => op.stops.flatMap((s) => s.items.map((i) => i.offer_id)));
    const all = Object.fromEntries(products.flatMap((p) => catalog.findOffers(p.product_id, { origin: o, limit: 300 }).offers).filter((x) => offers.includes(x.offer_id)).map((x) => [x.offer_id, x]));
    return {
      model: {
        items: plan.items.map((i) => ({ title: i.title, sellers_nearby: i.sellers_nearby })),
        not_found: unresolved,
        options: plan.options.map((op) => ({ title: op.title, total_toman: op.total, stops: op.stop_count, covered: `${op.covered}/${products.length}`, missing: op.missing, offer_ids: op.offer_ids, shops: op.stops.map((s) => s.shop_name) })),
      },
      update: {
        products: Object.fromEntries(products.map((p) => [p.product_id, p])),
        offers: all,
        facts: { prices: [...plan.options.map((op) => op.total), ...Object.values(all).map((x) => x.price)].filter(Boolean), phones: [] },
      },
      blocks: [{ type: 'shopping_list', id: `list-${products.map((p) => p.product_id).join('-')}`, items: plan.items, not_found: unresolved, options: plan.options }],
    };
  },
});

const compare_products = defineTool({
  name: 'compare_products',
  kind: 'ui',
  description:
    'Side-by-side comparison of 2-3 PRODUCTS (models), e.g. "آیفون ۱۵ یا گلکسی S24؟", "این دوتا کفش": the key specs of their type with the better value marked, price range and how many shops list each. focus: up to 3 labels (from focus_labels_by_family) that matter for this user, shown first. For comparing SHOPS selling one product use compare_offers.',
  schema: z.object({ product_ids: z.array(id).min(2).max(3), focus: z.array(z.string().max(30)).max(3).optional() }),
  async run({ product_ids, focus = [] }, { state }) {
    const products = product_ids.map((p) => state.products?.[p] || catalog.getProduct(p)).filter(Boolean).map((p) => withCard(p, focus));
    if (products.length < 2) throw new ToolError('Need 2-3 product_ids from search_products.');
    const rows = compareCards(products.map((p) => p.card || { facts: [] }));
    return {
      model: { products: products.map((p) => ({ product_id: p.product_id, title: p.title, min_price: p.min_price, max_price: p.max_price, shops: p.shops })), rows: rows.map((r) => ({ label: r.label, values: r.values, better: r.winner == null ? null : products[r.winner].title })) },
      update: { facts: { prices: products.flatMap((p) => [p.min_price, p.max_price]).filter(Boolean), phones: [] } },
      blocks: [{ type: 'product_compare', id: `pc-${product_ids.join('-')}`, products: products.map(({ card, ...p }) => ({ ...p, badges: card?.badges || [], sizes: card?.sizes || [], colors: card?.colors || [] })), rows, focus }],
    };
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
    // Plan B for each: the closest other seller of the same product, decided before the trip.
    const fallbacks = Object.fromEntries(offers.map((o) => [o.offer_id, catalog.fallbackFor(o)]).filter(([, f]) => f));
    return {
      update: { offers: Object.fromEntries(Object.values(fallbacks).map((f) => [f.offer_id, f])), facts: { prices: Object.values(fallbacks).map((f) => f.price), phones: [] } },
      model: {
        compared: offers.map(offerForModel),
        best: wins,
        shop_answers: answers,
        plan_b: Object.fromEntries(Object.entries(fallbacks).map(([id, f]) => [id, { offer_id: f.offer_id, shop_name: f.shop_name, metres_from_first: f.from_primary_m, price_diff_toman: f.price_diff }])),
      },
      blocks: [{ type: 'compare', offers, best: wins, answers, bargain: catalog.findOffers(offers[0].product_id, { limit: 1 }).bargain, fallbacks }],
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
    const cheapestNear = [...cheaperNearby].sort((a, b) => a.price - b.price)[0] || r.offers.filter((o) => o.price && o.price < offered_price_toman).sort((a, b) => a.price - b.price)[0] || null;
    const result = {
      product_title: product?.title,
      offered_price_toman,
      verdict,
      bargain: r.bargain,
      tips: verdict === 'good' ? [] : bargainTips({ cheaper: cheapestNear, family: familyOf(product?.category) }),
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

    const planB = []; // full offers of each stop's plan B, registered so a swap can be planned
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
        fallback: (() => {
          const f = catalog.fallbackFor(o, { exclude: offers.map((x) => x.shop_id) });
          if (f) planB.push(f);
          return f ? { offer_id: f.offer_id, shop_id: f.shop_id, shop_name: f.shop_name, passage: f.passage, floor_unit: f.floor_unit, lat: f.lat, lon: f.lon, price: f.price, from_primary_m: f.from_primary_m, price_diff: f.price_diff } : null;
        })(),
        checks: [
          answer ? `خود مغازه گفته: ${answer.in_stock === false ? 'موجود نداره' : answer.in_stock ? 'موجوده' : 'موجودی نامعلوم'}${answer.price_toman ? `، ${answer.price_toman.toLocaleString('fa-IR')} تومان` : ''}` : null,
          !answer && stale ? `قیمت ثبت‌شده ${o.price_age_days != null ? `${o.price_age_days.toLocaleString('fa-IR')} روز پیشه` : 'تاریخ نداره'}؛ قبل از رفتن بپرس` : null,
          o.warranty?.provider ? `گارانتی «${o.warranty.provider}» رو روی جعبه چک کن` : 'گارانتی ثبت نشده؛ حضوری بپرس',
          o.installments.length ? `اقساط (${(o.payment_methods || []).filter((p) => o.installments.includes(p.provider)).map((p) => `${p.provider}${p.in_person ? ' حضوری' : '، نوع پذیرش رو بپرس'}`).join('، ')}): کارت ملی همراهت باشه` : null,
          o.torobpay_in_person ? 'ترب‌پی حضوری قبول می‌کنه' : null,
          productCard({ title: o.title || state.products?.[o.product_id]?.title || '', category: state.products?.[o.product_id]?.category || catalog.getProduct(o.product_id)?.category }).checklist[0] || null,
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
        plan_b: stops.filter((s) => s.fallback).map((s) => ({ for: s.shop_name, shop_name: s.fallback.shop_name, metres_away: s.fallback.from_primary_m, price_diff_toman: s.fallback.price_diff })),
      },
      // Plan B shops are switchable in one tap: the agent must know their offers.
      update: { offers: Object.fromEntries(planB.map((f) => [f.offer_id, f])), facts: { prices: planB.map((f) => f.price), phones: [] } },
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
    const product = state.products?.[product_id] || catalog.getProduct(product_id);
    if (!product) throw new ToolError('Unknown product_id. Use one from search_products.');
    // "ask the first one" before any shop was shown: point the model at the sellers it knows, or at find_sellers.
    const known = Object.values(state.offers || {}).filter((o) => o.product_id === product_id);
    // No board shown yet ("از اولی بپرس" right after a search): "the first one" is the nearest seller.
    const nearest = known.length ? null : catalog.findOffers(product_id, { origin: origin(state), limit: 1 }).offers[0];
    const shop = catalog.getShop(shop_id) || (known.length === 1 ? catalog.getShop(known[0].shop_id) : null) || (nearest ? catalog.getShop(nearest.shop_id) : null);
    if (!shop) {
      throw new ToolError(
        known.length
          ? `Unknown shop_id. Shops listing this product: ${known.slice(0, 6).map((o) => `${o.shop_id} (${o.shop_name})`).join(', ')}.`
          : 'No shop lists this product. Offer find_alternatives instead.',
      );
    }
    shop_id = shop.shop_id;
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
  show_shop,
  explain_term,
  get_shop_contact,
  check_shop_instagram,
  check_shop_website,
  get_followups,
  show_shops,
  show_products,
  plan_list,
  compare_products,
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

// ---------- when the model is unavailable ----------

// Words that describe the request, not the product ("نزدیکم", "می‌خوام"…), dropped before a direct search.
const FILLER = /(^|\s)(نزدیک(م|ترین)?|اطرافم|این\s*اطراف|می\s*خوام|میخوام|میخواهم|میخواستم|بخرم|یه|یک|کجا(ست)?|کجا\s*بخرم|لطفا|لطفاً|برام|برای\s*من|قیمت|ارزون(ترین)?|بهترین)(?=\s|$)/g;

/**
 * The same message answered without the model: a direct catalogue search, and — with a known location and
 * one clear match — its shop board and map. Keeps the app useful when the AI provider is down or out of credit.
 */
export function directAnswer(text, ctx = {}) {
  const query = normalizeText(text).replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  const state = { ctx, products: {}, offers: {} };
  const kinds = query.length >= 2 ? catalog.matchShopCategories(query, 4) : [];
  const r = query.length >= 2 ? catalog.searchProducts(query, { limit: 8 }) : { results: [] };
  const results = r.results.filter((p) => p.shops > 0).map((p) => withCard(p));
  const intro = 'دستیار هوشمندم الان در دسترس نیست؛ این نتیجه‌ی جست‌وجوی مستقیم توی داده‌های تربه.';
  // "…فروشی / مغازه‌ی …": a kind of shop, not a product.
  if (kinds.length && origin(state) && /فروشی|مغازه|فروشگاه/.test(text)) {
    const shops = catalog.shopsOfKindNear(kinds.filter((k) => k.score === kinds[0].score).map((k) => k.category), { origin: origin(state), limit: 12 });
    if (shops.length) return { text: intro, blocks: [{ type: 'nearby_shops', id: `direct-kind-${Date.now()}`, category: kinds[0].category, origin: origin(state), shops }] };
  }
  // Only a search that matched every word is an answer; loose matches ("یه شعر بگو") are noise.
  if (r.match !== 'all_words' && r.match !== 'category_popular') return { text: `${intro} برای «${text.slice(0, 40)}» چیزی پیدا نکردم؛ اسم کالا یا نوع مغازه رو بنویس.`, blocks: [] };
  const pick = origin(state) ? confidentPick(query, results, text) || (results.length === 1 ? results[0] : null) : null;
  if (pick) {
    const s = sellersFor(pick, {}, state);
    return { text: `${intro} مغازه‌هایی که «${pick.title}» رو دارن:`, blocks: s.blocks };
  }
  if (results.length) return { text: `${intro} یکی رو انتخاب کن تا مغازه‌هاش رو ببینی:`, blocks: [{ type: 'product_list', id: `direct-${Date.now()}`, title: null, products: results }] };
  return { text: `${intro} برای «${text.slice(0, 40)}» چیزی پیدا نکردم؛ اسم دقیق‌تر کالا رو بنویس.`, blocks: [] };
}
