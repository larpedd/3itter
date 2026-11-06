// Content filter for handles, names, bios and (optionally) posts.
//
// Three rule types keep false positives low ("Scunthorpe problem"):
//   contains  - matched anywhere inside a word (only for terms with no innocent uses)
//   prefix    - the word starts with it ("fagg" catches "faggert", not the surname "Fagan")
//   word      - must be the whole word ("ass" but not "class"; "anal" but not "analysis")
// Text is normalised first: lower case, accents stripped, look-alike letters mapped,
// leetspeak decoded (f4gg0t), repeated letters collapsed (fuuuck), CamelCase split, and
// runs of 1-2 letter fragments joined (f.u.c.k).
import { getSetting } from './db.js';

const LISTS = {
  slurs: {
    contains: ['nigger', 'nigga', 'niggah', 'faggot', 'fagot', 'tranny', 'trannie', 'shemale', 'wetback', 'beaner', 'jigaboo',
      'porchmonkey', 'raghead', 'towelhead', 'zipperhead', 'golliwog', 'sandnigger', 'chingchong', 'kike', 'kyke',
      'heilhitler', 'siegheil', 'whitepower', 'gasthejews', 'killalljews', 'retarded'],
    prefix: ['nigg', 'fagg', 'retard', 'tranni', 'trann'],
    word: ['fag', 'fags', 'dyke', 'dykes', 'chink', 'chinks', 'gook', 'gooks', 'spic', 'spics', 'spick', 'coon', 'coons', 'paki', 'pakis',
      'tard', 'tards', 'wop', 'dago', 'mongoloid', 'kkk', 'nazi', 'nazis', 'hitler', 'sambo', 'negroid', 'gyp', 'rape', 'rapist', 'rapists'],
  },
  profanity: {
    contains: ['fuck', 'fuk', 'fcuk', 'motherf', 'shit', 'bitch', 'cunt', 'asshole', 'arsehole', 'dumbass', 'jackass', 'bastard', 'dickhead',
      'cocksucker', 'wanker', 'twat', 'whore', 'slut', 'bullshit', 'dipshit', 'shithead', 'assclown', 'douchebag', 'jizz'],
    prefix: ['fuck', 'fck'],
    word: ['ass', 'asses', 'arse', 'dick', 'dicks', 'cock', 'cocks', 'prick', 'pricks', 'piss', 'hoe', 'hoes', 'thot', 'thots', 'fck', 'fk', 'stfu', 'gtfo', 'wtf', 'kys'],
  },
  sexual: {
    contains: ['porn', 'pornhub', 'xvideos', 'xhamster', 'onlyfans', 'hentai', 'nsfw', 'xxx', 'boobs', 'boobies', 'titties', 'titty', 'pussy',
      'penis', 'vagina', 'dildo', 'cumshot', 'creampie', 'milf', 'horny', 'blowjob', 'handjob', 'rimjob', 'orgasm', 'erotic', 'fetish',
      'bdsm', 'camgirl', 'sexcam', 'pedophil', 'paedophil', 'incest', 'zoophil', 'bestiality', 'beastiality', 'nudes', 'sexting', 'gangbang',
      'deepthroat', 'masturbat', 'ejaculat', 'clitoris', 'pedobear', 'lolicon', 'shotacon', 'ahegao', 'rule34'],
    prefix: ['pedo', 'paedo'],
    word: ['sex', 'sexy', 'sext', 'nude', 'naked', 'tits', 'tit', 'boob', 'cum', 'cums', 'anal', 'anus', 'escort', 'escorts', 'loli', 'lolis',
      'shota', 'smut', 'lewd', 'stripper', 'hooker', 'hookers', 'nsfl'],
  },
};

// Innocent words that a rule above would otherwise catch.
const ALLOW = new Set(['scunthorpe', 'penistone', 'niggle', 'niggles', 'niggling', 'retardant', 'retardation', 'shiitake', 'shitake',
  'cocktail', 'cockatoo', 'cockpit', 'cockroach', 'peacock', 'hancock', 'babcock', 'woodcock', 'shuttlecock', 'cocker', 'pussycat',
  'pussywillow', 'pedometer', 'pedometers', 'pedology', 'cumin', 'cumbria', 'cumulus', 'cumberland', 'grape', 'grapes', 'drape', 'scrape',
  'therapist', 'therapists', 'analysis', 'analyst', 'canal', 'stripe', 'striped', 'stripes', 'essex', 'sussex', 'middlesex', 'sextant', 'sexton',
  'titan', 'titanic', 'titanium', 'title', 'titles', 'titmouse', 'twatt', 'bastardise', 'expensive', 'spice', 'spicy', 'raccoon', 'cocoon',
  'tycoon', 'buckfast', 'dickens', 'dickinson', 'mishit', 'hitchcock', 'xxxl', 'gored']);

// Handles nobody can register (impersonation, system words). Matched after removing digits and underscores.
const RESERVED = new Set(['admin', 'administrator', 'admins', 'root', 'system', 'sysadmin', 'moderator', 'moderators', 'mod', 'mods', 'staff',
  'support', 'help', 'helpdesk', 'security', 'abuse', 'official', 'team', 'owner', 'operator', 'webmaster', 'postmaster', 'hostmaster',
  'noreply', 'info', 'contact', 'legal', 'privacy', 'terms', 'api', 'www', 'mail', 'email', 'null', 'undefined', 'anonymous',
  'everyone', 'here', 'all', 'deleted', 'suspended', 'verified', 'trust', 'safety', 'trustandsafety', '3itter', 'itter', 'orbit', 'twitter', 'x']);

// ---------------------------------------------------------------- normalisation

const HOMOGLYPHS = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g',
  'ı': 'i', 'ℓ': 'l', 'α': 'a', 'ο': 'o', 'ν': 'v', 'κ': 'k', 'τ': 't', 'ϲ': 'c', 'ß': 'ss' };
const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e', '£': 'l', '+': 't' };

function baseNormalize(text) {
  return String(text || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')           // strip accents
    .replace(/[​-‏⁠﻿­]/g, '')              // zero-width characters
    .replace(/[^\u0000-\u007f]/g, (c) => HOMOGLYPHS[c.toLowerCase()] ?? c);
}

// Words of a text, with CamelCase split ("BitchFaggot" -> bitch, faggot) and tiny fragments joined ("f.u.c.k" -> fuck).
function words(text, leet, joinAll) {
  let s = baseNormalize(text).replace(/([a-z])([A-Z])/g, '$1 $2');
  if (leet) s = s.replace(/[0-9@$!|€£+]/g, (c) => LEET[c] ?? c);
  const raw = s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const out = [];
  let run = '';
  for (const w of raw) {
    if (w.length <= 2) { run += w; continue; }
    if (run) { out.push(run); run = ''; }
    out.push(w);
  }
  if (run) out.push(run);
  // Handles only: everything squashed together catches separator tricks like "fa_ggot".
  // (Not used for display names, where "Pass Hit" would otherwise read as "passhit".)
  const joined = raw.join('');
  if (joinAll && joined && !out.includes(joined) && raw.length > 1) out.push(joined);
  return out;
}

const collapse = (w) => w.replace(/(.)\1+/g, '$1');

// ---------------------------------------------------------------- matching

function settingsLists() {
  const lines = (key) => getSetting(key, '').split(/[\n,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return { custom: lines('filter_custom'), allow: new Set(lines('filter_allow')) };
}

// The repeated-letter check ("fuuuck") only applies to terms without double letters of their own;
// otherwise "fagg" would shrink to "fag" (matching Fagan), "xxx" to "x" and "ass" to "as".
const plain = (t) => collapse(t) === t;
function matchWord(w, list) {
  const c = collapse(w);
  for (const t of list.word) if (w === t || (plain(t) && c === t)) return t;
  for (const t of list.prefix) if (w.startsWith(t) || (plain(t) && c.startsWith(t))) return t;
  for (const t of list.contains) if (w.includes(t) || (plain(t) && c.includes(t))) return t;
  return null;
}

// Returns { category, term } for the first match, or null. `categories` is a subset of ['slurs', 'profanity', 'sexual'].
export function findBlocked(text, categories = ['slurs', 'profanity', 'sexual'], { handle = false } = {}) {
  if (!text) return null;
  const { custom, allow } = settingsLists();
  const seen = new Set();
  for (const leet of [false, true]) {
    for (const w of words(text, leet, handle)) {
      if (seen.has(w)) continue;
      seen.add(w);
      if (ALLOW.has(w) || allow.has(w)) continue;
      for (const cat of categories) {
        const t = matchWord(w, LISTS[cat]);
        if (t) return { category: cat, term: t };
      }
      for (const t of custom) if (w.includes(t.replace(/[^a-z0-9]/g, ''))) return { category: 'custom', term: t };
    }
  }
  return null;
}

export function isReservedHandle(handle) {
  const h = String(handle || '').toLowerCase();
  const bare = h.replace(/[0-9_]+/g, '');
  const extra = new Set(getSetting('filter_reserved', '').split(/[\n,]/).map((x) => x.trim().toLowerCase().replace(/^@/, '')).filter(Boolean));
  return RESERVED.has(h) || RESERVED.has(bare) || extra.has(h) || extra.has(bare);
}

// Where each check applies; admins can widen post filtering in Admin → Instance.
export function filterConfig() {
  return {
    posts: getSetting('filter_posts', 'off'),       // off | slurs | all
    bios: getSetting('filter_bios', 'slurs'),       // off | slurs | all
  };
}
const CATS = { slurs: ['slurs'], all: ['slurs', 'profanity', 'sexual'], off: [] };
export const categoriesFor = (level) => CATS[level] || [];

const LABEL = { slurs: 'slurs or hate speech', profanity: 'profanity', sexual: 'adult content', custom: 'blocked words' };
export const reasonLabel = (hit) => LABEL[hit.category] || 'blocked words';
