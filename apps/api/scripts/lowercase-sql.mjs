// Lowercases everything outside quotes in the generated migrations, so SQL
// keywords follow the house style. Run by `db:generate` before a migration is
// ever applied; never run it on a migration that a database has already seen.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../drizzle/', import.meta.url);

function lowercaseOutsideQuotes(sql) {
  return sql.replace(/(`[^`]*`|'(?:[^']|'')*'|"[^"]*")|([^`'"]+)/g, (_, quoted, plain) =>
    quoted !== undefined ? quoted : plain.toLowerCase(),
  );
}

for (const name of readdirSync(dir)) {
  if (!name.endsWith('.sql')) continue;
  const file = new URL(name, dir);
  const before = readFileSync(file, 'utf8');
  const after = lowercaseOutsideQuotes(before);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`lowercased ${name}`);
  }
}
