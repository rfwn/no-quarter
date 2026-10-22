// Output grounding: every phone number and price the agent states must trace back to tool results
// (or to the user's own words). Generalises the v1 phone check to prices.
import { config } from '../config.js';
import { findPhones, phoneKey, toLatinDigits, PHONE_RE } from './privacy.js';

const UNIT = { هزار: 1e3, میلیون: 1e6, میلیارد: 1e9 };
const NUM = String.raw`\d+(?:[.,٫٬/]\d+)*`;
const PRICE_RE = new RegExp(String.raw`(${NUM})\s*(?:تا\s*(${NUM})\s*)?(میلیارد|میلیون|هزار)?\s*(تومان|تومن|ت\b)?`, 'g');

function parseNumber(token, hasUnitWord) {
  const parts = token.split(/[.,٫٬/]/);
  // "60٫000٫000" (Torob style) or "60,000,000": separators are thousands groups.
  if (parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && (!hasUnitWord || parts.length > 2)) {
    return Number(parts.join(''));
  }
  if (parts.length === 2) return Number(`${parts[0]}.${parts[1]}`);
  return Number(parts.join(''));
}

/** Price mentions in toman. Only numbers carrying a money unit are considered. */
export function extractPrices(text) {
  const out = [];
  const src = toLatinDigits(text).replace(PHONE_RE, ' ');
  for (const m of src.matchAll(PRICE_RE)) {
    const [, a, b, unitWord, toman] = m;
    if (!unitWord && !toman) continue;
    const mult = unitWord ? UNIT[unitWord] : 1;
    for (const tok of [a, b].filter(Boolean)) {
      const v = parseNumber(tok, !!unitWord) * mult;
      if (Number.isFinite(v) && v >= 10_000) out.push(v);
    }
  }
  return out;
}

export function emptyFacts() {
  return { prices: [], phones: [] };
}

export function mergeFacts(a = emptyFacts(), b = emptyFacts()) {
  return {
    prices: [...new Set([...(a.prices || []), ...(b.prices || [])])].slice(-400),
    phones: [...new Set([...(a.phones || []), ...(b.phones || [])])].slice(-100),
  };
}

function near(v, f, tol) {
  return Math.abs(v - f) / Math.max(v, f) <= tol;
}

/**
 * @param {string} text  candidate reply
 * @param {{prices:number[], phones:string[]}} facts  grounded facts collected from tools
 * @param {string[]} userTexts  the user's own messages (their numbers are allowed to be echoed)
 */
export function checkGrounding(text, facts, userTexts = []) {
  const violations = [];
  const knownPhones = new Set([...(facts.phones || []), ...userTexts.flatMap(findPhones).map(phoneKey)]);
  for (const p of findPhones(text)) if (!knownPhones.has(phoneKey(p))) violations.push({ kind: 'phone', value: p });

  const base = [...(facts.prices || []), ...userTexts.flatMap(extractPrices)];
  const tol = config.governance.priceTolerance;
  // Differences ("۲۳ میلیون گران‌تر") are derived facts too.
  const capped = base.slice(-60);
  const diffs = [];
  for (let i = 0; i < capped.length; i++) for (let j = i + 1; j < capped.length; j++) diffs.push(Math.abs(capped[i] - capped[j]));
  const allowed = [...base, ...diffs.filter((d) => d >= 10_000)];
  for (const v of extractPrices(text)) {
    if (!allowed.some((f) => near(v, f, tol))) violations.push({ kind: 'price', value: v });
  }
  return { ok: violations.length === 0, violations };
}

/** Last-resort redaction when the model keeps stating ungrounded phone numbers. */
export function redactUngroundedPhones(text, violations) {
  let out = toLatinDigits(text);
  for (const v of violations.filter((x) => x.kind === 'phone')) {
    out = out.replace(PHONE_RE, (m) => (phoneKey(m) === phoneKey(v.value) ? '[شماره تأییدنشده]' : m));
  }
  return out;
}
