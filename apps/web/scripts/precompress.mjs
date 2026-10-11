// Writes a .gz and a .br next to each text file in dist, so the api can serve
// them as they are instead of sending the bundle uncompressed over the LAN.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const TEXT = new Set(['.js', '.css', '.html', '.svg', '.json', '.map']);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

let count = 0;
for (const path of files(dist)) {
  if (!TEXT.has(extname(path))) continue;
  const raw = readFileSync(path);
  writeFileSync(`${path}.gz`, gzipSync(raw, { level: 9 }));
  writeFileSync(
    `${path}.br`,
    brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
  );
  count++;
}
console.log(`precompressed ${count} files in dist`);
