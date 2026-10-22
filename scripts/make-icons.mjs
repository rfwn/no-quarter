// Builds the favicon from the mascot's own pixel data (web/src/Mascot.jsx), so the icon always matches
// the character in the app:  node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../web/src/Mascot.jsx', import.meta.url), 'utf8');
const grab = (name, open = '[', close = ']') => {
  const start = src.indexOf(`const ${name} = ${open}`);
  let depth = 0;
  for (let i = src.indexOf(open, start); i < src.length; i++) {
    if (src[i] === open) depth++;
    if (src[i] === close && --depth === 0) return Function(`return ${src.slice(src.indexOf(open, start), i + 1)}`)();
  }
};
const C = grab('C', '{', '}');
const BODY = grab('BODY');
const EYES = grab('EYES_HAPPY');
const CHEEKS = grab('CHEEKS');
const MOUTH = grab('MOUTH', '{', '}').happy;
const ARMS = grab('ARMS_DOWN');

const px = [];
BODY.forEach((row, y) => [...row].forEach((k, x) => k !== '.' && px.push([x, y + 2, k])));
for (const [x, y, k] of [...EYES, ...CHEEKS, ...MOUTH, ...ARMS]) px.push([x, y + 3, k]);
const rects = px.map(([x, y, k]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${C[k]}"/>`).join('');

// Square, centred on the art (rows 2–16, columns 0–15).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 1.5 16 16" shape-rendering="crispEdges">${rects}</svg>\n`;
writeFileSync(new URL('../web/public/favicon.svg', import.meta.url), svg);
console.log('favicon.svg', px.length, 'pixels');
