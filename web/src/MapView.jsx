// Map on tap: shops as price pins around the user's origin (Neshan when available, else OpenStreetMap).
// Pins are clustered by on-screen distance at the current zoom, so labels never sit on top of each other;
// zooming in splits a cluster back into its shops.
import { useEffect, useRef } from 'react';
import { loadMapKit } from './tiles.js';
import { shortToman, toFaDigits } from './format.js';

const ACTION = '#ef4056';
const CLUSTER_PX = { x: 110, y: 34 }; // roughly one price label

function clusterOnScreen(m, offers) {
  const groups = [];
  for (const o of offers) {
    if (o.lat == null) continue;
    const p = m.latLngToContainerPoint([o.lat, o.lon]);
    const g = groups.find((x) => Math.abs(x.p.x - p.x) < CLUSTER_PX.x && Math.abs(x.p.y - p.y) < CLUSTER_PX.y);
    if (g) g.offers.push(o);
    else groups.push({ p, lat: o.lat, lon: o.lon, offers: [o] });
  }
  return groups;
}

export default function MapView({ offers, origin, selectedIds = [], route = null, onPick }) {
  const box = useRef(null);

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    loadMapKit().then(({ L, create }) => {
      if (cancelled || !box.current) return;
      cleanup = draw(L, create(box.current, { zoomControl: false, attributionControl: true }));
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [offers, origin, selectedIds, route, onPick]);

  // Everything below uses the kit's own L, so markers and the map always share one Leaflet.
  function draw(L, m) {
    L.control.zoom({ position: 'bottomleft' }).addTo(m);

    const points = offers.filter((o) => o.lat != null).map((o) => [o.lat, o.lon]);
    if (origin?.lat != null) {
      L.circleMarker([origin.lat, origin.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }).addTo(m).bindTooltip('شما', { direction: 'top', offset: [0, -8] });
      points.push([origin.lat, origin.lon]);
    }
    if (route?.length > 1) L.polyline(route.map((p) => [p.lat, p.lon]), { color: ACTION, weight: 4, opacity: 0.8 }).addTo(m);

    const cheapest = Math.min(...offers.map((o) => o.price ?? Infinity));
    const pins = L.layerGroup().addTo(m);
    const drawPins = () => {
      pins.clearLayers();
      for (const g of clusterOnScreen(m, offers)) {
        const prices = g.offers.map((o) => o.price).filter(Boolean);
        const low = prices.length ? Math.min(...prices) : null;
        const picked = g.offers.some((o) => selectedIds.includes(o.offer_id));
        const isCheapest = low != null && low === cheapest;
        const anyOpen = g.offers.some((o) => o.open?.status === 'open');
        // Shops without a price (a "kind of shop" search) are labelled by name.
        const label = g.offers.length > 1 ? (low ? `${toFaDigits(g.offers.length)} مغازه · از ${shortToman(low)}` : `${toFaDigits(g.offers.length)} مغازه`) : low ? shortToman(low) : g.offers[0].shop_name;
        const pin = L.marker([g.lat, g.lon], {
          icon: L.divIcon({
            className: '',
            html: `<span dir="rtl" class="pin${picked ? ' is-picked' : ''}${isCheapest ? ' is-cheapest' : ''}${anyOpen ? '' : ' is-closed'}">${label}</span>`,
            iconSize: null,
          }),
          title: g.offers.map((o) => o.shop_name).join('، '),
          zIndexOffset: picked ? 1000 : isCheapest ? 500 : 0,
        }).addTo(pins);
        // A cluster zooms in to split; a single shop opens its row.
        pin.on('click', () => {
          if (g.offers.length > 1 && m.getZoom() < m.getMaxZoom()) m.flyToBounds(g.offers.map((o) => [o.lat, o.lon]), { padding: [60, 60], maxZoom: 19 });
          else onPick?.([...g.offers].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0]);
        });
      }
    };

    const fit = () => {
      if (points.length > 1) m.fitBounds(points, { padding: [56, 48], maxZoom: 17 });
      else if (points.length === 1) m.setView(points[0], 16);
      else m.setView([35.6953, 51.4098], 14);
    };
    fit();
    m.on('zoomend', drawPins);
    // The sheet sizes the container after opening: fit again, then place pins at the real zoom.
    const t = setTimeout(() => {
      m.invalidateSize();
      fit();
      drawPins();
    }, 300);
    return () => {
      clearTimeout(t);
      m.remove();
    };
  }

  return <div ref={box} className="map" role="region" aria-label="نقشه مغازه‌ها" />;
}
