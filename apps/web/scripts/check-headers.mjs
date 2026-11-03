// Fails the build when the security headers or the built page would break the Content-Security-Policy
// (spec 8.3): an inline script, a policy that allows too much, or an asset address the policy lacks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(import.meta.dirname, '..', 'dist');
const problems = [];

const headers = readFileSync(join(dist, '_headers'), 'utf8');
const policy = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(headers)?.[1];
if (policy === undefined) {
  problems.push('dist/_headers has no Content-Security-Policy line.');
} else {
  const directives = new Map(
    policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
  const need = (name, value) => {
    if (!directives.get(name)?.includes(value)) {
      problems.push(`CSP directive ${name} must include ${value}.`);
    }
  };
  const forbid = (name, value) => {
    if (directives.get(name)?.includes(value)) {
      problems.push(`CSP directive ${name} must not include ${value}.`);
    }
  };
  need('default-src', "'self'");
  need('script-src', "'self'");
  for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'", '*', 'data:', 'http:']) {
    forbid('script-src', unsafe);
    forbid('default-src', unsafe);
  }
  need('object-src', "'none'");
  need('base-uri', "'none'");
  need('frame-ancestors', "'none'");
  // The asset address, when art is not served from the site itself, must be allowed to load.
  const assetBase = process.env.VITE_ASSET_BASE_URL ?? '';
  if (assetBase.startsWith('https://')) {
    const origin = new URL(assetBase).origin;
    for (const name of ['img-src', 'media-src', 'connect-src']) {
      need(name, origin);
    }
  }
}

// A script written into the page itself would be blocked by the policy.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) {
  problems.push('dist/index.html has an inline <script>, which the policy blocks.');
}
if (/\son[a-z]+\s*=/i.test(html)) {
  problems.push('dist/index.html has an inline event handler, which the policy blocks.');
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Security headers: Content-Security-Policy checks passed.');
