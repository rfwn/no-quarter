// One place that decides how maps are drawn. When the server reports a working Neshan web key
// (/api/maps), maps use Neshan's Leaflet SDK and tiles; otherwise our bundled Leaflet with OpenStreetMap
// tiles, tinted with CSS (.osm-tiles in styles.css). CARTO basemaps now need an API key, so they're out.
import Leaflet from 'leaflet';

const NESHAN_SDK = 'https://static.neshan.org/sdk/leaflet/v1.9.4/neshan-sdk/v1.0.8';
const TEHRAN = [35.6953, 51.4098];

export const baseTiles = () =>
  Leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'osm-tiles', attribution: '© OpenStreetMap' });

function load(tag, attrs) {
  return new Promise((resolve, reject) => {
    const el = Object.assign(document.createElement(tag), attrs, { onload: resolve, onerror: reject });
    document.head.appendChild(el);
  });
}

const osmKit = {
  provider: 'osm',
  L: Leaflet,
  create(el, opts) {
    const m = Leaflet.map(el, opts);
    baseTiles().addTo(m);
    return m;
  },
};

let kit;

/** {provider, L, create(el, opts)} — every layer on a map must come from the same `L`. */
export function loadMapKit() {
  kit ||= (async () => {
    try {
      const cfg = await (await fetch('/api/maps')).json();
      if (cfg.provider !== 'neshan' || !cfg.key) return osmKit;
      await Promise.all([load('link', { rel: 'stylesheet', href: `${NESHAN_SDK}/index.css` }), load('script', { src: `${NESHAN_SDK}/index.js` })]);
      const NL = window.L;
      if (!NL?.Map) return osmKit;
      return {
        provider: 'neshan',
        L: NL,
        create: (el, opts) => new NL.Map(el, { key: cfg.key, maptype: 'neshan', poi: false, traffic: false, center: TEHRAN, zoom: 14, ...opts }),
      };
    } catch {
      return osmKit;
    }
  })();
  return kit;
}
