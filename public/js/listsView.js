// Lists (curated timelines), the "add to lists" picker, and scheduled posts.
import { html, el } from './lib/html.js';
import { api } from './lib/api.js';
import { state, emit } from './store.js';
import {
  icon, avatar, nameOf, topBar, infiniteList, postCard, userRow, emptyState, toast, confirmDialog, openDialog,
  fullTime, compact,
} from './ui.js';

const listList = (lists) => html`<div class="seg list-cards">${lists.map((l) => html`
  <a class="list-item list-card" href="/lists/${l.id}">
    <span class="list-art shape-${['cookie9', 'clover4', 'sunny', 'flower', 'gem', 'burst'][l.id % 6]}" style="--uh:${l.owner.hue}">${icon('list_alt')}</span>
    <div class="li-text">
      <div class="li-head">${l.name}${l.private ? html` <span class="tag" title="Only you can see this list">${icon('lock', 'xs')}Private</span>` : ''}</div>
      <div class="li-sub">${l.description || `${compact(l.members)} member${l.members === 1 ? '' : 's'}`}</div>
    </div>
    <span class="li-sub">${compact(l.members)} ${icon('group', 'xs')}</span>
  </a>`)}</div>`;

function listForm({ name = '', description = '', private: priv = false } = {}, title, submitLabel) {
  return el(html`<form class="list-form" novalidate>
    <div class="dialog-head">
      <button class="icon-btn" type="button" data-close aria-label="Close">${icon('close')}</button>
      <h2 class="title-large emph">${title}</h2>
      <button class="btn filled" type="submit">${submitLabel}</button>
    </div>
    <div class="dialog-body stack">
      <div class="field"><input name="name" maxlength="40" placeholder=" " value="${name}" required><label>Name</label></div>
      <div class="field"><textarea name="description" maxlength="160" placeholder=" " rows="3">${description}</textarea><label>Description</label></div>
      <label class="setting"><div><div class="title-medium">Make private</div><div class="setting-sub">Only you can see a private list</div></div>
        <input type="checkbox" class="switch" name="private" ${priv ? html`checked` : ''} aria-label="Private list"></label>
    </div>
  </form>`);
}

export function openListEditor(existing = null, onDone) {
  const box = listForm(existing || {}, existing ? 'Edit list' : 'New list', existing ? 'Save' : 'Create');
  const { close } = openDialog(box, { cls: 'fullscreen-mobile' });
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { name: box.name.value, description: box.description.value, private: box.private.checked };
    try {
      const { list } = existing
        ? await api(`/lists/${existing.id}`, { method: 'PATCH', body })
        : await api('/lists', { method: 'POST', body });
      close();
      onDone?.(list);
    } catch (err) { toast(err.message); }
  });
  requestAnimationFrame(() => box.name.focus());
}

export async function listsView() {
  const { lists } = await api('/lists');
  const root = el(html`<div class="view">
    ${topBar({ title: 'Lists', big: true, actions: html`<button class="icon-btn tonal" type="button" data-new-list aria-label="New list">${icon('playlist_add')}</button>` })}
    <div class="lists-body">${lists.length ? listList(lists) : emptyState({
    icon: 'list_alt', shape: 'clover8', title: 'Make your first list',
    body: 'Lists are timelines of just the accounts you pick: friends, topics, news. Private lists are only visible to you.',
    action: html`<button class="btn filled md" type="button" data-new-list>${icon('playlist_add')}New list</button>`,
  })}</div>
  </div>`);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-new-list]')) openListEditor(null, (list) => emit('navigate', `/lists/${list.id}`));
  });
  return { el: root, title: 'Lists' };
}

export async function listView({ id, tab = 'posts' }) {
  const { list } = await api(`/lists/${id}`);
  const root = el(html`<div class="view">
    ${topBar({
    back: true, title: list.name, sub: `@${list.owner.handle} · ${compact(list.members)} member${list.members === 1 ? '' : 's'}`,
    actions: list.isOwner ? html`<button class="icon-btn" type="button" data-edit-list aria-label="Edit list">${icon('edit')}</button>
        <button class="icon-btn" type="button" data-delete-list aria-label="Delete list">${icon('delete')}</button>` : '',
    below: html`<nav class="tabs"><a class="tab" href="/lists/${list.id}" ${tab === 'posts' ? html`aria-current="page"` : ''}><span>Posts</span></a>
        <a class="tab" href="/lists/${list.id}/members" ${tab === 'members' ? html`aria-current="page"` : ''}><span>Members</span></a></nav>`,
  })}
    <section class="card list-hero">
      <span class="list-art big shape-sunny" style="--uh:${list.owner.hue}">${icon('list_alt')}</span>
      <div><h2 class="headline-small emph">${list.name}${list.private ? html` <span class="tag">${icon('lock', 'xs')}Private</span>` : ''}</h2>
        ${list.description ? html`<p class="setting-sub">${list.description}</p>` : ''}
        <a class="list-owner" href="/u/${list.owner.handle}">${avatar(list.owner, 'xs', { link: false })}${nameOf(list.owner)}</a></div>
    </section>
  </div>`);
  if (tab === 'members') {
    root.append(infiniteList({
      load: async (offset) => { const r = await api(`/lists/${list.id}/members?offset=${offset}`); return { items: r.users, next: r.next }; },
      render: (u) => html`<div class="list-member">${userRow(u)}${list.isOwner ? html`<button class="btn text xs" type="button" data-remove-member="${u.handle}">Remove</button>` : ''}</div>`,
      className: 'seg users',
      empty: emptyState({ icon: 'group_add', title: 'No members yet', body: 'Add people from their profile: ••• → Add to lists.', shape: 'clover4' }),
    }));
  } else {
    root.append(infiniteList({
      load: async (offset) => { const r = await api(`/lists/${list.id}/timeline?offset=${offset}`); return { items: r.posts, next: r.next }; },
      render: (p) => postCard(p),
      key: (p) => `${p.id}:${p.repostedBy?.id || ''}`,
      empty: emptyState({ icon: 'forum', title: 'Nothing here yet', body: list.members ? 'Posts from members will show up here.' : 'Add people from their profile: ••• → Add to lists.', shape: 'flower' }),
    }));
  }
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-edit-list]')) openListEditor(list, () => emit('navigate', `/lists/${list.id}`));
    if (e.target.closest('[data-delete-list]')) {
      if (!await confirmDialog({ title: `Delete “${list.name}”?`, body: 'The list is deleted for good. Its members aren’t notified.', confirm: 'Delete', danger: true })) return;
      try { await api(`/lists/${list.id}`, { method: 'DELETE' }); toast('List deleted'); emit('navigate', '/lists'); } catch (err) { toast(err.message); }
    }
    const rm = e.target.closest('[data-remove-member]');
    if (rm) {
      try {
        await api(`/lists/${list.id}/members/${encodeURIComponent(rm.dataset.removeMember)}`, { method: 'DELETE' });
        rm.closest('.list-member').remove();
        toast(`Removed @${rm.dataset.removeMember}`);
      } catch (err) { toast(err.message); }
    }
  });
  return { el: root, title: list.name };
}

// "Add to lists" dialog for a profile.
export async function openListPicker(user) {
  let lists;
  try { ({ lists } = await api(`/lists?member=${encodeURIComponent(user.handle)}`)); } catch (e) { toast(e.message); return; }
  const box = el(html`<div class="list-picker">
    <div class="dialog-head">
      <button class="icon-btn" type="button" data-close aria-label="Close">${icon('close')}</button>
      <h2 class="title-large emph">Add @${user.handle} to lists</h2>
    </div>
    <div class="dialog-body">
      <div class="seg tight picker-rows"></div>
      <button class="btn tonal block" type="button" data-create>${icon('playlist_add', 'sm')}New list</button>
    </div>
  </div>`);
  const rows = box.querySelector('.picker-rows');
  const draw = () => {
    rows.innerHTML = lists.length ? String(html`${lists.map((l) => html`<label class="list-item">
        <span class="li-icon">${icon(l.private ? 'lock' : 'list_alt')}</span>
        <div class="li-text"><div class="li-head">${l.name}</div><div class="li-sub">${compact(l.members)} member${l.members === 1 ? '' : 's'}</div></div>
        <input type="checkbox" class="checkbox" data-list="${l.id}" ${l.hasMember ? html`checked` : ''} aria-label="${l.name}"></label>`)}`)
      : String(html`<p class="list-empty">You don’t have any lists yet.</p>`);
  };
  draw();
  rows.addEventListener('change', async (e) => {
    const cb = e.target.closest('[data-list]');
    if (!cb) return;
    const l = lists.find((x) => String(x.id) === cb.dataset.list);
    try {
      await api(`/lists/${l.id}/members/${encodeURIComponent(user.handle)}`, { method: cb.checked ? 'POST' : 'DELETE' });
      l.hasMember = cb.checked;
      l.members += cb.checked ? 1 : -1;
      toast(cb.checked ? `Added to ${l.name}` : `Removed from ${l.name}`);
    } catch (err) { cb.checked = !cb.checked; toast(err.message); }
  });
  box.querySelector('[data-create]').addEventListener('click', () => openListEditor(null, async (list) => {
    try {
      await api(`/lists/${list.id}/members/${encodeURIComponent(user.handle)}`, { method: 'POST' });
      lists.unshift({ ...list, members: 1, hasMember: true });
      draw();
      toast(`Added to ${list.name}`);
    } catch (err) { toast(err.message); }
  }));
  openDialog(box, { cls: 'sm fullscreen-mobile' });
}

// ---------------------------------------------------------------- scheduled posts

const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export async function scheduledView() {
  const { scheduled } = await api('/scheduled');
  const root = el(html`<div class="view">${topBar({ back: true, title: 'Scheduled posts', sub: Intl.DateTimeFormat().resolvedOptions().timeZone })}
    <div class="scheduled-list stack"></div></div>`);
  const box = root.querySelector('.scheduled-list');
  const draw = () => {
    box.innerHTML = scheduled.length ? String(html`${scheduled.map((s) => html`<article class="card sched ${s.status}" data-sched="${s.id}">
        <div class="sched-head">
          <span class="tag ${s.status === 'failed' ? 'bad' : s.status === 'published' ? 'ok' : 'info'}">${icon(s.status === 'pending' ? 'schedule_send' : s.status === 'published' ? 'check' : 'error', 'xs')}${s.status === 'pending' ? 'Scheduled' : s.status === 'published' ? 'Posted' : 'Failed'}</span>
          <time title="${fullTime(s.publishAt)}">${when(s.publishAt)}</time>
        </div>
        ${s.cw ? html`<div class="eh-cw">${icon('warning', 'xs')}${s.cw}</div>` : ''}
        <p class="sched-text">${s.text}</p>
        ${s.images.length ? html`<div class="sched-media">${s.images.map((im) => html`<img src="${im.src}" alt="${im.alt}">`)}</div>` : ''}
        ${s.poll ? html`<div class="quote-poll">${icon('ballot', 'xs')}Poll · ${s.poll.options.length} choices · runs ${s.poll.durationHours} h</div>` : ''}
        ${s.error ? html`<p class="error-text">${icon('error', 'xs')}${s.error}</p>` : ''}
        <div class="row-end">
          ${s.status === 'published' && s.postId ? html`<a class="btn tonal xs" href="/p/${s.postId}">View post</a>` : ''}
          ${s.status === 'pending' ? html`<button class="btn text xs" type="button" data-resched>Change time</button><button class="btn tonal xs" type="button" data-now>Post now</button>` : ''}
          ${s.status !== 'published' ? html`<button class="btn text xs danger-text" type="button" data-cancel>${s.status === 'failed' ? 'Remove' : 'Cancel'}</button>` : ''}
        </div>
      </article>`)}`)
      : String(emptyState({ icon: 'schedule_send', shape: 'sunny', title: 'Nothing scheduled', body: 'In the composer, tap the clock to pick when a post goes out.' }));
  };
  draw();
  box.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-sched]');
    if (!card) return;
    const s = scheduled.find((x) => String(x.id) === card.dataset.sched);
    try {
      if (e.target.closest('[data-cancel]')) {
        if (!await confirmDialog({ title: 'Cancel this post?', body: 'It won’t be published.', confirm: 'Cancel post', danger: true })) return;
        await api(`/scheduled/${s.id}`, { method: 'DELETE' });
        scheduled.splice(scheduled.indexOf(s), 1);
        draw();
      }
      if (e.target.closest('[data-now]')) {
        const { post } = await api(`/scheduled/${s.id}/publish`, { method: 'POST' });
        Object.assign(s, { status: 'published', postId: post.id, publishAt: post.createdAt });
        draw();
        toast('Posted', { action: 'View', onAction: () => emit('navigate', `/p/${post.id}`) });
      }
      if (e.target.closest('[data-resched]')) {
        const pad = (x) => String(x).padStart(2, '0');
        const d = new Date(s.publishAt);
        const v = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const form = el(html`<form><h2 class="dialog-title headline-small">Change time</h2>
          <div class="dialog-body"><input class="datetime" type="datetime-local" value="${v}" required aria-label="Publish at"></div>
          <div class="dialog-actions"><button class="btn text" type="button" data-close>Cancel</button><button class="btn filled" type="submit">Save</button></div></form>`);
        const { close } = openDialog(form, { cls: 'sm' });
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          try {
            const { scheduled: upd } = await api(`/scheduled/${s.id}`, { method: 'PATCH', body: { publishAt: new Date(form.querySelector('input').value).getTime() } });
            Object.assign(s, upd);
            close();
            draw();
          } catch (err) { toast(err.message); }
        });
      }
    } catch (err) { toast(err.message); }
  });
  return { el: root, title: 'Scheduled posts' };
}

