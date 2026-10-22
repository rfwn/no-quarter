// One map for every card that has shops: shop lists, nearby shops, comparisons, visit plans, shopping lists
// and shop pages. The map and the list are one object — tap a pin and its row lights up; tap a row and
// the map flies to its pin. Inline it sits at the top of the card (lazy: built when scrolled into view);
// «بزرگ کن» opens the same map full-screen with the same selection.
//
// Phones: the inline map never captures a swipe, so scrolling the chat is never hijacked — pins stay
// tappable, and panning/zooming happens in the full-screen view.
import { useEffect, useRef, useState } from 'react';
import { loadMapKit } from './tiles.js';
import { neshanHref, shortToman, toFaDigits } from './format.js';
import { CloseIcon, ExpandIcon, LocateIcon, RouteIcon } from './Icons.jsx';
import Sheet from './Sheet.jsx';

const ROUTE = '#ef4056';
const CLUSTER_PX = { x: 96, y: 30 }; // about one label
const TOUCH = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/**
 * @typedef {{ id: string, lat: number, lon: number, label: string, title?: string, order?: number,
 *             closed?: boolean, best?: boolean }} MapPoint
 */

function cluster(m, points) {
  const groups = [];
  for (const p of points) {
    const xy = m.latLngToContainerPoint([p.lat, p.lon]);
    const g = groups.find((x) => Math.abs(x.xy.x - xy.x) < CLUSTER_PX.x && Math.abs(x.xy.y - xy.y) < CLUSTER_PX.y);
    if (g) g.points.push(p);
    else groups.push({ xy, lat: p.lat, lon: p.lon, points: [p] });
  }
  return groups;
}

function pinHtml(g, selectedId) {
  const one = g.points.length === 1 ? g.points[0] : null;
  const sel = g.points.some((p) => p.id === selectedId);
  const best = g.points.some((p) => p.best);
  const closed = g.points.every((p) => p.closed);
  const cls = ['pin', sel && 'is-sel', best && 'is-best', closed && 'is-closed', one?.order != null && 'is-num'].filter(Boolean).join(' ');
  const prices = g.points.map((p) => p.price).filter((x) => x != null);
  const text = one
    ? one.order != null
      ? toFaDigits(one.order)
      : one.label
    : `${toFaDigits(g.points.length)} مغازه${prices.length ? `، از ${shortToman(Math.min(...prices))}` : ''}`;
  return `<span dir="rtl" class="${cls}">${text}</span>`;
}

/**
 * @param {{ points: MapPoint[], origin?: {lat:number, lon:number}|null, route?: boolean, selectedId?: string|null,
 *           onSelect?: (id:string)=>void, peek?: React.ReactNode, title?: string, full?: boolean }} props
 */
export default function ShopMap({ points, origin = null, route = false, selectedId = null, onSelect, peek = null, title = 'نقشه', full = false }) {
  const wrap = useRef(null);
  const box = useRef(null);
  const api = useRef(null); // { m, draw, focus }
  const [visible, setVisible] = useState(full);
  const [expanded, setExpanded] = useState(false);
  const [group, setGroup] = useState(null); // shops sharing one spot (same passage): pick one
  const pickRef = useRef(onSelect);
  pickRef.current = onSelect;
  const pts = points.filter((p) => p.lat != null && p.lon != null);
  const key = pts.map((p) => `${p.id}:${p.label}:${p.order ?? ''}`).join('|') + (origin ? `@${origin.lat},${origin.lon}` : '');

  // Inline maps are built only once they scroll into view: a long chat stays fast.
  useEffect(() => {
    if (visible || !wrap.current) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: '200px' });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !box.current || !pts.length) return;
    let cancelled = false;
    let cleanup = () => {};
    loadMapKit().then(({ L, create }) => {
      if (cancelled || !box.current) return;
      const inlineTouch = !full && TOUCH;
      const m = create(box.current, {
        zoomControl: full,
        attributionControl: true,
        dragging: !inlineTouch,
        touchZoom: !inlineTouch,
        doubleClickZoom: !inlineTouch,
        scrollWheelZoom: full,
        boxZoom: false,
        keyboard: full,
      });
      if (full) m.zoomControl?.setPosition?.('bottomleft');
      const bounds = pts.map((p) => [p.lat, p.lon]);
      if (origin?.lat != null) {
        L.circleMarker([origin.lat, origin.lon], { radius: 7, color: '#fff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }).addTo(m).bindTooltip('تو', { direction: 'top', offset: [0, -6] });
        bounds.push([origin.lat, origin.lon]);
      }
      if (route) {
        const line = [...(origin?.lat != null ? [[origin.lat, origin.lon]] : []), ...[...pts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((p) => [p.lat, p.lon])];
        if (line.length > 1) L.polyline(line, { color: ROUTE, weight: 3, opacity: 0.75, dashArray: '6 6' }).addTo(m);
      }
      const layer = L.layerGroup().addTo(m);
      let sel = selectedId;
      const draw = () => {
        layer.clearLayers();
        const groups = pts.some((p) => p.order != null) ? pts.map((p) => ({ xy: null, lat: p.lat, lon: p.lon, points: [p] })) : cluster(m, pts);
        for (const g of groups) {
          const isSel = g.points.some((p) => p.id === sel);
          const marker = L.marker([g.lat, g.lon], {
            icon: L.divIcon({ className: '', html: pinHtml(g, sel), iconSize: null }),
            title: g.points.map((p) => p.title || p.label).join('، '),
            keyboard: true,
            zIndexOffset: isSel ? 1000 : g.points.some((p) => p.best) ? 500 : 0,
          }).addTo(layer);
          marker.on('click', () => {
            if (g.points.length === 1) {
              setGroup(null);
              return pickRef.current?.(g.points[0].id);
            }
            // Same building (a passage): zooming never separates them, so offer a chooser instead.
            const b = L.latLngBounds(g.points.map((p) => [p.lat, p.lon]));
            const tight = m.distance(b.getSouthWest(), b.getNorthEast()) < 60 || m.getZoom() >= 17;
            if (tight) setGroup(g.points.map((p) => p.id));
            else m.flyToBounds(b, { padding: [48, 48], maxZoom: 18, duration: 0.5 });
          });
        }
      };
      const fit = () => {
        if (bounds.length > 1) m.fitBounds(bounds, { padding: full ? [56, 48] : [36, 28], maxZoom: 17 });
        else m.setView(bounds[0], 16);
      };
      fit();
      m.on('zoomend', draw);
      const t = setTimeout(() => (m.invalidateSize(), fit(), draw()), full ? 320 : 60);
      api.current = {
        select(id) {
          sel = id;
          draw();
          const p = pts.find((x) => x.id === id);
          if (p && !m.getBounds().pad(-0.15).contains([p.lat, p.lon])) m.flyTo([p.lat, p.lon], Math.max(m.getZoom(), 16), { duration: 0.5 });
        },
        recenter: fit,
      };
      cleanup = () => {
        clearTimeout(t);
        api.current = null;
        m.remove();
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [visible, key, full]);

  // Selection from the list → the pin lights up and comes into view.
  useEffect(() => {
    api.current?.select(selectedId);
  }, [selectedId]);

  if (!pts.length) return null;
  const chooser = group && (
    <div className="map-group" role="listbox" aria-label="مغازه‌های این‌جا">
      <p className="map-group-title">{toFaDigits(group.length)} مغازه این‌جان؛ یکی رو انتخاب کن</p>
      <div className="map-group-chips">
        {group.map((id) => {
          const p = pts.find((x) => x.id === id);
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={id === selectedId}
              className="chip"
              onClick={() => {
                setGroup(null);
                onSelect?.(id);
              }}
            >
              {p?.title || p?.label}
              {p?.price != null && <span className="muted"> {shortToman(p.price)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
  const below = chooser || peek;
  return (
    <div ref={wrap} className={`shopmap${full ? ' is-full' : ''}`}>
      <div className="shopmap-frame">
        <div ref={box} className="shopmap-canvas" role="region" aria-label={`${title}: ${toFaDigits(pts.length)} مغازه روی نقشه`} />
        {!visible && <div className="shopmap-placeholder" aria-hidden="true" />}
        <div className="shopmap-tools">
          {!full && (
            <button type="button" className="shopmap-btn" onClick={() => setExpanded(true)} aria-label="نقشه‌ی بزرگ" title="نقشه‌ی بزرگ">
              <ExpandIcon size={16} />
            </button>
          )}
          <button type="button" className="shopmap-btn" onClick={() => api.current?.recenter()} aria-label="نمایش همه" title="نمایش همه">
            <LocateIcon size={16} />
          </button>
        </div>
        {full && below && <div className="shopmap-peek">{below}</div>}
      </div>
      {!full && below && <div className="shopmap-under">{below}</div>}
      {!full && (
        <Sheet open={expanded} title={title} onClose={() => setExpanded(false)} tall>
          {expanded && <ShopMap points={points} origin={origin} route={route} selectedId={selectedId} onSelect={onSelect} peek={peek} title={title} full />}
        </Sheet>
      )}
    </div>
  );
}

/** The selected shop, on the map: who, how much, open or not, and the next tap. */
export function MapPeek({ title, sub, meta, place, action, onClose }) {
  return (
    <div className="peek" role="status" aria-live="polite">
      <div className="peek-text">
        <p className="peek-title">{title}</p>
        {sub && <p className="peek-sub">{sub}</p>}
        {meta && <p className="peek-meta">{meta}</p>}
      </div>
      <div className="peek-actions">
        {place && neshanHref(place) && (
          <a className="btn btn-ghost btn-sm" href={neshanHref(place)} target="_blank" rel="noopener noreferrer" aria-label={`مسیر تا ${title} در نشان`}>
            <RouteIcon size={16} />
            مسیر
          </a>
        )}
        {action}
      </div>
      {onClose && (
        <button type="button" className="peek-x" onClick={onClose} aria-label="بستن">
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
}

/** Bring a card's row for this pin into view (rows carry data-pin). */
export function focusRow(container, id) {
  requestAnimationFrame(() => container?.querySelector(`[data-pin="${CSS.escape(String(id))}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

const CLOSED = new Set(['closed_now', 'closed_today', 'opens_later']);

/** Offers (shop lists, comparisons) as pins: price labels, the cheapest marked, closed ones dimmed. */
export function offerPoints(offers, label) {
  const priced = offers.filter((o) => o.price != null);
  const low = priced.length ? Math.min(...priced.map((o) => o.price)) : null;
  return offers.map((o) => ({ id: o.offer_id, lat: o.lat, lon: o.lon, label: label(o), price: o.price ?? null, title: o.shop_name, closed: CLOSED.has(o.open?.status), best: priced.length > 1 && o.price === low }));
}

/** Clicks inside a row that land on its own buttons or links shouldn't also move the map. */
export const ownControl = (e) => !!e.target.closest('a, button, input, label, summary');
