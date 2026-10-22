// Plan B, decided before the trip: if this shop doesn't have it, the closest other seller of the same product,
// how far from the first and the price difference — with one tap to switch.
import { formatKm, shortToman } from './format.js';
import { openShop } from './shopSheet.js';

export default function PlanB({ fallback: f, forName, onAsk, busy, ask }) {
  if (!f) return null;
  const diff = f.price_diff;
  const priceText = diff == null ? '' : diff === 0 ? '، همون قیمت' : diff > 0 ? `، ${shortToman(diff)} گرون‌تر` : `، ${shortToman(-diff)} ارزون‌تر`;
  const far = f.from_primary_m != null ? (f.from_primary_m < 60 ? 'همون‌جا کنارش' : `${formatKm(f.from_primary_m / 1000)} اون‌طرف‌تر`) : '';
  return (
    <div className="planb">
      <p className="planb-text">
        <span className="planb-tag">پلن ب</span> اگه «{forName}» نداشت:{' '}
        <button type="button" className="shop-link" onClick={() => openShop(f.shop_id, f.shop_name)}>
          {f.shop_name}
        </button>
        <span className="muted">
          {far ? `، ${far}` : ''}
          {priceText}
        </span>
      </p>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onAsk(ask)}>
        عوضش کن
      </button>
    </div>
  );
}
