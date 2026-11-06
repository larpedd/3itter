// Tiny escaping template helpers. Everything interpolated into `html` is escaped
// unless it is itself the result of `html` or `raw`.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));

function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

export function el(markup) {
  const t = document.createElement('template');
  t.innerHTML = String(markup).trim();
  return t.content.firstElementChild;
}

export function frag(markup) {
  const t = document.createElement('template');
  t.innerHTML = String(markup);
  return t.content;
}
