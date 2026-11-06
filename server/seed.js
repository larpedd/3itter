// Seeds demo accounts and posts on first run so the feed is not empty.
// Demo accounts have an unusable password hash ("!"), so nobody can log in as them.
import { get, run, tx } from './db.js';

const USERS = [
  { handle: '3itter', name: '3itter', bio: 'The official account. Shapes, springs and good vibes. ✦', shape: 'sunny', hue: 285, verified: 1 },
  { handle: 'ada_builds', name: 'Ada Moreno', bio: 'Design engineer. I make buttons squish. #m3expressive', shape: 'cookie9', hue: 330, location: 'Lisbon' },
  { handle: 'kofi', name: 'Kofi Mensah', bio: 'Photographer & trail runner. Mostly mountains.', shape: 'clover4', hue: 150, location: 'Accra' },
  { handle: 'mei_lin', name: 'Mei Lin', bio: 'Type nerd. Variable fonts changed my life.', shape: 'flower', hue: 20, location: 'Taipei' },
  { handle: 'jonas', name: 'Jonas Berg', bio: 'Backend person. SQLite enjoyer. Coffee-powered.', shape: 'squircle', hue: 220, location: 'Oslo' },
  { handle: 'priya', name: 'Priya Raman', bio: 'Product manager by day, synth noodler by night 🎹', shape: 'cookie6', hue: 50, location: 'Bengaluru' },
  { handle: 'sam_draws', name: 'Sam Okafor', bio: 'Illustrator. Drawing one blob a day until I run out of blobs.', shape: 'burst', hue: 0 },
  { handle: 'lena', name: 'Lena Fischer', bio: 'Motion designer. Everything should have a little bounce.', shape: 'pentagon', hue: 265, location: 'Berlin', verified: 1 },
];

const POSTS = [
  ['3itter', 'Welcome to 3itter 👋 A tiny social space built with Material 3 Expressive: springy motion, morphing shapes and bold type. Say hi! #hello'],
  ['ada_builds', 'Hot take: a button that changes shape when you press it is more honest than one that just changes colour. #m3expressive'],
  ['lena', 'Spring physics > cubic-bezier. Fight me. Damping 0.8, stiffness 380 is my comfort zone. #motion'],
  ['kofi', 'Sunrise run up the ridge this morning. Legs: destroyed. Soul: restored. #trailrunning'],
  ['mei_lin', 'Roboto Flex at wdth 125 and wght 800 for headlines. Chef’s kiss. #typography'],
  ['jonas', 'Shipped a whole backend today with zero npm dependencies. node:sqlite is genuinely good now.'],
  ['priya', 'Roadmap meeting went 40 minutes over. We decided to have fewer meetings. 🙃'],
  ['sam_draws', 'Blob #212: a clover that thinks it is a cookie. #dailyblob'],
  ['ada_builds', 'Button groups where the pressed button grows and its neighbours shrink. Tiny detail, huge delight. #m3expressive'],
  ['lena', 'Rule of thumb: spatial springs can overshoot, effect springs (colour, opacity) should not. #motion'],
  ['mei_lin', 'Emphasized type styles are not just "make it bold". It is about hierarchy and rhythm. #typography'],
  ['kofi', 'Golden hour in the valley. Sometimes the light does all the work. #photography'],
  ['jonas', 'WAL mode on SQLite is the easiest performance win you will ever ship.'],
  ['priya', 'Synth patch of the day: slow attack, long release, a little chorus. Instant nostalgia 🎹'],
  ['3itter', 'Tip: you can pick your avatar shape in Edit profile. Cookie, clover, sunny, flower… find your shape. ✦'],
  ['sam_draws', 'Drew all 35 shapes from the M3 shape library. My hand hurts but it was worth it. #dailyblob'],
  ['lena', 'Loading indicators that morph between shapes are oddly hypnotic. Could watch them all day. #motion'],
  ['ada_builds', 'Reminder that rounded corners scale: 4, 8, 12, 16, 20, 28, 32, 48. Use the tokens, not vibes.'],
  ['kofi', 'Packed for the weekend: 2 lenses, 1 tent, 0 regrets. #trailrunning'],
  ['mei_lin', 'Kerning is just personal space for letters.'],
];

const REPLIES = [
  [2, 'lena', 'Agreed! Shape change gives real tactile feedback.'],
  [2, 'jonas', 'As long as it does not shift the layout, I am in.'],
  [3, 'ada_builds', 'The overshoot on fast spatial springs is the secret sauce.'],
  [1, 'kofi', 'Hello! Love the bouncy buttons already.'],
  [1, 'mei_lin', 'The headline type here is so good.'],
  [6, 'priya', 'Teach me your ways.'],
  [5, 'sam_draws', 'Width axis is so underrated!'],
];

const FOLLOWS = {
  '3itter': ['ada_builds', 'lena', 'mei_lin'],
  ada_builds: ['3itter', 'lena', 'mei_lin', 'jonas'],
  kofi: ['3itter', 'sam_draws', 'priya'],
  mei_lin: ['3itter', 'ada_builds', 'lena'],
  jonas: ['3itter', 'ada_builds', 'priya'],
  priya: ['3itter', 'jonas', 'kofi'],
  sam_draws: ['3itter', 'mei_lin', 'kofi', 'lena'],
  lena: ['3itter', 'ada_builds', 'sam_draws'],
};

export function seed() {
  if (process.env.SEED === '0' || get('SELECT COUNT(*) AS n FROM users').n > 0) return;
  const now = Date.now();
  const HOUR = 3600_000;
  tx(() => {
    const ids = {};
    USERS.forEach((u, i) => {
      const r = run(
        `INSERT INTO users (handle, name, bio, location, password_hash, avatar_shape, hue, verified, created_at)
         VALUES (:handle, :name, :bio, :location, '!', :shape, :hue, :verified, :t)`,
        { handle: u.handle, name: u.name, bio: u.bio, location: u.location || '', shape: u.shape, hue: u.hue, verified: u.verified || 0, t: now - (90 - i) * 24 * HOUR },
      );
      ids[u.handle] = Number(r.lastInsertRowid);
    });
    for (const [a, list] of Object.entries(FOLLOWS)) {
      for (const b of list) run('INSERT INTO follows VALUES (:a, :b, :t)', { a: ids[a], b: ids[b], t: now });
    }
    const postIds = [];
    POSTS.forEach(([h, text], i) => {
      const t = now - (POSTS.length - i) * 2.7 * HOUR;
      const r = run('INSERT INTO posts (author_id, text, created_at) VALUES (:a, :text, :t)', { a: ids[h], text, t });
      postIds.push(Number(r.lastInsertRowid));
    });
    for (const [n, h, text] of REPLIES) {
      const parent = postIds[n - 1];
      run('INSERT INTO posts (author_id, text, reply_to, created_at) VALUES (:a, :text, :p, :t)',
        { a: ids[h], text, p: parent, t: now - Math.random() * 20 * HOUR });
    }
    // Sprinkle likes and reposts with a deterministic pattern.
    const handles = Object.keys(ids);
    postIds.forEach((pid, i) => {
      handles.forEach((h, j) => {
        if ((i * 7 + j * 3) % 5 < 2) run('INSERT OR IGNORE INTO likes VALUES (:u, :p, :t)', { u: ids[h], p: pid, t: now });
        if ((i * 5 + j * 11) % 13 === 0) run('INSERT OR IGNORE INTO reposts VALUES (:u, :p, :t)', { u: ids[h], p: pid, t: now - i * HOUR });
      });
    });
  });
  console.log('Seeded demo content.');
}
