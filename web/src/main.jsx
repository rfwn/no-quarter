import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './game.css';
import './chat.css';
import App from './App.jsx';
import { applyTheme, getTheme } from './theme.js';

applyTheme(getTheme()); // before the first paint, so there's no flash of the wrong theme

// Opens with no signal (passage basements): see public/sw.js.
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
