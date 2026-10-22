// Pick any place in Tehran: GPS, search by name (dataset areas/passages + OpenStreetMap), or pan a map
// under a fixed pin. Used by the location sheet and by the agent's "where are you?" question.
import { useEffect, useRef, useState } from 'react';
import { loadMapKit } from './tiles.js';
import { reversePlace, searchPlaces } from './api.js';
import { LocateIcon, MapIcon, RouteIcon, SearchIcon } from './Icons.jsx';

const TEHRAN = [35.6953, 51.4098];

export default function LocationPicker({ areas = [], current, onPick, onDecline, busy }) {
  const [mode, setMode] = useState('list'); // list | map
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [gps, setGps] = useState(''); // '' | locating | error text

  // Search as you type (debounced).
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return setResults(null);
    setSearching(true);
    const t = setTimeout(async () => {
      setResults(await searchPlaces(text).catch(() => []));
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  function shareGps() {
    if (!navigator.geolocation) return setGps('مرورگرت موقعیت‌یابی رو پشتیبانی نمی‌کنه.');
    setGps('locating');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = +pos.coords.latitude.toFixed(5);
        const lon = +pos.coords.longitude.toFixed(5);
        const { name } = await reversePlace(lat, lon).catch(() => ({}));
        setGps('');
        onPick({ lat, lon, place: name || 'موقعیت من' }, name ? `موقعیتم: ${name}` : 'موقعیتم رو فرستادم');
      },
      (err) => setGps(err.code === 1 ? 'اجازه‌ی دسترسی داده نشد؛ جا رو جست‌وجو کن یا روی نقشه بزن.' : 'موقعیت پیدا نشد؛ جا رو جست‌وجو کن.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 },
    );
  }

  if (mode === 'map') return <MapPicker start={current?.lat != null ? [current.lat, current.lon] : TEHRAN} onBack={() => setMode('list')} onPick={onPick} busy={busy} />;

  return (
    <div className="stack">
      <div className="loc-search">
        <SearchIcon size={16} className="loc-search-icon" />
        <label className="sr-only" htmlFor="loc-q">
          جست‌وجوی محله، خیابان یا پاساژ
        </label>
        <input id="loc-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="محله، خیابان، میدان یا پاساژ…" autoComplete="off" />
      </div>

      {results && (
        <ul className="loc-results" aria-busy={searching}>
          {results.length === 0 && !searching && <li className="muted small loc-empty">چیزی پیدا نشد؛ روی نقشه انتخاب کن.</li>}
          {results.map((r, i) => (
            <li key={`${r.name}-${i}`}>
              <button type="button" className="loc-result" disabled={busy} onClick={() => onPick({ lat: r.lat, lon: r.lon, place: r.name }, r.name)}>
                <RouteIcon size={16} />
                <span>
                  <span className="loc-name">{r.name}</span>
                  {r.detail && <span className="loc-detail">{r.detail}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="loc-actions">
        <button type="button" className="btn btn-primary" onClick={shareGps} disabled={busy || gps === 'locating'}>
          <LocateIcon size={18} />
          {gps === 'locating' ? 'در حال پیدا کردن…' : 'موقعیت فعلی من'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setMode('map')} disabled={busy}>
          <MapIcon size={18} />
          انتخاب روی نقشه
        </button>
      </div>
      {gps && gps !== 'locating' && (
        <p className="inline-error" role="alert">
          {gps}
        </p>
      )}

      {areas.length > 0 && (
        <>
          <p className="muted small">محدوده‌های پرمغازه:</p>
          <div className="area-grid">
            {areas.slice(0, 12).map((a) => (
              <button key={a.name} type="button" className="chip" aria-pressed={current?.place === a.name} disabled={busy} onClick={() => onPick({ lat: a.lat, lon: a.lon, place: a.name, area: a.name }, `محدوده ${a.name}`)}>
                {a.name}
              </button>
            ))}
          </div>
        </>
      )}
      {onDecline && (
        <button type="button" className="link-btn" disabled={busy} onClick={onDecline}>
          بدون موقعیت ادامه بده
        </button>
      )}
    </div>
  );
}

/** Pan the map under a fixed centre pin, then confirm. */
function MapPicker({ start, onBack, onPick, busy }) {
  const box = useRef(null);
  const map = useRef(null);
  const [label, setLabel] = useState('');

  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    loadMapKit().then(({ L, create }) => {
      if (cancelled || !box.current) return;
      off = mount(L, create(box.current, { zoomControl: false, center: start, zoom: 15 }).setView(start, 15));
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [start]);

  function mount(L, m) {
    L.control.zoom({ position: 'bottomleft' }).addTo(m);
    map.current = m;
    let t;
    const name = () => {
      clearTimeout(t);
      setLabel('');
      t = setTimeout(async () => {
        const c = m.getCenter();
        setLabel((await reversePlace(c.lat.toFixed(5), c.lng.toFixed(5)).catch(() => ({}))).name || 'نقطه‌ی انتخابی');
      }, 400);
    };
    m.on('moveend', name);
    const r = setTimeout(() => (m.invalidateSize(), name()), 250);
    return () => {
      clearTimeout(r);
      clearTimeout(t);
      m.remove();
    };
  }

  function confirm() {
    if (!map.current) return;
    const c = map.current.getCenter();
    onPick({ lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5), place: label || 'نقطه‌ی انتخابی' }, label || 'نقطه‌ی انتخابی');
  }

  return (
    <div className="stack">
      <div className="map-pick">
        <div ref={box} className="map-pick-map" role="region" aria-label="نقشه؛ نقشه را بکش تا نشانگر روی جای مورد نظر بیفتد" />
        <span className="map-pick-pin" aria-hidden="true" />
      </div>
      <p className="muted small map-pick-label">{label ? `جای انتخابی: ${label}` : 'نقشه رو بکش تا نشانگر روی جات بیفته…'}</p>
      <div className="loc-actions">
        <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
          همین‌جا
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          برگشت
        </button>
      </div>
    </div>
  );
}
