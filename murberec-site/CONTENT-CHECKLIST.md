# MURBEREC® site: what the owner needs to confirm

The site is built so that **nothing unverified is shown**. Wherever a real
fact is missing (phone, address, client logos, case studies), that element is
hidden rather than filled with placeholder data. Fill in the items below and
they appear automatically.

Almost everything lives in **`src/data/site.ts`**. Search the repo for
`TODO(owner)` to find every spot.

## Needed before launch

| # | Item | Where | Why it matters |
|---|---|---|---|
| 1 | **Real street address** (the old site said "Alexandria, **NY**") | `site.ts` → `address` | Shown in footer + Google business data (JSON-LD). Hidden until set. |
| 2 | **Real phone number** (old one was a fake 555 number) | `site.ts` → `phone` | Becomes a tap-to-call `tel:` link. Hidden until set. |
| 3 | ~~Public email~~ Done: info@murberec.com, from the current site | `site.ts` → `email` | Shown as a `mailto:` link in footer, contact page, privacy page. |
| 4 | **Where form leads go** | Cloudflare env var `CONTACT_TO` | See README → Deploy. |
| 5 | **Confirm the impact stats** (taken from the current site): 1M+ learners across four continents; 1st global Gen-AI readiness program for the world's largest engineering firm; 1st scalable global leadership infrastructure for a Big Three record label group | `site.ts` → `stats` | Shown on Home and About. The incomplete "record-breaking in the regulatory landscape" item was left out. |
| 6 | **Review the remaining draft copy**. Home, Xtudio, Contact, the service taglines/descriptions/focus areas and the footer now use the current site's own words. Still drafts: each service page's "when teams call us", phase and deliverables sections; the About page (the live `/about-us` currently shows a broken WordPress template); the FAQ | `src/data/services.ts`, `src/pages/about.astro`, `src/data/faq.ts` | It should sound like Marc. |
| 7 | **Privacy policy** legal review | `src/pages/privacy.astro` | Required because the form collects personal data. |
| 8 | ~~Official name~~ Done: "Xtudio™", matching his logo. ® is only for registered trademarks | Global | Switch to ® only if the mark is registered. |

## Makes it much stronger (can follow launch)

| # | Item | Where |
|---|---|---|
| 9 | ~~Client logos~~ Done: the 12 original logo files from the current site, auto-scrolling on Home | `public/clients/`, `site.ts` → `clients` |
| 10 | **2–4 case studies**: problem → approach → measurable result | `src/data/work.ts` (commented example inside). Home teaser + `/work/[slug]` pages appear automatically. |
| 11 | **Testimonials**: quote, name, role, company (with permission) | `site.ts` → `testimonials`. Section appears on Home. |
| 12 | ~~Xtudio triptych~~ Done: all 3 clips rendered and live on the Xtudio page | `xtudio-reel/`, `public/xtudio/` | |
| 12b | **Xtudio reel videos** (poster image + video file/URL each) | `reels` array in `src/pages/xtudio.astro`. Replaces the "request the reel" block and the old "01 / FILM" placeholders. |
| 13 | **Social profile URLs** (LinkedIn etc.) | `site.ts` → `social` |
| 14 | **MURBEREC® logo**: new "synapse M" mark chosen by Marc (concept 1, take 4) and redrawn as vector. It's in the nav, favicon, home-screen icon, link-preview image and structured data. Final files: `brand-logo/final/` (SVG, light/dark). Still a candidate: re-run concepts if he wants to explore further. The Xtudio logo is redrawn; an original vector would be even better | `brand-logo/final/`, `public/brand/` |
| 15 | **Founder / team** section, if wanted on About | `src/pages/about.astro` |

## Audit fixes already done

- **Credibility:** wrong NY address and fake 555 phone removed (hidden until real ones are set); phone/email render as `tel:`/`mailto:` links; all typos from the audit gone ("ABout Us", "&DELIVERY", "andmeaningful", "performance..", "Str."); section numbers are generated in order on every page, so they can't repeat or skip; decorative "© 2026" labels removed; "Let's Converse" added to the footer; one consistent "Xtudio®".
- **SEO:** one `<h1>` per page and real `<h2>`/`<h3>` hierarchy; unique title and description on every page, written around search terms ("neuroscience-based leadership development", "custom learning experience design", "change management consulting"…); JSON-LD `Organization` + `ProfessionalService` sitewide, `BreadcrumbList` on inner pages, `FAQPage` on About, `Service` on each service page; FAQ answers are plain crawlable HTML; `sitemap-index.xml`, `robots.txt`, canonical URLs, Open Graph image.
- **Redirects:** `/x-studio` → `/xtudio`, `/about-us` → `/about`, `/lets-converse` → `/contact` (301s in `public/_redirects`).
- **Accessibility:** zero axe WCAG 2.2 AA violations on every page at 375px and 1440px; skip link; visible focus rings; keyboard-operable menu (Esc closes), audience picker and FAQ; real `<label>`s, inline error messages and a polite live region on the form; ticker and all animation respect `prefers-reduced-motion`.
- **Lead gen:** one primary CTA ("Book a 30-min discovery call") repeated in nav, hero, every page's closing band and footer; working form endpoint with honeypot + optional Cloudflare Turnstile; thank-you state (and a `/thanks` page for no-JS); analytics events `cta_click`, `form_start`, `form_error`, `form_submit`; privacy policy page.
- **Performance:** Lighthouse mobile 100 / 100 / 100 / 100 on Home, About, Xtudio and a service page; LCP 1.2–1.4s, CLS 0. Fonts cut from 4 families to 2, self-hosted, with the main one preloaded.
