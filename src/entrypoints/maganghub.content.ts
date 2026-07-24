import {
	CARD_SELECTOR,
	CARD_ANCHOR_SELECTOR,
	STAR_INJECTED_ATTR,
	STAR_HOST_CLASS,
	DETAIL_HOST_CLASS,
	DETAIL_FIELD_SELECTORS,
} from "@/lib/constants";
import {
	extractUuidFromHref,
	extractDetailUrl,
	extractSnapshot,
	extractDetailSnapshot,
} from "@/lib/extract";
import {
	createFavorite,
	getFavorite,
	isFavorited,
	removeFavorite,
	setFavorite,
	FAVORITE_KEY_PREFIX,
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
		const pathUuid = extractUuidFromHref(location.pathname);
		if (pathUuid) {
			injectDetailToggle(pathUuid);
		} else {
			injectStars();
		}
		setupStorageSync();
	},
});

interface StarState {
	/** True once the user has clicked this toggle; gates the initial reflect. */
	interacted: boolean;
}

type FilledUpdater = (filled: boolean) => void;

/** Per-UUID updaters, fired by the storage.onChanged listener for live sync. */
const updaters = new Map<string, Set<FilledUpdater>>();

function registerUpdater(uuid: string, update: FilledUpdater): () => void {
	let set = updaters.get(uuid);
	if (!set) {
		set = new Set();
		updaters.set(uuid, set);
	}
	set.add(update);
	return () => {
		set?.delete(update);
		if (set && set.size === 0) updaters.delete(uuid);
	};
}

function notifyUpdaters(uuid: string, filled: boolean): void {
	const set = updaters.get(uuid);
	if (!set) return;
	for (const update of set) update(filled);
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
	card.style.setProperty("position", card.style.position || "relative");
	const shadow = host.attachShadow({ mode: "closed" });
	const button = buildStarButton(shadow);
	card.append(host);

	const state: StarState = { interacted: false };
	const apply = (filled: boolean) => setFilled(host, button, filled);
	void reflectState(uuid, apply, state);
	registerUpdater(uuid, apply);
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

/** First element matching any of `selectors`, in priority order, or null. */
function queryFirstElement(
	root: HTMLElement,
	selectors: readonly string[],
): HTMLElement | null {
	for (const selector of selectors) {
		const el = root.querySelector<HTMLElement>(selector);
		if (el) return el;
	}
	return null;
}

// ─────────────────────── Detail page: toggle near title ─────────────────────

/**
 * Inject a favorite toggle on a Lowongan detail page, near the `<h1>` title.
 * The detail toggle drives the SAME Favorite record as the list star (same
 * UUID), so state stays consistent across surfaces (issue #3).
 */
function injectDetailToggle(uuid: string): void {
	const titleEl = queryFirstElement(
		document.body,
		DETAIL_FIELD_SELECTORS.title,
	);
	if (!titleEl) return;
	if (titleEl.hasAttribute(STAR_INJECTED_ATTR)) return;
	titleEl.setAttribute(STAR_INJECTED_ATTR, uuid);

	const host = document.createElement("div");
	host.className = DETAIL_HOST_CLASS;
	host.setAttribute("data-filled", "false");
	const shadow = host.attachShadow({ mode: "closed" });
	const button = buildDetailButton(shadow);
	// Place the toggle adjacent to the title (AC: "near the title").
	titleEl.after(host);

	const state: StarState = { interacted: false };
	const apply = (filled: boolean) =>
		setFilled(host, button, filled, DETAIL_LABELS);
	void reflectState(uuid, apply, state);
	registerUpdater(uuid, apply);
	attachDetailToggle(uuid, titleEl, host, button, state);
}

function buildDetailButton(shadow: ShadowRoot): HTMLButtonElement {
	const style = document.createElement("style");
	style.textContent = DETAIL_CSS;
	const button = document.createElement("button");
	button.type = "button";
	button.className = "mh-favorite-detail";
	button.setAttribute("aria-label", DETAIL_LABELS.labelOff);
	button.setAttribute("aria-pressed", "false");
	button.textContent = DETAIL_LABELS.textOff ?? "☆ Tandai Favorit";
	shadow.append(style, button);
	return button;
}

function attachDetailToggle(
	uuid: string,
	titleEl: HTMLElement,
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
				savedSnapshot: extractDetailSnapshot(detailContainer(titleEl)),
			});
			// re-read in case of a race, then persist only if still not favorited
			if (!(await isFavorited(uuid))) {
				await setFavorite(favorite);
				setFilled(host, button, true, DETAIL_LABELS);
			}
		}
	});
}

/** The DOM scope to extract the detail snapshot from: the title's `<main>`, or
 * its nearest section, falling back to the body. Keeps `img`/`h1` lookups from
 * matching unrelated page chrome. */
function detailContainer(titleEl: HTMLElement): HTMLElement {
	return (
		titleEl.closest<HTMLElement>("main") ??
		titleEl.closest<HTMLElement>("article") ??
		titleEl.parentElement ??
		document.body
	);
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

const DETAIL_LABELS: FilledLabels = {
	labelOn: "Hapus dari favorit",
	labelOff: "Tandai sebagai favorit",
	textOn: "★ Tersimpan",
	textOff: "☆ Tandai Favorit",
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
	button.setAttribute("aria-label", filled ? labels.labelOn : labels.labelOff);
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

const DETAIL_CSS = `
  :host { all: initial; display: inline-block; }
  .mh-favorite-detail {
    all: initial;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 6px 12px;
    border-radius: 9999px;
    border: 1px solid rgba(0,0,0,0.12);
    background: rgba(255,255,255,1);
    color: #475569;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    transition: color 80ms ease, background 80ms ease, border-color 80ms ease;
  }
  .mh-favorite-detail:hover { color: #f59e0b; border-color: rgba(245,158,11,0.5); }
  .mh-favorite-detail.is-filled {
    color: #b45309;
    background: rgba(254,243,199,1);
    border-color: rgba(245,158,11,0.6);
  }
  .mh-favorite-detail.is-filled:hover { color: #92400e; }
`;
