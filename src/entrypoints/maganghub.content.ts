import {
	CARD_ANCHOR_SELECTOR,
	CARD_SELECTOR,
	DETAIL_HOST_CLASS,
	DETAIL_INJECTED_ATTR,
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
} from "@/lib/extract";
import {
	assessDetailMarkup,
	assessListMarkup,
	type HealthStatus,
	reportHealth,
} from "@/lib/health";
import {
	createFavorite,
	FAVORITE_KEY_PREFIX,
	getFavorite,
	isFavorited,
	removeFavorite,
	setFavorite,
} from "@/lib/storage";

/**
 * Content script for MagangHub Lowongan pages.
 *
 * A single `matches` covers both the list page (`/magang-nasional/lowongan`) and
 * detail pages (`/magang-nasional/lowongan/<slug>-<uuid>`); `main()` branches on
 * whether the path carries a UUID. Both surfaces inject a favorite toggle as
 * plain DOM inside a CLOSED Shadow DOM (ADR-0004: no framework runtime shipped
 * to the page; styles isolated from MagangHub's Tailwind). Clicking either
 * toggle persists the same Favorite record to chrome.storage.local keyed by the
 * Lowongan UUID, and a storage.onChanged listener keeps every injected toggle
 * in sync with the canonical storage state (issue #3: detail ↔ list state sync).
 */
export default defineContentScript({
	matches: ["https://maganghub.kemnaker.go.id/magang-nasional/lowongan*"],
	main() {
		// Guarded like every later scan: a MagangHub redesign must never surface
		// as a console error in the user's page (issue #8).
		safeScan();
		watchForChanges();
		setupStorageSync();
	},
});

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

type FilledUpdater = (filled: boolean) => void;

/**
 * A registered toggle: the updater to call on a storage change, plus the host
 * node it draws into. The host is what makes cleanup possible — once MagangHub
 * swaps a card out, its host is detached from the document and the updater is
 * dead weight (issue #8: "cleanup on card removal").
 */
interface Registration {
	update: FilledUpdater;
	host: HTMLElement;
}

/** Per-UUID updaters, fired by the storage.onChanged listener for live sync. */
const updaters = new Map<string, Set<Registration>>();

function registerUpdater(
	uuid: string,
	update: FilledUpdater,
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

function notifyUpdaters(uuid: string, filled: boolean): void {
	const set = updaters.get(uuid);
	if (!set) return;
	for (const { update } of set) update(filled);
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
			const nowFavorited = changes[key].newValue !== undefined;
			notifyUpdaters(uuid, nowFavorited);
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
	if (card.hasAttribute(STAR_INJECTED_ATTR)) return;

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
	host.style.setProperty("top", "8px");
	host.style.setProperty("right", "8px");
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
	const button = buildStarButton(shadow);
	card.append(host);

	const state: StarState = { interacted: false };
	const apply = (filled: boolean) => setFilled(host, button, filled);
	void reflectState(uuid, apply, state);
	registerUpdater(uuid, apply, host);
	attachStarToggle(card, uuid, anchor, host, button, state);
}

function buildStarButton(shadow: ShadowRoot): HTMLButtonElement {
	const style = document.createElement("style");
	style.textContent = STAR_CSS;
	const button = document.createElement("button");
	button.type = "button";
	button.className = "mh-star";
	button.setAttribute("aria-label", "Tandai sebagai favorit");
	button.setAttribute("aria-pressed", "false");
	button.textContent = "★";
	shadow.append(style, button);
	return button;
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
	if (cluster.hasAttribute(DETAIL_INJECTED_ATTR)) return;
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
	const apply = (filled: boolean) =>
		setFilled(host, button, filled, DETAIL_LABELS);
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
 * Lucide `star`, inline. The neighbouring "Bagikan" button renders a lucide SVG
 * at stroke-width 2, so a `★` text glyph beside it would sit at a visibly
 * different weight and baseline. `fill` is driven by CSS: `none` when unsaved,
 * `currentColor` when saved.
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
	apply: FilledUpdater,
	state: StarState,
): Promise<void> {
	const fav = await getFavorite(uuid);
	// Don't clobber a click that landed before the initial read resolved.
	if (state.interacted) return;
	apply(Boolean(fav));
}

/**
 * Mirror the toggle state onto the light-DOM host (data-filled) so it is
 * observable without piercing the closed Shadow DOM, and update the shadow
 * button's visual + aria-pressed. aria-pressed lives only on the interactive
 * button — the host is a non-interactive div where AT would ignore it.
 */
function setFilled(
	host: HTMLElement,
	button: HTMLButtonElement,
	filled: boolean,
	labels: FilledLabels = STAR_LABELS,
): void {
	host.setAttribute("data-filled", String(filled));
	button.classList.toggle("is-filled", filled);
	button.setAttribute("aria-pressed", String(filled));
	const label = filled ? labels.labelOn : labels.labelOff;
	button.setAttribute("aria-label", label);
	if (button.title) button.title = label;
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
			}
		}
	});
}

const STAR_CSS = `
  :host { all: initial; }
  .mh-star {
    all: initial;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 9999px;
    border: 1px solid rgba(0,0,0,0.12);
    background: rgba(255,255,255,0.9);
    color: #cbd5e1;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(4px);
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    transition: transform 80ms ease, color 80ms ease, background 80ms ease;
  }
  .mh-star:hover { transform: scale(1.08); color: #f59e0b; }
  .mh-star.is-filled { color: #f59e0b; background: rgba(255,255,255,1); }
  .mh-star.is-filled:hover { color: #d97706; }
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
