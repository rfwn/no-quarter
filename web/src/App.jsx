import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAreas, fetchCoverage, fetchThread, getThreadId, loadChats, newThreadId, removeChat, setCurrentThread, streamChat, touchChat } from './api.js';
import { Block, QUESTION_TYPES } from './GenUI.jsx';
import { formatKm, toFaDigits } from './format.js';
import { ArrowUpIcon, ChevronIcon, LocateIcon, PlusIcon, SearchIcon, SidebarIcon } from './Icons.jsx';
import Reply from './Reply.jsx';
import Sheet from './Sheet.jsx';
import Mascot from './Mascot.jsx';
import Drawer from './Drawer.jsx';
import LocationPicker from './Location.jsx';
import { LevelChip, MissionBar, Profile, RewardNote, rewardFor } from './GameUI.jsx';
import { clearMission, record, startBasket, subscribe } from './game.js';

// Agent results that move the basket forward. Only shown results count — never the message itself.
const BLOCK_ACTIONS = { shop_board: 'shops', compare: 'compare', visit_plan: 'plan', price_verdict: 'verdict', followup: 'ask_shop' };
const recordBlock = (b) => {
  if (b.type === 'shop_board' && b.product) startBasket(b.product.title);
  else if (b.type === 'product_list' && b.reason !== 'alternatives' && b.products?.length) startBasket(b.title || b.products[0].title);
  if (BLOCK_ACTIONS[b.type]) record(BLOCK_ACTIONS[b.type]);
  else if (b.type === 'product_list' && b.reason === 'alternatives') record('alternatives');
};

// Product name (Liara app id: torobchin).
const APP_NAME = 'ترب‌چین';

const EXAMPLES = ['آیفون ۱۳ کارکرده ۱۲۸ گیگ نزدیکم', 'یه گوشی ساده برای مامانم', 'هدفون بی‌سیم تا ۳ میلیون', 'اینجا ۱۰۵ میلیون می‌دن، منصفانه‌ست؟'];

const ORIGIN_KEY = 'torob-agent-origin';
const NAME_KEY = 'torobchin-name'; // null: never asked · '': skipped · otherwise what to call them

function loadName() {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return '';
  }
}

function loadOrigin() {
  try {
    return JSON.parse(localStorage.getItem(ORIGIN_KEY)) || {};
  } catch {
    return {};
  }
}

/** Rebuild visible turns from the server transcript (user entries start a turn; answers don't). */
function turnsFromTranscript(transcript, pending) {
  const turns = [];
  for (const e of transcript) {
    if (e.role === 'user' && !e.answer) turns.push({ id: crypto.randomUUID(), query: e.text, items: [], status: 'done', steps: [] });
    else if (e.role === 'assistant' && turns.length) {
      const t = turns[turns.length - 1];
      if (e.text) t.items.push({ kind: 'text', text: e.text, flags: e.flags });
      for (const b of e.blocks || []) t.items.push({ kind: 'block', block: b });
    }
  }
  if (pending && turns.length) {
    const t = turns[turns.length - 1];
    t.items.push({ kind: 'block', block: pending });
    t.status = 'waiting';
  }
  return turns;
}

const pendingQuestion = (turn) => turn?.items.find((it) => it.kind === 'block' && QUESTION_TYPES.has(it.block.type) && it.block.answer == null)?.block || null;

export default function App() {
  const [threadId, setThreadId] = useState(getThreadId);
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState('');
  const [origin, setOrigin] = useState(loadOrigin); // {lat, lon, place}
  const [areas, setAreas] = useState([]);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [drawerOpen, setDrawerOpenState] = useState(() => {
    try {
      return window.matchMedia('(min-width: 1024px)').matches && localStorage.getItem('torobchin-sidebar') === '1';
    } catch {
      return false;
    }
  });
  const setDrawerOpen = (v) => {
    setDrawerOpenState(v);
    try {
      localStorage.setItem('torobchin-sidebar', v ? '1' : '0');
    } catch {}
  };
  const narrow = () => window.matchMedia('(max-width: 1023px)').matches;
  const [chats, setChats] = useState(loadChats);
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setNameState] = useState(loadName);
  const [coverage, setCoverage] = useState(null);

  // Torob's data has ~10% of Tehran's shops, from selected areas: say so when the chosen spot is thin.
  useEffect(() => {
    if (origin.lat == null) return setCoverage(null);
    let alive = true;
    fetchCoverage(origin.lat, origin.lon).then((c) => alive && setCoverage(c)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [origin.lat, origin.lon]);
  const setName = (v) => {
    const clean = v.replace(/\s+/g, ' ').trim().slice(0, 24);
    setNameState(clean);
    try {
      localStorage.setItem(NAME_KEY, clean);
    } catch {}
  };
  const last = turns[turns.length - 1];
  const busy = last?.status === 'working';
  const question = pendingQuestion(last);
  const latestRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchThread(threadId).then(({ transcript, pending }) => setTurns(turnsFromTranscript(transcript, pending)));
    fetchAreas().then(setAreas);
  }, [threadId]);

  useEffect(() => {
    try {
      localStorage.setItem(ORIGIN_KEY, JSON.stringify(origin));
    } catch {}
  }, [origin]);

  // A new message scrolls to its own top, so the answer reads from the start.
  useEffect(() => {
    latestRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [turns.length]);

  const patchLast = (fn) => setTurns((all) => all.map((t, i) => (i === all.length - 1 ? { ...t, ...fn(t) } : t)));

  // Game milestones land in the conversation as a small note under the latest answer — no pop-ups.
  useEffect(
    () =>
      subscribe((_, e) => {
        const reward = rewardFor(e);
        if (reward) setTurns((all) => all.map((t, i) => (i === all.length - 1 ? { ...t, items: [...t.items, { kind: 'reward', reward: { ...reward, id: crypto.randomUUID() } }] } : t)));
      }),
    [],
  );

  const run = useCallback(
    async (payload) => {
      const segment = { start: null };
      patchLast((t) => {
        segment.start = t.items.length;
        return { status: 'working', stream: '', started: Date.now(), error: null };
      });
      try {
        const final = await streamChat({ threadId, ...payload, ctx: { ...(origin.lat != null ? { lat: origin.lat, lon: origin.lon, place: origin.place } : {}), ...(name ? { name } : {}) } }, (e) => {
          if (e.type === 'step') patchLast((t) => ({ steps: [...t.steps, e.label], stream: '' }));
          else if (e.type === 'token') patchLast((t) => ({ stream: (t.stream || '') + e.text }));
          else if (e.type === 'text_reset') patchLast(() => ({ stream: '' }));
          else if (e.type === 'ui') {
            recordBlock(e.block);
            patchLast((t) => {
              const items = t.items.filter((it) => !(it.kind === 'block' && e.block.replaces?.includes(it.block.id)));
              return { items: [...items, { kind: 'block', block: e.block }] };
            });
          }
        });
        if (final.type === 'interrupt') {
          patchLast((t) => ({ status: 'waiting', stream: '', items: [...t.items, { kind: 'block', block: final.block }] }));
        } else {
          // Replace this segment's streamed blocks with the verified final set.
          patchLast((t) => ({
            status: 'done',
            stream: '',
            items: [...t.items.slice(0, segment.start ?? t.items.length), ...(final.text ? [{ kind: 'text', text: final.text, flags: final.flags }] : []), ...final.blocks.map((b) => ({ kind: 'block', block: b }))],
          }));
        }
      } catch (err) {
        patchLast(() => ({ status: 'error', stream: '', error: err.message || 'خطایی رخ داد.' }));
      }
    },
    [threadId, origin, name],
  );

  const markAnswered = (label) => patchLast((t) => ({ items: t.items.map((it) => (it.kind === 'block' && QUESTION_TYPES.has(it.block.type) && it.block.answer == null ? { ...it, block: { ...it.block, answer: label } } : it)) }));

  function ask(message) {
    const text = message.trim();
    if (!text || busy) return;
    setDraft('');
    if (question) {
      // Typing while a question is open answers it in your own words.
      markAnswered(text);
      return run({ message: text });
    }
    setTurns((all) => [...all, { id: crypto.randomUUID(), query: text, items: [], status: 'working', steps: [] }]);
    setChats(touchChat(threadId, text));
    run({ message: text });
  }

  function resume(value, label) {
    markAnswered(label);
    run({ resume: value });
  }

  function onLocation(loc) {
    if (loc.lat != null) setOrigin({ lat: loc.lat, lon: loc.lon, place: loc.place || 'موقعیت من' });
    else if (loc.area) {
      const a = areas.find((x) => x.name === loc.area);
      if (a) setOrigin({ lat: a.lat, lon: a.lon, place: a.name });
    }
  }

  function startOver() {
    clearMission();
    setThreadId(newThreadId());
    setTurns([]);
    if (narrow()) setDrawerOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function openChat(id) {
    if (narrow()) setDrawerOpen(false);
    if (id === threadId) return;
    clearMission();
    setTurns([]);
    setThreadId(setCurrentThread(id));
  }

  function deleteChat(id) {
    setChats(removeChat(id));
    if (id === threadId) startOver();
  }

  const ctx = origin.lat != null ? { lat: origin.lat, lon: origin.lon } : {};
  const empty = turns.length === 0;
  const composer = <Composer inputRef={inputRef} draft={draft} setDraft={setDraft} onSend={() => ask(draft)} busy={busy} placeholder={question ? 'یا جوابت رو اینجا بنویس…' : 'پیامت رو بنویس…'} />;

  return (
    <div className={`app${empty ? ' is-empty' : ''}${drawerOpen ? ' has-drawer' : ''}`}>
      {/* Icon rail: on the reading-start edge on wide screens, a top bar on phones. */}
      <nav className="rail" aria-label="ناوبری">
        <button type="button" className="rail-btn" onClick={() => setDrawerOpen(!drawerOpen)} aria-label="گفت‌وگوها" title="گفت‌وگوها" aria-expanded={drawerOpen}>
          <SidebarIcon size={20} />
        </button>
        <button type="button" className="rail-btn" onClick={startOver} aria-label="گفت‌وگوی تازه" title="گفت‌وگوی تازه">
          <PlusIcon size={20} />
        </button>
        <span className="rail-spacer" />
        <LevelChip onOpen={() => setProfileOpen(true)} />
      </nav>

      <div className="main">
        <header className="topbar">
          <p className="chat-title">{empty ? '' : turns[0].query}</p>
          <button type="button" className={`place-pill${origin.lat != null ? ' is-set' : ''}`} onClick={() => setPlaceOpen(true)} aria-label={origin.place ? `موقعیت: ${origin.place}. تغییر` : 'انتخاب موقعیت'}>
            <LocateIcon size={15} />
            <span>{origin.place || 'موقعیت'}</span>
          </button>
        </header>
        {coverage && coverage.level !== 'good' && (
          <div className="coverage-note" role="note">
            <p>
              اطراف «{origin.place || 'این‌جا'}» توی داده‌های ترب {coverage.shops_within_2km ? 'مغازه‌ی کمی' : 'مغازه‌ای'} ثبت نشده
              {coverage.nearest_shop_km ? `؛ نزدیک‌ترین مغازه ${formatKm(coverage.nearest_shop_km)} اون‌طرف‌تره` : ''}.
              {coverage.nearest_busy_area && ` پرمغازه‌ترین محدوده‌ی نزدیکت «${coverage.nearest_busy_area.name}»ه (${formatKm(coverage.nearest_busy_area.km)}).`}
            </p>
            {coverage.nearest_busy_area && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOrigin({ lat: coverage.nearest_busy_area.lat, lon: coverage.nearest_busy_area.lon, place: coverage.nearest_busy_area.name })}>
                بگرد توی {coverage.nearest_busy_area.name}
              </button>
            )}
          </div>
        )}

        {empty ? (
          name === null ? (
            <Onboarding onDone={setName} />
          ) : (
          <main className="welcome">
            <Mascot mood="happy" size={56} title="ترب‌چین" />
            <h1>{name ? `سلام ${name}! بریم ترب بچینیم؟` : 'من ترب‌چینم، دستیار خرید حضوریت'}</h1>
            <p className="welcome-sub">مدل مناسب رو پیدا کن، نزدیک‌ترین مغازه‌های تهران رو مقایسه کن و مسیر رفتن بگیر.</p>
            {composer}
            {/* <p className="welcome-hints">جست‌وجو · مقایسه · مغازه‌های نزدیک · مسیر رفتن · ترب جمع کن</p>*/}
            <div className="welcome-examples" role="group" aria-label="نمونه‌ها">
              {EXAMPLES.map((q) => (
                <button key={q} type="button" className="example-chip" onClick={() => ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          </main>
          )
        ) : (
          <>
            <MissionBar onNew={startOver} />
            <main className="thread" aria-live="polite">
              {turns.map((t, i) => (
                <div key={t.id} ref={i === turns.length - 1 ? latestRef : null}>
                  <Turn turn={t} isLast={i === turns.length - 1} threadId={threadId} ctx={ctx} busy={busy || i !== turns.length - 1} onAsk={ask} onRetry={() => run({ message: t.query })} answer={{ onResume: resume, onLocation, areas, busy }} />
                </div>
              ))}
            </main>
            <div className="dock">
              {composer}
              <p className="disclaimer">ترب‌چین ممکنه اشتباه کنه. قیمت‌ها ثبت‌شده‌ان؛ قبل از رفتن بپرس.</p>
            </div>
          </>
        )}
      </div>

      <Sheet open={placeOpen} title="کجا خرید می‌کنی؟" onClose={() => setPlaceOpen(false)}>
        {placeOpen && (
          <div className="stack">
            <LocationPicker
              areas={areas}
              current={origin}
              onPick={(loc) => {
                setOrigin({ lat: loc.lat, lon: loc.lon, place: loc.place });
                setPlaceOpen(false);
              }}
            />
            {origin.lat != null && (
              <button type="button" className="link-btn" onClick={() => (setOrigin({}), setPlaceOpen(false))}>
                پاک کردن موقعیت
              </button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={profileOpen} title="انبار ترب‌هات" onClose={() => setProfileOpen(false)} tall>
        {profileOpen && <Profile name={name} onRename={setName} />}
      </Sheet>

      <Drawer open={drawerOpen} chats={chats} currentId={threadId} onClose={() => setDrawerOpen(false)} onSelect={openChat} onNew={startOver} onDelete={deleteChat} onProfile={() => setProfileOpen(true)} />

    </div>
  );
}

function Composer({ inputRef, draft, setDraft, onSend, busy, placeholder }) {
  return (
    <form
      className="composer"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <label htmlFor="q" className="sr-only">
        پیام
      </label>
      <textarea
        id="q"
        ref={inputRef}
        rows={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        maxLength={1000}
        enterKeyHint="send"
      />
      <button type="submit" className="send" disabled={busy || !draft.trim()} aria-label="بفرست">
        <ArrowUpIcon size={18} />
      </button>
    </form>
  );
}

function Turn({ turn, isLast, threadId, ctx, busy, onAsk, onRetry, answer }) {
  const texts = turn.items.filter((it) => it.kind === 'text');
  const blocks = turn.items.filter((it) => it.kind === 'block');
  const working = turn.status === 'working';
  return (
    <article className="turn" aria-label={turn.query}>
      <p className="user-msg">{turn.query}</p>
      <StepsPill steps={turn.steps} working={working} started={turn.started} blocks={blocks} />
      {working && blocks.length === 0 && !turn.stream && (
        <div className="thinking" role="status">
          <Mascot mood="think" size={40} />
          <span>ترب‌چین داره برات می‌گرده…</span>
        </div>
      )}
      <div className="answer">
        {texts.map((it, i) => (
          <Reply key={i} text={it.text} flags={it.flags} />
        ))}
        {working && turn.stream && <Reply text={turn.stream} streaming />}
      </div>
      {blocks.map((it, i) => (
        <Block key={it.block.id || i} block={it.block} threadId={threadId} ctx={ctx} busy={busy} onAsk={onAsk} answer={isLast ? answer : null} />
      ))}
      {turn.items
        .filter((it) => it.kind === 'reward')
        .map((it) => (
          <RewardNote key={it.reward.id} reward={it.reward} />
        ))}
      {turn.status === 'error' && (
        <div className="card notice" role="alert">
          <Mascot mood="worried" size={40} />
          <p>{turn.error}</p>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy && !isLast} onClick={onRetry}>
            دوباره امتحان کن
          </button>
        </div>
      )}
    </article>
  );
}

/** "۴ جست‌وجو · ۸ مغازه" — what the agent did for this answer, expandable to every step. */
function StepsPill({ steps, working, started, blocks }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [working]);
  if (!steps.length && !working) return null;
  const searches = steps.filter((s) => s.startsWith('جستجوی')).length;
  const shops = blocks.find((b) => b.block.type === 'shop_board')?.block.matched;
  const parts = [searches && `${toFaDigits(searches)} جست‌وجو`, shops != null && `${toFaDigits(shops)} مغازه`, !searches && shops == null && `${toFaDigits(steps.length)} مرحله`].filter(Boolean);
  return (
    <div className="steps">
      <button type="button" className="steps-pill" aria-expanded={open} onClick={() => setOpen(!open)} disabled={!steps.length}>
        {working ? <span className="spinner" aria-hidden="true" /> : <SearchIcon size={14} />}
        <span>{working ? `${steps[steps.length - 1] || 'در حال فکر کردن'} · ${toFaDigits(Math.max(0, Math.round((now - (started || now)) / 1000)))} ثانیه` : parts.join(' · ')}</span>
        {steps.length > 0 && (
          <span className="steps-more">
            {open ? 'بستن' : 'دیدن مراحل'}
            <ChevronIcon size={14} />
          </span>
        )}
      </button>
      {open && (
        <ol className="steps-list">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** First visit ever: ترب‌چین introduces itself and asks what to call you. Skippable; changeable in the profile. */
function Onboarding({ onDone }) {
  const [value, setValue] = useState('');
  return (
    <main className="welcome onboarding">
      <Mascot mood="cheer" size={72} title="ترب‌چین" />
      <div className="onb-bubble">
        <p className="onb-hi">سلام! من ترب‌چینم 🌱</p>
        <p>
          ترب‌چین یعنی کسی که می‌ره و بهترین تربا رو می‌چینه! من هم برات بهترین مغازه‌های نزدیکت رو می‌چینم: قیمت‌ها رو مقایسه می‌کنم، می‌گم کی بازن و مسیر رفتن رو می‌چینم.
        </p>
        <p className="onb-ask">راستی، چی صدات کنم؟</p>
      </div>
      <form
        className="onb-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onDone(value);
        }}
      >
        <label className="sr-only" htmlFor="onb-name">
          اسمت
        </label>
        <input id="onb-name" className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="اسمت یا یه لقب…" maxLength={24} autoComplete="given-name" autoFocus />
        <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
          بزن بریم
        </button>
      </form>
      <button type="button" className="link-btn" onClick={() => onDone('')}>
        بی‌اسم ادامه بده
      </button>
    </main>
  );
}
