// Fails the build when the JavaScript the browser must download to open the page grows past the
// budget. Mobile load time depends on this number, so it is checked on every build (spec 8.1).
// Only the page's first download counts. Code that loads later, only when the temple's manifest
// names a model or picture (the loaders and the decoders), is listed but not counted.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BYTES_PER_KB = 1024;
const dist = join(import.meta.dirname, '..', 'dist');
const { maxGzipKb } = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'bundle-budget.json'), 'utf8'),
);

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const firstLoad = new Set(
  [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.js)"/g)].map((match) => match[1]),
);

const gzipKb = (file) => gzipSync(readFileSync(join(dist, file))).length / BYTES_PER_KB;
let totalKb = 0;
for (const name of readdirSync(join(dist, 'assets')).filter((file) => file.endsWith('.js'))) {
  const file = `assets/${name}`;
  const kb = gzipKb(file);
  const counted = firstLoad.has(file);
  totalKb += counted ? kb : 0;
  console.log(`${name}: ${kb.toFixed(1)} kB gzip${counted ? '' : ' (loaded later, not counted)'}`);
}
console.log(`First-load JavaScript: ${totalKb.toFixed(1)} kB gzip (budget ${maxGzipKb} kB)`);
if (firstLoad.size === 0) {
  console.error('Found no scripts in dist/index.html, so the budget cannot be checked.');
  process.exit(1);
}
if (totalKb > maxGzipKb) {
  console.error(
    'Bundle budget exceeded. Split the code, drop a dependency, or raise the budget on purpose.',
  );
  process.exit(1);
}
