// Theme preferences: light/dark/system mode, seed hue and reduced motion.
// boot.js applies the same settings before first paint to avoid a flash.
const KEY = '3itter-theme';
const LEGACY_KEY = 'orbit-theme'; // read once so settings survive the rename
const DEFAULTS = { mode: 'system', hue: 285, useProfileHue: false, reduceMotion: false, textScale: 1, highContrast: false };

export function getTheme() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function setTheme(patch, profileHue) {
  const t = { ...getTheme(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(t));
  applyTheme(t, profileHue);
  return t;
}

const media = matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(t = getTheme(), profileHue) {
  const root = document.documentElement;
  const dark = t.mode === 'dark' || (t.mode === 'system' && media.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  const hue = t.useProfileHue && profileHue != null ? profileHue : t.hue;
  root.style.setProperty('--h', hue);
  root.classList.toggle('reduce-motion', !!t.reduceMotion);
  root.classList.toggle('high-contrast', !!t.highContrast);
  root.style.setProperty('--ts', t.textScale || 1);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', getComputedStyle(root).getPropertyValue('--app-bg').trim() || '#fff');
}

media.addEventListener('change', () => applyTheme(getTheme(), window.__profileHue));
