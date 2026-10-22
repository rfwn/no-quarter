// Product types ("families") and what matters for each: which spec fields to show (the same field has
// several names in the export), how to compare them, sizes/colours for wearables, and what to check in
// the shop. Cards and comparisons are built from this table; the model may only choose WHICH of a
// family's labels to put first (focus) — every value comes from the product's own specs or title.
import { normalizeText } from './normalize.js';

const num = (v) => {
  const m = String(v ?? '')
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/,/g, '')
    .match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// [label, spec names (first match wins), better: 'max' | 'min' | null]
export const FAMILIES = {
  phone: {
    label: 'گوشی',
    match: (c) => c === 'گوشی موبایل',
    fields: [
      ['حافظه', ['حافظه داخلی'], 'max'],
      ['رم', ['__ram'], 'max'],
      ['باتری', ['ظرفیت باتری'], 'max'],
      ['صفحه', ['اندازه صفحه نمایش', 'اندازه'], null],
      ['سیم‌کارت', ['تعداد سیم کارت'], null],
      ['دوربین سلفی', ['دوربین سلفی'], 'max'],
      ['تراشه', ['تراشه'], null],
      ['سیستم‌عامل', ['سیستم عامل'], null],
      ['NFC', ['NFC'], null],
      ['کارت حافظه', ['پشتیبانی از کارت حافظه'], null],
      ['وزن', ['وزن'], 'min'],
    ],
    checklist: ['رجیستری رو با کد IMEI چک کن (*#06#)', 'پلمب جعبه و برچسب گارانتی رو ببین', 'اگه استوکه: سلامت باتری و تعویضی نبودن قطعات'],
  },
  laptop: {
    label: 'لپ‌تاپ',
    match: (c) => c === 'لپ تاپ و نوت بوک',
    fields: [
      ['پردازنده', ['__cpu'], null],
      ['نسل', ['نسل پردازنده'], 'max'],
      ['هسته', ['تعداد هسته'], 'max'],
      ['رم', ['__ram', 'نوع رم'], 'max'],
      ['حافظه', ['نوع حافظه'], null],
      ['صفحه', ['وضوح تصویر'], null],
      ['پنل', ['پنل تصویر'], null],
      ['رفرش ریت', ['نرخ بروزرسانی تصویر'], 'max'],
      ['وزن', ['وزن (کیلوگرم)', 'وزن'], 'min'],
      ['کاربری', ['کاربری'], null],
    ],
    checklist: ['مشخصات رو توی تنظیمات خود سیستم چک کن', 'سلامت باتری و پیکسل سوخته‌ی صفحه', 'گارانتی و آکبند بودن'],
  },
  shoes: {
    label: 'کفش',
    match: (c) => /کفش|کتانی|صندل|بوت/.test(c),
    fields: [
      ['جنس رویه', ['جنس رویه', 'رویه'], null],
      ['زیره', ['جنس زیره', 'زیره'], null],
      ['کفی', ['کفی', 'نوع کفی'], null],
      ['بستن', ['نحوه بستن', 'نحوه بسته شدن'], null],
      ['نوع', ['نوع کفش'], null],
      ['مناسب برای', ['مناسب برای', 'کاربرد'], null],
      ['جنسیت', ['جنسیت'], null],
    ],
    sizes: ['سایز', 'سایزبندی'],
    colors: ['رنگ بندی', 'رنگ'],
    checklist: ['حتماً بپوش و چند قدم راه برو', 'شرایط تعویض سایز رو بپرس', 'جنس رویه رو از نزدیک ببین'],
  },
  clothes: {
    label: 'پوشاک',
    match: (c) => /پوشاک|لباس|مانتو|شلوار|پیراهن|تی شرت|کت|دامن|هودی|سویشرت/.test(c) && !/چوب لباسی|رگال|آویز/.test(c),
    fields: [
      ['جنس', ['جنس', 'جنس پارچه', 'پارچه', 'جنس :'], null],
      ['استایل', ['مناسب استایل', 'مناسب :'], null],
      ['تن‌خور', ['تن خور'], null],
      ['آستین', ['آستین', 'نوع آستین'], null],
      ['شستشو', ['نحوه شستشو'], null],
      ['ساخت', ['کشور سازنده', 'کشور تولید کننده'], null],
    ],
    sizes: ['سایز', 'سایزبندی لباس', 'سایزلباس', 'سایز:'],
    colors: ['رنگ بندی', 'رنگ', 'رنگ بندی:'],
    checklist: ['پرو کن؛ سایزها بین برندها فرق دارن', 'شرایط تعویض رو بپرس', 'جنس رو از روی اتیکت چک کن'],
  },
  headphone: {
    label: 'هدفون',
    match: (c) => c === 'هدفون، هدست و هندزفری',
    fields: [
      ['اتصال', ['نوع اتصال'], null],
      ['نویز کنسلینگ', ['قابلیت نویز کنسلینگ'], null],
      ['باتری', ['عمر باتری هدفون در حالت پخش موسیقی', 'ظرفیت باتری'], 'max'],
      ['نوع', ['نوع هدفون، هدست و هندزفری', 'نوع گوشی'], null],
      ['بلوتوث', ['نسخه بلوتوث'], 'max'],
      ['میکروفون', ['میکروفون'], null],
      ['درایور', ['قطر درایور'], 'max'],
      ['وزن', ['وزن'], 'min'],
    ],
    checklist: ['کد اصالت رو روی جعبه چک کن', 'قبل از خرید وصلش کن و صدا رو تست کن'],
  },
  tv: {
    label: 'تلویزیون',
    match: (c) => /تلویزیون/.test(c),
    fields: [
      ['اندازه', ['__inch'], 'max'],
      ['کیفیت', ['کیفیت تصویر'], null],
      ['پنل', ['نوع پنل'], null],
      ['سیستم‌عامل', ['سیستم عامل'], null],
      ['HDR', ['تکنولوژی HDR'], null],
      ['ساخت', ['کشور سازنده'], null],
    ],
    checklist: ['تست پیکسل سوخته قبل از تحویل', 'هزینه‌ی ارسال و نصب رو بپرس', 'برچسب گارانتی'],
  },
  fridge: {
    label: 'یخچال',
    match: (c) => /یخچال|فریزر/.test(c),
    fields: [
      ['گنجایش', ['گنجایش کل به لیتر', 'گنجایش یخچال', 'گنجایش کل به فوت'], 'max'],
      ['کمپرسور', ['نوع کمپرسور'], null],
      ['برفک', ['نوع مقاومت در برابر برفک', 'بدون برفک'], null],
      ['یخساز', ['یخساز'], null],
      ['آبسردکن', ['آبسردکن'], null],
      ['ساخت', ['کشور سازنده'], null],
      ['ابعاد', ['ابعاد'], null],
    ],
    checklist: ['ابعاد جای یخچال رو قبلش اندازه بگیر', 'هزینه و زمان ارسال و نصب', 'برچسب انرژی'],
  },
};

export function familyOf(category) {
  const c = String(category || '');
  for (const [id, f] of Object.entries(FAMILIES)) if (f.match(c)) return id;
  return 'generic';
}

/** Allowed focus labels for a family (what the model may choose to put first). */
export const familyLabels = (family) => (FAMILIES[family]?.fields || []).map(([label]) => label);

// Values that live in the title rather than the specs.
function fromTitle(kind, title) {
  const t = String(title || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  if (kind === '__ram') return t.match(/رم\s*(\d+)\s*(گیگ|GB)/i)?.[1] ? `${t.match(/رم\s*(\d+)/i)[1]} گیگابایت` : null;
  if (kind === '__inch') return t.match(/(\d{2,3})\s*اینچ/)?.[1] ? `${t.match(/(\d{2,3})\s*اینچ/)[1]} اینچ` : null;
  return null;
}

/** Spec values carry export debris ("5000 mAh, ,", "a | b"): one clean, readable string. */
const tidy = (v) =>
  String(v)
    .replace(/\s*\|\s*/g, '، ')
    .replace(/(\s*[,،]\s*)+/g, '، ')
    .replace(/^[\s،]+|[\s،]+$/g, '');

const listOf = (v) =>
  String(v || '')
    .split(/[,،/|]| - /)
    .map((x) => x.trim())
    .filter((x) => x && x.length <= 20);

/**
 * A product's type card: family, the fields that matter (focus first), sizes/colours, badges, checklist.
 * @param {{title:string, category:string, specs?:{key:string,value:string}[]}} product
 */
export function productCard(product, focus = []) {
  const family = familyOf(product.category);
  const def = FAMILIES[family];
  const specs = new Map((product.specs || []).map((s) => [String(s.key).trim(), String(s.value ?? '').trim()]));
  const get = (names) => {
    for (const n of names) {
      if (n === '__cpu') {
        const v = [specs.get('سری پردازنده'), specs.get('مدل پردازنده')].filter(Boolean).join(' ');
        if (v) return v;
      } else if (n.startsWith('__')) {
        const v = fromTitle(n, product.title);
        if (v) return v;
      } else if (specs.get(n) && !/^(ندارد|-|—)$/.test(specs.get(n))) return specs.get(n);
    }
    return null;
  };
  let facts;
  if (def) {
    facts = def.fields.map(([label, names, better]) => ({ label, value: get(names), better, n: num(get(names)) })).filter((f) => f.value);
  } else {
    facts = (product.specs || []).filter((s) => s.value && String(s.value).length <= 40).slice(0, 6).map((s) => ({ label: s.key, value: String(s.value), better: null, n: null }));
  }
  const allowed = new Set(focus.filter((f) => facts.some((x) => x.label === f)));
  facts = [...facts.filter((f) => allowed.has(f.label)).map((f) => ({ ...f, focus: true })), ...facts.filter((f) => !allowed.has(f.label))];
  const t = normalizeText(product.title);
  const version = family === 'phone' ? product.title.match(/\(([^)]+)\)/)?.[1] : null; // e.g. (ویتنام)
  const badges = [...new Set([/استوک|کارکرده/.test(t) ? 'استوک' : null, /ریفربیش/.test(t) ? 'ریفربیش' : null, version && !/استوک|کارکرده|گارانتی/.test(version) ? version : null].filter(Boolean))];
  return {
    family,
    family_label: def?.label || null,
    facts: facts.map(({ n, ...f }) => ({ ...f, value: tidy(f.value).slice(0, 48) })),
    sizes: def?.sizes ? listOf(get(def.sizes)).slice(0, 14) : [],
    colors: def?.colors ? listOf(get(def.colors)).slice(0, 8) : [],
    badges,
    checklist: def?.checklist || [],
  };
}

/** Which product wins each comparable row (null on ties or missing values). */
export function compareCards(cards) {
  const labels = [...new Set(cards.flatMap((c) => c.facts.map((f) => f.label)))];
  return labels.map((label) => {
    const cells = cards.map((c) => c.facts.find((f) => f.label === label) || null);
    const better = cells.find((x) => x?.better)?.better || null;
    let winner = null;
    if (better) {
      const vals = cells.map((x) => (x ? num(x.value) : null));
      const ok = vals.filter((v) => v != null);
      if (ok.length >= 2) {
        const target = better === 'max' ? Math.max(...ok) : Math.min(...ok);
        const idx = vals.map((v, i) => (v === target ? i : -1)).filter((i) => i >= 0);
        winner = idx.length === 1 ? idx[0] : null;
      }
    }
    return { label, values: cells.map((x) => x?.value || null), winner, focus: cells.some((x) => x?.focus) };
  });
}
