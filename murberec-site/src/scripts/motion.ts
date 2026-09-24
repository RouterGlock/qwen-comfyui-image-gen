/**
 * Scroll motion: Lenis smooth scroll, hero pin + fade, [data-bleed] exits,
 * staggered reveals and the LightField canvases. Everything scroll-driven runs
 * off one self-scheduling rAF loop (see pump()), never per-effect listeners.
 * Under prefers-reduced-motion none of it starts and CSS shows all content.
 */
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { motion } from './motion.config';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(hover: none), (pointer: coarse)').matches;
const nav = navigator as Navigator & { deviceMemory?: number };
const weak = (nav.hardwareConcurrency || 8) <= 2 || (nav.deviceMemory || 8) <= 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const root = document.documentElement;

/* ---------- Reveals ---------- */
const cssTime = (name: string) => {
  const v = getComputedStyle(root).getPropertyValue(name).trim();
  return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000 || 0;
};
const revealMs = cssTime('--reveal-duration');
const staggerMs = cssTime('--reveal-stagger');

// Siblings inside a [data-stagger] group enter one after another.
document.querySelectorAll('[data-stagger]').forEach((group) => {
  group.querySelectorAll<HTMLElement>('.reveal').forEach((el, i) => el.style.setProperty('--i', String(i)));
});

const reveals = document.querySelectorAll<HTMLElement>('.reveal');
const settle = (el: HTMLElement) => {
  el.classList.add('is-in');
  // Drop the entrance transition once it has played, so bleed tracks scroll 1:1.
  const i = Math.min(Number(el.style.getPropertyValue('--i')) || 0, 8);
  setTimeout(() => el.classList.add('is-settled'), revealMs + i * staggerMs + 60);
};
if (reduce || !('IntersectionObserver' in window)) {
  reveals.forEach((el) => el.classList.add('is-in', 'is-settled'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { settle(e.target as HTMLElement); io.unobserve(e.target); }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );
  reveals.forEach((el) => io.observe(el));
}

/* ---------- Lenis ---------- */
let lenis: Lenis | null = null;
if (!reduce) {
  lenis = new Lenis({ ...motion.lenis, autoRaf: false });
  // The mobile menu locks the page; Lenis would otherwise keep scrolling it.
  document.addEventListener('scroll-lock', (e) => ((e as CustomEvent<boolean>).detail ? lenis!.stop() : lenis!.start()));

  // Same-page anchors: glide there, then move focus like a native jump would.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    const id = a?.getAttribute('href')!.slice(1);
    const target = id ? document.getElementById(decodeURIComponent(id)) : null;
    if (!a || !target) return;
    e.preventDefault();
    const focus = () => {
      if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };
    history.pushState(null, '', `#${id}`);
    if (id === 'main') { lenis!.scrollTo(target, { immediate: true }); focus(); }
    else lenis!.scrollTo(target, { onComplete: focus }); // Lenis honours scroll-margin-top (clears the nav)
  });
}

/* ---------- Hero pin + fade ---------- */
const hero = document.querySelector<HTMLElement>('[data-hero]');
let HERO: (() => void) | null = null;
if (hero && !reduce) {
  // Stick where the hero's bottom meets the viewport bottom (or under the nav
  // if it fits), so a hero taller than the screen is never covered unread.
  const pin = () => {
    const navH = document.querySelector<HTMLElement>('.nav')?.offsetHeight ?? 0;
    hero.style.setProperty('--hero-pin', `${Math.min(navH, innerHeight - hero.offsetHeight)}px`);
  };
  pin();
  addEventListener('resize', pin);
  HERO = () => hero.style.setProperty('--hp', clamp01(scrollY / (innerHeight * motion.heroFade)).toFixed(3));
}

/* ---------- Bleed out ---------- */
const bleeds = [...document.querySelectorAll<HTMLElement>('[data-bleed]')];
let BLEED: (() => void) | null = null;
if (bleeds.length && !reduce) {
  BLEED = () => {
    const vh = innerHeight, start = vh * motion.bleed.start, range = vh * motion.bleed.range;
    for (const el of bleeds) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 1.6) continue; // skip off-screen work
      el.style.setProperty('--bp', clamp01((start - r.top) / range).toFixed(3));
    }
  };
}

/* ---------- Light fields ---------- */
interface Field { host: HTMLElement; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; W: number; H: number; k: number; on: boolean }
const fields: Field[] = [];
if (!reduce && !coarse && !weak) {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const ro = new ResizeObserver((entries) => {
    for (const en of entries) {
      const f = fields.find((x) => x.host === en.target)!;
      f.W = f.cv.width = Math.max(1, Math.round(en.contentRect.width * motion.light.scale * dpr));
      f.H = f.cv.height = Math.max(1, Math.round(en.contentRect.height * motion.light.scale * dpr));
    }
  });
  const vis = new IntersectionObserver((entries) => {
    for (const en of entries) fields.find((x) => x.host === en.target)!.on = en.isIntersecting;
  });
  document.querySelectorAll<HTMLElement>('[data-lightfield]').forEach((host) => {
    const cv = host.querySelector('canvas')!;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    fields.push({ host, cv, ctx, W: 1, H: 1, k: Number(host.dataset.intensity) || 1, on: false });
    ro.observe(host);
    vis.observe(host);
    requestAnimationFrame(() => host.classList.add('is-live')); // hand over from the CSS glow
  });
}

let t = 0, vel = 0, target = 0;
const TAU = Math.PI * 2;
const { beams, colors } = motion.light;
function paint(f: Field, sy: number) {
  const { ctx, W, H } = f;
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (let j = 0; j < beams.length; j++) {
    const bm = beams[j], c = colors[bm.c].join(',');
    const drift = ((bm.x + (sy * bm.sp) / 2600) % 1.3) - 0.15;
    const bw = bm.w * W * (1 + vel * 0.34);
    ctx.save();
    ctx.translate(drift * W, 0);
    ctx.rotate(bm.tl);
    for (let s = 0; s < 4; s++) {
      // Packets travel with time and scroll: light slides while you move and
      // keeps drifting when you stop. Radial gradients stretched on Y read as
      // soft shafts; rectangles would show hard edges.
      const ph = (s / 4 + (t * 0.55 + sy * 0.0002) * bm.k) % 1;
      const env = Math.sin(Math.PI * ph);
      const a = bm.a * env * env * (0.55 + vel * 0.85) * f.k * motion.light.alpha;
      if (a < 0.004) continue;
      ctx.save();
      ctx.translate(0, (ph * 1.9 - 0.45) * H);
      ctx.scale(1, 7 + Math.sin(t * 1.7 + j) * 1.4);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, bw);
      g.addColorStop(0, `rgba(${c},${a.toFixed(4)})`);
      g.addColorStop(0.45, `rgba(${c},${(a * 0.34).toFixed(4)})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, bw, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ---------- The one loop ----------
   Self-scheduling rather than a scroll-event + "ticking" flag: that flag can
   strand true (dropped frame, bfcache, hidden tab) and silently kill every
   later update. Scroll work runs only when scrollY changed. */
let lastY = -1, prevY = scrollY, pumping = true;
function pump(time: number) {
  if (!pumping) return;
  lenis?.raf(time);
  const y = scrollY;
  if (y !== lastY) { lastY = y; HERO?.(); BLEED?.(); }
  if (fields.length) {
    target = Math.max(target, Math.min(1, Math.abs(y - prevY) / 70));
    prevY = y;
    t += motion.light.speed;
    vel += (target - vel) * 0.08; // ease toward scroll speed, then decay
    target *= 0.9;
    for (const f of fields) if (f.on) paint(f, y);
  }
  requestAnimationFrame(pump);
}
const repump = () => { lastY = -1; };
addEventListener('resize', repump);
addEventListener('pageshow', repump);
addEventListener('load', repump);
document.addEventListener('visibilitychange', () => {
  pumping = !document.hidden;
  if (pumping) { repump(); requestAnimationFrame(pump); }
});
if (!reduce) requestAnimationFrame(pump);
