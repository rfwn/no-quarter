// One normalisation for indexing and querying Persian product text:
// Arabic ي/ك → Persian ی/ک, Persian/Arabic digits → Latin, ZWNJ and punctuation → space, lowercase.
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Persian/Arabic digits → Latin, nothing else changed (prices like «۲۵٬۰۰۰٬۰۰۰ تومان»). */
export const toEnglishDigits = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => PERSIAN_DIGITS.indexOf(d)).replace(/[٠-٩]/g, (d) => ARABIC_DIGITS.indexOf(d));

export function normalizeText(s) {
  return String(s ?? '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[۰-۹]/g, (d) => PERSIAN_DIGITS.indexOf(d))
    .replace(/[٠-٩]/g, (d) => ARABIC_DIGITS.indexOf(d))
    .replace(/[ً-ٟـ]/g, '') // harakat, tatweel
    .replace(/[‌‍]/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Shoppers type brands and models in Persian; titles mix Persian and English. Expand both ways.
export const SYNONYMS = {
  آیفون: ['iphone'], ایفون: ['iphone'], ایرپاد: ['airpods'], ایرپاد: ['airpods'], اپل: ['apple'], مکبوک: ['macbook'], آیپد: ['ipad'], ایپد: ['ipad'],
  سامسونگ: ['samsung'], گلکسی: ['galaxy'], شیائومی: ['xiaomi'], شیاومی: ['xiaomi'], ردمی: ['redmi'], پوکو: ['poco'], هواوی: ['huawei'], آنر: ['honor'],
  نوکیا: ['nokia'], موتورولا: ['motorola'], ریلمی: ['realme'], وان: ['one'], پلاس: ['plus'], پرو: ['pro'], مکس: ['max'], الترا: ['ultra'], اولترا: ['ultra'],
  پلی: ['play'], استیشن: ['station'], پلیاستیشن: ['playstation'], ایکس: ['x'], باکس: ['box'], ایکسباکس: ['xbox'], نینتندو: ['nintendo'],
  لنوو: ['lenovo'], ایسوس: ['asus'], ایسر: ['acer'], دل: ['dell'], اچپی: ['hp'], سونی: ['sony'], کانن: ['canon'], نیکون: ['nikon'], جیبیال: ['jbl'], انکر: ['anker'],
  گیگ: ['gb'], گیگابایت: ['gb'], ترابایت: ['tb'], اینچ: ['inch'],
};

/** Normalised tokens of a user query, each with its synonym alternatives. */
export function queryTokens(q) {
  return normalizeText(q)
    .split(' ')
    .filter(Boolean)
    .slice(0, 8)
    .map((t) => [t, ...(SYNONYMS[t] || [])]);
}
