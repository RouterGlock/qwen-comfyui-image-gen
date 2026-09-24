import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// BASE_PATH=/murberec builds a private preview that lives in a subfolder of
// another site (see `npm run build:preview`). Normal builds leave it unset.
const base = process.env.BASE_PATH?.replace(/\/$/, '') || undefined;

export default defineConfig({
  site: 'https://murberec.com',
  base,
  // Folder-style pages (about/index.html) work on any web server; the root
  // build keeps Cloudflare's clean .html URLs.
  trailingSlash: base ? 'ignore' : 'never',
  build: { format: base ? 'directory' : 'file' },
  integrations: base
    ? []
    : [
        sitemap({
          // The 404 and thank-you pages should never be indexed.
          filter: (page) => !/\/(404|thanks)$/.test(page),
        }),
      ],
});
