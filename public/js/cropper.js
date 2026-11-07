// Image cropper for avatars and banners: drag to move, pinch / scroll / slider to zoom, rotate,
// then export the framed area as a new image.
import { html, el } from './lib/html.js';
import { icon, openDialog } from './ui.js';
import { t } from './lib/i18n.js';

const MAX_ZOOM = 6;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('That image couldn’t be opened.')));
    img.src = src;
  });
}

// Returns a data URL of the cropped image, or null when cancelled.
//   kind: 'avatar' (square, shown in the profile's shape) or 'banner' (3:1)
export async function openCropper(file, { kind = 'avatar', shape = 'circle' } = {}) {
  const url = URL.createObjectURL(file);
  let source;
  try { source = await loadImage(url); } finally { /* revoked on close */ }
  const isGif = file.type === 'image/gif';
  const aspect = kind === 'avatar' ? 1 : 3;
  const out = kind === 'avatar' ? { w: 512, h: 512 } : { w: 1500, h: 500 };

  const box = el(html`<form class="cropper" novalidate>
    <div class="dialog-head">
      <button class="icon-btn" type="button" data-close aria-label="Cancel">${icon('close')}</button>
      <h2 class="title-large emph">${kind === 'avatar' ? t('Edit profile picture') : t('Edit banner')}</h2>
      <button class="btn filled" type="submit">${t('Apply')}</button>
    </div>
    <div class="crop-stage ${kind}" tabindex="0" aria-label="${t('Drag to move the picture. Use the slider or + and − to zoom.')}">
      <img class="crop-img" alt="" draggable="false">
      <div class="crop-frame ${kind === 'avatar' ? `shape-${shape}` : ''}"><img class="crop-lit" alt="" draggable="false"></div>
      <div class="crop-grid"></div>
    </div>
    <div class="crop-tools">
      <button class="icon-btn" type="button" data-zoom="-1" aria-label="${t('Zoom out')}">${icon('zoom_out')}</button>
      <input class="slider crop-zoom" type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="${t('Zoom')}">
      <button class="icon-btn" type="button" data-zoom="1" aria-label="${t('Zoom in')}">${icon('zoom_in')}</button>
      <button class="icon-btn" type="button" data-rotate aria-label="${t('Rotate')}">${icon('rotate_right')}</button>
      <button class="icon-btn" type="button" data-reset aria-label="${t('Reset')}">${icon('restart_alt')}</button>
    </div>
    <p class="setting-sub center crop-hint">${t('Drag to reposition. Pinch, scroll or use the slider to zoom.')}</p>
    ${isGif ? html`<button class="btn text block" type="button" data-original>${icon('gif_box', 'sm')}${t('Use the original GIF (keeps the animation)')}</button>` : ''}
  </form>`);

  const stage = box.querySelector('.crop-stage');
  const img = box.querySelector('.crop-img');
  const frame = box.querySelector('.crop-frame');
  const lit = box.querySelector('.crop-lit');
  const slider = box.querySelector('.crop-zoom');

  // Current image (re-rendered into a canvas when rotated).
  let current = source;
  let iw = source.naturalWidth;
  let ih = source.naturalHeight;
  img.src = url;
  lit.src = url;

  // Geometry, in CSS pixels of the stage. The frame is the area that will be exported.
  let F = { x: 0, y: 0, w: 0, h: 0 };
  let base = 1;   // scale at which the image just covers the frame
  let zoom = 1;
  let tx = 0;     // image top-left within the stage
  let ty = 0;

  const scale = () => base * zoom;
  const clamp = () => {
    const s = scale();
    tx = Math.min(F.x, Math.max(F.x + F.w - iw * s, tx));
    ty = Math.min(F.y, Math.max(F.y + F.h - ih * s, ty));
  };
  const paint = () => {
    clamp();
    img.style.width = `${iw}px`;
    img.style.height = `${ih}px`;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale()})`;
    // The lit copy inside the frame shows the part that will be kept, in the profile's shape.
    lit.style.width = img.style.width;
    lit.style.height = img.style.height;
    lit.style.transform = `translate(${tx - F.x}px, ${ty - F.y}px) scale(${scale()})`;
    slider.value = String(zoom);
  };
  const layout = (keepCenter = true) => {
    const r = stage.getBoundingClientRect();
    const pad = Math.max(16, r.width * 0.06);
    let w = r.width - pad * 2;
    let h = w / aspect;
    if (h > r.height - pad * 2) { h = r.height - pad * 2; w = h * aspect; }
    const prev = F;
    const cx = keepCenter && prev.w ? (prev.x + prev.w / 2 - tx) / scale() : iw / 2;
    const cy = keepCenter && prev.w ? (prev.y + prev.h / 2 - ty) / scale() : ih / 2;
    F = { x: (r.width - w) / 2, y: (r.height - h) / 2, w, h };
    frame.style.cssText = `left:${F.x}px; top:${F.y}px; width:${F.w}px; height:${F.h}px`;
    box.querySelector('.crop-grid').style.cssText = frame.style.cssText;
    base = Math.max(F.w / iw, F.h / ih);
    tx = F.x + F.w / 2 - cx * scale();
    ty = F.y + F.h / 2 - cy * scale();
    paint();
  };
  // Zoom keeping the point (fx, fy) of the stage still.
  const zoomTo = (z, fx = F.x + F.w / 2, fy = F.y + F.h / 2) => {
    const before = scale();
    zoom = Math.min(MAX_ZOOM, Math.max(1, z));
    const after = scale();
    tx = fx - (fx - tx) * (after / before);
    ty = fy - (fy - ty) * (after / before);
    paint();
  };

  // Pointer input: one pointer drags, two pointers pinch.
  const pointers = new Map();
  let pinch = null;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.classList.add('dragging');
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, next);
    if (pointers.size === 1) {
      tx += next.x - prev.x;
      ty += next.y - prev.y;
      paint();
    } else if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const r = stage.getBoundingClientRect();
      zoomTo(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomTo(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 10;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); tx += moves[e.key][0]; ty += moves[e.key][1]; paint(); }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(zoom * 1.15); }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(zoom / 1.15); }
  });
  slider.addEventListener('input', () => zoomTo(Number(slider.value)));

  const rotate = () => {
    const c = document.createElement('canvas');
    c.width = ih;
    c.height = iw;
    const g = c.getContext('2d');
    g.translate(ih, 0);
    g.rotate(Math.PI / 2);
    g.drawImage(current, 0, 0);
    current = c;
    [iw, ih] = [ih, iw];
    img.src = c.toDataURL('image/png');
    lit.src = img.src;
    zoom = 1;
    F = { ...F, w: 0 }; // recentre
    layout(false);
  };

  const exportImage = () => {
    const s = scale();
    const c = document.createElement('canvas');
    // Don't upscale tiny images beyond what they have.
    const srcW = F.w / s;
    const k = Math.min(1, srcW / out.w) < 1 ? srcW / out.w : 1;
    c.width = Math.max(1, Math.round(out.w * k));
    c.height = Math.max(1, Math.round(out.h * k));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(current, (F.x - tx) / s, (F.y - ty) / s, F.w / s, F.h / s, 0, 0, c.width, c.height);
    const webp = c.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.9);
  };

  return new Promise((resolve) => {
    let result = null;
    const onResize = () => layout();
    const dlg = openDialog(box, {
      cls: 'cropper-dialog fullscreen-mobile',
      onClose: () => { removeEventListener('resize', onResize); URL.revokeObjectURL(url); resolve(result); },
    });
    addEventListener('resize', onResize);
    requestAnimationFrame(() => { layout(false); stage.focus({ preventScroll: true }); });
    box.addEventListener('click', (e) => {
      const z = e.target.closest('[data-zoom]');
      if (z) zoomTo(zoom * (Number(z.dataset.zoom) > 0 ? 1.25 : 0.8));
      if (e.target.closest('[data-rotate]')) rotate();
      if (e.target.closest('[data-reset]')) { zoom = 1; F = { ...F, w: 0 }; layout(false); }
      if (e.target.closest('[data-original]')) { result = { original: true }; dlg.close(); }
    });
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      result = exportImage();
      dlg.close();
    });
  });
}
