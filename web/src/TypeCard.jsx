// Product-type UI: the same card speaks phone (storage, battery, «استوک»), shoes (size chips, colours),
// laptop (CPU, RAM)… — built from the server's type card, so every value is the product's own data.
import { shortToman, toFaDigits } from './format.js';
import { CheckIcon } from './Icons.jsx';

/** Compact facts for a product row or header. `max` facts, focus ones first (marked). */
export function TypeFacts({ card, max = 4, showSizes = true }) {
  if (!card) return null;
  const facts = card.facts.slice(0, max);
  return (
    <span className="type-facts">
      {card.badges?.map((b) => (
        <span key={b} className="type-badge">
          {b}
        </span>
      ))}
      {facts.map((f) => (
        <span key={f.label} className={`type-fact${f.focus ? ' is-focus' : ''}`}>
          <span className="type-fact-label">{f.label}</span> {toFaDigits(f.value)}
        </span>
      ))}
      {showSizes && card.sizes?.length > 0 && (
        <span className="type-sizes" aria-label="سایزها">
          {card.sizes.slice(0, 8).map((s) => (
            <span key={s} className="size-chip">
              {toFaDigits(s)}
            </span>
          ))}
          {card.sizes.length > 8 && <span className="muted small">+{toFaDigits(card.sizes.length - 8)}</span>}
        </span>
      )}
      {card.colors?.length > 0 && <span className="type-colors">رنگ‌ها: {card.colors.slice(0, 5).join('، ')}</span>}
    </span>
  );
}

/** Two or three models side by side: their type's specs with the better value marked, then price and shops. */
export function ProductCompare({ block, onAsk, busy }) {
  const { products, rows } = block;
  const cols = products.length;
  return (
    <section className="card pcmp" aria-label="مقایسه‌ی مدل‌ها">
      <div className="pcmp-heads" style={{ '--cols': cols }}>
        {products.map((p) => (
          <div key={p.product_id} className="pcmp-head">
            {p.image ? <img src={p.image} alt="" width="72" height="72" loading="lazy" /> : <span className="pcmp-noimg" />}
            <p className="pcmp-title">{p.title}</p>
            {p.badges?.length > 0 && (
              <p className="pcmp-badges">
                {p.badges.map((b) => (
                  <span key={b} className="type-badge">
                    {b}
                  </span>
                ))}
              </p>
            )}
          </div>
        ))}
      </div>
      <dl className="pcmp-rows">
        <div className="pcmp-row">
          <dt>قیمت ثبت‌شده</dt>
          <dd style={{ '--cols': cols }}>
            {products.map((p) => (
              <span key={p.product_id}>{p.min_price != null ? `از ${shortToman(p.min_price)}` : 'ثبت نشده'}</span>
            ))}
          </dd>
        </div>
        <div className="pcmp-row">
          <dt>مغازه‌ها</dt>
          <dd style={{ '--cols': cols }}>
            {products.map((p) => (
              <span key={p.product_id}>{p.shops ? `${toFaDigits(p.shops)} مغازه` : 'هیچ‌جا'}</span>
            ))}
          </dd>
        </div>
        {rows.map((r) => (
          <div key={r.label} className={`pcmp-row${r.focus ? ' is-focus' : ''}`}>
            <dt>
              {r.label}
              {r.focus && <span className="pcmp-focus">برات مهمه</span>}
            </dt>
            <dd style={{ '--cols': cols }}>
              {r.values.map((v, i) => (
                <span key={i} className={r.winner === i ? 'is-best' : ''}>
                  {r.winner === i && <CheckIcon size={12} />}
                  {v ? toFaDigits(v) : <span className="muted">—</span>}
                </span>
              ))}
            </dd>
          </div>
        ))}
        {products.some((p) => p.sizes?.length) && (
          <div className="pcmp-row">
            <dt>سایزها</dt>
            <dd style={{ '--cols': cols }}>
              {products.map((p) => (
                <span key={p.product_id}>{p.sizes?.length ? toFaDigits(p.sizes.join('، ')) : '—'}</span>
              ))}
            </dd>
          </div>
        )}
      </dl>
      <div className="pcmp-actions" style={{ '--cols': cols }}>
        {products.map((p) => (
          <button key={p.product_id} type="button" className="btn btn-ghost btn-sm" disabled={busy || !p.shops} onClick={() => onAsk(`مغازه‌های نزدیک «${p.title}» رو نشونم بده`)}>
            مغازه‌هاش
          </button>
        ))}
      </div>
      <p className="data-note">مشخصات از اطلاعات خود محصول در تربه؛ تیک یعنی بهتر در اون ردیف (وقتی برابرن علامتی نمی‌خوره).</p>
    </section>
  );
}
