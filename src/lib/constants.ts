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
 * Detail-page header selectors — CONFIRMED against the live page via camofox
 * across three Lowongan (issue #10).
 *
 * The detail page keeps a Lowongan's *identity* in one header block and its
 * *numbers* in a sidebar, in disjoint subtrees:
 *
 *   div.flex.flex-col.sm:flex-row.items-start.gap-5      ← the header block
 *   ├─ div.w-16.h-16 …                                    ← organizer logo
 *   ├─ div.flex-1                                         ← badge, h1, organizer
 *   └─ div.flex.gap-2.self-start                          ← share cluster
 *
 * Only `title`/`organizer`/`logo` come from selectors, and only within that
 * header block: page-wide, `img` first matches a call-centre icon and
 * `p.text-muted-foreground` matches 15 elements. Location/Kuota/Pelamar are
 * NOT selectable per-field — the sidebar renders them as structurally
 * identical rows told apart by label text, so they go through
 * `INFO_ROW_LABELS` + `readInfoRows` instead (see parse.ts).
 *
 * None of the old `.mh-lowongan-*` guesses match the live page; `main` and
 * `article` do not exist on it either.
 */
export const DETAIL_HEADER_SELECTORS = {
	/** The header block holding logo + title + organizer + share cluster. */
	block: [
		'div[class*="items-start"][class*="gap-5"]',
		"div.flex.flex-col.items-start.gap-5",
	],
	title: ["h1"],
	/** Organizer sits directly after the `h1`, inside `div.flex-1`. */
	organizer: ["p.text-muted-foreground", "p"],
	/** Exactly one `img` lives in the header block: the organizer logo. */
	logo: ["img"],
} as const;

/**
 * Labels of the detail page's sidebar info rows, as rendered (issue #10).
 * Matched case-insensitively against `readInfoRows` keys. Live rows are:
 * Durasi Magang, Lokasi Magang, Kuota, Pelamar, Tunjangan.
 */
export const INFO_ROW_LABELS = {
	location: "lokasi magang",
	kuota: "kuota",
	pelamar: "pelamar",
} as const;

/**
 * Where the favorite toggle mounts on a detail page: inside MagangHub's own
 * share cluster, beside the "Bagikan" button (issue #10).
 *
 * Layered on purpose, walked by `queryFirst` like every other selector list
 * here. The layers fail independently: the aria-label survives a Tailwind
 * reshuffle, the utility classes survive the label being translated, and the
 * lucide icon class survives both. If all three miss, we inject nothing and
 * report `degraded` rather than keeping a fallback path that never runs.
 */
export const SHARE_CLUSTER_SELECTORS = [
	'button[aria-label="Bagikan"]',
	"div.flex.gap-2.self-start",
	"svg.lucide-share2",
] as const;

/** Attribute marking a card that already has a star injected (idempotency). */
export const STAR_INJECTED_ATTR = "data-mh-star";

/** Shadow host class for the list star toggle. */
export const STAR_HOST_CLASS = "mh-favorite-host";

/** Shadow host class for the detail-page favorite toggle. */
export const DETAIL_HOST_CLASS = "mh-favorite-detail-host";

/**
 * Attribute marking the share cluster we've already injected the detail toggle
 * into. The `h1` used to carry the injected marker, but the toggle no longer
 * mounts there — the marker has to live on the node we actually append to, or
 * a re-scan would inject a second toggle beside the first.
 */
export const DETAIL_INJECTED_ATTR = "data-mh-favorite";
