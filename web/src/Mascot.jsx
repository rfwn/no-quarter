// ترب‌چین: a pixel-art shopping bag with a freshly picked radish (ترب) peeking out — the one who
// goes and picks تربs. Moods: idle (blinks), think (agent working), happy, cheer (wins), worried (errors).

const C = {
  H: '#0b5a54', // handle
  B: '#0f766e', // bag
  L: '#14a08f', // top band
  D: '#0a4f49', // bottom shade
  R: '#ef4056', // radish
  r: '#f79aa6', // radish highlight
  G: '#3fa34d', // leaves
  W: '#ffffff',
  K: '#111827',
  P: '#f7a8a0', // cheeks
};

// 16×16; '.' is transparent.
const BODY = [
  '.....HHHHHH.....',
  '....H.G.G..H....',
  '....H..GG..H....',
  '....H.RRRR.H....',
  '..LLLRrRRRRLLL..',
  '..LLLLRRRRLLLL..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..DDDDDDDDDDDD..',
];

// Face overlays: [x, y, colour key]
const EYES_OPEN = [
  [4, 6, 'W'], [5, 6, 'W'], [4, 7, 'W'], [5, 7, 'K'],
  [10, 6, 'W'], [11, 6, 'W'], [10, 7, 'W'], [11, 7, 'K'],
];
const EYES_UP = [
  [4, 6, 'W'], [5, 6, 'K'], [4, 7, 'W'], [5, 7, 'W'],
  [10, 6, 'W'], [11, 6, 'K'], [10, 7, 'W'], [11, 7, 'W'],
];
const EYES_HAPPY = [
  [4, 7, 'K'], [5, 6, 'K'], [6, 7, 'K'],
  [9, 7, 'K'], [10, 6, 'K'], [11, 7, 'K'],
];
const EYES_WORRIED = [...EYES_OPEN, [3, 5, 'K'], [4, 5, 'K'], [11, 5, 'K'], [12, 5, 'K']];
const CHEEKS = [[3, 9, 'P'], [12, 9, 'P']];
const MOUTH = {
  idle: [[7, 10, 'K'], [8, 10, 'K']],
  think: [[7, 10, 'K']],
  happy: [[6, 9, 'K'], [7, 10, 'K'], [8, 10, 'K'], [9, 9, 'K']],
  cheer: [[6, 9, 'K'], [7, 9, 'K'], [8, 9, 'K'], [9, 9, 'K'], [7, 10, 'K'], [8, 10, 'K']],
  worried: [[6, 11, 'K'], [7, 10, 'K'], [8, 10, 'K'], [9, 11, 'K']],
};
const ARMS_UP = [[1, 4, 'H'], [1, 5, 'H'], [0, 3, 'H'], [14, 5, 'H'], [14, 4, 'H'], [15, 3, 'H']];
const ARMS_DOWN = [[1, 9, 'H'], [0, 10, 'H'], [14, 9, 'H'], [15, 10, 'H']];
const DOTS = [[13, 0, 'H'], [15, 0, 'H']];

const px = (x, y, k, key) => <rect key={key} x={x} y={y} width="1" height="1" fill={C[k]} />;

export default function Mascot({ mood = 'idle', size = 48, title }) {
  const eyes = mood === 'happy' || mood === 'cheer' ? EYES_HAPPY : mood === 'think' ? EYES_UP : mood === 'worried' ? EYES_WORRIED : EYES_OPEN;
  const body = [];
  BODY.forEach((row, y) => [...row].forEach((k, x) => k !== '.' && body.push(px(x, y + 2, k, `b${x}-${y}`))));
  const shift = (list) => list.map(([x, y, k]) => [x, y + 3, k]);
  return (
    <svg
      className={`mascot mascot-${mood}`}
      width={size}
      height={size}
      viewBox="0 0 16 19"
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g className="mascot-body">{body}</g>
      <g className="mascot-eyes">{shift(eyes).map(([x, y, k], i) => px(x, y, k, `e${i}`))}</g>
      {shift([...CHEEKS, ...MOUTH[mood]]).map(([x, y, k], i) => px(x, y, k, `f${i}`))}
      <g className="mascot-arms">{shift(mood === 'cheer' ? ARMS_UP : ARMS_DOWN).map(([x, y, k], i) => px(x, y, k, `a${i}`))}</g>
      {mood === 'think' && <g className="mascot-dots">{DOTS.map(([x, y, k], i) => px(x, y, k, `d${i}`))}</g>}
    </svg>
  );
}
