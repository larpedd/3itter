// Shared client state.
export const state = {
  me: null,
  instance: null, // public instance info from /api/instance
  badges: { notifications: 0, messages: 0 },
};

// Latest known copy of every post, keyed by id, so actions can update all on-screen copies.
export const postStore = new Map();

export function remember(posts) {
  for (const p of posts) {
    if (!p || p.deleted) continue;
    const { repostedBy, ...rest } = p;
    postStore.set(p.id, { ...postStore.get(p.id), ...rest });
    if (p.quote && !p.quote.deleted) postStore.set(p.quote.id, { ...postStore.get(p.quote.id), ...p.quote });
  }
}

// Tiny event bus.
const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => {
  const h = (e) => fn(e.detail);
  bus.addEventListener(type, h);
  return () => bus.removeEventListener(type, h);
};
