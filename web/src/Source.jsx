// Where a fact comes from, said on the fact itself (the brief: «با مشخص بودن نوع اطلاعات»).
// A listed price is not a confirmed price; a declared payment option is the seller's word; stock is never
// confirmed by the data. Keep these labels on every surface that shows such facts.
export const SOURCES = {
  torob: { label: 'ثبت‌شده در ترب', hint: 'قیمت یا اطلاعاتی که فروشنده در ترب ثبت کرده؛ ممکنه قدیمی باشه.' },
  seller: { label: 'به اعلام فروشنده', hint: 'فروشنده خودش اعلام کرده؛ ترب یا ما تأییدش نکردیم.' },
  hours: { label: 'ثبت‌شده‌ی مغازه', hint: 'ساعت کاری‌ای که مغازه ثبت کرده؛ روزهای تعطیل رسمی ممکنه فرق کنه.' },
  unverified: { label: 'تأیید نشده', hint: 'داده‌ها موجودی رو نشون نمی‌دن؛ قبل از رفتن از مغازه بپرس.' },
  you: { label: 'به گفته‌ی خودت', hint: 'جوابی که از مغازه گرفتی و این‌جا نوشتی.' },
  site: { label: 'از سایت مغازه', hint: 'از سایت خود مغازه خوندیم؛ ادعای فروشنده‌ست.' },
  category: { label: 'فقط دسته‌ی فعالیت', hint: 'مغازه گفته این دسته رو کار می‌کنه، ولی کالایی ازش ثبت نکرده؛ نشونه‌ی موجود بودن نیست.' },
};

export function Src({ kind }) {
  const s = SOURCES[kind];
  if (!s) return null;
  return (
    <span className={`src src-${kind}`} title={s.hint}>
      {s.label}
    </span>
  );
}
