// Renders a turn (text + generative UI blocks) as plain text + buttons, for channels without a UI
// (the Instagram DM bot via BoxAPI). Same agent output, different surface.

const fa = (n) => new Intl.NumberFormat('fa-IR').format(n);
const toman = (n) => (n == null ? 'قیمت ثبت نشده' : n >= 1e6 ? `${fa(Math.round(n / 1e5) / 10)} میلیون تومان` : `${fa(n)} تومان`);
const VERDICT = { good: 'قیمت خوبی است', fair: 'قیمت منصفانه است', high: 'گران‌تر از بازار است', suspicious: 'مشکوک است (احتمال تقلبی/کارکرده)' };
const neshan = (o) => (o.lat != null ? `https://neshan.org/maps/@${o.lat},${o.lon},17z` : null);

export function renderText(result, { maxShops = 3 } = {}) {
  const lines = [];
  const buttons = [];
  const strip = (s) => String(s || '').replace(/\*\*/g, '');

  if (result.type === 'interrupt') {
    const b = result.block;
    if (b.type === 'request_location') {
      lines.push('کجای تهران هستید؟ اسم محله یا پاساژ را بنویسید (مثلاً جمهوری، پاساژ علاءالدین).');
    } else if (b.type === 'confirm_outreach') {
      lines.push(`از «${b.shop_name}» درباره موجودی و قیمت بپرسم؟`, '', b.message);
      buttons.push({ type: 'postback', title: 'بپرس', payload: JSON.stringify({ approve: true }) }, { type: 'postback', title: 'نه', payload: JSON.stringify({ approve: false }) });
    } else {
      lines.push(b.question);
      b.options.forEach((o, i) => lines.push(`${fa(i + 1)}. ${o.label}`));
      buttons.push(...b.options.slice(0, 3).map((o) => ({ type: 'postback', title: o.label.slice(0, 20), payload: JSON.stringify({ value: o.value }) })));
    }
    return { text: lines.join('\n'), buttons };
  }

  if (result.text) lines.push(strip(result.text));
  for (const block of result.blocks || []) {
    if (block.type === 'shop_board') {
      lines.push('');
      block.offers.slice(0, maxShops).forEach((o, i) => {
        lines.push(`${fa(i + 1)}. ${o.shop_name} — ${toman(o.price)}${o.distance_km != null ? ` — ${fa(o.distance_km)} کیلومتر` : ''} — ${o.open?.status === 'open' ? 'باز' : 'بسته/نامشخص'}`);
        if (neshan(o)) buttons.push({ type: 'web_url', title: `مسیر ${o.shop_name}`.slice(0, 20), url: neshan(o) });
      });
    } else if (block.type === 'price_verdict') {
      lines.push('', `${toman(block.offered_price_toman)}: ${VERDICT[block.verdict]}`);
    } else if (block.type === 'product_list') {
      lines.push('');
      block.products.slice(0, 5).forEach((p, i) => lines.push(`${fa(i + 1)}. ${p.title} — از ${toman(p.min_price)}`));
    } else if (block.type === 'visit_plan') {
      lines.push('', 'مسیر پیشنهادی:');
      block.stops.forEach((s, i) => lines.push(`${fa(i + 1)}. ${s.shop_name}${s.passage ? ` (${s.passage})` : ''} — ${fa(s.leg_minutes)} دقیقه ${s.mode === 'walk' ? 'پیاده' : 'با ماشین'}`));
      buttons.push({ type: 'web_url', title: 'مسیر روی نقشه', url: block.maps_url });
    }
  }
  return { text: lines.join('\n').trim(), buttons: buttons.slice(0, 3) };
}
