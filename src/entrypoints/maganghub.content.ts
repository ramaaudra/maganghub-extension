import {
	CARD_ANCHOR_SELECTOR,
	CARD_SELECTOR,
	DETAIL_HOST_CLASS,
	DETAIL_INJECTED_ATTR,
	STAGE_HOST_CLASS,
	STAGE_INJECTED_ATTR,
	STAR_HOST_CLASS,
	STAR_INJECTED_ATTR,
} from "@/lib/constants";
import {
	extractDetailSnapshot,
	extractDetailUrl,
	extractSnapshot,
	extractUuidFromHref,
	findDetailHeader,
	findShareCluster,
	findStageSidebar,
} from "@/lib/extract";
import {
	assessDetailMarkup,
	assessListMarkup,
	type HealthStatus,
	reportHealth,
} from "@/lib/health";
import {
	type FavoriteV1,
	type FavoriteV2,
	type FavoriteV3,
	migrateFavorite,
} from "@/lib/migrations";
import {
	createFavorite,
	FAVORITE_KEY_PREFIX,
	getFavorite,
	isFavorited,
	removeFavorite,
	setFavorite,
	setStatusLamar,
} from "@/lib/storage";
import {
	STAGE_SELECT_OPTIONS,
	stageChipAriaLabel,
	stageLabel,
} from "@/lib/stage";
import { composeStarTitle } from "@/lib/star-title";
import type { Favorite, StatusLamar } from "@/lib/types";

/**
 * Content script for MagangHub Lowongan pages.
 *
 * `matches` is the whole MagangHub origin, not just `/magang-nasional/lowongan*`.
 * MagangHub is a Next.js SPA: clicking "Lowongan" from Beranda / Penyelenggara /
 * FAQ is a client-side route change, not a document load. Chrome only injects a
 * content script on a real navigation that matches — so a script scoped to the
 * Lowongan path never runs when the user arrives via in-app nav, and stars stay
 * missing until a hard reload. Matching the origin lets `main()` attach once;
 * `isLowonganSurface` then gates injection so we do nothing on Beranda etc.
 *
 * On a Lowongan surface, `main()` branches on whether the path carries a UUID
 * (list vs detail). Both surfaces inject a favorite toggle as plain DOM inside
 * a CLOSED Shadow DOM (ADR-0004: no framework runtime shipped to the page;
 * styles isolated from MagangHub's Tailwind). Clicking either toggle persists
 * the same Favorite record to chrome.storage.local keyed by the Lowongan UUID,
 * and a storage.onChanged listener keeps every injected toggle in sync with the
 * canonical storage state (issue #3: detail ↔ list state sync).
 */
export default defineContentScript({
	matches: ["https://maganghub.kemnaker.go.id/*"],
	main() {
		// Guarded like every later scan: a MagangHub redesign must never surface
		// as a console error in the user's page (issue #8).
		safeScan();
		watchForChanges();
		setupStorageSync();
	},
});

/**
 * True on the list (`/magang-nasional/lowongan`) and any detail page under it.
 * Everything else on the origin (Beranda, Penyelenggara, FAQ, login redirects)
 * is out of scope — the content script is loaded there only so SPA navigation
 * *into* Lowongan can still inject.
 */
function isLowonganSurface(pathname: string): boolean {
	return (
		pathname === "/magang-nasional/lowongan" ||
		pathname.startsWith("/magang-nasional/lowongan/")
	);
}

/** `scan()` that can never throw into the page. */
function safeScan(): void {
	try {
		scan();
	} catch {
		// Injection is best-effort against a site we don't control.
	}
}

/**
 * Inject whatever the current URL calls for, then report what we found.
 *
 * Re-entrant and idempotent: every injection point marks its target with
 * `STAR_INJECTED_ATTR`, so re-scanning the same DOM is a no-op. This is what
 * makes it safe to call on every mutation and every navigation.
 */
function scan(): void {
	pruneDetachedUpdaters();
	// Origin-wide match + path gate (see defineContentScript matches). On Beranda
	// etc. we stay silent: no inject, no health write. Health is a statement about
	// the Lowongan surface the user is looking at, not about MagangHub in general.
	if (!isLowonganSurface(location.pathname)) return;
	const pathUuid = extractUuidFromHref(location.pathname);
	const health = pathUuid ? scanDetail(pathUuid) : scanList();

	// Write only on a CHANGE. A scan runs on every re-render burst, and each
	// storage write wakes every storage.onChanged listener — including the
	// popup's, which re-reads the whole favorites list. Re-reporting "ok" onto
	// "ok" would turn ordinary scrolling into a write storm.
	if (health === lastReportedHealth) return;
	lastReportedHealth = health;
	void reportHealth(health).catch(() => {
		// Health reporting is best-effort; never let it break injection.
		lastReportedHealth = undefined;
	});
}

/** Last health written this page-load; skips redundant storage writes. */
let lastReportedHealth: HealthStatus | undefined;

function scanList(): HealthStatus {
	injectStars();
	return assessListMarkup(document.body);
}

function scanDetail(uuid: string): HealthStatus {
	injectDetailToggle(uuid);
	injectStageCard(uuid);
	// A detail page also renders a "Lowongan Serupa" grid of the same
	// `.mh-lowongan-card` elements the list page uses (issue #10). They carry
	// UUID-bearing anchors, so they star exactly like list cards — a card that
	// looks identical but behaves differently would teach the user the star
	// can't be relied on. Health stays detail-only: an empty "Lowongan Serupa"
	// is not a broken page.
	injectStars();
	return assessDetailMarkup(document.body);
}

/**
 * Keep injecting as MagangHub's SPA reshapes the page (issue #8).
 *
 * MagangHub is Next.js: filters and pagination swap cards in place, and moving
 * list ↔ detail is a client-side route change. `main()` runs once per document
 * load, so without this every such interaction would silently drop the stars.
 *
 * The MutationObserver is the workhorse rather than a `history` patch: a
 * content script runs in an isolated world, so patching `history.pushState`
 * there cannot see the page's own router calling it. The DOM, by contrast, is
 * shared — every route change MagangHub makes has to touch it to render. We
 * still listen to `popstate` (a real event that does cross worlds, fired by
 * back/forward) and patch our own world's `history` for completeness, but
 * correctness rests on the observer.
 *
 * Scans are debounced to one per animation frame's worth of mutations: a
 * re-render fires hundreds of records, and injecting is DOM work we don't want
 * to repeat per record (AC: "must not slow down MagangHub page loads").
 */
function watchForChanges(): void {
	let scheduled = false;
	const scheduleScan = (): void => {
		if (scheduled) return;
		scheduled = true;
		setTimeout(() => {
			scheduled = false;
			safeScan();
		}, SCAN_DEBOUNCE_MS);
	};

	new MutationObserver(scheduleScan).observe(document.body, {
		childList: true,
		subtree: true,
	});

	// Back/forward. A real event, so it crosses into the isolated world.
	window.addEventListener("popstate", scheduleScan);

	// Same-world pushState/replaceState (e.g. a link we handle ourselves).
	for (const method of ["pushState", "replaceState"] as const) {
		const original = history[method];
		history[method] = function patched(
			this: History,
			...args: Parameters<History["pushState"]>
		) {
			const result = original.apply(this, args);
			scheduleScan();
			return result;
		};
	}
}

/** Coalesce a burst of mutations from one re-render into a single scan. */
const SCAN_DEBOUNCE_MS = 50;

interface StarState {
	/** True once the user has clicked this toggle; gates the initial reflect. */
	interacted: boolean;
}

/**
 * The updater payload: the full `Favorite | undefined`, not a boolean. Carrying
 * the whole record (not just "is it saved") is what lets on-page features read
 * `statusLamar` (A2), `catatan` (A3), and `liveStatus` (C2 detail card) without
 * each re-deriving them from storage. `undefined` = the Favorite was removed.
 */
type FavoriteUpdater = (favorite: Favorite | undefined) => void;

/**
 * A registered toggle: the updater to call on a storage change, plus the host
 * node it draws into. The host is what makes cleanup possible — once MagangHub
 * swaps a card out, its host is detached from the document and the updater is
 * dead weight (issue #8: "cleanup on card removal").
 */
interface Registration {
	update: FavoriteUpdater;
	host: HTMLElement;
}

/** Per-UUID updaters, fired by the storage.onChanged listener for live sync. */
const updaters = new Map<string, Set<Registration>>();

function registerUpdater(
	uuid: string,
	update: FavoriteUpdater,
	host: HTMLElement,
): () => void {
	let set = updaters.get(uuid);
	if (!set) {
		set = new Set();
		updaters.set(uuid, set);
	}
	const registration: Registration = { update, host };
	set.add(registration);
	return () => {
		set?.delete(registration);
		if (set && set.size === 0) updaters.delete(uuid);
	};
}

function notifyUpdaters(uuid: string, favorite: Favorite | undefined): void {
	const set = updaters.get(uuid);
	if (!set) return;
	for (const { update } of set) update(favorite);
}

/**
 * Drop registrations whose host has left the document.
 *
 * A filter change or pagination replaces the whole card list; without this the
 * map grows forever, each entry pinning a detached host + its shadow tree, and
 * every storage change repaints toggles nobody can see. Runs on each scan, so
 * cleanup rides the re-render that caused it.
 */
function pruneDetachedUpdaters(): void {
	for (const [uuid, set] of updaters) {
		for (const registration of set) {
			if (!registration.host.isConnected) set.delete(registration);
		}
		if (set.size === 0) updaters.delete(uuid);
	}
}

/**
 * Keep every injected toggle in sync with storage. Fires in this tab (a click
 * on one toggle updates the others) and across tabs (star on the list, detail
 * page open elsewhere → detail toggle flips) — the canonical state is always
 * chrome.storage.local (ADR-0001).
 */
function setupStorageSync(): void {
	browser.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== "local") return;
		for (const key of Object.keys(changes)) {
			if (!key.startsWith(FAVORITE_KEY_PREFIX)) continue;
			const uuid = key.slice(FAVORITE_KEY_PREFIX.length);
			// Migrate the raw stored record to the current shape, the same as the
			// read paths in storage.ts. `newValue` is the persisted object (any past
			// schema version); `undefined` means the Favorite was removed.
			const stored = changes[key].newValue as
				| Favorite
				| FavoriteV1
				| FavoriteV2
				| FavoriteV3
				| undefined;
			const favorite = stored ? migrateFavorite(stored) : undefined;
			notifyUpdaters(uuid, favorite);
		}
	});
}

// ───────────────────────── List page: star per card ─────────────────────────

/** Inject a star into every card on the page. Idempotent per card. */
function injectStars(): void {
	const cards = document.querySelectorAll<HTMLElement>(CARD_SELECTOR);
	cards.forEach((card) => injectStarIntoCard(card));
}

function injectStarIntoCard(card: HTMLElement): void {
	// Marker alone is not enough: MagangHub (React) can strip our foreign host
	// child while leaving the card element — and our `data-mh-star` on it —
	// intact. Treating the marker as proof of a live star then permanently
	// skips re-injection. Only a connected host child means "already done".
	if (card.querySelector(`.${STAR_HOST_CLASS}`)) return;
	card.removeAttribute(STAR_INJECTED_ATTR);

	const anchor =
		card.closest<HTMLAnchorElement>("a[href]") ??
		card.querySelector<HTMLAnchorElement>(CARD_ANCHOR_SELECTOR);
	const href = anchor?.getAttribute("href") ?? null;
	const uuid = extractUuidFromHref(href);
	if (!uuid || !anchor) return; // no stable id → no star (AC #15 lands in a later issue)

	card.setAttribute(STAR_INJECTED_ATTR, uuid);

	const host = document.createElement("div");
	host.className = STAR_HOST_CLASS;
	host.setAttribute("data-filled", "false");
	host.style.setProperty("position", "absolute");
	// 12px insets, not 8px: MagangHub's card uses a 12px (`rounded-xl`) corner
	// radius, and a control tucked inside that arc needs to clear it or it reads
	// as crowding the corner rather than sitting in it.
	host.style.setProperty("top", "12px");
	host.style.setProperty("right", "12px");
	host.style.setProperty("z-index", "5");
	// The star is absolutely positioned, so the card has to be a containing
	// block. Check the COMPUTED position, not the inline one: reading
	// `card.style.position` only sees inline styles, so a card positioned by
	// MagangHub's stylesheet would be silently overwritten and their layout
	// broken. Promoting `static` → `relative` changes nothing visually.
	if (getComputedStyle(card).position === "static") {
		card.style.setProperty("position", "relative");
	}
	const shadow = host.attachShadow({ mode: "closed" });
	const { button, chip } = buildStarChrome(shadow);
	card.append(host);

	const state: StarState = { interacted: false };
	// Filled bit, stage chip, and Catatan tooltip all ride the Favorite shape
	// from the updater protocol (issues #14 / #19 / #18).
	const apply = (favorite: Favorite | undefined) => {
		setFilled(host, button, Boolean(favorite), STAR_LABELS, favorite?.catatan);
		applyStageChip(host, chip, favorite?.statusLamar);
	};
	void reflectState(uuid, apply, state);
	registerUpdater(uuid, apply, host);
	attachStarToggle(card, uuid, anchor, host, button, chip, state);
}

/**
 * Star button + stage chip inside one closed shadow (issue #19).
 *
 * The star carries exactly one ring, and that ring means one thing: saved or
 * not saved. It used to carry two — its own 1px border plus a second, 2px
 * urgency band at `inset: -3px` — which rendered as a visible double border on
 * every card and spent amber on two unrelated meanings at once. MagangHub now
 * ships its own "Peluang" pill with a real percentage on the card, so the band
 * was also duplicating a signal the page states better (see `STAR_CSS`).
 *
 * The stage chip is a real light-DOM element (slotted) so AT and e2e can
 * reach it without piercing Shadow DOM — same pattern as the detail stage
 * card's select. The chip is text-only (D7).
 */
function buildStarChrome(shadow: ShadowRoot): {
	button: HTMLButtonElement;
	chip: HTMLElement;
} {
	const style = document.createElement("style");
	style.textContent = STAR_CSS;
	const button = document.createElement("button");
	button.type = "button";
	button.className = "mh-star";
	button.setAttribute("aria-label", "Tandai sebagai favorit");
	button.setAttribute("aria-pressed", "false");
	// Same lucide `star` the detail toggle uses. A `★` text glyph sat on a text
	// baseline, which is why it never optically centred in a round button; the
	// SVG centres on its own box and matches the icon weight of the card.
	button.innerHTML = STAR_ICON_SVG;
	// Chip lives in light DOM via <slot>, so Playwright/AT see it on the host.
	const chip = document.createElement("span");
	chip.className = "mh-stage-chip";
	chip.hidden = true;
	chip.setAttribute("data-stage-chip", "true");
	const slot = document.createElement("slot");
	shadow.append(style, button, slot);
	return { button, chip };
}

/**
 * Show or hide the on-card stage chip (issue #19 / A2).
 *
 * The chip is a light-DOM child of the star host (slotted into the closed
 * shadow), so e2e can assert `data-stage` / text without piercing Shadow DOM
 * and AT can announce it via its own aria-label. No stage → no chip, so the
 * majority of saved cards stay clean (D7). Colour is deliberately neutral —
 * A1 owns the colour channel on this card.
 */
function applyStageChip(
	host: HTMLElement,
	chip: HTMLElement,
	stage: StatusLamar | undefined,
): void {
	const label = stageLabel(stage);
	if (!stage || !label) {
		host.removeAttribute("data-stage");
		chip.hidden = true;
		chip.textContent = "";
		chip.removeAttribute("aria-label");
		// Detach so an empty chip never occupies layout or AT tree.
		chip.remove();
		return;
	}
	host.setAttribute("data-stage", stage);
	chip.hidden = false;
	chip.textContent = label;
	chip.setAttribute("aria-label", stageChipAriaLabel(stage));
	// Ensure the chip is a light-DOM child of the host (slotted).
	if (chip.parentElement !== host) host.append(chip);
}

// ─────────────────────── Detail page: toggle near title ─────────────────────

/**
 * Inject a favorite toggle on a Lowongan detail page, into MagangHub's own
 * share cluster beside the "Bagikan" button (issue #10). The detail toggle
 * drives the SAME Favorite record as the list star (same UUID), so state stays
 * consistent across surfaces (issue #3).
 *
 * If the cluster can't be found, nothing is injected — there is deliberately no
 * fallback placement. `assessDetailMarkup` reports `degraded` for the same
 * condition, so the popup tells the user the extension needs an update instead
 * of the button silently vanishing.
 */
function injectDetailToggle(uuid: string): void {
	const cluster = findShareCluster(document.body);
	if (!cluster) return;
	// Same orphan-marker trap as the list star: React may drop the host child
	// while the share cluster (and `data-mh-favorite`) stays. Re-inject when the
	// host is gone, even if the marker remains.
	if (cluster.querySelector(`.${DETAIL_HOST_CLASS}`)) return;
	cluster.removeAttribute(DETAIL_INJECTED_ATTR);
	cluster.setAttribute(DETAIL_INJECTED_ATTR, uuid);

	const host = document.createElement("div");
	host.className = DETAIL_HOST_CLASS;
	host.setAttribute("data-filled", "false");
	const shadow = host.attachShadow({ mode: "closed" });
	const button = buildDetailButton(shadow);
	// Second child of the cluster: the toggle sits beside "Bagikan", in the slot
	// MagangHub already established for secondary actions on this page.
	cluster.append(host);

	const state: StarState = { interacted: false };
	const apply = (favorite: Favorite | undefined) =>
		setFilled(
			host,
			button,
			Boolean(favorite),
			DETAIL_LABELS,
			favorite?.catatan,
		);
	void reflectState(uuid, apply, state);
	registerUpdater(uuid, apply, host);
	attachDetailToggle(uuid, host, button, state);
}

function buildDetailButton(shadow: ShadowRoot): HTMLButtonElement {
	const style = document.createElement("style");
	style.textContent = DETAIL_CSS;
	const button = document.createElement("button");
	button.type = "button";
	button.className = "mh-favorite-detail";
	button.setAttribute("aria-label", DETAIL_LABELS.labelOff);
	button.setAttribute("aria-pressed", "false");
	// The label is icon-only, so `title` carries it for mouse users while
	// `aria-label` carries it for assistive tech.
	button.title = DETAIL_LABELS.labelOff;
	button.innerHTML = STAR_ICON_SVG;
	shadow.append(style, button);
	return button;
}

/**
 * Lucide `star`, inline. Shared by both toggles.
 *
 * On the detail page the neighbouring "Bagikan" button renders a lucide SVG at
 * stroke-width 2, so a `★` text glyph beside it would sit at a visibly
 * different weight and baseline. The same held on the list card, which drew its
 * own `★` glyph: MagangHub's card icons are lucide at stroke-width 2, and a
 * font-rendered glyph among them read as a different alphabet — and never
 * optically centred, because it sat on a text baseline rather than its own box.
 * One icon for both surfaces is also one thing to keep consistent, not two.
 *
 * `fill` is driven by CSS: `none` when unsaved, `currentColor` when saved.
 */
const STAR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

function attachDetailToggle(
	uuid: string,
	host: HTMLElement,
	button: HTMLButtonElement,
	state: StarState,
): void {
	button.addEventListener("click", async (event) => {
		event.preventDefault();
		event.stopPropagation();
		state.interacted = true;
		const currentlyFavorited = await isFavorited(uuid);
		if (currentlyFavorited) {
			await removeFavorite(uuid);
			setFilled(host, button, false, DETAIL_LABELS);
		} else {
			const favorite = createFavorite({
				uuid,
				// The detail page itself is the canonical reference URL.
				detailUrl: location.pathname,
				// Two scopes: identity comes from the header block, the numbers from
				// the sidebar's info rows. See `extractDetailSnapshot`.
				savedSnapshot: extractDetailSnapshot(
					findDetailHeader(document.body),
					document,
				),
			});
			// re-read in case of a race, then persist only if still not favorited
			if (!(await isFavorited(uuid))) {
				await setFavorite(favorite);
				setFilled(host, button, true, DETAIL_LABELS);
			}
		}
	});
}

// ──────────────── Detail page: Status Lamar stage card (issue #20) ──────────

/**
 * Inject the user's Status Lamar stage tracker into the detail sidebar.
 *
 * Mounts as the LAST child of the sidebar — furthest from MagangHub's own
 * "Alur Lamaran" card — so it never reads as a second instance of the site's
 * pipeline (D3). Attribution copy is in the light DOM (title + footnote) so a
 * glance makes ownership unmistakable; the interactive control is also light
 * DOM (via a closed-shadow `<slot>`) so e2e and assistive tech can reach it
 * without piercing Shadow DOM, while styles stay isolated (ADR-0004).
 *
 * Visibility rule (issue #20): the card only renders for a saved Favorite.
 * Picking a stage on an unsaved Lowongan saves it first, then sets the stage —
 * a stage never exists without a Favorite to attach to. Unfavoriting (via the
 * share-cluster toggle or the popup) hides the card again via the storage sync.
 *
 * If the sidebar can't be found, nothing is injected — `assessDetailMarkup`
 * reports `degraded` for the same condition, and stages stay settable from the
 * popup (D4 safety net).
 */
function injectStageCard(uuid: string): void {
	const sidebar = findStageSidebar(document.body);
	if (!sidebar) return;
	if (sidebar.querySelector(`.${STAGE_HOST_CLASS}`)) return;
	sidebar.removeAttribute(STAGE_INJECTED_ATTR);
	sidebar.setAttribute(STAGE_INJECTED_ATTR, uuid);

	const host = document.createElement("div");
	host.className = STAGE_HOST_CLASS;
	host.setAttribute("data-visible", "false");
	// Ownership copy also rides on the host so e2e/AT can assert attribution
	// without piercing the closed shadow (same pattern as data-filled on the
	// star host). Visual title stays inside the shadow so MagangHub's Tailwind
	// cannot restyle it (ADR-0004).
	host.setAttribute("data-stage-title", STAGE_CARD_TITLE);
	host.setAttribute(
		"aria-label",
		`${STAGE_CARD_TITLE}. ${STAGE_CARD_SUBTITLE}`,
	);
	host.hidden = true;

	// Light-DOM control only: Playwright and AT reach the select without
	// piercing Shadow DOM. The shadow styles it via `::slotted(select)`.
	// Font metrics also land as inline styles: the select inherits MagangHub's
	// light-DOM cascade (often 16px body), and `::slotted` alone loses that fight
	// on some builds — the value then reads louder than the attribution title.
	const select = document.createElement("select");
	select.setAttribute("aria-label", "Status Lamar");
	select.dataset.stageSelect = "true";
	Object.assign(select.style, STAGE_SELECT_INLINE_STYLE);
	for (const [value, label] of STAGE_SELECT_OPTIONS) {
		const option = document.createElement("option");
		option.value = value;
		option.textContent = label;
		select.append(option);
	}
	host.append(select);

	const shadow = host.attachShadow({ mode: "closed" });
	const style = document.createElement("style");
	style.textContent = STAGE_CARD_CSS;
	const card = document.createElement("div");
	card.className = "mh-stage-card";
	card.innerHTML = `
		<p class="mh-stage-title">${STAGE_CARD_TITLE}</p>
		<p class="mh-stage-sub">${STAGE_CARD_SUBTITLE}</p>
		<label class="mh-stage-label">
			<span class="mh-stage-label-text">Status Lamar</span>
			<slot></slot>
		</label>
	`;
	shadow.append(style, card);

	// LAST child of the sidebar — away from "Alur Lamaran" (D3).
	sidebar.append(host);

	const state: StarState = { interacted: false };
	const apply = (favorite: Favorite | undefined) =>
		reflectStageCard(host, select, favorite);
	void reflectState(uuid, apply, state);
	registerUpdater(uuid, apply, host);
	attachStageSelect(uuid, select, state);
}

/** Attribution copy (D3) — ownership must be unmistakable. */
const STAGE_CARD_TITLE = "Lamaranku · catatan pribadi";
const STAGE_CARD_SUBTITLE = "Bukan fitur MagangHub — disimpan di browser kamu.";

function reflectStageCard(
	host: HTMLElement,
	select: HTMLSelectElement,
	favorite: Favorite | undefined,
): void {
	const visible = Boolean(favorite);
	host.setAttribute("data-visible", String(visible));
	host.hidden = !visible;
	// "" = no stage. Only rewrite the select when a Favorite is present; when
	// hidden the value is irrelevant and rewriting would thrash focus.
	if (favorite) {
		select.value = favorite.statusLamar ?? "";
	}
}

function attachStageSelect(
	uuid: string,
	select: HTMLSelectElement,
	state: StarState,
): void {
	select.addEventListener("change", async () => {
		state.interacted = true;
		const stage =
			select.value === "" ? undefined : (select.value as StatusLamar);

		// A stage never exists without a Favorite. Picking one on an unsaved
		// Lowongan saves it first (issue #20 AC), then sets the stage.
		if (!(await isFavorited(uuid))) {
			const favorite = createFavorite({
				uuid,
				detailUrl: location.pathname,
				savedSnapshot: extractDetailSnapshot(
					findDetailHeader(document.body),
					document,
				),
			});
			favorite.statusLamar = stage;
			await setFavorite(favorite);
			return;
		}

		await setStatusLamar(uuid, stage);
	});
}

// ───────────────────────────── Shared helpers ───────────────────────────────

interface FilledLabels {
	labelOn: string;
	labelOff: string;
	textOn?: string;
	textOff?: string;
}

const STAR_LABELS: FilledLabels = {
	labelOn: "Hapus dari favorit",
	labelOff: "Tandai sebagai favorit",
};

// Icon-only, mirroring the "Bagikan" button beside it — no textOn/textOff, so
// `setFilled` leaves the inline SVG alone and only swaps colour + aria/title.
const DETAIL_LABELS: FilledLabels = {
	labelOn: "Hapus dari favorit",
	labelOff: "Tandai sebagai favorit",
};

async function reflectState(
	uuid: string,
	apply: FavoriteUpdater,
	state: StarState,
): Promise<void> {
	const fav = await getFavorite(uuid);
	// Don't clobber a click that landed before the initial read resolved.
	if (state.interacted) return;
	apply(fav);
}

/**
 * Mirror the toggle state onto the light-DOM host (data-filled) so it is
 * observable without piercing the closed Shadow DOM, and update the shadow
 * button's visual + aria-pressed. aria-pressed lives only on the interactive
 * button — the host is a non-interactive div where AT would ignore it.
 *
 * Catatan rides the native `title` (issue #18 / A3). Compose rather than
 * clobber: filled always writes the composed title (list stars gain a
 * tooltip on save); unfilled keeps the detail toggle's seeded off-label and
 * clears the list star so nothing residual lingers after unsave.
 * `data-star-title` on the host mirrors the same string for e2e without
 * piercing Shadow DOM. Urgency owns `host.title` separately — do not write
 * Catatan there.
 */
function setFilled(
	host: HTMLElement,
	button: HTMLButtonElement,
	filled: boolean,
	labels: FilledLabels = STAR_LABELS,
	catatan?: string,
): void {
	host.setAttribute("data-filled", String(filled));
	button.classList.toggle("is-filled", filled);
	button.setAttribute("aria-pressed", String(filled));
	const label = filled ? labels.labelOn : labels.labelOff;
	button.setAttribute("aria-label", label);
	// Filled: always write composed title (list stars gain a tooltip on save).
	// Unfilled: detail keeps its seeded title (off-label); list clears so a
	// previously-saved star does not leave a residual off-label tooltip.
	if (filled) {
		const title = composeStarTitle(label, catatan);
		button.title = title;
		host.setAttribute("data-star-title", title);
	} else {
		host.removeAttribute("data-star-title");
		if (labels === DETAIL_LABELS) button.title = label;
		else button.removeAttribute("title");
	}
	if (labels.textOn && labels.textOff) {
		button.textContent = filled ? labels.textOn : labels.textOff;
	}
}

function attachStarToggle(
	card: HTMLElement,
	uuid: string,
	anchor: HTMLAnchorElement,
	host: HTMLElement,
	button: HTMLButtonElement,
	chip: HTMLElement,
	state: StarState,
): void {
	button.addEventListener("click", async (event) => {
		// The card sits inside an <a>; don't navigate to the detail page on star click.
		event.stopPropagation();
		event.preventDefault();
		state.interacted = true;
		const currentlyFavorited = await isFavorited(uuid);
		if (currentlyFavorited) {
			await removeFavorite(uuid);
			setFilled(host, button, false);
			// Optimistic: drop the stage chip with the star. Storage sync will
			// confirm; without this the chip lingers until the event arrives.
			applyStageChip(host, chip, undefined);
		} else {
			const favorite = createFavorite({
				uuid,
				detailUrl: extractDetailUrl(anchor),
				savedSnapshot: extractSnapshot(card),
			});
			// re-read in case of a race, then persist only if still not favorited
			if (!(await isFavorited(uuid))) {
				await setFavorite(favorite);
				setFilled(host, button, true);
				// Fresh Favorite has no stage — keep the chip off (D7).
				applyStageChip(host, chip, undefined);
			}
		}
	});
}

/**
 * List-card star.
 *
 * ONE ring, ONE meaning. The button's own 1px border is the only ring on this
 * control, and it says exactly one thing: saved or not saved. Anything that
 * needs a second concentric ring here is a second meaning competing for the
 * same 32px, which is what the removed urgency band was.
 *
 * Geometry is borrowed from the detail toggle (`DETAIL_CSS`) so the two read as
 * one control at two sizes: same `#e1e7ef` border, same lucide star at the same
 * stroke weight, same amber. Only the size and radius differ — 32px and fully
 * round on the card, because it floats over MagangHub's content instead of
 * sitting in a button row.
 */
const STAR_CSS = `
  :host {
    all: initial;
    position: relative;
    display: inline-block;
    width: 32px;
    height: 32px;
  }
  .mh-star {
    all: initial;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 9999px;
    border: 1px solid rgb(225,231,239);
    background: rgb(255,255,255);
    color: rgb(148,163,184);
    cursor: pointer;
    /* Offset + blur, so the star lifts off the card instead of wearing a halo.
       The card underneath is white; without this the button dissolves into it. */
    box-shadow: 0 1px 2px rgba(15,23,41,0.06), 0 1px 1px rgba(15,23,41,0.04);
    transition: color 120ms ease, border-color 120ms ease, box-shadow 120ms ease,
                transform 120ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .mh-star svg {
    width: 16px;
    height: 16px;
    fill: none;
    /* The star glyph's optical centre sits above its bounding-box centre — the
       two lower points are longer than the top one. Nudge it back down. */
    transform: translateY(0.5px);
  }
  .mh-star:hover {
    color: #f59e0b;
    border-color: rgba(245,158,11,0.5);
    transform: scale(1.06);
  }
  .mh-star:active { transform: scale(0.96); }
  .mh-star:focus-visible {
    outline: 2px solid #f59e0b;
    outline-offset: 2px;
  }
  .mh-star.is-filled {
    color: #f59e0b;
    border-color: rgba(245,158,11,0.6);
  }
  .mh-star.is-filled svg { fill: currentColor; }
  .mh-star.is-filled:hover { color: #d97706; border-color: rgba(217,119,6,0.7); }
  @media (prefers-reduced-motion: reduce) {
    .mh-star { transition: color 120ms ease, border-color 120ms ease; }
    .mh-star:hover, .mh-star:active { transform: none; }
  }
  /* Stage chip (issue #19 / A2): text only. Neutral slate so Dilamar and
     Ditolak never look the same via colour. Positioned under the star so it
     doesn't cover MagangHub's title. */
  ::slotted(.mh-stage-chip) {
    position: absolute;
    top: 38px;
    right: 0;
    display: inline-block;
    max-width: 88px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 1px 6px;
    border-radius: 9999px;
    border: 1px solid rgb(203, 213, 225);
    background: rgb(248, 250, 252);
    color: rgb(51, 65, 85);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: 0.01em;
    pointer-events: none;
    box-sizing: border-box;
  }
  ::slotted(.mh-stage-chip[hidden]) { display: none; }
`;

/**
 * Mirrors the "Bagikan" button it sits beside (measured on the live page,
 * issue #10): 40×40, 14px radius, 1px #e1e7ef border, white background.
 * Matching those numbers is the whole point of the placement — a differently
 * shaped button in a two-button cluster reads as something bolted on.
 */
const DETAIL_CSS = `
  :host { all: initial; display: inline-block; }
  .mh-favorite-detail {
    all: initial;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 14px;
    border: 1px solid rgb(225,231,239);
    background: rgb(255,255,255);
    color: rgb(15,23,41);
    cursor: pointer;
    transition: color 80ms ease, background 80ms ease, border-color 80ms ease;
  }
  .mh-favorite-detail svg { width: 16px; height: 16px; fill: none; }
  .mh-favorite-detail:hover { color: #f59e0b; border-color: rgba(245,158,11,0.5); }
  .mh-favorite-detail.is-filled { color: #f59e0b; border-color: rgba(245,158,11,0.6); }
  .mh-favorite-detail.is-filled svg { fill: currentColor; }
  .mh-favorite-detail.is-filled:hover { color: #d97706; }
`;

/**
 * Stage card styles (issue #20 / D3).
 *
 * Deliberate visual distance from MagangHub's "Alur Lamaran" card:
 *  - no numbered discs, no primary colour accents
 *  - slate border/background instead of pure white + primary chips
 *  - still uses the site's 16px radius / 20px padding so it doesn't look bolted on
 * Attribution lives in the title + subtitle, not a colour alone.
 *
 * Type ramp (Operate, dense sidebar instrument — not a second page heading):
 *  title 14/600 → caption 12/400 → field label 12/500 → value 12/400.
 * Hierarchy is weight + tone, not size bloat. The value must never outrank
 * the ownership title; popup Status Lamar is `text-xs` (12px), and this
 * control matches that role across surfaces. Sizes stay on the 12/14 steps
 * shared with DESIGN.md even though the content script ships no Geist.
 */
// Inline on the light-DOM select so MagangHub's `font: inherit` / body scale
// cannot inflate the value past the card's type ramp. Keep in lockstep with
// the `::slotted(select)` block below.
const STAGE_SELECT_INLINE_STYLE = {
	fontFamily:
		'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
	fontSize: "12px",
	fontWeight: "400",
	lineHeight: "1.35",
	color: "rgb(15, 23, 41)",
} as const;

const STAGE_CARD_CSS = `
  :host {
    all: initial;
    display: block;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  :host([hidden]) { display: none; }
  .mh-stage-card {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 16px 18px;
    border-radius: 16px;
    border: 1px solid rgb(203, 213, 225);
    background: rgb(248, 250, 252);
    color: rgb(15, 23, 41);
    box-sizing: border-box;
  }
  /* Title + trust note sit as one attribution block; control sits below. */
  .mh-stage-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
    color: rgb(51, 65, 85);
  }
  .mh-stage-sub {
    margin: 4px 0 0;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    color: rgb(100, 116, 139);
  }
  .mh-stage-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 12px;
  }
  .mh-stage-label-text {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.3;
    color: rgb(100, 116, 139);
  }
  ::slotted(select) {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    box-sizing: border-box;
    border-radius: 6px;
    border: 1px solid rgb(203, 213, 225);
    background-color: rgb(255, 255, 255);
    /* Chevron drawn so we can drop UA appearance bloat without losing the
       affordance. Right padding keeps the value clear of the glyph. */
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 12px;
    color: rgb(15, 23, 41);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.35;
    padding: 6px 28px 6px 8px;
    cursor: pointer;
  }
  ::slotted(select:hover) {
    border-color: rgb(148, 163, 184);
  }
  ::slotted(select:focus) {
    outline: 2px solid rgb(100, 116, 139);
    outline-offset: 1px;
  }
`;
