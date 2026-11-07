#!/usr/bin/env node
// A minimal 3itter bot: it listens to the realtime stream and answers every mention.
// Zero dependencies (Node 18+).
//
//   1. Make an account for the bot, and in Settings → Bots & API turn on "This is an automated account".
//   2. Create a token there with the "read" and "write" scopes.
//   3. INSTANCE=https://twitter.republican TOKEN=3tt_… node examples/bots/echo-bot.mjs
//
// See /developers on any 3itter instance for the full API.

const INSTANCE = (process.env.INSTANCE || '').replace(/\/+$/, '');
const TOKEN = process.env.TOKEN || '';
if (!INSTANCE || !TOKEN) {
  console.error('Set INSTANCE (e.g. https://twitter.republican) and TOKEN (3tt_…).');
  process.exit(1);
}
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${INSTANCE}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// What the bot says back. Replace this with your own logic.
function answer(text, from) {
  const said = text.replace(/@[\w@.:-]+/g, '').trim();
  return said ? `@${from} you said: “${said.slice(0, 400)}”` : `@${from} hi! 👋`;
}

async function onEvent(event, data) {
  if (event !== 'notification') return;
  const n = JSON.parse(data);
  if (n.type !== 'mention' || !n.post) return;
  const from = n.actor.domain ? `${n.actor.handle}@${n.actor.domain}` : n.actor.handle;
  try {
    await api('/posts', { method: 'POST', body: { text: answer(n.post.text, from), replyTo: n.post.id } });
    console.log(`replied to @${from} (post ${n.post.id})`);
  } catch (e) {
    console.error(`couldn’t reply to post ${n.post.id}: ${e.message}`);
  }
}

async function listen() {
  const res = await fetch(`${INSTANCE}/api/stream`, { headers: { Authorization: headers.Authorization } });
  if (res.status === 401) throw Object.assign(new Error('The token is invalid or was revoked.'), { fatal: true });
  if (!res.ok) throw new Error(`stream: HTTP ${res.status}`);
  let buffer = '';
  for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) await onEvent(event, data);
    }
  }
}

const { user } = await api('/me');
console.log(`@${user.handle} is listening on ${INSTANCE}${user.bot ? '' : ' (tip: turn on the "Automated" label in Settings → Bots & API)'}`);
for (;;) {
  try { await listen(); } catch (e) {
    if (e.fatal) { console.error(e.message); process.exit(1); }
    console.error(`${e.message}; reconnecting in 5 s`);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
