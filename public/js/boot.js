// Runs synchronously in <head> so the saved theme applies before first paint.
(function () {
  var t = {};
  try { t = JSON.parse((localStorage.getItem('3itter-theme') || localStorage.getItem('orbit-theme')) || '{}'); } catch (e) { /* ignore */ }
  var mode = t.mode || 'system';
  var dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--h', t.hue != null ? t.hue : 285);
  if (t.reduceMotion) root.classList.add('reduce-motion');
  if (t.highContrast) root.classList.add('high-contrast');
  root.style.setProperty('--ts', t.textScale || 1);
})();
