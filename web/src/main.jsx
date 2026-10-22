import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './game.css';
import './chat.css';
import App from './App.jsx';
import { applyTheme, getTheme } from './theme.js';

applyTheme(getTheme()); // before the first paint, so there's no flash of the wrong theme

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
