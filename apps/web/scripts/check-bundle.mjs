// Fails the build when the JavaScript the browser must download grows past the budget.
// Mobile load time depends on this number, so it is checked on every build (spec 8.1).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BYTES_PER_KB = 1024;
const assetsDir = join(import.meta.dirname, '..', 'dist', 'assets');
const { maxGzipKb } = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'bundle-budget.json'), 'utf8'),
);

const files = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
let totalBytes = 0;
for (const name of files) {
  const gzipBytes = gzipSync(readFileSync(join(assetsDir, name))).length;
  totalBytes += gzipBytes;
  console.log(`${name}: ${(gzipBytes / BYTES_PER_KB).toFixed(1)} kB gzip`);
}
const totalKb = totalBytes / BYTES_PER_KB;
console.log(`Total JavaScript: ${totalKb.toFixed(1)} kB gzip (budget ${maxGzipKb} kB)`);
if (totalKb > maxGzipKb) {
  console.error(
    'Bundle budget exceeded. Split the code, drop a dependency, or raise the budget on purpose.',
  );
  process.exit(1);
}
