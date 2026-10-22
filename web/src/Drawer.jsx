// Chat list panel, TorobChat's sidebar: logo + collapse, «گفت‌وگوی جدید», chats grouped by day, level in the
// footer. Wide screens: it replaces the rail and pushes the page. Phones: it slides over with a scrim.
import { useEffect, useState } from 'react';
import { fetchFollowups } from './api.js';
import Mascot from './Mascot.jsx';
import { LevelCard } from './GameUI.jsx';
import { CloseIcon, PlusIcon, SidebarIcon } from './Icons.jsx';

function group(chats) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const buckets = [
    ['امروز', (t) => t >= startOfToday],
    ['دیروز', (t) => t >= startOfToday - day],
    ['۷ روز گذشته', (t) => t >= startOfToday - 7 * day],
    ['قدیمی‌تر', () => true],
  ];
  const out = [];
  for (const c of chats) {
    const [label] = buckets.find(([, test]) => test(c.updatedAt));
    let g = out.find((x) => x.label === label);
    if (!g) out.push((g = { label, chats: [] }));
    g.chats.push(c);
  }
  return out;
}

const FU_STATUS = { prepared: 'هنوز نفرستادی', waiting: 'منتظر جواب', answered: 'جواب داد' };

/** Questions to shops across the recent chats: the open ones first. */
function useFollowups(open, chats) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all(chats.slice(0, 8).map((c) => fetchFollowups(c.id).then((fs) => fs.map((f) => ({ ...f, chatId: c.id }))).catch(() => [])))
      .then((all) => {
        if (!alive) return;
        const rank = { waiting: 0, prepared: 1, answered: 2 };
        setItems(all.flat().sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || b.updated_at - a.updated_at).slice(0, 6));
      });
    return () => {
      alive = false;
    };
  }, [open, chats]);
  return items;
}

export default function Drawer({ open, chats, currentId, onClose, onSelect, onNew, onDelete, onProfile }) {
  const followups = useFollowups(open, chats);
  // Esc closes it on phones, where it covers the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && window.matchMedia('(max-width: 1023px)').matches && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={`drawer-scrim${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`drawer${open ? ' is-open' : ''}`} aria-label="گفت‌وگوها" aria-hidden={!open} inert={!open ? '' : undefined}>
        <header className="drawer-head">
          <span className="drawer-brand">
            <Mascot mood="happy" size={28} />
            ترب‌چین
          </span>
          <button type="button" className="rail-btn" onClick={onClose} aria-label="بستن منو" title="بستن منو">
            <SidebarIcon size={20} />
          </button>
        </header>
        <button type="button" className="drawer-new" onClick={onNew}>
          <PlusIcon size={18} />
          گفت‌وگوی جدید
        </button>
        {followups.length > 0 && (
          <section className="drawer-fu" aria-label="پیگیری‌ها">
            <h3 className="drawer-group">پیگیری‌ها</h3>
            <ul>
              {followups.map((f) => (
                <li key={f.id}>
                  <button type="button" className="drawer-fu-item" onClick={() => onSelect(f.chatId)}>
                    <span className="drawer-fu-text">
                      <span className="drawer-fu-shop">{f.shop_name || 'مغازه'}</span>
                      <span className="drawer-fu-product">{f.product_title}</span>
                    </span>
                    <span className={`pill pill-${f.status}`}>{FU_STATUS[f.status] || f.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <nav className="drawer-list" aria-label="گفت‌وگوهای قبلی">
          {chats.length === 0 ? (
            <p className="drawer-empty">هنوز گفت‌وگویی نداری. اولین تربت رو بچین!</p>
          ) : (
            group(chats).map((g) => (
              <section key={g.label}>
                <h3 className="drawer-group">{g.label}</h3>
                <ul>
                  {g.chats.map((c) => (
                    <li key={c.id} className={`drawer-item${c.id === currentId ? ' is-current' : ''}`}>
                      <button type="button" className="drawer-link" aria-current={c.id === currentId ? 'page' : undefined} onClick={() => onSelect(c.id)}>
                        {c.title}
                      </button>
                      <button type="button" className="drawer-del" onClick={() => onDelete(c.id)} aria-label={`حذف «${c.title}»`} title="حذف">
                        <CloseIcon size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </nav>
        <footer className="drawer-foot">
          <LevelCard onOpen={onProfile} />
        </footer>
      </aside>
    </>
  );
}
