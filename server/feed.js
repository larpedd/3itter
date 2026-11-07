// "For you" timeline.
//
// 1. Candidates: recent top-level posts (two weeks, or the latest 1500 when the instance is quiet).
// 2. Signals per post: likes, reposts, replies, quotes and views; how many people you follow liked or
//    reposted it; whether you follow the author and how often you've interacted with them lately.
// 3. Score = engagement × affinity × freshness, with small boosts for media and brand-new posts and a
//    penalty for posts you've already liked or reposted.
// 4. Diversity: each further post by the same author in a row of results is damped, so one account
//    can't take over the feed.
// 5. Stable paging: the ranked list is computed once (page 1) and kept for a while, so later pages
//    continue the same order instead of reshuffling (no duplicates or gaps).

import { all } from './db.js';
import { hiddenIds } from './core.js';

const HOUR = 3600_000;
const SNAPSHOT_TTL = 20 * 60_000;
const snapshots = new Map(); // userId -> { ids, at }

function candidates(me, now) {
  const params = { me, since: now - 14 * 24 * HOUR };
  const sql = (where) => `
    WITH cand AS (
      SELECT p.id, p.author_id, p.created_at, p.views, (p.image IS NOT NULL OR p.video IS NOT NULL) AS media,
             COALESCE(p.fed_likes, 0) AS fl, COALESCE(p.fed_reposts, 0) AS fr, p.quote_of
      FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.deleted = 0 AND p.reply_to IS NULL AND u.suspended = 0 AND u.deleted_at IS NULL ${where}
      ORDER BY p.created_at DESC LIMIT 1500
    ), myf AS (SELECT followee_id AS id FROM follows WHERE follower_id = :me)
    SELECT c.*,
      MAX((SELECT COUNT(*) FROM likes l WHERE l.post_id = c.id), c.fl) AS likes,
      MAX((SELECT COUNT(*) FROM reposts r WHERE r.post_id = c.id), c.fr) AS reposts,
      (SELECT COUNT(*) FROM posts x WHERE x.reply_to = c.id AND x.deleted = 0) AS replies,
      (SELECT COUNT(*) FROM posts q WHERE q.quote_of = c.id AND q.deleted = 0) AS quotes,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = c.id AND l.user_id IN (SELECT id FROM myf))
        + 2 * (SELECT COUNT(*) FROM reposts r WHERE r.post_id = c.id AND r.user_id IN (SELECT id FROM myf)) AS social,
      EXISTS(SELECT 1 FROM myf WHERE id = c.author_id) AS followed,
      EXISTS(SELECT 1 FROM likes WHERE post_id = c.id AND user_id = :me)
        OR EXISTS(SELECT 1 FROM reposts WHERE post_id = c.id AND user_id = :me) AS engaged
    FROM cand c`;
  let rows = all(sql('AND p.created_at > :since'), params);
  if (rows.length < 60) rows = all(sql(''), { me }); // quiet instance: look further back
  return rows;
}

// How much you've interacted with each author over the last 30 days (likes, reposts, replies).
function affinities(me, now) {
  const rows = all(`
    SELECT author_id AS a, COUNT(*) AS n FROM (
      SELECT p.author_id FROM likes l JOIN posts p ON p.id = l.post_id WHERE l.user_id = :me AND l.created_at > :since
      UNION ALL SELECT p.author_id FROM reposts r JOIN posts p ON p.id = r.post_id WHERE r.user_id = :me AND r.created_at > :since
      UNION ALL SELECT t.author_id FROM posts mine JOIN posts t ON t.id = mine.reply_to
        WHERE mine.author_id = :me AND mine.created_at > :since AND mine.deleted = 0
    ) GROUP BY author_id`, { me, since: now - 30 * 24 * HOUR });
  return new Map(rows.map((r) => [r.a, r.n]));
}

function rank(me) {
  const now = Date.now();
  const hidden = hiddenIds(me);
  const affinity = affinities(me, now);
  const scored = [];
  for (const r of candidates(me, now)) {
    if (hidden.has(r.author_id)) continue;
    const ageH = Math.max(0, (now - r.created_at) / HOUR);
    const engagement = 1 + r.likes + 2 * r.reposts + 2.5 * r.replies + 1.5 * r.quotes + Math.min(r.views, 500) * 0.02;
    let boost = 1;
    if (r.author_id === me) boost *= 0.7;                                 // you've seen your own posts
    else if (r.followed) boost *= 2.2;                                     // people you follow
    boost *= 1 + Math.min(r.social, 10) * 0.35;                            // liked/reposted by people you follow
    boost *= 1 + Math.log1p(affinity.get(r.author_id) || 0) * 0.45;        // accounts you interact with
    if (r.media) boost *= 1.1;
    if (r.quote_of) boost *= 1.05;
    if (r.engaged) boost *= 0.45;                                          // already liked/reposted it
    if (ageH < 1) boost *= 1.4;                                            // give brand-new posts a chance
    const freshness = (ageH + 2) ** -1.35;
    scored.push({ id: r.id, author: r.author_id, s: Math.log1p(engagement) * 3 * boost * freshness + boost * freshness });
  }
  scored.sort((a, b) => b.s - a.s);

  // Diversity: re-pick greedily, damping each extra post from an author already shown recently.
  const out = [];
  const pool = scored.slice(0, 600);
  const recent = new Map();
  while (pool.length) {
    let best = 0;
    let bestScore = -1;
    for (let i = 0; i < Math.min(pool.length, 40); i++) {
      const seen = recent.get(pool[i].author) || 0;
      const s = pool[i].s * 0.55 ** seen;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    const [pick] = pool.splice(best, 1);
    out.push(pick.id);
    recent.set(pick.author, (recent.get(pick.author) || 0) + 1);
    // Forget authors gradually, so they can come back further down.
    if (out.length % 10 === 0) for (const [k, v] of recent) recent.set(k, Math.max(0, v - 1));
  }
  return out;
}

// Ranked post ids for a page. Page 1 (offset 0) always re-ranks; later pages reuse that ranking.
export function forYouIds(me, offset, limit) {
  let snap = snapshots.get(me);
  if (offset === 0 || !snap || Date.now() - snap.at > SNAPSHOT_TTL) {
    snap = { ids: rank(me), at: Date.now() };
    snapshots.set(me, snap);
    if (snapshots.size > 5000) snapshots.delete(snapshots.keys().next().value);
  }
  const ids = snap.ids.slice(offset, offset + limit);
  return { ids, next: offset + limit < snap.ids.length ? offset + limit : null };
}
