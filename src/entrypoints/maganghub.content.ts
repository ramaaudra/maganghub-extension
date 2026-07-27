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
	stageChipAriaLabel,
	stageLabel,
} from "@/lib/stage";
import type { Favorite, StatusLamar } from "@/lib/types";
import {
	type UrgencyBand,
	urgencyBandFromCard,
	urgencyLabel,
} from "@/lib/urgency";

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
	const { button, urgency, chip } = buildStarChrome(shadow);
	applyUrgency(host, urgency, urgencyBandFromCard(card));
	card.append(host);

	const state: StarState = { interacted: false };
	// Filled bit + stage chip both ride the Favorite shape from the updater
	// protocol (issue #14 / #19). A3 will hang the Catatan tooltip off the same
	// `apply` seam.
	const apply = (favorite: Favorite | undefined) => {
		setFilled(host, button, Boolean(favorite));
		applyStageChip(host, chip, favorite?.statusLamar);
	};
	void reflectState(uuid, apply, state);
	registerUpdater(uuid, apply, host);
	attachStarToggle(card, uuid, anchor, host, button, chip, state);
}

/**
 * Star button + urgency ring + stage chip inside one closed shadow
 * (issues #16 / #19).
 *
 * The ring is colour-only (pre-attentive). Title/aria-label for the band live
 * on the light-DOM host (see `applyUrgency`); `data-urgency` on the host lets
 * e2e assert the band without piercing the closed shadow.
 *
 * The stage chip is a real light-DOM element (slotted) so AT and e2e can
 * reach it without piercing Shadow DOM — same pattern as the detail stage
 * card's select. Colour channel is left to A1; the chip is text-only (D7).
 */
function buildStarChrome(shadow: ShadowRoot): {
	button: HTMLButtonElement;
	urgency: HTMLElement;
	chip: HTMLElement;
} {
	const style = document.createElement("style");
	style.textContent = STAR_CSS;
	const button = document.createElement("button");
	button.type = "button";
	button.className = "mh-star";
	button.setAttribute("aria-label", "Tandai sebagai favorit");
	button.setAttribute("aria-pressed", "false");
	button.textContent = "★";
	const urgency = document.createElement("span");
	urgency.className = "mh-urgency";
	urgency.hidden = true;
	// Chip lives in light DOM via <slot>, so Playwright/AT see it on the host.
	const chip = document.createElement("span");
	chip.className = "mh-stage-chip";
	chip.hidden = true;
	chip.setAttribute("data-stage-chip", "true");
	const slot = document.createElement("slot");
	shadow.append(style, urgency, button, slot);
	return { button, urgency, chip };
}

/**
 * Paint the urgency ring for a band, or hide it when numbers don't parse.
 *
 * The ring is purely visual (`pointer-events: none` so it never steals the
 * star click). The textual equivalent (WCAG 1.4.1) therefore lives on the
 * light-DOM host — same pattern as the stage card's attribution — where hover
 * and AT can both reach it. The star button keeps its own aria-label.
 */
function applyUrgency(
	host: HTMLElement,
	urgency: HTMLElement,
	band: UrgencyBand | undefined,
): void {
	if (!band) {
		host.removeAttribute("data-urgency");
		host.removeAttribute("title");
		host.removeAttribute("aria-label");
		urgency.hidden = true;
		urgency.removeAttribute("data-band");
		return;
	}
	const label = urgencyLabel(band);
	host.setAttribute("data-urgency", band);
	host.setAttribute("title", label);
	host.setAttribute("aria-label", label);
	urgency.hidden = false;
	urgency.setAttribute("data-band", band);
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
	const apply = (favorite: Favorite | undefined) =>
		setFilled(host, button, Boolean(favorite), DETAIL_LABELS);
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
	if (sidebar.hasAttribute(STAGE_INJECTED_ATTR)) return;
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
	const select = document.createElement("select");
	select.setAttribute("aria-label", "Status Lamar");
	select.dataset.stageSelect = "true";
	for (const [value, label] of STAGE_OPTIONS) {
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

/** Stage options, matching the popup's Status Lamar select (issue #15). */
const STAGE_OPTIONS: ReadonlyArray<readonly [string, string]> = [
	["", "Belum dilamar"],
	["dilamar", "Dilamar"],
	["interview", "Interview"],
	["diterima", "Diterima"],
	["ditolak", "Ditolak"],
];

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
  /* Urgency ring (issue #16): colour only — the Kuota/Pelamar pills already
     carry the numbers. Three bands share one element; band drives colour via
     data-band so MagangHub's Tailwind cannot restyle it (closed shadow). */
  .mh-urgency {
    position: absolute;
    inset: -3px;
    border-radius: 9999px;
    border: 2px solid transparent;
    pointer-events: none;
    box-sizing: border-box;
  }
  .mh-urgency[data-band="calm"] { border-color: #22c55e; }
  .mh-urgency[data-band="hampir_penuh"] { border-color: #f59e0b; }
  .mh-urgency[data-band="lewat_kuota"] { border-color: #ef4444; }
  /* Stage chip (issue #19 / A2): text only — colour channel belongs to A1.
     Neutral slate so Dilamar and Ditolak never look the same via colour.
     Positioned under the star so it doesn't cover MagangHub's title. */
  ::slotted(.mh-stage-chip) {
    position: absolute;
    top: 34px;
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
 */
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
    gap: 10px;
    padding: 20px;
    border-radius: 16px;
    border: 1px solid rgb(203, 213, 225);
    background: rgb(248, 250, 252);
    color: rgb(15, 23, 41);
    box-sizing: border-box;
  }
  .mh-stage-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
    color: rgb(51, 65, 85);
  }
  .mh-stage-sub {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: rgb(100, 116, 139);
  }
  .mh-stage-label {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mh-stage-label-text {
    font-size: 12px;
    font-weight: 500;
    color: rgb(71, 85, 105);
  }
  ::slotted(select) {
    appearance: auto;
    width: 100%;
    box-sizing: border-box;
    border-radius: 8px;
    border: 1px solid rgb(203, 213, 225);
    background: rgb(255, 255, 255);
    color: rgb(15, 23, 41);
    font-size: 13px;
    line-height: 1.4;
    padding: 8px 10px;
    cursor: pointer;
  }
  ::slotted(select:focus) {
    outline: 2px solid rgb(100, 116, 139);
    outline-offset: 1px;
  }
`;
