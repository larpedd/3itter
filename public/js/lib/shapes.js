// M3 Expressive-style shape library, generated as clip-path polygons.
// Every shape uses the same number of points, starting at the top, so CSS can
// morph smoothly between any two of them (used by avatars and the loading indicator).

const N = 72;
const TAU = Math.PI * 2;

const superellipse = (n) => (t) => (Math.abs(Math.cos(t)) ** n + Math.abs(Math.sin(t)) ** n) ** (-1 / n);
const wave = (k, a, power = 1) => (t) => 1 - a + a * ((1 + Math.cos(k * t)) / 2) ** power;
const polygon = (sides) => (t) => {
  const seg = TAU / sides;
  const local = ((t + Math.PI / 2) % seg + seg) % seg - seg / 2;
  return Math.cos(Math.PI / sides) / Math.cos(local);
};

const DEFS = {
  circle:   { r: () => 1 },
  squircle: { r: superellipse(4.5) },
  puffy:    { r: (t) => superellipse(3)(t) * (1 + 0.045 * Math.cos(8 * t + Math.PI)), smooth: 2 },
  cookie4:  { r: wave(4, 0.2, 0.8), smooth: 2 },
  cookie6:  { r: wave(6, 0.16, 0.8), smooth: 1 },
  cookie9:  { r: wave(9, 0.12, 0.8), smooth: 1 },
  cookie12: { r: wave(12, 0.09, 0.8) },
  clover4:  { r: (t) => 0.6 + 0.4 * Math.abs(Math.cos(2 * t)) ** 0.55, smooth: 2 },
  clover8:  { r: (t) => 0.72 + 0.28 * Math.abs(Math.cos(4 * t)) ** 0.7, smooth: 1 },
  flower:   { r: wave(6, 0.3, 0.6), smooth: 1 },
  sunny:    { r: wave(8, 0.16, 2.2), smooth: 1 },
  burst:    { r: wave(12, 0.22, 2.6) },
  pentagon: { r: polygon(5), smooth: 4 },
  gem:      { r: polygon(6), smooth: 4, sy: 1.12 },
};

export const SHAPES = Object.keys(DEFS);

function points(name) {
  const def = DEFS[name] || DEFS.circle;
  let rs = Array.from({ length: N }, (_, i) => def.r(-Math.PI / 2 + (i / N) * TAU));
  for (let pass = 0; pass < (def.smooth || 0); pass++) {
    rs = rs.map((_, i) => (rs[(i - 1 + N) % N] + 2 * rs[i] + rs[(i + 1) % N]) / 4);
  }
  const pts = rs.map((r, i) => {
    const t = -Math.PI / 2 + (i / N) * TAU;
    return [r * Math.cos(t), r * Math.sin(t) * (def.sy || 1)];
  });
  // Fit into the 0–100% box.
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = 100 / Math.max(maxX - minX, maxY - minY);
  const ox = (100 - (maxX - minX) * scale) / 2; const oy = (100 - (maxY - minY) * scale) / 2;
  return pts.map(([x, y]) => [ox + (x - minX) * scale, oy + (y - minY) * scale]);
}

const cache = new Map();
export function shapePolygon(name) {
  if (!cache.has(name)) {
    cache.set(name, `polygon(${points(name).map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`);
  }
  return cache.get(name);
}

// Inject one class per shape plus the loading-indicator keyframes.
export function installShapes() {
  const LOADER = ['burst', 'cookie9', 'pentagon', 'squircle', 'sunny', 'cookie4', 'circle'];
  const step = 100 / LOADER.length;
  const frames = [...LOADER, LOADER[0]].map((s, i) =>
    `${(i * step).toFixed(3)}% { clip-path: ${shapePolygon(s)}; transform: rotate(${i * 154}deg); animation-timing-function: var(--md-spring-fast-spatial); }`,
  ).join('\n');
  const css = SHAPES.map((s) => `.shape-${s} { clip-path: ${shapePolygon(s)}; }`).join('\n')
    + `\n@keyframes m3-shape-morph {\n${frames}\n}`;
  const style = document.createElement('style');
  style.id = 'shape-library';
  style.textContent = css;
  document.head.append(style);
}

export const SHAPE_LABELS = {
  circle: 'Circle', squircle: 'Squircle', puffy: 'Puffy', cookie4: '4-sided cookie', cookie6: '6-sided cookie',
  cookie9: '9-sided cookie', cookie12: '12-sided cookie', clover4: '4-leaf clover', clover8: '8-leaf clover',
  flower: 'Flower', sunny: 'Sunny', burst: 'Burst', pentagon: 'Pentagon', gem: 'Gem',
};
