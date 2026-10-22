import { createHash } from 'node:crypto';
import { config } from '../config.js';

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';

export const toLatinDigits = (s) =>
  String(s ?? '')
    .replace(/[۰-۹]/g, (d) => PERSIAN.indexOf(d))
    .replace(/[٠-٩]/g, (d) => ARABIC.indexOf(d));

export const digitsOnly = (s) => toLatinDigits(s).replace(/\D/g, '');

// Iranian mobile/landline numbers, with or without +98 / separators, in any digit script.
export const PHONE_RE = /(?:\+98|0098|0)[\s-]?\d(?:[\s-]?\d){8,10}/g;

export function findPhones(text) {
  return (toLatinDigits(text).match(PHONE_RE) || []).map(digitsOnly).filter((p) => p.length >= 10);
}

export const phoneKey = (p) => digitsOnly(p).slice(-10);

export function redactPhones(text) {
  return toLatinDigits(text).replace(PHONE_RE, '[phone]');
}

export function hashId(id) {
  return createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
}

// Coarsen location before it enters graph state, traces or logs.
export function coarsenCtx(ctx = {}) {
  const d = config.governance.locationDecimals;
  const out = {};
  if (typeof ctx.city === 'string' && ctx.city.trim()) out.city = ctx.city.trim().slice(0, 40);
  if (typeof ctx.place === 'string' && ctx.place.trim()) out.place = ctx.place.trim().slice(0, 40);
  // What the user asked to be called: letters, spaces and ZWNJ only (it reaches the prompt), max 24 chars.
  if (typeof ctx.name === 'string') {
    const name = ctx.name.replace(/[^\p{L}\p{M}\s‌]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (name) out.name = name;
  }
  const lat = Number(ctx.lat);
  const lon = Number(ctx.lon);
  if (ctx.lat != null && ctx.lon != null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    out.lat = +lat.toFixed(d);
    out.lon = +lon.toFixed(d);
  }
  return out;
}
