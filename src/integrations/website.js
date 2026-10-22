// A shop's own website as price/stock evidence (for stale listings). Only URLs from the dataset are
// fetched — never one the model or user supplies. Everything read here is seller-written: untrusted.
import { normalizeText, toEnglishDigits } from '../data/normalize.js';

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 9000;
const UA = 'Mozilla/5.0 (compatible; torobchin/1.0; +hackathon demo)';
const cache = new Map(); // `${site}|${query}` -> {at, result}
const TTL_MS = 30 * 60_000;

/** GET with a time limit and a size cap (some shop pages are 10+ MB). Returns '' on any failure. */
async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
    if (!res.ok || !res.body) return '';
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    return Buffer.concat(chunks).toString('utf8');
  } catch {
    return '';
  }
}

/** Toman from a price and its currency/unit; IRR and «ریال» are divided by 10. */
function toToman(value, currency = '') {
  const n = Number(String(toEnglishDigits(String(value))).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const rial = /IRR|ریال|rial/i.test(currency);
  const t = Math.round(rial ? n / 10 : n);
  return t >= 10_000 && t <= 5_000_000_000 ? t : null;
}

/** Schema.org Product entries in JSON-LD blocks. */
function jsonLdProducts(html, base) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack = [data];
    while (stack.length) {
      const d = stack.pop();
      if (!d || typeof d !== 'object') continue;
      if (Array.isArray(d)) stack.push(...d);
      else {
        if (d['@graph']) stack.push(d['@graph']);
        const type = [].concat(d['@type'] || []);
        if (type.includes('Product') && d.name) {
          const offers = [].concat(d.offers || []).flatMap((o) => (o?.offers ? [].concat(o.offers) : [o]));
          const o = offers.find((x) => x && (x.price ?? x.lowPrice) != null) || offers[0] || {};
          out.push({
            name: String(d.name),
            price_toman: toToman(o.price ?? o.lowPrice ?? '', o.priceCurrency || ''),
            in_stock: o.availability ? /InStock|PreOrder|LimitedAvailability/i.test(o.availability) : null,
            url: safeUrl(d.url || o.url, base),
          });
        }
      }
    }
  }
  return out;
}

const safeUrl = (u, base) => {
  try {
    const url = new URL(u, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
};

/** Product page links on a search results page (WooCommerce and most Persian shop themes use /product/). */
function productLinks(html, base, keys) {
  const host = new URL(base).host;
  const links = new Set();
  for (const m of html.matchAll(/href="([^"]*\/(?:product|products|shop|p)\/[^"#?]+)"/gi)) {
    const u = safeUrl(m[1], base);
    if (u && new URL(u).host === host) links.add(u);
    if (links.size >= 40) break;
  }
  // Search pages also show "related" products: links naming the model come first.
  const named = (u) => {
    let d = u;
    try {
      d = decodeURIComponent(u);
    } catch {}
    return matches(d.replace(/[-_/]/g, ' '), keys) ? 0 : 1;
  };
  return [...links].sort((a, b) => named(a) - named(b));
}

/** Plain-text fallback: prices printed within ~160 characters after a mention of the model. */
function textMentions(html, keys) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&zwnj;/g, ' ')
    .replace(/\s+/g, ' ');
  const norm = toEnglishDigits(text);
  const out = [];
  for (const key of keys) {
    let i = norm.toLowerCase().indexOf(key.toLowerCase());
    while (i !== -1 && out.length < 3) {
      const win = norm.slice(i, i + 160);
      const p = win.match(/([\d,٬.]{5,})\s*(تومان|تومن|ریال)/);
      if (p) out.push({ name: text.slice(Math.max(0, i - 40), i + 80).trim(), price_toman: toToman(p[1], p[2]), in_stock: /ناموجود|موجود نیست|اتمام موجودی/.test(win) ? false : null, url: null });
      i = norm.toLowerCase().indexOf(key.toLowerCase(), i + key.length);
    }
  }
  return out;
}

/** Distinctive words of a product title: model numbers and Latin words beat generic Persian ones. */
export function productKeys(title, model) {
  const words = toEnglishDigits(`${model || ''} ${title || ''}`)
    .replace(/[|()«»"،,/]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const strong = [...new Set(words.filter((w) => /[a-z]/i.test(w) && /\d/.test(w)))];
  const latin = [...new Set(words.filter((w) => /^[a-z][a-z0-9-]+$/i.test(w) && w.length > 2))];
  // Persian-only titles ("قرنیز پی وی سی طرح ونگه … کد ۹۱۲"): their distinctive words, numbers included.
  const persian = [...new Set(normalizeText(title).split(' ').filter((w) => (w.length > 2 || /\d/.test(w)) && !PERSIAN_GENERIC.has(w)))].slice(0, 8);
  return { strong, latin, persian, all: words };
}

const PERSIAN_GENERIC = new Set(['مدل', 'طرح', 'رنگ', 'برای', 'سایز', 'سانت', 'متر', 'طول', 'عرض', 'با', 'و', 'کد', 'میل', 'عدد', 'بسته']);

const matches = (name, keys) => {
  const n = toEnglishDigits(normalizeText(name)).toLowerCase();
  if (keys.strong.length) return keys.strong.some((k) => n.includes(k.toLowerCase()));
  if (keys.latin.length) return keys.latin.filter((k) => n.includes(k.toLowerCase())).length >= Math.min(2, keys.latin.length);
  // No model code: most of the title's distinctive Persian words must be there.
  const hits = keys.persian.filter((w) => n.split(' ').includes(w)).length;
  return keys.persian.length > 0 && hits >= Math.ceil(keys.persian.length * 0.6);
};

/**
 * Look for a product on a shop's website: site search → product pages' JSON-LD → text near the model name.
 * @returns {{available:boolean, reason?:string, site?:string, checked?:string[], matches?:Array<{name,price_toman,in_stock,url}>}}
 */
export async function websiteEvidence(site, productTitle, model) {
  const base = safeUrl(site);
  if (!base) return { available: false, reason: 'no_website' };
  const keys = productKeys(productTitle, model);
  const query = (keys.strong[0] || keys.latin.slice(0, 2).join(' ') || keys.persian.slice(0, 3).join(' ')).trim();
  const ck = `${base}|${query}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;

  const checked = [];
  const found = [];
  const searchUrl = new URL(`/?s=${encodeURIComponent(query)}&post_type=product`, base).href;
  const page = await fetchText(searchUrl);
  checked.push(searchUrl);
  if (!page) {
    const result = { available: true, site: base, checked, reachable: false, matches: [] };
    cache.set(ck, { at: Date.now(), result });
    return result;
  }
  // Some searches land straight on the product page.
  found.push(...jsonLdProducts(page, base));
  if (!found.some((p) => matches(p.name, keys))) {
    for (const link of productLinks(page, base, keys).slice(0, 3)) {
      const html = await fetchText(link);
      checked.push(link);
      found.push(...jsonLdProducts(html, link).map((p) => ({ ...p, url: p.url || link })));
      if (found.some((p) => matches(p.name, keys) && p.price_toman)) break;
    }
  }
  let good = found.filter((p) => matches(p.name, keys));
  if (!good.length && (keys.strong.length || keys.latin.length)) good = textMentions(page, [...keys.strong, ...keys.latin].slice(0, 3)).filter((p) => p.price_toman);
  const result = {
    available: true,
    site: base,
    checked,
    reachable: true,
    matches: good.slice(0, 3).map((p) => ({ ...p, name: p.name.replace(/\s+/g, ' ').slice(0, 140) })),
  };
  cache.set(ck, { at: Date.now(), result });
  return result;
}
