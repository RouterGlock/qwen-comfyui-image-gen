/**
 * After `astro build` with BASE_PATH set, prefix the site's hand-written
 * root-relative links (href="/about", src="/clients/…", data-poster, form
 * action) with the base, so the whole site works from a subfolder such as
 * https://example.com/murberec. Astro already prefixes its own /_astro assets.
 */
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.BASE_PATH?.replace(/\/$/, '');
if (!base) { console.error('rebase: BASE_PATH is not set'); process.exit(1); }

const dist = join(process.cwd(), 'dist');
const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// An attribute value starting with a single "/" that isn't already under the base.
const attr = new RegExp(`(\\s(?:href|src|action|poster|data-poster)=")/(?!/)(?!${esc.slice(1)}(?:/|"))`, 'g');

let files = 0;
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) {
      const html = readFileSync(p, 'utf8');
      const out = html.replace(attr, `$1${base}/`);
      if (out !== html) { writeFileSync(p, out); files++; }
    }
  }
};
walk(dist);

// Cloudflare-only files and the robots file mean nothing inside a subfolder.
for (const f of ['_redirects', '_headers', 'robots.txt']) rmSync(join(dist, f), { force: true });
console.log(`rebase: ${files} pages rewritten for ${base}/`);
