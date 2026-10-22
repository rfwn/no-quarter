// Buying know-how, shown where the decision happens: a bargaining range, the seller's listing claims in plain
// words, what a warranty really means, and when to go.
import { useState } from 'react';
import { shortToman, toFaDigits } from './format.js';
import { Src } from './Source.jsx';

/** Aim → fair up to → walk away, from the listed prices of this product. */
export function BargainRange({ bargain, tips = [] }) {
  if (!bargain) return null;
  return (
    <div className="bargain" aria-label="محدوده‌ی چونه">
      <p className="bargain-title">
        چونه بزن <span className="muted small">از روی {toFaDigits(bargain.listed_count)} قیمت ثبت‌شده</span>
      </p>
      <ol className="bargain-steps">
        <li>
          <span>هدفت</span>
          <strong>{shortToman(bargain.aim)}</strong>
        </li>
        <li>
          <span>منصفانه تا</span>
          <strong>{shortToman(bargain.fair_max)}</strong>
        </li>
        <li className="is-stop">
          <span>بالاتر از این نخر</span>
          <strong>{shortToman(bargain.walk_away)}</strong>
        </li>
      </ol>
      {tips.length > 0 && (
        <ul className="bargain-tips">
          {tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What the seller's listing claims (نات‌اکتیو، رجیستر نشده…), each explainable with a tap. */
export function SellerClaims({ claims }) {
  const [open, setOpen] = useState(null);
  if (!claims?.length) return null;
  return (
    <div className="claims">
      <span className="claims-row">
        {claims.map((c) => (
          <button key={c.label} type="button" className={`claim${c.label === 'رجیستر نشده' ? ' is-warn' : ''}`} aria-expanded={open === c.label} onClick={() => setOpen(open === c.label ? null : c.label)}>
            {c.label}
          </button>
        ))}
        <Src kind="seller" />
      </span>
      {open && <p className="claim-explain">{claims.find((c) => c.label === open)?.explain}</p>}
    </div>
  );
}

/** A warranty in plain words: «فقط تست و تحویل» is flagged as no warranty. */
export function WarrantyText({ kind }) {
  if (!kind) return <span className="muted">نامشخص</span>;
  const warn = kind.kind === 'test_only' || kind.kind === 'none';
  return (
    <span className={warn ? 'warranty-warn' : undefined} title={kind.explain}>
      {kind.label}
      {kind.kind !== 'unknown' && <Src kind="seller" />}
      {warn && <span className="warranty-note"> — {kind.explain}</span>}
    </span>
  );
}

/** "When to go" from the shops' own hours. */
export function TimeHint({ time }) {
  if (!time || (!time.advice && !time.closing_soon?.length)) return null;
  return (
    <p className="time-hint" role="note">
      {time.advice ||
        `«${time.closing_soon[0].shop_name}» ${toFaDigits(time.closing_soon[0].minutes)} دقیقه‌ی دیگه (${toFaDigits(time.closing_soon[0].closes)}) می‌بنده.`}
      <Src kind="hours" />
    </p>
  );
}
