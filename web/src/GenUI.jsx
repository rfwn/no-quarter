// Generative UI: the agent chooses components by type; these registries are the client-side allowlist.
// Unknown types render nothing — the agent can't inject arbitrary UI.
import { useEffect, useState } from 'react';
import { ProductList, ShopList } from './Directory.jsx';
import { markShopAsked, reportShopAnswer } from './api.js';
import { clockFa, formatKm, neshanHref, openState, priceAge, shortToman, telHref, toFaDigits } from './format.js';
import { BackIcon, ChatIcon, CheckIcon, LinkIcon, LocateIcon, MapIcon, PhoneIcon, RouteIcon } from './Icons.jsx';
import MapView from './MapView.jsx';
import Sheet from './Sheet.jsx';
import LocationPicker from './Location.jsx';
import ShopPage from './ShopPage.jsx';
import { ProductCompare } from './TypeCard.jsx';
import ShoppingList from './ShoppingList.jsx';
import { BargainRange, SellerClaims } from './Buying.jsx';
import { openShop } from './shopSheet.js';
import { Src } from './Source.jsx';

// ---------- inline results ----------

const INLINE = {
  shop_board: (p) => <ShopList {...p} />,
  nearby_shops: (p) => <NearbyShops {...p} />,
  product_compare: (p) => <ProductCompare {...p} />,
  shopping_list: (p) => <ShoppingList {...p} />,
  shop_profile: ({ block, threadId, ctx, onAsk, busy }) => <ShopPage shop={block.shop} threadId={threadId} ctx={ctx} onAsk={onAsk} busy={busy} />,
  product_list: ({ block, busy, onAsk }) => <ProductList block={block} disabled={busy} onPick={(p) => onAsk(`مغازه‌های نزدیک «${p.title}» رو نشونم بده`)} />,
  price_verdict: (p) => <PriceVerdict {...p} />,
  compare: (p) => <Compare {...p} />,
  visit_plan: (p) => <VisitPlan {...p} />,
  instagram_evidence: (p) => <InstagramEvidence {...p} />,
  website_evidence: (p) => <WebsiteEvidence {...p} />,
  followup: (p) => <Followup {...p} />,
};

export const QUESTION_TYPES = new Set(['ask_user', 'request_location']);

export function Block(props) {
  const { block } = props;
  if (QUESTION_TYPES.has(block.type)) {
    if (block.answer != null) return <AnsweredLine block={block} />;
    // The open question is asked right in the conversation, as a card — never a modal.
    const a = props.answer;
    if (!a) return null;
    return (
      <section className="card question-card" aria-label={questionTitle(block)}>
        <h3 className="question-title">{questionTitle(block)}</h3>
        <QuestionBody block={block} onResume={a.onResume} busy={a.busy} onLocation={a.onLocation} areas={a.areas} />
      </section>
    );
  }
  const render = INLINE[block.type];
  return render ? render(props) : null;
}

const Toman = ({ n }) => (n == null ? <span className="muted">ثبت نشده</span> : <>{shortToman(n)} تومان</>);

function AnsweredLine({ block }) {
  const label = block.type === 'request_location' ? 'موقعیت' : 'انتخاب شما';
  return (
    <p className="answered" title={block.type === 'ask_user' ? block.question : undefined}>
      <CheckIcon size={16} />
      <span>
        <span className="muted">{label}:</span> {block.answer}
      </span>
    </p>
  );
}

// ---------- price verdict ----------

const VERDICTS = {
  good: { word: 'قیمت خوب است', note: 'از بیشتر قیمت‌های ثبت‌شده پایین‌تر است.', tone: 'good' },
  fair: { word: 'قیمت منصفانه است', note: 'نزدیک به قیمت معمول ثبت‌شده است.', tone: 'fair' },
  high: { word: 'گران است', note: 'از قیمت معمول بالاتر است؛ چانه بزنید یا مغازه‌های نزدیک را ببینید.', tone: 'bad' },
  suspicious: { word: 'مشکوک است', note: 'خیلی پایین‌تر از همه قیمت‌هاست؛ ممکن است تقلبی، کارکرده یا نمونه باشد.', tone: 'bad' },
};

function PriceVerdict({ block }) {
  const v = VERDICTS[block.verdict] || VERDICTS.fair;
  const s = block.listed;
  const lo = Math.min(s.min, block.offered_price_toman);
  const hi = Math.max(s.max, block.offered_price_toman);
  const pos = (x) => (hi === lo ? 50 : 3 + ((x - lo) / (hi - lo)) * 94);
  const diff = block.diff_vs_median_toman;
  return (
    <section className={`card verdict tone-${v.tone}`} aria-label="بررسی قیمت">
      <h3 className="verdict-word">{v.word}</h3>
      <p className="muted small">{block.product_title}</p>
      <p className="verdict-line">
        پیشنهاد فروشنده <strong><Toman n={block.offered_price_toman} /></strong>
        {diff !== 0 && <span className="muted">، {shortToman(Math.abs(diff))} {diff > 0 ? 'بالاتر' : 'پایین‌تر'} از میانه</span>}
      </p>
      <div className="range" role="img" aria-label={`قیمت پیشنهادی در مقایسه با ${s.count} قیمت ثبت‌شده`}>
        <span className="range-band" style={{ insetInlineStart: `${pos(s.min)}%`, width: `${pos(s.max) - pos(s.min)}%` }} />
        <span className="range-mid" style={{ insetInlineStart: `${pos(s.median)}%` }} />
        <span className="range-pin" style={{ insetInlineStart: `${pos(block.offered_price_toman)}%` }} />
      </div>
      <div className="range-legend">
        <span>{shortToman(s.min)}</span>
        <span>میانه {shortToman(s.median)}، {toFaDigits(s.count)} مغازه</span>
        <span>{shortToman(s.max)}</span>
      </div>
      <p className="muted small">{v.note}</p>
      {block.verdict !== 'good' && <BargainRange bargain={block.bargain} tips={block.tips} />}
      {block.cheaper_within_1_5km?.length > 0 && (
        <div className="sub-list">
          <p className="sub-title">ارزان‌تر در همین نزدیکی</p>
          <ul className="list list-plain">
            {block.cheaper_within_1_5km.map((o) => (
              <li key={o.offer_id} className="mini-row">
                <span className="row-title">{o.shop_name}</span>
                <span className="row-sub">
                  <Toman n={o.price} />، {formatKm(o.distance_km)}، {priceAge(o.price_age_days)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------- compare ----------

// ---------- Compare: decision first ----------
// A fixed, explainable pick (not the model's opinion): cheaper, closer, fresher price and open-now win;
// a closed shop drops. Then the one trade-off that matters, then each shop with its wins and actions.
const WALK_KMH = 4.5;
const DRIVE_KMH = 22; // Tehran city traffic

function travel(km) {
  if (km == null) return null;
  return km <= 2 ? `≈ ${toFaDigits(Math.max(1, Math.round((km / WALK_KMH) * 60)))} دقیقه پیاده` : `≈ ${toFaDigits(Math.max(3, Math.round((km / DRIVE_KMH) * 60)))} دقیقه با ماشین`;
}

function rankOffers(offers) {
  const span = (f) => {
    const v = offers.map(f).filter((x) => x != null);
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 0];
  };
  const [pMin, pMax] = span((o) => o.price);
  const [dMin, dMax] = span((o) => o.distance_km);
  const [aMin, aMax] = span((o) => o.price_age_days);
  const norm = (v, lo, hi) => (v == null || hi === lo ? 0.5 : (v - lo) / (hi - lo));
  return offers
    .map((o) => {
      const closed = o.open?.status && o.open.status !== 'open' && o.open.status !== 'unknown';
      const score = 0.5 * norm(o.price, pMin, pMax) + 0.25 * norm(o.distance_km, dMin, dMax) + 0.15 * norm(o.price_age_days, aMin, aMax) + (closed ? 0.4 : 0);
      return { o, score };
    })
    .sort((a, b) => a.score - b.score)
    .map((x) => x.o);
}

function tradeoff(pick, offers) {
  const cheapest = offers.reduce((m, o) => (o.price != null && (m == null || o.price < m.price) ? o : m), null);
  const nearest = offers.reduce((m, o) => (o.distance_km != null && (m == null || o.distance_km < m.distance_km) ? o : m), null);
  if (cheapest && nearest && cheapest !== nearest && nearest.price != null) {
    const dp = nearest.price - cheapest.price;
    const dd = (cheapest.distance_km ?? 0) - (nearest.distance_km ?? 0);
    if (dp > 0 && dd > 0) return `«${cheapest.shop_name}» ${shortToman(dp)} تومان ارزون‌تره ولی ${formatKm(dd)} دورتر از «${nearest.shop_name}».`;
  }
  if (cheapest && cheapest === pick) return 'هم ارزون‌ترینه، هم گزینه‌ی معقولی برای رفتن.';
  return null;
}

const warrantyText = (w) => (w ? `${w.provider}${w.months ? ` ${toFaDigits(w.months)} ماه` : ''}` : null);
const answerText = (a) => `${a.in_stock === true ? 'موجوده' : a.in_stock === false ? 'ناموجوده' : 'نامعلوم'}${a.price_toman ? `، ${shortToman(a.price_toman)}` : ''}`;

function Compare({ block, onAsk, busy }) {
  const { offers, best = {}, answers = {} } = block;
  const ranked = rankOffers(offers);
  const pick = ranked[0];
  const cheapest = Math.min(...offers.map((o) => o.price ?? Infinity));
  const note = tradeoff(pick, offers);
  const wins = (o) =>
    [
      best.price === o.offer_id && 'ارزون‌ترین',
      best.distance === o.offer_id && 'نزدیک‌ترین',
      best.freshness === o.offer_id && 'قیمت تازه‌تر',
      best.warranty === o.offer_id && 'گارانتی بلندتر',
      o.open?.status === 'open' && 'الان بازه',
    ].filter(Boolean);

  return (
    <section className="card cmp" aria-label="مقایسه مغازه‌ها">
      <header className="cmp-head">
        <p className="cmp-kicker">پیشنهاد ترب‌چین از بین {toFaDigits(offers.length)} مغازه</p>
        <h3 className="cmp-pick">{pick.shop_name}</h3>
        {note && <p className="cmp-tradeoff">{note}</p>}
      </header>
      <ol className="cmp-list">
        {ranked.map((o, i) => {
          const more = o.price != null && Number.isFinite(cheapest) && o.price > cheapest ? o.price - cheapest : 0;
          const open = openState(o.open);
          const stale = o.price_age_days != null && o.price_age_days > 14;
          const a = answers[o.offer_id];
          const pay = [o.torobpay_in_person && 'ترب‌پی', ...(o.installments || [])].filter(Boolean);
          const facts = [
            ['رفتن', o.distance_km != null ? `${formatKm(o.distance_km)}، ${travel(o.distance_km)}` : 'فاصله نامعلوم'],
            ['ساعت کاری', open.text, `status status-${open.tone}`],
            ['قیمت', `${priceAge(o.price_age_days)}${stale ? ' — بهتره قبلش بپرسی' : ''}`, stale ? 'is-stale' : '', 'torob'],
            ['موجودی', a ? null : 'معلوم نیست', '', 'unverified'],
            ['گارانتی', o.warranty_kind?.label || warrantyText(o.warranty), o.warranty_kind && ['test_only', 'none'].includes(o.warranty_kind.kind) ? 'is-stale' : '', o.warranty_kind?.kind === 'unknown' ? null : 'seller'],
            ['پرداخت', pay.join('، ') || null, '', 'seller'],
            ['جواب مغازه', a ? answerText(a) : null, '', 'you'],
          ].filter(([, v]) => v);
          return (
            <li key={o.offer_id} className={`cmp-shop${i === 0 ? ' is-pick' : ''}`}>
              <div className="cmp-top">
                <div>
                  <p className="cmp-name">
                    {i === 0 && <span className="cmp-badge">پیشنهاد</span>}
                    <button type="button" className="shop-link" onClick={() => openShop(o.shop_id, o.shop_name)}>
                      {o.shop_name}
                    </button>
                  </p>
                  <p className="cmp-where">{o.passage ? `${o.passage}${o.floor_unit ? `، ${o.floor_unit}` : ''}` : o.area}</p>
                </div>
                <div className="cmp-price">
                  <span className="price">{o.price != null ? shortToman(o.price) : '—'}</span>
                  <span className="price-unit">{o.price != null ? 'تومان' : 'بدون قیمت'}</span>
                  {more > 0 && <span className="cmp-more">{shortToman(more)} گرون‌تر</span>}
                </div>
              </div>
              {wins(o).length > 0 && (
                <ul className="cmp-wins" aria-label="برتری‌ها">
                  {wins(o).map((w) => (
                    <li key={w}>
                      <CheckIcon size={12} />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              <dl className="cmp-facts">
                {facts.map(([k, v, cls, src]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd className={cls || undefined}>
                      {v} {src && <Src kind={src} />}
                    </dd>
                  </div>
                ))}
              </dl>
              <SellerClaims claims={o.seller_claims} />
              <div className="cmp-actions">
                {neshanHref(o) && (
                  <a className="btn btn-ghost btn-sm" href={neshanHref(o)} target="_blank" rel="noopener noreferrer" aria-label={`مسیر تا ${o.shop_name} در نشان`}>
                    <RouteIcon size={16} />
                    مسیر
                  </a>
                )}
                <button type="button" className={`btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-ghost'}`} disabled={busy} onClick={() => onAsk(`می‌خوام برم «${o.shop_name}»؛ برنامه‌ی رفتنم رو بچین`)}>
                  برو همین‌جا
                </button>
                {!a && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onAsk(`از «${o.shop_name}» بپرس موجوده و قیمتش چنده`)}>
                    <ChatIcon size={16} />
                    بپرس موجوده؟
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {block.bargain && (
        <div className="cmp-bargain">
          <BargainRange bargain={block.bargain} />
        </div>
      )}
      <p className="data-note">پیشنهاد بر اساس قیمت ثبت‌شده، فاصله، تازگی قیمت و باز بودنه؛ موجودی رو مغازه باید تأیید کنه.</p>
    </section>
  );
}

// ---------- visit plan ----------

/** The trip: best order, when to leave, how long each shop stays open after you arrive, what to check there. */
function arrivalNote(s) {
  if (s.open_at_arrival === 'open') return s.minutes_before_close != null && s.minutes_before_close <= 90 ? `باز تا ${toFaDigits(s.closes)} — فقط ${toFaDigits(s.minutes_before_close)} دقیقه وقت داری` : `باز تا ${toFaDigits(s.closes || '')}`;
  if (s.open_at_arrival === 'opens_later') return `ساعت ${toFaDigits(s.opens)} باز می‌شه؛ ${toFaDigits(s.wait_minutes)} دقیقه زودتر می‌رسی`;
  if (s.open_at_arrival === 'unknown') return 'ساعت کاری ثبت نشده؛ قبلش بپرس';
  return 'موقع رسیدن بسته‌ست';
}

function VisitPlan({ block, ctx, onAsk, busy }) {
  const [mapOpen, setMapOpen] = useState(false);
  const closed = block.stops.filter((s) => s.open_at_arrival === 'closed_now' || s.open_at_arrival === 'closed_today');
  const first = block.stops[0];
  return (
    <section className="card plan" aria-label="برنامه رفتن">
      <header className="plan-head">
        <div>
          <h3 className="card-title">برنامه‌ی رفتن</h3>
          <p className="muted small">
            {toFaDigits(block.stops.length)} مغازه، حدود {toFaDigits(block.total_minutes)} دقیقه با خرید
          </p>
        </div>
        {block.leave_by && (
          <p className="plan-leave">
            <span>دیرتر از</span>
            <strong>{clockFa(block.leave_by)}</strong>
            <span>راه نیفت</span>
          </p>
        )}
      </header>
      {closed.length > 0 && (
        <p className="inline-error" role="alert">
          {closed.map((s) => `«${s.shop_name}»`).join('، ')} موقع رسیدن بسته‌ست؛ یه روز دیگه یا یه مغازه‌ی دیگه رو در نظر بگیر.
        </p>
      )}
      <ol className="timeline">
        {block.stops.map((s, i) => (
          <li key={s.offer_id} className={s.open_at_arrival === 'open' ? '' : 'is-closed'}>
            <span className="step-dot">{toFaDigits(i + 1)}</span>
            <div className="step-body">
              <p className="muted small">
                {i === 0 ? 'از جات' : 'بعدش'} {s.mode === 'walk' ? 'پیاده' : 'با ماشین'} {toFaDigits(s.leg_minutes)} دقیقه، رسیدن {clockFa(s.arrive_at)}
              </p>
              <p className="row-title">
                <button type="button" className="shop-link" onClick={() => openShop(s.shop_id, s.shop_name)}>
                  {s.shop_name}
                </button>
              </p>
              <p className="row-sub">{s.passage ? `${s.passage}${s.floor_unit ? `، ${s.floor_unit}` : ''}` : s.address}</p>
              <p className={`small plan-open plan-${s.open_at_arrival}`}>{arrivalNote(s)}</p>
              <p className="small">
                <Toman n={s.price} /> <span className="muted">، {priceAge(s.price_age_days)}</span>
              </p>
              {s.checks.length > 0 && (
                <ul className="checks" aria-label="اونجا چک کن">
                  {s.checks.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
              <div className="plan-actions">
                {neshanHref(s) && (
                  <a className="btn btn-ghost btn-sm" href={neshanHref(s)} target="_blank" rel="noopener noreferrer" aria-label={`مسیر تا ${s.shop_name} در نشان`}>
                    <RouteIcon size={16} />
                    مسیر در نشان
                  </a>
                )}
                {s.checks.some((c) => c.includes('بپرس')) && s.shop_id && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onAsk(`از «${s.shop_name}» بپرس موجوده و قیمتش چنده`)}>
                    <ChatIcon size={16} />
                    قبلش بپرس
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={() => setMapOpen(true)}>
          <MapIcon size={18} /> مسیر روی نقشه
        </button>
        {neshanHref(first) && (
          <a className="btn btn-primary" href={neshanHref(first)} target="_blank" rel="noopener noreferrer">
            <RouteIcon size={18} /> برو سمت مغازه‌ی اول
          </a>
        )}
      </div>
      <Sheet open={mapOpen} title="مسیر خرید" onClose={() => setMapOpen(false)} tall>
        {mapOpen && <MapView offers={block.stops.map((s) => ({ ...s, open: { status: s.open_at_arrival } }))} origin={ctx?.lat != null ? ctx : null} route={[...(ctx?.lat != null ? [ctx] : []), ...block.stops]} />}
      </Sheet>
    </section>
  );
}

// ---------- instagram evidence ----------

function InstagramEvidence({ block }) {
  return (
    <section className="card" aria-label="اینستاگرام مغازه">
      <header className="card-head">
        <h3 className="card-title">اینستاگرام {block.shop_name}</h3>
        <span className="muted small">
          @{block.username}، {toFaDigits(block.posts_checked)} پست اخیر
        </span>
      </header>
      {block.matches.length === 0 ? (
        <p className="muted">پستی درباره «{block.product_title}» در پست‌های اخیر نبود.</p>
      ) : (
        <ul className="list list-plain">
          {block.matches.map((m) => (
            <li key={m.url || m.snippet} className="mini-row">
              <span className="small">
                {m.age_days != null ? priceAge(m.age_days) : 'تاریخ نامشخص'}
                {m.prices.length > 0 && <>، قیمت در پست: <Toman n={m.prices[0]} /></>}
              </span>
              <span className="note">{m.snippet}</span>
              {m.url && (
                <a href={m.url} target="_blank" rel="noreferrer" className="small">
                  دیدن پست
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- seller follow-up ----------

/**
 * Asking a shop, done by the user in one tap. ترب‌چین can't DM a shop (Instagram only lets businesses
 * answer people who wrote first), so the card hands over the shop's channels and a ready message, then
 * takes the reply back — which goes to the agent, so "تموم کردیم" leads straight to alternatives.
 * prepared → (user: «فرستادم») waiting → (user pastes the reply) answered.
 */
const CHANNEL_LABEL = { instagram: 'دایرکت اینستاگرام', website: 'سایت مغازه', whatsapp: 'واتساپ', phone: 'تماس' };
const NUDGE_AFTER_MIN = 20;

function Followup({ block, threadId, onAsk, busy }) {
  const [f, setF] = useState(block);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const channels = f.channels || [];

  useEffect(() => {
    if (f.status !== 'waiting') return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [f.status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(f.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }

  // Opening a channel copies the message first, so it's one paste away.
  const openChannel = () => copy();

  async function sent() {
    try {
      const r = await markShopAsked(threadId, f.followup_id);
      setF((cur) => ({ ...cur, status: r.status, updated_at: r.updated_at }));
    } catch {}
  }

  async function submit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    try {
      const r = await reportShopAnswer(threadId, f.followup_id, text);
      setF((cur) => ({ ...cur, status: r.status, reply: r.reply, extracted: r.extracted }));
      setError('');
      setDraft('');
      // The agent takes it from here: out of stock → alternatives, in stock → go.
      if (!busy) onAsk?.(`«${f.shop_name}» جواب داد: «${text}»`);
    } catch (err) {
      setError(err.message);
    }
  }

  const ex = f.extracted;
  const waitedMin = f.status === 'waiting' && f.updated_at ? Math.floor((now - f.updated_at) / 60_000) : 0;
  const STATUS = { prepared: 'پیامش آماده‌ست', waiting: 'منتظر جواب', answered: 'جواب داد' };

  return (
    <section className={`card followup status-${f.status}`} aria-label={`پیگیری از ${f.shop_name}`} aria-live="polite">
      <header className="card-head">
        <div>
          <h3 className="card-title">بپرس از {f.shop_name}</h3>
          <p className="muted small">{f.product_title}</p>
        </div>
        <span className={`pill pill-${f.status}`}>{STATUS[f.status] || STATUS.prepared}</span>
      </header>

      {f.status === 'answered' && ex ? (
        <div className="fu-answer">
          <p className="fu-answer-main">{ex.in_stock === true ? 'موجود داره' : ex.in_stock === false ? 'موجود نداره' : 'درباره‌ی موجودی چیزی نگفت'}</p>
          {ex.price_toman && (
            <p>
              قیمت امروز: <strong><Toman n={ex.price_toman} /></strong>
            </p>
          )}
          {ex.note && <p className="muted small">{ex.note}</p>}
          <p className="muted small">«{f.reply}»، به گفته‌ی خودت</p>
        </div>
      ) : (
        <>
          {f.status === 'prepared' && (
            <>
              <ol className="fu-steps">
                <li>پیام رو کپی کن (با زدن هر دکمه خودش کپی می‌شه)</li>
                <li>از یکی از راه‌های زیر برای مغازه بفرست</li>
                <li>جوابشون رو همین پایین بنویس؛ بقیه‌ش با من</li>
              </ol>
              <div className="fu-message">
                <p>{f.message}</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
                  {copied ? 'کپی شد ✓' : 'کپی پیام'}
                </button>
              </div>
              <div className="fu-channels">
                {channels.map((c) =>
                  c.kind === 'phone' ? (
                    <a key={c.kind} className="btn btn-ghost" href={telHref(c.number)} onClick={openChannel}>
                      <PhoneIcon size={18} />
                      {CHANNEL_LABEL.phone}
                    </a>
                  ) : (
                    <a key={c.kind} className={`btn ${c.kind === channels[0].kind ? 'btn-primary' : 'btn-ghost'}`} href={c.dm_url || c.url} target="_blank" rel="noopener noreferrer" onClick={openChannel}>
                      {c.kind === 'instagram' ? <ChatIcon size={18} /> : c.kind === 'website' ? <LinkIcon size={18} /> : <ChatIcon size={18} />}
                      {CHANNEL_LABEL[c.kind]}
                      {c.handle && <span className="fu-handle" dir="ltr">@{c.handle}</span>}
                    </a>
                  ),
                )}
              </div>
              {!channels.some((c) => c.kind === 'instagram') && <p className="muted small">این مغازه اینستاگرام ثبت‌شده نداره؛ تماس یا سایت سریع‌تره.</p>}
              <button type="button" className="link-btn" onClick={sent}>
                فرستادم ✓
              </button>
            </>
          )}
          {f.status === 'waiting' && (
            <p className="muted">
              پیامت رفت{waitedMin > 0 ? ` (${toFaDigits(waitedMin)} دقیقه پیش)` : ''}. جواب دادن، همین‌جا بنویس.
              {waitedMin >= NUDGE_AFTER_MIN && channels.some((c) => c.kind === 'phone') && ' هنوز خبری نیست؟ یه زنگ بزن، سریع‌تره.'}
            </p>
          )}
          <form className="answer-form" onSubmit={submit}>
            <label htmlFor={`ans-${f.followup_id}`}>مغازه چی گفت؟</label>
            <div className="field-row">
              <input id={`ans-${f.followup_id}`} className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="مثلاً: موجوده، ۱۱۰ میلیون" />
              <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
                ثبت جواب
              </button>
            </div>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </>
      )}
    </section>
  );
}

// ---------- questions (rendered inside a bottom sheet by App) ----------

export function questionTitle(block) {
  if (block.type === 'request_location') return 'کجای تهرانی؟';
  return block.question;
}

export function QuestionBody({ block, onResume, busy, onLocation, areas }) {
  if (block.type === 'request_location') return <LocationQuestion block={block} onResume={onResume} busy={busy} onLocation={onLocation} areas={areas} />;
  return <ChoiceQuestion block={block} onResume={onResume} busy={busy} />;
}

function ChoiceQuestion({ block, onResume, busy }) {
  return (
    <>
      <ul className="list">
        {block.options.map((o) => (
          <li key={o.value} className="row">
            <button type="button" className="row-main option" disabled={busy} onClick={() => onResume({ value: o.value }, o.label)}>
              {o.image && (
                <span className="thumb">
                  <img src={o.image} alt="" loading="lazy" width="48" height="48" />
                </span>
              )}
              <span className="row-text">
                <span className="row-title">{o.label}</span>
                {(o.min_price != null || o.shops != null) && (
                  <span className="row-sub">
                    {o.min_price != null && `از ${shortToman(o.min_price)} تومان`}
                    {o.shops != null && `، ${toFaDigits(o.shops)} مغازه`}
                  </span>
                )}
              </span>
              <BackIcon size={18} className="muted" />
            </button>
          </li>
        ))}
      </ul>
      {block.allow_free_text && <p className="muted small sheet-hint">یا جوابتان را در کادر جستجو بنویسید.</p>}
    </>
  );
}

function LocationQuestion({ block, onResume, busy, onLocation, areas }) {
  return (
    <div className="stack">
      <p className="muted">{block.reason || 'تا نزدیک‌ترین مغازه‌ها اول بیان.'}</p>
      <LocationPicker
        areas={areas?.length ? areas : (block.areas || []).map((name) => ({ name }))}
        busy={busy}
        onPick={(loc, label) => {
          onLocation?.(loc);
          onResume(loc.area && loc.lat == null ? { area: loc.area } : { lat: loc.lat, lon: loc.lon, place: loc.place }, label);
        }}
        onDecline={() => onResume({ declined: true }, 'بدون موقعیت')}
      />
    </div>
  );
}


/** Shops of a kind near the user ("nearest phone shop") — no product, so no prices: distance, hours, directions. */
function NearbyShops({ block, ctx, onAsk, busy }) {
  const [mapOpen, setMapOpen] = useState(false);
  const shops = block.shops || [];
  const origin = block.origin || (ctx?.lat != null ? ctx : null);
  return (
    <section className="card results" aria-label={`مغازه‌های ${block.category}`}>
      <header className="product-head">
        <div className="product-meta">
          <h3 className="product-title">{block.open_now ? `${block.category}، الان باز` : `${block.category} نزدیکت`}</h3>
          <p className="product-sub">
            {toFaDigits(shops.length)} مغازه{origin ? '، نزدیک‌ترین اول' : ''}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMapOpen(true)} disabled={!shops.length}>
          <MapIcon size={18} />
          نقشه
        </button>
      </header>
      <ul className="list">
        {shops.map((s, i) => {
          const open = openState(s.open);
          return (
            <li key={s.shop_id} className="row">
              <div className="row-line">
                <div className="row-main">
                  <span className="row-text">
                    <span className="row-title">
                      <button type="button" className="shop-link" onClick={() => openShop(s.shop_id, s.shop_name)}>
                        {s.shop_name}
                      </button>
                      {i === 0 && origin && <span className="tag">نزدیک‌ترین</span>}
                    </span>
                    <span className="row-sub">{s.address || s.area}</span>
                    <span className="row-meta">
                      <span className={`status status-${open.tone}`}>{open.text}</span>
                      {s.distance_km != null && <span>{formatKm(s.distance_km)}</span>}
                    </span>
                  </span>
                </div>
                <a className="btn btn-ghost btn-sm row-route" href={neshanHref(s)} target="_blank" rel="noopener noreferrer" aria-label={`مسیر تا ${s.shop_name} در نشان`}>
                  <RouteIcon size={16} />
                  مسیر
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="data-note">این مغازه‌ها این دسته رو می‌فروشن؛ موجود بودن کالای خاص معلوم نیست.</p>
      {!busy && (
        <div className="nearby-next">
          <button type="button" className="example-chip" onClick={() => onAsk(`از این ${block.category}‌ها کدوما الان بازن؟`)}>
            کدوما الان بازن؟
          </button>
          <button type="button" className="example-chip" onClick={() => onAsk('یه مدل خاص می‌خوام؛ کمکم کن انتخاب کنم')}>
            کمکم کن مدل انتخاب کنم
          </button>
        </div>
      )}
      <Sheet open={mapOpen} title={`${block.category} روی نقشه`} onClose={() => setMapOpen(false)} tall>
        {mapOpen && <MapView offers={shops.map((s) => ({ ...s, offer_id: s.shop_id, price: null }))} origin={origin} />}
      </Sheet>
    </section>
  );
}

/** What the shop's own website shows for the product, next to the listed price. Seller-written: evidence only. */
function WebsiteEvidence({ block }) {
  const host = (() => {
    try {
      return new URL(block.site).host.replace(/^www\./, '');
    } catch {
      return block.site;
    }
  })();
  const m = block.matches?.[0];
  return (
    <section className="card web-evidence" aria-label={`سایت ${block.shop_name}`}>
      <header className="card-head">
        <h3 className="card-title">سایت {block.shop_name}</h3>
        <a href={block.site} target="_blank" rel="noopener noreferrer" className="small" dir="ltr">
          {host}
        </a>
      </header>
      {!block.reachable ? (
        <p className="muted">سایت مغازه الان باز نشد؛ بهتره قبل از رفتن تماس بگیری یا بپرسی.</p>
      ) : !m ? (
        <p className="muted">«{block.product_title}» توی جست‌وجوی سایتشون پیدا نشد.</p>
      ) : (
        <dl className="web-facts">
          <div>
            <dt>قیمت روی سایت</dt>
            <dd>{m.price_toman ? <Toman n={m.price_toman} /> : 'بدون قیمت'}</dd>
          </div>
          {block.listed_price != null && (
            <div>
              <dt>قیمت ثبت‌شده در ترب</dt>
              <dd>
                <Toman n={block.listed_price} /> <span className="muted small">({priceAge(block.listed_age_days)})</span>
              </dd>
            </div>
          )}
          <div>
            <dt>موجودی روی سایت</dt>
            <dd>{m.in_stock === true ? 'موجود' : m.in_stock === false ? 'ناموجود' : 'نامعلوم'}</dd>
          </div>
        </dl>
      )}
      {m?.url && (
        <a href={m.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
          دیدن صفحه‌ی محصول
        </a>
      )}
      <p className="data-note">این‌ها رو خود مغازه روی سایتش نوشته؛ موجودی حضوری رو قبل از رفتن بپرس.</p>
    </section>
  );
}
