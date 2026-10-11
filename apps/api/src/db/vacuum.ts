import { openDb, resolveDataDir } from './client.js';

// CLI entry for `pnpm --filter api db:vacuum`: reclaims free pages and
// refreshes the query planner's statistics. Safe to run while the api is up.
const dataDir = resolveDataDir();
const open = openDb(dataDir);
try {
  open.sqlite.exec('vacuum');
  open.sqlite.exec('analyze');
  console.log(`vacuumed ${open.path}`);
} finally {
  open.sqlite.close();
}
