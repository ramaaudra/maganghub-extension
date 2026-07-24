/**
 * Selectors and anchors for MagangHub's Lowongan pages.
 *
 * CONFIRMED against the live DOM (docs/agents/camofox-browser.md):
 *  - cards are `.mh-lowongan-card`, each wrapped in
 *    `<a class="group block h-full" href="/magang-nasional/lowongan/<slug>-<uuid>">`
 *  - stable id = the UUID in that href
 *  - stack is Next.js + Tailwind + shadcn
 *
 * PROVISIONAL (inner field classes): Cloudflare blocked live exploration while
 * building the tracer bullet, so the field selectors below are best-effort and
 * MUST be confirmed/refreshed from the live DOM via camofox before relying on
 * them in production. They are centralized here so a single edit retunes them.
 * The e2e fixture (test/fixtures/lowongan-list.html) is built to match these.
 */
export const CARD_SELECTOR = '.mh-lowongan-card';

/** Anchor wrapping a card; its href carries the UUID. */
export const CARD_ANCHOR_SELECTOR = 'a[href*="/magang-nasional/lowongan/"]';

/**
 * Inner field selectors, in priority order. First match wins.
 * `mh-lowongan-*` / `mh-penyelenggara` follow the confirmed `.mh-lowongan-card`
 * naming convention; structural fallbacks (h3, img) cover shadcn markup.
 */
export const FIELD_SELECTORS = {
  title: ['.mh-lowongan-title', 'h3', 'h2'],
  organizer: ['.mh-penyelenggara', '[data-field="organizer"]'],
  location: ['.mh-lowongan-location', '[data-field="location"]'],
  kuota: ['.mh-lowongan-kuota', '[data-field="kuota"]'],
  pelamar: ['.mh-lowongan-pelamar', '[data-field="pelamar"]'],
  logo: ['img.mh-lowongan-logo', 'img'],
} as const;

/** Attribute marking a card that already has a star injected (idempotency). */
export const STAR_INJECTED_ATTR = 'data-mh-star';

/** Shadow host class for the star toggle. */
export const STAR_HOST_CLASS = 'mh-favorite-host';