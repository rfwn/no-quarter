// Send a plan, a comparison or a list to someone at home: the phone's share sheet, or copy as text.
import { useState } from 'react';
import { formatKm, neshanHref, openState, shortToman, toFaDigits } from './format.js';

export function ShareButton({ title, text }) {
  const [done, setDone] = useState('');
  async function share() {
    const body = typeof text === 'function' ? text() : text;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: body });
        return;
      }
      await navigator.clipboard.writeText(body);
      setDone('کپی شد');
      setTimeout(() => setDone(''), 2500);
    } catch {}
  }
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={share}>
      {done || 'بفرست برای کسی'}
    </button>
  );
}

const where = (s) => [s.passage, s.floor_unit].filter(Boolean).join('، ');

export const planText = (block) =>
  [
    'برنامه‌ی خرید (ترب‌چین)',
    ...block.stops.map((s, i) =>
      [`${toFaDigits(i + 1)}. ${s.shop_name}${where(s) ? ` — ${where(s)}` : ''}`, s.price != null ? `   ${shortToman(s.price)} تومان (قیمت ثبت‌شده)` : null, neshanHref(s) ? `   مسیر: ${neshanHref(s)}` : null]
        .filter(Boolean)
        .join('\n'),
    ),
    block.leave_by ? `دیرتر از ${toFaDigits(new Date(block.leave_by).toLocaleTimeString('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }))} راه نیفت.` : null,
  ]
    .filter(Boolean)
    .join('\n');

export const compareText = (offers, pick) =>
  [
    'مقایسه‌ی مغازه‌ها (ترب‌چین)',
    ...offers.map((o) => `- ${o.shop_name}: ${o.price != null ? `${shortToman(o.price)} تومان` : 'بدون قیمت'}${o.distance_km != null ? `، ${formatKm(o.distance_km)}` : ''}، ${openState(o.open).text}`),
    pick ? `پیشنهاد: ${pick.shop_name}` : null,
    'قیمت‌ها ثبت‌شده‌ان؛ موجودی رو باید از مغازه پرسید.',
  ]
    .filter(Boolean)
    .join('\n');

export const listText = (block, op) =>
  [
    `لیست خرید (ترب‌چین): ${op.title}`,
    ...op.stops.map((s) => `- ${s.shop_name}${where(s) ? ` (${where(s)})` : ''}: ${s.items.map((it) => `${block.items.find((x) => x.product_id === it.product_id)?.title?.split('|')[0].trim()} ${shortToman(it.price)}`).join('، ')}`),
    `جمع: ${shortToman(op.total)} تومان برای ${toFaDigits(op.covered)} از ${toFaDigits(block.items.length)} قلم`,
  ].join('\n');
