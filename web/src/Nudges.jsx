// Proactive, quiet nudges above the composer — never pop-ups: a question to a shop that hasn't been answered,
// a message that was prepared but never sent, and the visit plan's "leave by" time getting close.
import { useEffect, useState } from 'react';
import { fetchFollowups } from './api.js';
import { clockFa, telHref, toFaDigits } from './format.js';
import { CloseIcon } from './Icons.jsx';

const WAIT_NUDGE_MIN = 20;
const PREPARED_NUDGE_MIN = 10;
const LEAVE_WARN_MIN = 15;

const minutesSince = (t) => Math.floor((Date.now() - t) / 60_000);

export default function Nudges({ threadId, turns, onAsk, busy }) {
  const [followups, setFollowups] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState(() => new Set());

  // Refresh once a minute; follow-up status changes when the user records an answer.
  useEffect(() => {
    let alive = true;
    const load = () => fetchFollowups(threadId).then((f) => alive && setFollowups(f)).catch(() => {});
    load();
    const t = setInterval(() => (load(), setNow(Date.now())), 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [threadId, turns.length]);

  const items = [];

  for (const f of followups) {
    const since = minutesSince(f.updated_at || f.created_at);
    if (f.status === 'waiting' && since >= WAIT_NUDGE_MIN) {
      items.push({
        id: `fu-wait-${f.id}`,
        text: `${toFaDigits(since)} دقیقه پیش از «${f.shop_name}» پرسیدی؛ جواب داد؟`,
        actions: [
          { label: 'ثبت جواب', onClick: () => document.getElementById(`ans-${f.followup_id || f.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) },
          ...(f.phone ? [{ label: 'زنگ بزن', href: telHref(f.phone) }] : []),
        ],
      });
    } else if (f.status === 'prepared' && since >= PREPARED_NUDGE_MIN) {
      items.push({
        id: `fu-prep-${f.id}`,
        text: `پیامت به «${f.shop_name}» هنوز نرفته.`,
        actions: [{ label: 'نشونم بده', onClick: () => document.getElementById(`followup-${f.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }],
      });
    }
  }

  // The latest visit plan in this chat: warn as its leave-by time approaches or passes.
  const plan = [...turns].reverse().flatMap((t) => t.items).find((it) => it.kind === 'block' && it.block.type === 'visit_plan')?.block;
  if (plan?.leave_by) {
    const left = Math.floor((new Date(plan.leave_by).getTime() - now) / 60_000);
    if (left <= LEAVE_WARN_MIN && left > 0) {
      items.push({ id: `leave-${plan.leave_by}`, text: `${toFaDigits(left)} دقیقه وقت داری راه بیفتی تا همه‌ی مغازه‌ها موقع رسیدن باز باشن (تا ${clockFa(plan.leave_by)}).` });
    } else if (left <= 0 && left > -180) {
      items.push({
        id: `late-${plan.leave_by}`,
        text: `از ساعت رفتن (${clockFa(plan.leave_by)}) گذشته؛ بعضی مغازه‌ها شاید تا برسی بسته باشن.`,
        actions: [{ label: 'دوباره بچین', onClick: () => onAsk('برنامه‌ی رفتن رو با توجه به ساعت الان دوباره بچین'), disabled: busy }],
      });
    }
  }

  const visible = items.filter((n) => !dismissed.has(n.id));
  if (!visible.length) return null;
  return (
    <div className="nudges" role="status" aria-live="polite">
      {visible.slice(0, 2).map((n) => (
        <div key={n.id} className="nudge">
          <p className="nudge-text">{n.text}</p>
          {n.actions?.map((a) =>
            a.href ? (
              <a key={a.label} className="btn btn-ghost btn-sm" href={a.href}>
                {a.label}
              </a>
            ) : (
              <button key={a.label} type="button" className="btn btn-ghost btn-sm" onClick={a.onClick} disabled={a.disabled}>
                {a.label}
              </button>
            ),
          )}
          <button type="button" className="nudge-x" aria-label="بستن" onClick={() => setDismissed((d) => new Set([...d, n.id]))}>
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
