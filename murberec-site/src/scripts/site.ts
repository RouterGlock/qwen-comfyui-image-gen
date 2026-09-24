/**
 * Site-wide behavior: scroll reveals and analytics events.
 *
 * track() is provider-agnostic: it pushes to window.dataLayer (GTM / GA4)
 * and calls window.plausible or window.zaraz if either is on the page, so
 * the owner can pick an analytics tool without touching markup.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    plausible?: (event: string, opts?: { props?: Record<string, string> }) => void;
    zaraz?: { track: (event: string, props?: Record<string, string>) => void };
  }
}

export function track(event: string, props: Record<string, string> = {}) {
  (window.dataLayer ||= []).push({ event, ...props });
  window.plausible?.(event, { props });
  window.zaraz?.track(event, props);
}

// Any element with data-track="event_name" fires on click; data-track-* become props.
document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-track]');
  if (!el) return;
  const props: Record<string, string> = { path: location.pathname };
  for (const [k, v] of Object.entries(el.dataset)) {
    if (k.startsWith('track') && k !== 'track' && v) props[k.slice(5).toLowerCase()] = v;
  }
  track(el.dataset.track!, props);
});

// Reveal on scroll. CSS makes .reveal visible immediately under reduced motion.
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && reveals.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('is-in'));
}
