// Admin command line: npm run admin -- <command> <handle>
//   promote <handle>    make an account an admin
//   moderator <handle>  make an account a moderator
//   demote <handle>     back to a regular user
//   verify <handle> / unverify <handle>
//   unsuspend <handle>
//   list                list staff accounts
import { get, run, all } from './db.js';
import { audit } from './core.js';

const [cmd, handle] = process.argv.slice(2);
const user = () => {
  const u = get('SELECT * FROM users WHERE handle = :h AND domain IS NULL AND deleted_at IS NULL', { h: String(handle || '').replace(/^@/, '') });
  if (!u) { console.error(`No local account @${handle}`); process.exit(1); }
  return u;
};
const actions = {
  promote: () => run(`UPDATE users SET role = 'admin' WHERE id = :id`, { id: user().id }),
  moderator: () => run(`UPDATE users SET role = 'moderator' WHERE id = :id`, { id: user().id }),
  demote: () => run(`UPDATE users SET role = 'user' WHERE id = :id`, { id: user().id }),
  verify: () => run('UPDATE users SET verified = 1 WHERE id = :id', { id: user().id }),
  unverify: () => run('UPDATE users SET verified = 0 WHERE id = :id', { id: user().id }),
  unsuspend: () => run('UPDATE users SET suspended = 0 WHERE id = :id', { id: user().id }),
  list: () => console.table(all(`SELECT handle, role, verified, suspended FROM users WHERE role != 'user' OR verified = 1`)),
};
if (!actions[cmd]) {
  console.log('Usage: npm run admin -- <promote|moderator|demote|verify|unverify|unsuspend> <handle>  |  npm run admin -- list');
  process.exit(cmd ? 1 : 0);
}
actions[cmd]();
if (handle) { audit(null, `cli.${cmd}`, `@${handle}`); console.log(`Done: ${cmd} @${handle}`); }
