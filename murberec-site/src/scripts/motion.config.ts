/**
 * JS-side motion settings. CSS-side values (reveal timing, stagger, marquee
 * speed, colours, sticky offsets) are tokens in src/styles/global.css :root.
 */
export const motion = {
  /** Lenis smooth scroll. Lower lerp = smoother/heavier (0.1 is Lenis' default). */
  lenis: { lerp: 0.11, wheelMultiplier: 1, smoothWheel: true },

  /** Hero content fades out over this fraction of the viewport height of scroll. */
  heroFade: 0.45,

  /** [data-bleed] blocks: stay solid until their top is within `start` of the
   *  viewport top, then fade over `range` (both as fractions of viewport height). */
  bleed: { start: 0.12, range: 0.46 },

  /** Light shafts. `alpha` scales overall brightness; `speed` is time drift. */
  light: {
    scale: 0.42,           // canvas renders at this fraction of CSS size, then upscales
    alpha: 1,
    speed: 0.0028,
    colors: [[35, 210, 226], [140, 238, 246], [0, 150, 166]] as [number, number, number][],
    beams: [
      { x: 0.58, w: 0.070, a: 0.22, sp: 0.050, k: 1.0, tl: -0.22, c: 0 },
      { x: 0.72, w: 0.040, a: 0.18, sp: 0.090, k: 1.5, tl: -0.27, c: 1 },
      { x: 0.86, w: 0.090, a: 0.20, sp: 0.040, k: 0.8, tl: -0.18, c: 2 },
      { x: 0.98, w: 0.055, a: 0.16, sp: 0.075, k: 1.3, tl: -0.25, c: 0 },
    ],
  },
} as const;
