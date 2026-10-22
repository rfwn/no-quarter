const fa = new Intl.NumberFormat('fa-IR');

export const toFaDigits = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
export const faNum = (n) => fa.format(n);

// 60000000 → "۶۰ میلیون", 145900000 → "۱۴۵٫۹ میلیون", 850000 → "۸۵۰ هزار"
export function shortToman(n) {
  if (n == null) return null;
  if (n >= 1e9) return `${fa.format(Math.round(n / 1e7) / 100)} میلیارد`;
  if (n >= 1e6) return `${fa.format(Math.round(n / 1e5) / 10)} میلیون`;
  if (n >= 1e3) return `${fa.format(Math.round(n / 1e3))} هزار`;
  return fa.format(n);
}

// "۹۲ تا ۱۳۵ میلیون تومان" — one unit, so the range never breaks into a lone "میلیون تومان".
export function rangeText(min, max) {
  if (min == null) return null;
  if (min === max || max == null) return `${shortToman(min)} تومان`;
  if (min >= 1e6 && max >= 1e6 && max < 1e9) return `${fa.format(Math.round(min / 1e5) / 10)} تا ${fa.format(Math.round(max / 1e5) / 10)} میلیون تومان`;
  return `${shortToman(min)} تا ${shortToman(max)} تومان`;
}

// Torob listing titles use "|" as a separator: "iPhone 13 | حافظه 128 گیگابایت" → "iPhone 13، حافظه 128 گیگابایت"
export const cleanTitle = (t) => String(t || '').replace(/\s*\|\s*/g, '، ').trim();

export function formatKm(km) {
  if (km == null) return null;
  if (km < 1) return `${fa.format(Math.max(50, Math.round((km * 1000) / 50) * 50))} متر`;
  return `${fa.format(km < 10 ? Math.round(km * 10) / 10 : Math.round(km))} کیلومتر`;
}

export function priceAge(days) {
  if (days == null) return 'زمان ثبت نامشخص';
  if (days === 0) return 'امروز';
  if (days === 1) return 'دیروز';
  if (days < 30) return `${fa.format(days)} روز پیش`;
  if (days < 365) return `${fa.format(Math.round(days / 30))} ماه پیش`;
  return `${fa.format(Math.round(days / 365))} سال پیش`;
}

/** Short open-status label + tone for the dot. */
export function openState(open) {
  switch (open?.status) {
    case 'open':
      return { tone: open.closes_in_min != null && open.closes_in_min <= 45 ? 'soon' : 'open', text: `باز تا ${toFaDigits(open.closes)}` };
    case 'opens_later':
      return { tone: 'closed', text: `ساعت ${toFaDigits(open.opens)} باز می‌شود` };
    case 'closed_now':
      return { tone: 'closed', text: 'امروز بسته شد' };
    case 'closed_today':
      return { tone: 'closed', text: 'امروز تعطیل' };
    default:
      return { tone: 'unknown', text: 'ساعت کاری نامشخص' };
  }
}

export const telHref = (phone) => `tel:${String(phone).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d+]/g, '')}`;
export const neshanHref = (o) => (o?.lat != null ? `https://neshan.org/maps/@${o.lat},${o.lon},17z` : null);
export const clockFa = (iso) => toFaDigits(new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }));

/** "۲۱ مهر" (Persian calendar) for an ISO date. */
export function faDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('fa-IR', { day: 'numeric', month: 'long' });
  } catch {
    return null;
  }
}
