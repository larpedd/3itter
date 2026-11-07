// Affiliations and bots.
//
// Affiliations: an admin marks an account as an organization. The organization invites accounts
// (optionally with a label such as "Engineer"), and an affiliation only becomes visible once the
// invited person accepts. Either side can end it. An account has at most one active affiliation.
// Affiliated accounts show the organization's avatar as a small badge next to their name.
//
// Bots: any account can be marked "Automated" (optionally "run by @owner"), and people can create
// personal API tokens ("3tt_…") with read / write / messages scopes for scripts and bots.
import crypto from 'node:crypto';
import { all, get, run, tx } from './db.js';
import { fail, route } from './http.js';
import { publicUser, notify, localUserByHandle, rateLimit, str, audit } from './core.js';

const PAGE = 20;

// ---------------------------------------------------------------- affiliations

const affOut = (r, side) => ({
  id: r.id, status: r.status, label: r.label, createdAt: r.created_at,
  user: publicUser(get('SELECT * FROM users WHERE id = :id', { id: side === 'org' ? r.user_id : r.org_id })),
});

route('GET', '/api/affiliations', ({ me }) => {
  const isOrg = !!me.is_org;
  return {
    org: isOrg,
    members: isOrg ? all(`SELECT * FROM affiliations WHERE org_id = :me ORDER BY status = 'active' DESC, created_at DESC`, { me: me.id }).map((r) => affOut(r, 'org')) : [],
    current: (() => { const r = get(`SELECT * FROM affiliations WHERE user_id = :me AND status = 'active'`, { me: me.id }); return r ? affOut(r, 'member') : null; })(),
    invites: all(`SELECT * FROM affiliations WHERE user_id = :me AND status = 'pending' ORDER BY created_at DESC`, { me: me.id }).map((r) => affOut(r, 'member')),
  };
});

route('POST', '/api/affiliations', ({ me, body }) => {
  if (!me.is_org) fail(403, 'Only organization accounts can add affiliates. Ask an admin to mark your account as an organization.');
  rateLimit(`aff:${me.id}`, 60, 3600_000);
  const handle = String(body.handle || '').trim().replace(/^@/, '');
  const u = localUserByHandle(handle);
  if (!u || u.suspended || u.deleted_at) fail(404, 'No account with that handle on this instance.');
  if (u.id === me.id) fail(400, 'An organization can’t be affiliated with itself.');
  if (u.is_org) fail(400, 'Organizations can’t be affiliated with other organizations.');
  const label = str(body.label, { name: 'Label', max: 30 });
  const existing = get('SELECT * FROM affiliations WHERE org_id = :o AND user_id = :u', { o: me.id, u: u.id });
  if (existing) fail(409, existing.status === 'active' ? 'They’re already affiliated with you.' : 'They already have an invitation from you.');
  run(`INSERT INTO affiliations (org_id, user_id, label, status, created_at) VALUES (:o, :u, :l, 'pending', :t)`, { o: me.id, u: u.id, l: label, t: Date.now() });
  notify(u.id, me.id, 'affiliation');
  return { ok: true };
});

route('POST', '/api/affiliations/:id/accept', ({ me, params }) => {
  const a = get(`SELECT * FROM affiliations WHERE id = :id AND user_id = :me AND status = 'pending'`, { id: Number(params.id) || 0, me: me.id }) || fail(404, 'Invitation not found.');
  tx(() => {
    run(`DELETE FROM affiliations WHERE user_id = :me AND status = 'active'`, { me: me.id }); // one at a time
    run(`UPDATE affiliations SET status = 'active', accepted_at = :t WHERE id = :id`, { id: a.id, t: Date.now() });
  });
  return { ok: true };
});

route('PATCH', '/api/affiliations/:id', ({ me, params, body }) => {
  const a = get('SELECT * FROM affiliations WHERE id = :id AND org_id = :me', { id: Number(params.id) || 0, me: me.id }) || fail(404, 'Affiliation not found.');
  run('UPDATE affiliations SET label = :l WHERE id = :id', { l: str(body.label, { name: 'Label', max: 30 }), id: a.id });
  return { ok: true };
});

route('DELETE', '/api/affiliations/:id', ({ me, params }) => {
  const r = run('DELETE FROM affiliations WHERE id = :id AND (org_id = :me OR user_id = :me)', { id: Number(params.id) || 0, me: me.id });
  if (!r.changes) fail(404, 'Affiliation not found.');
  return { ok: true };
});

// Public list of an organization's affiliates.
route('GET', '/api/orgs/:handle/affiliates', ({ me, params, query }) => {
  const org = localUserByHandle(String(params.handle)) || fail(404, 'User not found.');
  const offset = Math.max(0, Number(query.get('offset')) || 0);
  const rows = all(`SELECT u.*, a.label AS aff_label FROM affiliations a JOIN users u ON u.id = a.user_id
                    WHERE a.org_id = :o AND a.status = 'active' AND u.suspended = 0 AND u.deleted_at IS NULL
                    ORDER BY a.accepted_at DESC LIMIT :limit OFFSET :offset`, { o: org.id, limit: PAGE, offset });
  return { users: rows.map((u) => ({ ...publicUser(u, me.id), affiliationLabel: u.aff_label })), next: rows.length === PAGE ? offset + PAGE : null };
});

// Admins mark organizations.
route('PATCH', '/api/admin/users/:handle/org', ({ me, params, body }) => {
  if (me.role !== 'admin' && me.role !== 'moderator') fail(403, 'Staff only.');
  const ref = String(params.handle);
  const u = ref.startsWith('id:') ? get('SELECT * FROM users WHERE id = :id', { id: Number(ref.slice(3)) }) : localUserByHandle(ref);
  if (!u || u.domain) fail(404, 'Only local accounts can be organizations.');
  const on = !!body.org;
  tx(() => {
    run('UPDATE users SET is_org = :v WHERE id = :id', { v: on ? 1 : 0, id: u.id });
    if (!on) run('DELETE FROM affiliations WHERE org_id = :id', { id: u.id });
    else run('DELETE FROM affiliations WHERE user_id = :id', { id: u.id });
  });
  audit(me.id, on ? 'user.org' : 'user.unorg', `@${u.handle}`);
  return { ok: true, org: on };
}, { auth: true });

// ---------------------------------------------------------------- bots: tokens

export const TOKEN_SCOPES = ['read', 'write', 'messages'];
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Bearer-token authentication for the API. Returns { user, scopes, tokenId } or null.
export function tokenAuth(req) {
  const h = String(req.headers.authorization || '');
  const m = /^Bearer\s+(3tt_[A-Za-z0-9_-]{20,100})$/.exec(h);
  if (!m) return null;
  const row = get(`SELECT t.id AS token_id, t.scopes, t.last_used, u.* FROM api_tokens t JOIN users u ON u.id = t.user_id
                   WHERE t.token_hash = :h AND u.suspended = 0 AND u.deleted_at IS NULL AND u.domain IS NULL`, { h: hashToken(m[1]) });
  if (!row) fail(401, 'Invalid or revoked API token.');
  if (Date.now() - (row.last_used || 0) > 60_000) run('UPDATE api_tokens SET last_used = :t WHERE id = :id', { t: Date.now(), id: row.token_id });
  const { token_id, scopes, last_used, ...user } = row;
  return { user, scopes: scopes.split(',').filter(Boolean), tokenId: token_id };
}

// What a token may do. Account security and administration stay cookie-only.
export function checkTokenAccess(auth, method, path) {
  if (/^\/api\/(tokens|admin|me\/password|me\/sessions|me\/export|accounts|auth|passkeys)\b/.test(path) || (path === '/api/me' && method === 'DELETE')) {
    fail(403, 'API tokens can’t be used for this. Sign in on the website instead.');
  }
  const needs = path.startsWith('/api/conversations') ? 'messages' : method === 'GET' ? 'read' : 'write';
  if (!auth.scopes.includes(needs)) fail(403, `This token doesn’t have the “${needs}” scope.`);
  rateLimit(`token:${auth.tokenId}`, 600, 10 * 60_000);
}

route('GET', '/api/tokens', ({ me }) => ({
  tokens: all('SELECT id, name, scopes, prefix, created_at, last_used FROM api_tokens WHERE user_id = :me ORDER BY created_at DESC', { me: me.id })
    .map((t) => ({ id: t.id, name: t.name, scopes: t.scopes.split(','), prefix: t.prefix, createdAt: t.created_at, lastUsed: t.last_used })),
}));

route('POST', '/api/tokens', ({ me, body }) => {
  rateLimit(`tokens:${me.id}`, 20, 3600_000);
  const name = str(body.name, { name: 'Name', min: 1, max: 40 });
  const scopes = [...new Set((Array.isArray(body.scopes) ? body.scopes : ['read']).filter((s) => TOKEN_SCOPES.includes(s)))];
  if (!scopes.length) fail(400, 'Pick at least one scope.');
  if (get('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = :me', { me: me.id }).n >= 20) fail(400, 'You can have up to 20 tokens.');
  const token = `3tt_${crypto.randomBytes(30).toString('base64url')}`;
  const r = run('INSERT INTO api_tokens (user_id, name, scopes, token_hash, prefix, created_at) VALUES (:u, :n, :s, :h, :p, :t)',
    { u: me.id, n: name, s: scopes.join(','), h: hashToken(token), p: token.slice(0, 10), t: Date.now() });
  // The token itself is only ever shown in this response.
  return { token, id: Number(r.lastInsertRowid), name, scopes };
});

route('DELETE', '/api/tokens/:id', ({ me, params }) => {
  const r = run('DELETE FROM api_tokens WHERE id = :id AND user_id = :me', { id: Number(params.id) || 0, me: me.id });
  if (!r.changes) fail(404, 'Token not found.');
  return { ok: true };
});

// ---------------------------------------------------------------- bots: the "Automated" label

route('PATCH', '/api/me/bot', ({ me, body }) => {
  const bot = !!body.bot;
  let owner = null;
  if (bot && body.owner) {
    const handle = String(body.owner).trim().replace(/^@/, '');
    const o = localUserByHandle(handle);
    if (!o || o.suspended || o.deleted_at) fail(404, 'No account with that handle on this instance.');
    if (o.id === me.id) fail(400, 'A bot can’t be run by itself.');
    owner = o.handle;
  }
  run('UPDATE users SET is_bot = :b, bot_owner = :o WHERE id = :id', { b: bot ? 1 : 0, o: owner, id: me.id });
  return { user: publicUser(get('SELECT * FROM users WHERE id = :id', { id: me.id }), me.id) };
});
