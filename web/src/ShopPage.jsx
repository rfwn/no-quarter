// A shop's page: where it is, when it's open, how to reach it, what it lists — every fact with its source.
// Rendered inline when the agent calls show_shop, and in a sheet when any shop name is tapped.
import { useEffect, useRef, useState } from 'react';
import { fetchShop } from './api.js';
import { cleanTitle, formatKm, neshanHref, openState, paymentText, priceAge, shortToman, telHref, toFaDigits } from './format.js';
import { ChatIcon, LinkIcon, PhoneIcon, RouteIcon, SearchIcon } from './Icons.jsx';
import { Src } from './Source.jsx';
import ShopMap from './ShopMap.jsx';

/** "شنبه تا چهارشنبه ۹–۲۱" instead of seven identical lines. */
function groupWeek(week) {
  const out = [];
  for (const d of week) {
    const last = out.at(-1);
    if (last && last.text === d.text) last.to = d.day;
    else out.push({ from: d.day, to: d.day, text: d.text });
  }
  return out.map((g) => ({ days: g.from === g.to ? g.from : `${g.from} تا ${g.to}`, text: g.text }));
}

export default function ShopPage({ shop: initial, shopId, threadId, ctx, onAsk, busy, inSheet = false }) {
  const [shop, setShop] = useState(initial || null);
  const [items, setItems] = useState(initial?.catalog?.items || []);
  const [matched, setMatched] = useState(initial?.catalog?.matched ?? 0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  const first = useRef(true);
  const id = initial?.shop_id || shopId;

  async function load({ q = query, cat = category, offset = 0 } = {}) {
    setLoading(true);
    try {
      const page = await fetchShop(threadId, id, { query: q, category: cat, offset, ctx: ctx?.lat != null ? ctx : undefined });
      if (!offset) setShop(page);
      setItems((cur) => (offset ? [...cur, ...page.catalog.items] : page.catalog.items));
      setMatched(page.catalog.matched);
      setError('');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!initial) load();
  }, [id]);

  // Search inside the shop as you type.
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const t = setTimeout(() => load({ q: query, cat: category }), 300);
    return () => clearTimeout(t);
  }, [query, category]);

  if (!shop) return <p className="muted">{error || 'در حال باز کردن صفحه‌ی مغازه…'}</p>;

  const open = openState(shop.open);
  const pay = paymentText(shop);
  const where = shop.passage ? `${shop.passage}${shop.floor_unit ? `، ${shop.floor_unit}` : ''}` : shop.area;
  const week = shop.week ? groupWeek(shop.week) : null; // already Saturday → Friday

  return (
    <section className={`card shop-page${inSheet ? ' in-sheet' : ''}`} aria-label={`صفحه‌ی ${shop.name}`}>
      {!inSheet && (
        <header className="shop-head">
          <h3 className="shop-name">{shop.name}</h3>
          <p className="shop-where">{where}</p>
        </header>
      )}
      {inSheet && <p className="shop-where">{where}</p>}

      <p className="shop-status">
        <span className={`status status-${open.tone}`}>{open.text}</span>
        {shop.distance_km != null && <span className="muted">، {formatKm(shop.distance_km)} تا تو</span>}
      </p>

      <div className="shop-actions">
        {neshanHref(shop) && (
          <a className="btn btn-primary btn-sm" href={neshanHref(shop)} target="_blank" rel="noopener noreferrer">
            <RouteIcon size={16} />
            مسیر در نشان
          </a>
        )}
        {shop.instagram && (
          <a className="btn btn-ghost btn-sm" href={`https://instagram.com/${shop.instagram}`} target="_blank" rel="noopener noreferrer">
            <ChatIcon size={16} />
            <span dir="ltr">@{shop.instagram}</span>
          </a>
        )}
        {shop.website && (
          <a className="btn btn-ghost btn-sm" href={shop.website} target="_blank" rel="noopener noreferrer">
            <LinkIcon size={16} />
            سایت
          </a>
        )}
        {shop.phone && (
          <a className="btn btn-ghost btn-sm" href={telHref(shop.phone)}>
            <PhoneIcon size={16} />
            تماس
          </a>
        )}
      </div>

      {shop.lat != null && (
        <ShopMap title={shop.name} points={[{ id: shop.shop_id, lat: shop.lat, lon: shop.lon, label: shop.name, title: shop.name, best: true }]} origin={ctx?.lat != null ? ctx : null} />
      )}

      <dl className="shop-facts">
        <div>
          <dt>آدرس</dt>
          <dd>{shop.address}</dd>
        </div>
        <div>
          <dt>ساعت کاری</dt>
          <dd>
            {week ? (
              <span className="week">
                {week.map((g) => (
                  <span key={g.days}>
                    <span className="muted">{g.days}</span> {toFaDigits(g.text)}
                  </span>
                ))}
              </span>
            ) : (
              <span className="muted">ثبت نشده؛ قبل از رفتن بپرس</span>
            )}
            {week && <Src kind="hours" />}
          </dd>
        </div>
        <div>
          <dt>پرداخت</dt>
          <dd>
            {pay || <span className="muted">چیزی اعلام نشده</span>}
            {pay && <Src kind="seller" />}
          </dd>
        </div>
        {shop.fast_delivery && (
          <div>
            <dt>ارسال</dt>
            <dd>
              ارسال فوری <Src kind="seller" />
            </dd>
          </div>
        )}
        {shop.declared_only_categories?.length > 0 && (
          <div>
            <dt>کار دیگه‌ش</dt>
            <dd>
              {shop.declared_only_categories.slice(0, 4).join('، ')} <Src kind="category" />
            </dd>
          </div>
        )}
      </dl>

      <div className="shop-catalog">
        <h4 className="shop-sub">
          کالاهای ثبت‌شده <span className="muted">({toFaDigits(shop.catalog.total)})</span>
        </h4>
        {shop.catalog.total > 6 && (
          <div className="loc-search">
            <SearchIcon size={16} className="loc-search-icon" />
            <label className="sr-only" htmlFor={`shop-q-${id}`}>
              جست‌وجو توی این مغازه
            </label>
            <input id={`shop-q-${id}`} className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="توی همین مغازه بگرد…" autoComplete="off" />
          </div>
        )}
        {shop.catalog.categories.length > 1 && (
          <div className="filter-row" role="group" aria-label="دسته‌ها">
            <button type="button" className="chip" aria-pressed={!category} onClick={() => setCategory(null)}>
              همه
            </button>
            {shop.catalog.categories.slice(0, 8).map((c) => (
              <button key={c.name} type="button" className="chip" aria-pressed={category === c.name} onClick={() => setCategory(category === c.name ? null : c.name)}>
                {c.name} <span className="muted">{toFaDigits(c.n)}</span>
              </button>
            ))}
          </div>
        )}
        <ul className="list shop-items" aria-busy={loading}>
          {items.map((i) => (
            <li key={i.offer_id} className="row">
              <div className="row-line">
                {i.image ? <img className="shop-item-img" src={i.image} alt="" width="48" height="48" loading="lazy" /> : <span className="shop-item-img" />}
                <span className="row-text">
                  <span className="row-title product-name">{cleanTitle(i.title)}</span>
                  <span className="row-meta">
                    <span>{i.price != null ? `${shortToman(i.price)} تومان` : 'بدون قیمت'}</span>
                    <span className="muted">{priceAge(i.price_age_days)}</span>
                  </span>
                </span>
                {onAsk && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onAsk(`«${cleanTitle(i.title)}» رو از «${shop.name}» می‌خوام`)}>
                    همینو می‌خوام
                  </button>
                )}
              </div>
            </li>
          ))}
          {!items.length && !loading && <li className="muted small loc-empty">چیزی با این مشخصات توی این مغازه ثبت نشده.</li>}
        </ul>
        {items.length < matched && (
          <button type="button" className="link-btn" disabled={loading} onClick={() => load({ offset: items.length })}>
            {loading ? 'در حال آوردن…' : `بیشتر (${toFaDigits(matched - items.length)} کالای دیگه)`}
          </button>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <p className="data-note">
        قیمت‌ها <Src kind="torob" /> و موجودی <Src kind="unverified" />؛ قبل از رفتن از مغازه بپرس.
      </p>
    </section>
  );
}
