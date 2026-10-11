import { currentDataDir } from '../config.js';
import { migrateDb, openDb } from './client.js';

// CLI entry for `pnpm --filter api db:migrate`.
const dataDir = currentDataDir();
console.log(`data dir: ${dataDir}`);
const open = openDb(dataDir);
try {
  const version = migrateDb(open);
  console.log(`database: ${open.path}`);
  console.log(`migration version: ${version ?? 'none'}`);
} finally {
  open.sqlite.close();
}
