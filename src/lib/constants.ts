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
export const CARD_SELECTOR = ".mh-lowongan-card";

/** Anchor wrapping a card; its href carries the UUID. */
export const CARD_ANCHOR_SELECTOR = 'a[href*="/magang-nasional/lowongan/"]';

/**
 * Per-field selector list, in priority order. First match wins.
 */
export type FieldSelectors = {
	readonly title: readonly string[];
	readonly organizer: readonly string[];
	readonly location: readonly string[];
	readonly kuota: readonly string[];
	readonly pelamar: readonly string[];
	readonly logo: readonly string[];
};

/**
 * Inner field selectors, in priority order. First match wins.
 * `mh-lowongan-*` / `mh-penyelenggara` follow the confirmed `.mh-lowongan-card`
 * naming convention; structural fallbacks (h3, img) cover shadcn markup.
 */
export const FIELD_SELECTORS: FieldSelectors = {
	title: [".mh-lowongan-title", "h3", "h2"],
	organizer: [".mh-penyelenggara", '[data-field="organizer"]'],
	location: [".mh-lowongan-location", '[data-field="location"]'],
	kuota: [".mh-lowongan-kuota", '[data-field="kuota"]'],
	pelamar: [".mh-lowongan-pelamar", '[data-field="pelamar"]'],
	logo: ["img.mh-lowongan-logo", "img"],
};

/**
 * Detail-page field selectors. Same fields as `FIELD_SELECTORS` (still
 * PROVISIONAL pending re-recording via camofox), except `title`: the detail
 * page leads with `h1` (confirmed via camofox) rather than the card's `h3`/`h2`.
 */
export const DETAIL_FIELD_SELECTORS: FieldSelectors = {
	...FIELD_SELECTORS,
	title: ["h1", ".mh-lowongan-title"],
};

/** Attribute marking a card that already has a star injected (idempotency). */
export const STAR_INJECTED_ATTR = "data-mh-star";

/** Shadow host class for the list star toggle. */
export const STAR_HOST_CLASS = "mh-favorite-host";

/** Shadow host class for the detail-page favorite toggle. */
export const DETAIL_HOST_CLASS = "mh-favorite-detail-host";
