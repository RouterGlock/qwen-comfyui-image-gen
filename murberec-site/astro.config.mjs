import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://murberec.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    sitemap({
      // The 404 and thank-you pages should never be indexed.
      filter: (page) => !/\/(404|thanks)$/.test(page),
    }),
  ],
});
