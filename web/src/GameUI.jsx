// The game layer: level chip, mission bar, profile, and celebrations — all driven by game.js events.
import { useEffect, useState } from 'react';
import { BADGES, MISSION_STEPS, getGame, levelOf, subscribe } from './game.js';
import { faNum, shortToman, toFaDigits } from './format.js';
import { ChatIcon, CheckIcon, MapIcon, MonitorIcon, MoonIcon, RouteIcon, ScaleIcon, SearchIcon, SparkIcon, StarIcon, SunIcon, TagIcon } from './Icons.jsx';
import Mascot from './Mascot.jsx';
import { THEMES, getTheme, setTheme } from './theme.js';

export function useGame() {
  const [state, setState] = useState(getGame);
  useEffect(() => subscribe((s) => setState(s)), []);
  return state;
}

const BADGE_ICONS = { first_hunt: SearchIcon, map_reader: MapIcon, comparer: ScaleIcon, detective: SparkIcon, asker: ChatIcon, route_maker: RouteIcon, saver: TagIcon, veteran: StarIcon };

export function Medal({ id, earned, size = 56 }) {
  const Icon = BADGE_ICONS[id] || StarIcon;
  return (
    <span className={`medal${earned ? ' is-earned' : ''}`} style={{ '--size': `${size}px` }} aria-hidden="true">
      <Icon size={Math.round(size * 0.42)} />
    </span>
  );
}

// ---------- header level chip ----------

function LevelRing({ lvl }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--reward-soft)" strokeWidth="3.5" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--reward)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - lvl.progress)} transform="rotate(-90 18 18)" className="level-ring" />
      <text x="18" y="23" textAnchor="middle" className="level-num">
        {toFaDigits(lvl.index + 1)}
      </text>
    </svg>
  );
}

export function LevelChip({ onOpen }) {
  const g = useGame();
  const lvl = levelOf(g.xp);
  return (
    <button type="button" className="level-chip" onClick={onOpen} aria-label={`سطح ${lvl.index + 1}: ${lvl.name}، ${faNum(g.xp)} ترب. دیدن انبار ترب‌ها`}>
      <LevelRing lvl={lvl} />
    </button>
  );
}

/** Sidebar footer: the level ring plus its name and ترب count, like TorobChat's account row. */
export function LevelCard({ onOpen }) {
  const g = useGame();
  const lvl = levelOf(g.xp);
  return (
    <button type="button" className="level-card" onClick={onOpen}>
      <LevelRing lvl={lvl} />
      <span className="level-card-text">
        <span className="level-card-name">{lvl.name}</span>
        <span className="level-card-xp">{lvl.next ? `${faNum(g.xp)} از ${faNum(lvl.next)} ترب` : `${faNum(g.xp)} ترب`}</span>
      </span>
    </button>
  );
}

// ---------- mission bar ----------

export function MissionBar({ onNew }) {
  const g = useGame();
  const m = g.mission;
  if (!m) return null;
  const done = m.done;
  return (
    <div className={`mission${done ? ' is-done' : ''}`} role="region" aria-label="سبد خرید">
      <Mascot mood={done ? 'cheer' : 'idle'} size={40} />
      <div className="mission-body">
        <p className="mission-title">
          {done ? 'سبدت پر شد!' : 'سبد:'} <span>{m.title}</span>
        </p>
        <ol className="mission-steps" aria-label={`${toFaDigits(m.steps.length)} از ۴ مرحله`}>
          {MISSION_STEPS.map((s) => {
            const on = m.steps.includes(s.id);
            return (
              <li key={s.id} className={on ? 'is-on' : ''}>
                <span className="step-node">{on && <CheckIcon size={12} />}</span>
                <span className="step-label">{s.label}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <button type="button" className="mission-new" onClick={onNew}>
        سبد تازه
      </button>
    </div>
  );
}

// ---------- profile ----------

const THEME_ICON = { light: SunIcon, dark: MoonIcon, system: MonitorIcon };

/** TorobChat's «پوسته» control: three equal segments on an elevated track. */
export function ThemeSwitch() {
  const [pref, setPref] = useState(getTheme);
  return (
    <section className="theme-switch-wrap" aria-labelledby="theme-title">
      <h3 id="theme-title" className="theme-title">
        پوسته
      </h3>
      <p className="theme-sub">حالت نمایش رو انتخاب کن.</p>
      <div className="theme-switch" role="radiogroup" aria-labelledby="theme-title">
        {THEMES.map(({ value, label }) => {
          const Icon = THEME_ICON[value];
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={pref === value}
              className="theme-opt"
              onClick={() => {
                setTheme(value);
                setPref(value);
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function Profile({ name, onRename }) {
  const g = useGame();
  const lvl = levelOf(g.xp);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name || '');
  return (
    <div className="profile">
      {editing ? (
        <form
          className="name-row"
          onSubmit={(e) => {
            e.preventDefault();
            onRename(draft);
            setEditing(false);
          }}
        >
          <label className="sr-only" htmlFor="rename">
            اسمت
          </label>
          <input id="rename" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={24} placeholder="اسمت یا یه لقب…" autoFocus />
          <button type="submit" className="btn btn-primary btn-sm">
            ذخیره
          </button>
        </form>
      ) : (
        <p className="name-row">
          <span>{name ? `ترب‌چین صدات می‌کنه «${name}»` : 'هنوز اسمت رو نگفتی'}</span>
          <button type="button" className="link-btn" onClick={() => setEditing(true)}>
            {name ? 'تغییر اسم' : 'گفتن اسم'}
          </button>
        </p>
      )}
      <div className="profile-hero">
        <Mascot mood="happy" size={88} />
        <div>
          <p className="profile-level">
            سطح {toFaDigits(lvl.index + 1)}، {lvl.name}
          </p>
          <div className="xp-bar" role="progressbar" aria-valuemin={lvl.min} aria-valuemax={lvl.next ?? g.xp} aria-valuenow={g.xp}>
            <span style={{ transform: `scaleX(${lvl.progress})` }} />
          </div>
          <p className="muted small">{lvl.next ? `${faNum(g.xp)} از ${faNum(lvl.next)} ترب تا سطح بعد` : `${faNum(g.xp)} ترب، بالاترین سطح`}</p>
        </div>
      </div>

      <div className="stats">
        <div>
          <span className="stat-num reward">{g.savingsTotal ? shortToman(g.savingsTotal) : '۰'}</span>
          <span className="stat-label">{g.savingsTotal ? 'تومان زیر میانه‌ی بازار' : 'صرفه‌جویی چیده‌شده'}</span>
        </div>
        <div>
          <span className="stat-num">{toFaDigits(g.missionsDone)}</span>
          <span className="stat-label">سبد پر</span>
        </div>
        <div>
          <span className="stat-num">
            {toFaDigits(g.badges.length)} از {toFaDigits(BADGES.length)}
          </span>
          <span className="stat-label">نشان</span>
        </div>
      </div>
      <p className="muted small">صرفه‌جویی = فاصله‌ی قیمت مغازه‌ای که انتخاب کردید تا میانه‌ی قیمت‌های ثبت‌شده‌ی همان کالا.</p>

      <h3 className="card-title">نشان‌ها</h3>
      <ul className="badges">
        {BADGES.map((b) => {
          const earned = g.badges.includes(b.id);
          return (
            <li key={b.id} className={earned ? 'is-earned' : ''}>
              <Medal id={b.id} earned={earned} />
              <span className="badge-name">{b.name}</span>
              <span className="badge-hint">{earned ? 'گرفتی!' : b.hint}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- milestones in the chat ----------

/** Which game events deserve a note in the chat: milestones only — a full basket, a level, a badge, a saving. */
export function rewardFor(e) {
  if (!e || e.action === 'reset') return null;
  const badge = (e.badges || [])[0];
  if (e.missionDone) return { kind: 'mission', title: 'سبدت پر شد!', text: `برنامه‌ی خرید آماده‌ست، +${toFaDigits(e.xp)} ترب` };
  if (e.levelUp) return { kind: 'level', title: `رسیدی به سطح ${toFaDigits(e.levelUp.index + 1)}: ${e.levelUp.name}`, text: 'ترب‌های بیشتری منتظرتن!' };
  if (badge) return { kind: 'badge', badge: badge.id, title: `نشان تازه: ${badge.name}`, text: badge.got };
  if (e.action === 'saving' && e.saving > 0) return { kind: 'saving', title: `${shortToman(e.saving)} تومان زیر میانه`, text: e.shopName ? `یه ترب درشت از ${e.shopName} چیدی` : 'نسبت به میانه‌ی قیمت‌های ثبت‌شده' };
  return null;
}

/** A milestone, inline in the conversation. */
export function RewardNote({ reward }) {
  return (
    <p className={`reward-note reward-${reward.kind}`}>
      {reward.kind === 'badge' ? <Medal id={reward.badge} earned size={28} /> : <span className="reward-icon">{reward.kind === 'saving' ? <TagIcon size={16} /> : <StarIcon size={16} />}</span>}
      <span>
        <strong>{reward.title}</strong> <span className="reward-text">{reward.text}</span>
      </span>
    </p>
  );
}
