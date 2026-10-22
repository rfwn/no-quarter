// Buying know-how for Tehran shops, derived from the data — not invented:
//  - what a listing's warranty really means («تست و تحویل» is not a warranty)
//  - what a phone listing's words mean (نات اکتیو، رجیستر، پارت نامبر، پک اصلی، استوک)
//  - a bargaining range from the listed prices of the same product
//  - when to go, from the shops' own opening hours
import { normalizeText } from './normalize.js';

// ---------- warranty ----------

/** @param {{provider?:string, months?:number}|null} w */
export function warrantyKind(w) {
  const p = String(w?.provider || '').trim();
  const months = w?.months ? `${Number(w.months).toLocaleString('fa-IR')} ماه` : null;
  if (!p) return { kind: 'unknown', label: 'گارانتی ثبت نشده', explain: 'بپرس چه گارانتی‌ای داره و کارتش رو ببین.' };
  if (/تست و تحویل/.test(p)) return { kind: 'test_only', label: 'فقط تست و تحویل', explain: 'یعنی گارانتی نداره؛ همون‌جا کامل تستش کن، بعدش مسئولیتی نیست.' };
  if (/بدون گارانتی/.test(p)) return { kind: 'none', label: 'بدون گارانتی', explain: 'اگه خراب بشه هزینه‌ش با خودته؛ معمولاً باید ارزون‌تر باشه.' };
  if (p === 'شرکتی') return { kind: 'company', label: `گارانتی شرکتی${months ? ` ${months}` : ''}`, explain: 'اسم شرکت گارانتی رو روی کارت و برچسب ببین؛ «شرکتی» بدون اسم یعنی معلوم نیست کدوم شرکت.' };
  return { kind: 'named', label: `گارانتی ${p}${months ? ` ${months}` : ''}`, explain: 'شرکت گارانتی مشخصه؛ کارت گارانتی و برچسب روی جعبه رو تطبیق بده.' };
}

// ---------- phone listing words ----------

const PHONE_SIGNALS = [
  [/نات\s*اکتیو/, 'نات‌اکتیو', 'یعنی هنوز روشن و فعال نشده؛ پلمب جعبه رو چک کن.'],
  [/رجیستر\s*(نشده|نیست)|بدون\s*رجیستر/, 'رجیستر نشده', 'گوشی رجیستر نشده بعد از مدتی شبکه‌ش قطع می‌شه؛ مگه این‌که خودت رجیسترش کنی (هزینه‌ی گمرک داره).'],
  [/رجیستر(\s*شده)?/, 'رجیستر', 'می‌گه رجیستر شده؛ با کد IMEI روی سامانه‌ی همتا چک کن.'],
  [/پک\s*اصلی/, 'پک اصلی', 'جعبه و لوازم اصلی کارخونه؛ پلمب رو ببین.'],
  [/آکبند/, 'آکبند', 'یعنی نو و پلمب؛ قبل از پرداخت پلمب رو جلوی خودت باز کن.'],
  [/استوک|کارکرده/, 'استوک', 'کارکرده‌ست؛ سلامت باتری، تعویضی نبودن قطعات و رجیستری رو چک کن.'],
  [/\b(CH|ZA|LL|ZP|HN|VN|AA)\s*\/?\s*A?\b/, 'پارت نامبر', 'کد منطقه‌ی ساخت؛ مثلاً CH (چین) معمولاً دو سیم‌کارت فیزیکی داره. روی جعبه با گوشی تطبیق بده.'],
];

/** What a phone listing's seller text claims, in plain words. Seller-written: label it as such. */
export function phoneSignals(text) {
  const t = ` ${String(text || '')} `;
  const out = [];
  for (const [re, label, explain] of PHONE_SIGNALS) {
    if (re.test(t) && !(label === 'رجیستر' && out.some((s) => s.label === 'رجیستر نشده'))) out.push({ label, explain });
  }
  return out.slice(0, 4);
}

/** Terms shoppers meet in Tehran phone and electronics shops. */
export const GLOSSARY = {
  رجیستری: 'ثبت گوشی در گمرک. گوشی رجیستر نشده بعد از مدتی سیم‌کارت نمی‌گیره. قبل از خرید IMEI (کد *#06#) رو در سامانه‌ی همتا چک کن.',
  'نات اکتیو': 'گوشی‌ای که هنوز روشن و فعال نشده؛ عملاً نو. پلمب جعبه رو چک کن.',
  'پارت نامبر': 'کدی که نشون می‌ده گوشی برای کدوم بازار ساخته شده (مثل CH یا ZA). روی امکانات (مثلاً دو سیم‌کارت) و گارانتی اثر داره.',
  استوک: 'کارکرده. سلامت باتری، تعویضی نبودن قطعات و رجیستری رو چک کن؛ دلیل خوبی برای چونه زدنه.',
  'گارانتی شرکتی': 'گارانتی‌ای که اسم شرکتش معلوم نیست. اسم شرکت و کارت گارانتی رو بخواه.',
  'تست و تحویل': 'یعنی گارانتی نداره؛ فقط موقع تحویل تست می‌شه.',
};

// ---------- bargaining ----------

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];
const round = (n) => (n >= 10_000_000 ? Math.round(n / 100_000) * 100_000 : Math.round(n / 10_000) * 10_000);

/**
 * From the listed prices of one product: what to aim for, what's still fair, and when to walk away.
 * Null with fewer than 3 prices — not enough to say anything honest.
 */
export function bargainRange(prices) {
  const p = prices.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (p.length < 3) return null;
  const aim = round(Math.max(p[0], pct(p, 0.25)));
  const fairMax = round(pct(p, 0.5));
  const walkAway = round(Math.max(pct(p, 0.75), fairMax * 1.04));
  return { listed_count: p.length, lowest: p[0], aim, fair_max: fairMax, walk_away: walkAway };
}

/** Concrete things to say, with real names and numbers from the data. */
export function bargainTips({ cheaper, family, warranty }) {
  const tips = [];
  if (cheaper) tips.push(`بگو «${cheaper.shop_name}» همینو ${cheaper.price.toLocaleString('fa-IR')} تومان ثبت کرده${cheaper.distance_km != null ? ` (${cheaper.distance_km.toLocaleString('fa-IR')} کیلومتری)` : ''}.`);
  tips.push('قیمت نقدی یا کارت‌به‌کارت رو جدا بپرس؛ خیلی وقتا کمتره.');
  if (warranty?.kind === 'test_only' || warranty?.kind === 'none') tips.push('گارانتی نداره؛ این خودش دلیل تخفیفه.');
  if (family === 'phone') tips.push('اگه استوکه، سلامت باتری زیر ۸۵٪ دلیل خوبی برای تخفیفه.');
  return tips.slice(0, 3);
}

// ---------- when to go ----------

const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

/**
 * From the offers' opening status now: how many are open, which close soon, and — if most are closed —
 * when to come instead. `day` is the Tehran weekday key (sat…fri).
 */
export function timeAdvice(offers, { day } = {}) {
  const known = offers.filter((o) => o.open && o.open.status !== 'unknown');
  const open = known.filter((o) => o.open.status === 'open');
  const closingSoon = [...new Map(open.filter((o) => o.open.closes_in_min != null && o.open.closes_in_min <= 60).map((o) => [o.shop_name, { shop_name: o.shop_name, closes: o.open.closes, minutes: o.open.closes_in_min }])).values()];
  const later = known.filter((o) => o.open.status === 'opens_later').map((o) => o.open.opens).filter(Boolean).sort();
  const friday = day === 'fri';
  let advice = null;
  if (known.length >= 3 && open.length / known.length < 0.4) {
    if (later.length >= 2) advice = `بیشترشون الان بسته‌ن؛ از ساعت ${later[Math.floor(later.length / 2)]} بازن.`;
    else advice = friday ? 'امروز جمعه‌ست و بیشترشون بسته‌ن؛ شنبه صبح بهتره.' : 'بیشترشون امروز دیگه باز نمی‌کنن؛ فردا صبح بهتره.';
  } else if (closingSoon.length && closingSoon.length >= open.length / 2) {
    advice = `عجله کن: ${closingSoon.length.toLocaleString('fa-IR')} تاشون تا یه ساعت دیگه می‌بندن.`;
  }
  return { open_now: open.length, known_hours: known.length, unknown_hours: offers.length - known.length, closing_soon: closingSoon.slice(0, 3), friday, advice };
}

export const isPhoneCategory = (c) => normalizeText(c) === normalizeText('گوشی موبایل');
