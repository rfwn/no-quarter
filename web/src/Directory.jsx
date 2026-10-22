import { useMemo, useRef, useState } from 'react';
import { fetchShop, refilterOffers } from './api.js';
import { cleanTitle, faDate, formatKm, paymentText, neshanHref, openState, priceAge, rangeText, shortToman, telHref, toFaDigits } from './format.js';
import { ChatIcon, CheckIcon, ChevronIcon, InfoIcon, MapIcon, PhoneIcon, RouteIcon, TagIcon } from './Icons.jsx';
import ShopMap, { MapPeek, focusRow, offerPoints } from './ShopMap.jsx';
import { openShop } from './shopSheet.js';
import { Src } from './Source.jsx';
import { TypeFacts } from './TypeCard.jsx';
import { SellerClaims, TimeHint, WarrantyText } from './Buying.jsx';
import { record, recordSaving } from './game.js';
import Sheet from './Sheet.jsx';

const RADII = [0.5, 1, 2, 5];
const TOGGLES = [
  ['open_now', 'الان باز'],
  ['installments', 'اقساطی'],
  ['torobpay', 'ترب‌پی'],
  ['warranty', 'گارانتی'],
  ['fast_delivery', 'ارسال فوری'],
];

const toUiFilters = (f = {}) => ({ radius_km: f.radiusKm, max_price: f.maxPrice, open_now: f.openNow, torobpay: f.torobpay, installments: f.installments, fast_delivery: f.fastDelivery, warranty: f.warranty });

// ---------- shop list ----------

export function ShopList({ block: initial, threadId, ctx, onAsk, busy }) {
  const [block, setBlock] = useState(initial);
  const [filters, setFilters] = useState(() => toUiFilters(initial.filters));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [picked, setPicked] = useState([]);
  const [focusId, setFocusId] = useState(null); // the shop selected on the map ↔ in the list
  const listRef = useRef(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const highlights = useMemo(() => new Map((block.highlights || []).map((h) => [h.offer_id, h.reason])), [block.highlights]);

  const { offers, product } = block;
  const cheapest = Math.min(...offers.map((o) => o.price ?? Infinity));
  const nearestId = offers.reduce((a, o) => (o.distance_km != null && (a == null || o.distance_km < a.distance_km) ? o : a), null)?.offer_id;
  const activeCount = Object.values(filters).filter(Boolean).length;
  // A shop can list the same product more than once (colour, condition); those rows need a differentiator.
  const listingLabels = useMemo(() => distinctListingLabels(offers), [offers]);

  // Market reference for the savings game: median of all listed prices for this product.
  const median = block.price_median ?? null;

  async function apply(next) {
    record('filter');
    setFilters(next);
    setLoading(true);
    setError('');
    try {
      setBlock(await refilterOffers(threadId, product.product_id, next, ctx));
      setOpenId(null);
      setPicked([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isPicked = (o) => picked.some((x) => x.offer_id === o.offer_id);
  const togglePick = (o) => {
    if (!isPicked(o)) {
      record('pick', { key: o.offer_id });
      if (median && o.price && o.price < median) recordSaving(o.product_id, median - o.price, o.shop_name);
    }
    setPicked((p) => (isPicked(o) ? p.filter((x) => x.offer_id !== o.offer_id) : p.length < 4 ? [...p, o] : p));
  };
  const names = picked.map((o) => `«${o.shop_name}»`).join('، ');

  return (
    <section className={`card results${loading ? ' is-loading' : ''}`} aria-label="مغازه‌ها" aria-busy={loading}>
      {product && (
        <header className="product-head">
          {product.image && <img className="product-img" src={product.image} alt="" width="64" height="64" />}
          <div className="product-meta">
            <h3 className="product-title">{cleanTitle(product.title)}</h3>
            {product.card && <TypeFacts card={product.card} max={4} />}
            <p className="product-sub">
              <span className="nowrap">{toFaDigits(block.matched)} مغازه</span>
              {block.price_range && <span className="nowrap">، {rangeText(block.price_range.min, block.price_range.max)}</span>}
            </p>
          </div>
        </header>
      )}

      {product && (
        <div className="filter-row" role="group" aria-label="فیلترها">
          <button type="button" className="chip" aria-pressed={!!filters.radius_km} onClick={() => apply({ ...filters, radius_km: RADII[(RADII.indexOf(filters.radius_km) + 1) % (RADII.length + 1)] })}>
            {filters.radius_km ? `تا ${formatKm(filters.radius_km)}` : 'همه فاصله‌ها'}
          </button>
          <button type="button" className="chip" aria-pressed={!!filters.max_price} aria-expanded={budgetOpen} onClick={() => setBudgetOpen(!budgetOpen)}>
            {filters.max_price ? `تا ${shortToman(filters.max_price)}` : 'بودجه'}
          </button>
          {TOGGLES.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={!!filters[k]} onClick={() => apply({ ...filters, [k]: !filters[k] || undefined })}>
              {label}
            </button>
          ))}
          {activeCount > 0 && (
            <button type="button" className="chip chip-clear" onClick={() => apply({})}>
              حذف فیلترها
            </button>
          )}
        </div>
      )}
      {budgetOpen && <BudgetField value={filters.max_price} onChange={(v) => (setBudgetOpen(false), apply({ ...filters, max_price: v }))} />}

      <TimeHint time={block.time} />

      <p className="data-note">
        <InfoIcon size={16} />
        قیمت‌ها همون قیمت ثبت‌شده در ترب‌ان{block.data_as_of ? ` (داده‌ها تا ${faDate(block.data_as_of)})` : ''}؛ موجودی تأیید نشده، مگر مغازه جواب داده باشه.
      </p>

      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}

      {offers.length > 0 && (
        <ShopMap
          title={product ? cleanTitle(product.title) : 'مغازه‌ها'}
          points={offerPoints(offers, (o) => (o.price != null ? shortToman(o.price) : o.shop_name))}
          origin={ctx?.lat != null ? ctx : null}
          selectedId={focusId}
          onSelect={(id) => {
            record('map');
            setFocusId(id);
            focusRow(listRef.current, id);
          }}
          peek={(() => {
            const o = offers.find((x) => x.offer_id === focusId);
            if (!o) return null;
            return (
              <MapPeek
                title={o.shop_name}
                sub={`${o.price != null ? `${shortToman(o.price)} تومان` : 'بدون قیمت'}${listingLabels.get(o.offer_id) ? `، ${listingLabels.get(o.offer_id)}` : ''}`}
                meta={`${openState(o.open).text}${o.distance_km != null ? `، ${formatKm(o.distance_km)}` : ''}`}
                place={o}
                onClose={() => setFocusId(null)}
                action={
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setOpenId(o.offer_id), focusRow(listRef.current, o.offer_id))}>
                    جزئیات
                  </button>
                }
              />
            );
          })()}
        />
      )}

      {offers.length === 0 ? (
        <div className="empty">
          <p>با این فیلترها مغازه‌ای پیدا نشد{block.excluded_by_filters ? ` (${toFaDigits(block.excluded_by_filters)} مغازه کنار رفت)` : ''}.</p>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onAsk(`برای «${product?.title}» جایگزین نزدیک پیدا کن`)}>
            جایگزین پیدا کن
          </button>
        </div>
      ) : (
        <ul className="list" ref={listRef}>
          {offers.map((o) => (
            <OfferRow
              focused={focusId === o.offer_id}
              key={o.offer_id}
              offer={o}
              threadId={threadId}
              listingLabel={listingLabels.get(o.offer_id)}
              belowMedian={median && o.price && o.price <= median * 0.97 ? median - o.price : 0}
              pick={highlights.get(o.offer_id)}
              isCheapest={o.price != null && o.price === cheapest && offers.length > 1}
              isNearest={o.offer_id === nearestId && offers.length > 1}
              expanded={openId === o.offer_id}
              onToggle={() => {
                setOpenId(openId === o.offer_id ? null : o.offer_id);
                setFocusId(o.offer_id);
              }}
              selected={isPicked(o)}
              onSelect={() => togglePick(o)}
              onAsk={onAsk}
              busy={busy}
            />
          ))}
        </ul>
      )}

      {block.maybe_shops?.length > 0 && (
        <details className="maybe">
          <summary>
            {toFaDigits(block.maybe_shops.length)} مغازه نزدیک دیگر در همین دسته
            <ChevronIcon size={16} />
          </summary>
          <p className="maybe-note">این‌ها این کالا را ثبت نکرده‌اند؛ دسته‌بندی فعالیت یعنی ممکن است داشته باشند. قبل از رفتن بپرسید.</p>
          <ul className="list list-plain">
            {block.maybe_shops.map((s) => (
              <li key={s.shop_id} className="maybe-row">
                <span className="row-title">{s.shop_name}</span>
                <span className="row-sub">
                  {s.distance_km != null ? `${formatKm(s.distance_km)}، ` : ''}
                  {openState(s.open).text}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {picked.length > 0 && (
        <div className="tray" role="region" aria-label="انتخاب‌ها">
          <span className="tray-count">{toFaDigits(picked.length)} انتخاب</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy || picked.length < 2} onClick={() => onAsk(`مغازه‌های ${names} را با هم مقایسه کن`)}>
            مقایسه
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAsk(`برنامه رفتن به ${names} را بچین`)}>
            برنامه رفتن
          </button>
        </div>
      )}

    </section>
  );
}

function BudgetField({ value, onChange }) {
  const [draft, setDraft] = useState(value ? String(Math.round(value / 1e6)) : '');
  const submit = (e) => {
    e.preventDefault();
    const n = Number(String(draft).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    onChange(n > 0 ? Math.round(n * 1e6) : undefined);
  };
  return (
    <form className="budget" onSubmit={submit}>
      <label htmlFor="budget-input">حداکثر</label>
      <input id="budget-input" inputMode="numeric" autoFocus value={draft} placeholder="مثلاً ۱۰۰" onChange={(e) => setDraft(e.target.value)} />
      <span>میلیون تومان</span>
      <button type="submit" className="btn btn-primary btn-sm">
        اعمال
      </button>
    </form>
  );
}

// "شنبه تا پنج‌شنبه ۰۹:۳۰–۲۱:۰۰، جمعه تعطیل" instead of seven identical lines.
function groupWeek(week) {
  const groups = [];
  for (const d of week) {
    const last = groups[groups.length - 1];
    if (last && last.text === d.text) last.to = d.day;
    else groups.push({ from: d.day, to: null, text: d.text });
  }
  return groups.map((g) => ({ days: g.to ? `${g.from} تا ${g.to}` : g.from, text: g.text }));
}

/**
 * For shops with several listings of the product, label each with the words its listing doesn't share
 * with the shop's other listings ("مشکی، باتری ۹۰٪" rather than the common "گوشی موبایل اپل مدل…").
 */
function distinctListingLabels(offers) {
  const byShop = new Map();
  for (const o of offers) byShop.set(o.shop_id, [...(byShop.get(o.shop_id) || []), o]);
  const labels = new Map();
  for (const list of byShop.values()) {
    if (list.length < 2) continue;
    const words = list.map((o) => cleanTitle(`${o.seller_title || ''} ${(o.description || '').split('\n')[0]}`).split(/\s+/).filter(Boolean));
    const common = words.reduce((acc, w) => acc.filter((x) => w.includes(x)), words[0]);
    list.forEach((o, i) => {
      const own = words[i].filter((w) => !common.includes(w)).join(' ').replace(/^[،,\s]+/, '');
      labels.set(o.offer_id, own ? `این آگهی: ${own.slice(0, 50)}` : `آگهی ${toFaDigits(i + 1)} از ${toFaDigits(list.length)} این مغازه`);
    });
  }
  return labels;
}

function OfferRow({ focused, offer: o, threadId, listingLabel, belowMedian, pick, isCheapest, isNearest, expanded, onToggle, selected, onSelect, onAsk, busy }) {
  const [shop, setShop] = useState(null);
  const [state, setState] = useState('idle'); // idle | loading | error
  const [error, setError] = useState('');
  const open = openState(o.open);
  const stale = o.price_freshness === 'stale' || o.price_freshness === 'unknown';
  const payText = paymentText(o);

  async function loadShop() {
    if (shop || state === 'loading') return shop;
    setState('loading');
    try {
      const s = await fetchShop(threadId, o.shop_id);
      setShop(s);
      setState('idle');
      return s;
    } catch (err) {
      setError(err.message);
      setState('error');
      return null;
    }
  }

  function toggle() {
    onToggle();
    if (!expanded) loadShop();
  }

  async function call() {
    const s = await loadShop();
    if (s?.phone) window.location.href = telHref(s.phone);
  }

  const tag = pick || (isCheapest && 'ارزان‌ترین') || (isNearest && 'نزدیک‌ترین');

  return (
    <li className={`row${expanded ? ' is-open' : ''}${selected ? ' is-selected' : ''}${focused ? ' is-focus' : ''}`} id={`offer-${o.offer_id}`} data-pin={o.offer_id}>
      <div className="row-line">
        <button type="button" className="row-main" aria-expanded={expanded} aria-controls={`detail-${o.offer_id}`} onClick={toggle}>
          <span className="row-text">
            <span className="row-title">
              {o.shop_name}
              {tag && <span className={`tag${pick ? ' tag-pick' : ''}`}>{tag}</span>}
            </span>
            <span className="row-sub">{o.passage ? `${o.passage}${o.floor_unit ? `، ${o.floor_unit}` : ''}` : o.address}</span>
            {listingLabel && <span className="row-listing">{listingLabel}</span>}
            <span className="row-meta">
              <span className={`status status-${open.tone}`}>{open.text}</span>
              {o.distance_km != null && <span>{formatKm(o.distance_km)}</span>}
            </span>
          </span>
          <span className="row-price">
            {o.price != null ? (
              <>
                <span className="price">{shortToman(o.price)}</span>
                <span className="price-unit">تومان</span>
              </>
            ) : (
              <span className="price-missing">بدون قیمت</span>
            )}
            {belowMedian > 0 && (
              <span className="saving-chip" title="نسبت به میانه‌ی قیمت‌های ثبت‌شده">
                <TagIcon size={12} />
                {shortToman(belowMedian)} زیر میانه
              </span>
            )}
            <span className={`price-age${stale ? ' is-stale' : ''}`}>{priceAge(o.price_age_days)}</span>
          </span>
        </button>
        <button type="button" className={`select${selected ? ' is-on' : ''}`} aria-pressed={selected} onClick={onSelect} aria-label={`انتخاب ${o.shop_name} برای مقایسه یا مسیر`}>
          <CheckIcon size={16} />
        </button>
      </div>

      <div className="row-detail" id={`detail-${o.offer_id}`} hidden={!expanded}>
        <dl className="facts">
          <div>
            <dt>قیمت ثبت‌شده</dt>
            <dd>
              {o.price != null ? `${toFaDigits(o.price.toLocaleString('en'))} تومان` : 'ثبت نشده'}
              <span className="muted">، {priceAge(o.price_age_days)}</span> <Src kind="torob" />
            </dd>
          </div>
          <div>
            <dt>موجودی</dt>
            <dd>
              معلوم نیست <Src kind="unverified" />
            </dd>
          </div>
          <div>
            <dt>گارانتی</dt>
            <dd>
              <WarrantyText kind={o.warranty_kind} />
            </dd>
          </div>
          <div>
            <dt>پرداخت</dt>
            <dd>
              {payText ? (
                <>
                  {payText} <Src kind="seller" />
                </>
              ) : (
                <span className="muted">نامشخص</span>
              )}
            </dd>
          </div>
          <div>
            <dt>آدرس</dt>
            <dd>{o.address}</dd>
          </div>
          {shop?.week && (
            <div>
              <dt>ساعت کاری</dt>
              <dd className="week">
                {groupWeek(shop.week).map((g) => (
                  <span key={g.days}>
                    <span className="muted">{g.days}</span> {toFaDigits(g.text)}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {o.description && (
            <div>
              <dt>توضیح فروشنده</dt>
              <dd className="note">
                {o.description} <Src kind="seller" />
              </dd>
            </div>
          )}
        </dl>
        <SellerClaims claims={o.seller_claims} />

        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={call} disabled={state === 'loading'}>
            <PhoneIcon size={18} />
            {state === 'loading' ? 'در حال گرفتن شماره…' : shop?.phone ? toFaDigits(shop.phone) : 'تماس'}
          </button>
          {neshanHref(o) && (
            <a className="btn btn-ghost" href={neshanHref(o)} target="_blank" rel="noreferrer">
              <RouteIcon size={18} />
              مسیر
            </a>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => openShop(o.shop_id, o.shop_name)}>
            صفحه‌ی مغازه
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onAsk(`از «${o.shop_name}» بپرس «${o.seller_title || 'این کالا'}» را الان موجود دارد و قیمتش چند است`)}>
            <ChatIcon size={18} />
            بپرس موجود دارد؟
          </button>
        </div>
        {state === 'error' && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

// ---------- products ----------

export function ProductList({ block, onPick, disabled }) {
  return (
    <section className="card" aria-label="محصولات">
      {block.title && <h3 className="card-title">{block.title}</h3>}
      <ul className="list">
        {block.products.map((p) => (
          <li key={p.product_id} className="row">
            <button type="button" className="row-main product-row" disabled={disabled} onClick={() => onPick(p)}>
              <span className="thumb">{p.image && <img src={p.image} alt="" loading="lazy" width="56" height="56" />}</span>
              <span className="row-text">
                <span className="row-title product-name">{p.title}</span>
                {p.card && <TypeFacts card={p.card} max={3} />}
                <span className="row-sub">
                  {p.shops ? `${toFaDigits(p.shops)} مغازه` : 'مغازه‌ای ثبت نکرده'}
                  {p.nearest_km != null ? `، نزدیک‌ترین ${formatKm(p.nearest_km)}` : ''}
                </span>
              </span>
              <span className="row-price">
                {p.min_price != null ? (
                  <>
                    <span className="price-from">از</span>
                    <span className="price">{shortToman(p.cheapest_near ?? p.min_price)}</span>
                    <span className="price-unit">تومان</span>
                  </>
                ) : (
                  <span className="price-missing">بدون قیمت</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
