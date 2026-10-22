// Several items, one trip: the items found, then up to three ways to buy them nearby. Each option says
// plainly how many items it covers — a cheaper total that misses an item isn't really cheaper.
import { useRef, useState } from 'react';
import ShopMap, { focusRow, ownControl } from './ShopMap.jsx';
import { cleanTitle, formatKm, shortToman, toFaDigits } from './format.js';
import { openShop } from './shopSheet.js';
import { Src } from './Source.jsx';

const KIND_NOTE = {
  one_shop: 'کمترین رفت‌وآمد',
  one_passage: 'همه نزدیک هم، توی یه پاساژ',
  cheapest: 'کمترین هزینه',
};

export default function ShoppingList({ block, ctx, onAsk, busy }) {
  const [active, setActive] = useState(0);
  const [focusId, setFocusId] = useState(null);
  const stopsRef = useRef(null);
  const n = block.items.length;
  const op = block.options[active];
  const titleOf = (id) => cleanTitle(block.items.find((i) => i.product_id === id)?.title || '');
  return (
    <section className="card slist" aria-label="لیست خرید">
      <header className="slist-head">
        <h3 className="card-title">لیست خریدت، {toFaDigits(n)} قلم</h3>
        <ul className="slist-items">
          {block.items.map((i) => (
            <li key={i.product_id}>
              {i.image ? <img src={i.image} alt="" width="32" height="32" loading="lazy" /> : <span className="slist-noimg" />}
              <span className="slist-item-title">{cleanTitle(i.title)}</span>
              <span className="muted small">{toFaDigits(i.sellers_nearby)} مغازه نزدیک</span>
            </li>
          ))}
        </ul>
        {block.not_found?.length > 0 && <p className="muted small">پیدا نشد: {block.not_found.join('، ')}</p>}
      </header>

      {block.options.length > 1 && (
        <div className="slist-tabs" role="tablist" aria-label="راه‌های خرید">
          {block.options.map((o, i) => (
            <button key={o.kind} type="button" role="tab" aria-selected={i === active} className="slist-tab" onClick={() => setActive(i)}>
              <span className="slist-tab-title">{o.title}</span>
              <span className="slist-tab-meta">
                {shortToman(o.total)}، {toFaDigits(o.stop_count)} توقف
              </span>
              <span className={`slist-cover${o.covered < n ? ' is-partial' : ''}`}>{o.covered < n ? `${toFaDigits(o.covered)} از ${toFaDigits(n)} قلم` : 'همه‌ی اقلام'}</span>
            </button>
          ))}
        </div>
      )}

      {op && (
        <div className="slist-option" role="tabpanel">
          <p className="slist-summary">
            <strong>{shortToman(op.total)} تومان</strong> برای {toFaDigits(op.covered)} قلم، {toFaDigits(op.stop_count)} مغازه
            {KIND_NOTE[op.kind] && <span className="muted">، {KIND_NOTE[op.kind]}</span>}
            <Src kind="torob" />
          </p>
          {op.missing.length > 0 && <p className="slist-missing">این گزینه «{op.missing.map(cleanTitle).join('»، «')}» رو نداره؛ باید جای دیگه بگیری.</p>}
          <div className="card-map">
            <ShopMap
              key={op.kind}
              title={op.title}
              route={op.stops.length > 1}
              points={op.stops.map((st, i) => ({ id: st.shop_id, lat: st.lat, lon: st.lon, order: i + 1, label: st.shop_name, title: st.shop_name, closed: ['closed_now', 'closed_today', 'opens_later'].includes(st.open) }))}
              origin={ctx?.lat != null ? ctx : null}
              selectedId={focusId}
              onSelect={(id) => (setFocusId(id), focusRow(stopsRef.current, id))}
            />
          </div>
          <ol className="slist-stops" ref={stopsRef}>
            {op.stops.map((s) => (
              <li key={s.shop_id} data-pin={s.shop_id} className={focusId === s.shop_id ? 'is-focus' : undefined} onClick={(e) => !ownControl(e) && setFocusId(s.shop_id)}>
                <p className="slist-shop">
                  <button type="button" className="shop-link" onClick={() => openShop(s.shop_id, s.shop_name)}>
                    {s.shop_name}
                  </button>
                  <span className="muted small">
                    {' '}
                    {['', s.passage, s.passage && s.floor_unit, s.distance_km != null && formatKm(s.distance_km)].filter((x, j) => j === 0 || x).join('، ')}
                  </span>
                </p>
                <ul className="slist-stop-items">
                  {s.items.map((it) => (
                    <li key={it.offer_id}>
                      <span>{titleOf(it.product_id)}</span>
                      <span className="slist-price">{shortToman(it.price)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onAsk(`برنامه‌ی رفتن برای گزینه‌ی «${op.title}» رو بچین`)}>
            برنامه‌ی رفتن با همین گزینه
          </button>
        </div>
      )}
      <p className="data-note">قیمت‌ها ثبت‌شده‌ن و موجودی تأیید نشده؛ برای چند قلم، قبل از رفتن بپرسی بهتره.</p>
    </section>
  );
}
