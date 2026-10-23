import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './game.css';
import './chat.css';
import App from './App.jsx';
import { applyTheme, getTheme } from './theme.js';

applyTheme(getTheme()); // before the first paint, so there's no flash of the wrong theme

// Opens with no signal (passage basements): see public/sw.js. Not in dev: its cache would serve stale files.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  if (import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
  else navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
