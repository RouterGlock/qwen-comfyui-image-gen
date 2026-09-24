# murberec.com

Rebuild of the MURBEREC® website: a static [Astro](https://astro.build) site
with one Cloudflare Pages Function for the contact form.

**Before launch, work through [CONTENT-CHECKLIST.md](CONTENT-CHECKLIST.md)**:
it lists every fact the owner needs to confirm.

## Run it locally

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # static site into dist/
npm run check      # type-check pages and the form function
```

To test the contact form locally, run the built site with its function:

```sh
npm run build
npx wrangler pages dev dist   # http://localhost:8788
```

## Where things live

```
src/data/site.ts        contact details, stats, clients, testimonials, ticker, nav  <- edit this first
src/data/services.ts    the four service pages + Diagnose/Design/Embed copy
src/data/work.ts        case studies (each entry becomes /work/<slug>)
src/data/faq.ts         About page FAQ (also emitted as FAQPage structured data)
src/pages/              one file per page
src/components/         nav, footer, ticker, section header, CTA band, FAQ, hero art
src/styles/global.css   design tokens (colors, type scale, spacing) and shared styles
functions/api/contact.ts   form handler: validation, honeypot, Turnstile, email via Resend
public/_redirects       301s from the old Framer URLs
public/_headers         security + caching headers
xtudio-reel/            render + compose kit for the Xtudio "Content that inspires action" clips
```

Pages: `/`, `/services`, `/services/{leadership-development, learning-development,
change-management, product-design-delivery}`, `/xtudio`, `/work`, `/about`,
`/contact`, `/privacy`, `/thanks`, 404.

## Deploy (Cloudflare Pages)

1. Put this folder in its own GitHub repo (or point Pages at this folder as the root directory).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
   - Build command: `npm run build`
   - Output directory: `dist`
   - Root directory: `murberec-site` (only if it stays inside this repo)
3. **Form email**: create a free [Resend](https://resend.com) account, verify the
   `murberec.com` domain, then in Pages → Settings → Variables and secrets add:
   - `RESEND_API_KEY` (secret)
   - `CONTACT_TO`: the inbox that receives leads (comma-separate several)
   - `CONTACT_FROM`: e.g. `MURBEREC Website <web@murberec.com>`
4. **Spam protection (recommended)**: create a Turnstile widget in Cloudflare, then add
   - `TURNSTILE_SECRET_KEY` (secret, runtime)
   - `PUBLIC_TURNSTILE_SITE_KEY` (build-time variable; the widget appears on the form once set)
5. **Analytics**: add any of GA4/GTM, Plausible or Cloudflare Zaraz. The site already fires
   `cta_click`, `form_start`, `form_error` and `form_submit` to whichever is present
   (see `src/scripts/site.ts`).
6. Add the custom domain `murberec.com` in Pages, then move DNS off Framer.
   Afterwards: check that the old URLs 301 correctly, submit `https://murberec.com/sitemap-index.xml`
   in Google Search Console, and send a test lead through the form.

Until step 3 is done, the form tells visitors it's temporarily unavailable,
so leads are never silently lost.
