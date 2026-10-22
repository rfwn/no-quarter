// Iran's official holidays for the coming months: most shops and passages close. The solar-calendar ones are
// fixed; the lunar ones (marked `approx`) are computed and can be off by a day, so the app says
// «احتمالاً تعطیله» for them. Verify against the official calendar (time.ir) before relying on a lunar date.
const HOLIDAYS = [
  // 1405
  { date: '2026-11-13', name: 'شهادت حضرت فاطمه', approx: true },
  { date: '2026-12-23', name: 'ولادت امام علی', approx: true },
  { date: '2027-01-06', name: 'مبعث', approx: true },
  { date: '2027-01-24', name: 'نیمه‌ی شعبان', approx: true },
  { date: '2027-02-11', name: '۲۲ بهمن' },
  { date: '2027-03-01', name: 'شهادت امام علی', approx: true },
  { date: '2027-03-10', name: 'عید فطر', approx: true },
  { date: '2027-03-11', name: 'تعطیل عید فطر', approx: true },
  { date: '2027-03-20', name: 'ملی شدن صنعت نفت' },
  // 1406
  { date: '2027-03-21', name: 'نوروز' },
  { date: '2027-03-22', name: 'نوروز' },
  { date: '2027-03-23', name: 'نوروز' },
  { date: '2027-03-24', name: 'نوروز' },
  { date: '2027-04-01', name: 'روز جمهوری اسلامی' },
  { date: '2027-04-02', name: 'سیزده‌به‌در' },
  { date: '2027-04-03', name: 'شهادت امام صادق', approx: true },
  { date: '2027-05-17', name: 'عید قربان', approx: true },
  { date: '2027-05-25', name: 'عید غدیر', approx: true },
  { date: '2027-06-04', name: 'رحلت امام خمینی' },
  { date: '2027-06-05', name: 'قیام ۱۵ خرداد' },
  { date: '2027-06-14', name: 'تاسوعا', approx: true },
  { date: '2027-06-15', name: 'عاشورا', approx: true },
];

/** The Tehran calendar date (YYYY-MM-DD) of a moment. */
export function tehranDate(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** The official holiday on that day in Tehran, if any. */
export function holidayOn(at = new Date()) {
  const d = tehranDate(at);
  return HOLIDAYS.find((h) => h.date === d) || null;
}

/** Holidays in the next `days` days (today included), for the agent's context. */
export function upcomingHolidays(days = 3, from = new Date()) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const h = holidayOn(new Date(from.getTime() + i * 86_400_000));
    if (h) out.push({ ...h, in_days: i });
  }
  return out;
}

/** A one-line Persian warning for a holiday. */
export const holidayNote = (h, when = 'اون روز') =>
  h ? `${when} ${h.approx ? 'احتمالاً ' : ''}تعطیل رسمیه (${h.name})؛ خیلی از مغازه‌ها و پاساژها بسته‌ن، قبل از رفتن بپرس.` : null;
