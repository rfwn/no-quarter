// No signal inside the passage: the latest visit plan or shopping list is saved on the device as it arrives,
// and shown here when the connection drops — names, floors and units, what to check, plan B.
import { useEffect, useState } from 'react';
import { clockFa, shortToman, toFaDigits } from './format.js';

const KEY = 'torobchin-saved-trip';

export function saveTrip(block) {
  if (block?.type !== 'visit_plan' && block?.type !== 'shopping_list') return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ block, savedAt: Date.now() }));
  } catch {}
}

export function loadTrip() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

const where = (s) => [s.passage, s.floor_unit].filter(Boolean).join('، ') || s.address || '';

export function OfflineTrip() {
  const trip = loadTrip();
  return (
    <section className="card offline" role="region" aria-label="بدون اینترنت">
      <p className="offline-head">
        <strong>اینترنت قطعه.</strong> {trip ? 'آخرین برنامه‌ات این‌جاست:' : 'وصل که شد، پیامت رو بفرست.'}
      </p>
      {trip?.block.type === 'visit_plan' && (
        <ol className="offline-stops">
          {trip.block.stops.map((s, i) => (
            <li key={s.offer_id}>
              <p className="offline-name">
                {toFaDigits(i + 1)}. {s.shop_name}
              </p>
              <p className="offline-where">{where(s)}</p>
              <p className="offline-meta">
                {s.price != null ? `${shortToman(s.price)} تومان (ثبت‌شده)` : 'بدون قیمت'}
                {s.closes ? `، باز تا ${toFaDigits(s.closes)}` : ''}
              </p>
              {s.checks?.length > 0 && <p className="offline-checks">{s.checks.join('؛ ')}</p>}
              {s.fallback && (
                <p className="offline-planb">
                  پلن ب: {s.fallback.shop_name}، {where(s.fallback)}
                  {s.fallback.price != null ? `، ${shortToman(s.fallback.price)}` : ''}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {trip?.block.type === 'shopping_list' &&
        (() => {
          const op = trip.block.options[0];
          return (
            <ol className="offline-stops">
              {op?.stops.map((s) => (
                <li key={s.shop_id}>
                  <p className="offline-name">{s.shop_name}</p>
                  <p className="offline-where">{where(s)}</p>
                  <p className="offline-meta">{s.items.map((it) => shortToman(it.price)).join('، ')} تومان</p>
                </li>
              ))}
            </ol>
          );
        })()}
      {trip && <p className="offline-saved">ذخیره‌شده ساعت {clockFa(new Date(trip.savedAt).toISOString())} روی همین گوشی</p>}
    </section>
  );
}
