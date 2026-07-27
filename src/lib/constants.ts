/**
 * Selectors and anchors for MagangHub's Lowongan pages.
 *
 * CONFIRMED against the live DOM (docs/agents/camofox-browser.md):
 *  - cards are `.mh-lowongan-card`, each wrapped in
 *    `<a class="group block h-full" href="/magang-nasional/lowongan/<slug>-<uuid>">`
 *  - stable id = the UUID in that href
 *  - stack is Next.js + Tailwind + shadcn
 *
 * The inner field selectors below were PROVISIONAL — invented from the
 * `.mh-lowongan-card` naming convention while Cloudflare blocked live
 * exploration — until the 2026-07-25 recon confirmed that *none of them exist*:
 * page-wide, `.mh-lowongan-title`, `.mh-penyelenggara`, `.mh-lowongan-location`,
 * `.mh-lowongan-kuota`, `.mh-lowongan-pelamar` and `.mh-lowongan-logo` all match
 * zero elements. Only `.mh-lowongan-card` and `.mh-container` are real. They are
 * now retuned against the live markup; see docs/live-dom-recon-2026-07-25.md.
 */
export const CARD_SELECTOR = ".mh-lowongan-card";

/** Anchor wrapping a card; its href carries the UUID. */
export const CARD_ANCHOR_SELECTOR = 'a[href*="/magang-nasional/lowongan/"]';

/**
 * Per-field selector list, in priority order. First match wins.
 *
 * Only the fields a CSS selector can actually isolate live here. Location is
 * icon-anchored (`CARD_LOCATION_SELECTORS`) and Kuota/Pelamar are label-matched
 * (`CARD_BADGE_LABELS`) — see those constants for why.
 */
export type FieldSelectors = {
	readonly title: readonly string[];
	readonly organizer: readonly string[];
	readonly logo: readonly string[];
};

/**
 * Inner field selectors, in priority order. First match wins. CONFIRMED against
 * the live card (2026-07-25):
 *
 *   <div class="mh-lowongan-card …">
 *     <div class="w-12 h-12 …"><img class="w-full h-full object-contain"></div>
 *     <h3 class="font-semibold text-base leading-snug">Fisikawan Medis</h3>
 *     <p class="text-sm font-medium text-foreground">RSUP Dr. Kariadi</p>  ← Penyelenggara
 *     <p class="text-sm text-muted-foreground truncate">Fisika</p>          ← study program
 *
 * Each `organizer` layer survives a different change: `h3 + p` rides the title
 * anchor (itself confirmed), `p.text-foreground` rides shadcn's semantic colour
 * class, and bare `p` rides document order. All three resolve to the same
 * element today — which is the point, they are redundancy, not alternatives.
 *
 * `organizer` must NOT be `p.text-muted-foreground`: on a card that class is the
 * study program ("Fisika"), not the Penyelenggara. It means the opposite here
 * from what it means on the detail page.
 */
export const FIELD_SELECTORS: FieldSelectors = {
	title: ["h3", "h2"],
	organizer: ["h3 + p", "p.text-foreground", "p"],
	logo: ["img"],
};

/**
 * Location on a card, anchored to its lucide map-pin icon rather than to a
 * class — there is no location class, and the wrapper's utility classes
 * (`flex items-center gap-1.5`) are shared with the education-level and
 * working-days spans beside it.
 *
 * Resolved icon → `closest("span")`, so this is walked by `findCardLocation`
 * rather than by `queryFirst` (the icon is a landmark *inside* the target, the
 * same shape as `SHARE_CLUSTER_SELECTORS` / `findShareCluster`).
 *
 * Lucide class names are semantic and survive a restyle; the second layer
 * catches a lucide version that renames the class but keeps the stem.
 */
export const CARD_LOCATION_SELECTORS = [
	"svg.lucide-map-pin",
	'svg[class*="map-pin"]',
] as const;

/**
 * Kuota and Pelamar on a card are shadcn `Badge` pills:
 *
 *   <div class="… rounded-full … bg-secondary …">Kuota: <!-- -->5</div>
 *   <div class="… rounded-full … bg-secondary …">Pelamar: <!-- -->0</div>
 *
 * They are structurally identical to each other AND to the Hari Libur day pills
 * ("Sabtu", "Minggu") that follow them, differing only by a Tailwind variant.
 * So they are told apart by LABEL TEXT, exactly as the detail page's info rows
 * are (`INFO_ROW_LABELS` + `readInfoRows`). The `<!-- -->` is a Next.js
 * hydration marker and vanishes from `textContent`.
 */
export const CARD_BADGE_SELECTOR = "div.rounded-full";

/** Label prefixes of the badge pills, matched case-insensitively. */
export const CARD_BADGE_LABELS = {
	kuota: "kuota",
	pelamar: "pelamar",
} as const;

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

/**
 * Where the Status Lamar stage card mounts on a detail page: the LAST child of
 * the detail sidebar (`div.space-y-5.order-1.lg:order-2`), furthest from
 * MagangHub's own "Alur Lamaran" card (issue #20, D3/D4).
 *
 * Landmarks walked by `findStageSidebar` (not plain `queryFirst`) — each is a
 * handle *inside* the sidebar and needs its own step back:
 *  1. an h3 whose text is "Alur Lamaran" → `closest('div.space-y-5')`
 *  2. a button whose text is "Lamar Sekarang" → `closest('div.space-y-5')`
 *  3. the Penyelenggara `a.block.group` → `parentElement`
 *
 * If all three miss, inject nothing and report `degraded` — no fallback
 * placement (issue #10's reasoning). The text anchors survive a Tailwind
 * reshuffle; the Penyelenggara link survives MagangHub renaming the CTA.
 */
export const STAGE_SIDEBAR_LANDMARKS = {
	alurLamaranHeading: "Alur Lamaran",
	lamarSekarangButton: "Lamar Sekarang",
	penyelenggaraLink: "a.block.group",
} as const;

/** Attribute marking a card that already has a star injected (idempotency). */
export const STAR_INJECTED_ATTR = "data-mh-star";

/** Shadow host class for the list star toggle. */
export const STAR_HOST_CLASS = "mh-favorite-host";

/** Shadow host class for the detail-page favorite toggle. */
export const DETAIL_HOST_CLASS = "mh-favorite-detail-host";

/** Shadow host class for the detail-page Status Lamar stage card (issue #20). */
export const STAGE_HOST_CLASS = "mh-stage-card-host";

/**
 * Attribute marking the share cluster we've already injected the detail toggle
 * into. The `h1` used to carry the injected marker, but the toggle no longer
 * mounts there — the marker has to live on the node we actually append to, or
 * a re-scan would inject a second toggle beside the first.
 */
export const DETAIL_INJECTED_ATTR = "data-mh-favorite";

/**
 * Attribute marking the sidebar we've already injected the stage card into
 * (idempotency for issue #20). Lives on the sidebar itself, matching how
 * `DETAIL_INJECTED_ATTR` lives on the share cluster.
 */
export const STAGE_INJECTED_ATTR = "data-mh-stage";
