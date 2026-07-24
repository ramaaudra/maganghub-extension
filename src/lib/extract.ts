import { UUID_REGEX, type LowonganSnapshot } from "./types";
import {
	FIELD_SELECTORS,
	DETAIL_FIELD_SELECTORS,
	type FieldSelectors,
} from "./constants";

/**
 * Pure extraction helpers. These turn MagangHub DOM into plain data so they can
 * be unit-tested against fixture fragments without a browser.
 */

/** Pull the Lowongan UUID out of a detail href, or null if none. */
export function extractUuidFromHref(
	href: string | null | undefined,
): string | null {
	if (!href) return null;
	const match = href.match(UUID_REGEX);
	return match ? match[0] : null;
}

/**
 * The detail URL to store on the Favorite. MagangHub cards link via a relative
 * path (`/magang-nasional/lowongan/<slug>-<uuid>`); we store that path as-is so
 * the "open official detail" action (later issue) navigates within MagangHub.
 */
export function extractDetailUrl(anchor: HTMLAnchorElement): string {
	return anchor.getAttribute("href") ?? anchor.href;
}

/**
 * First element matching any of `selectors`, in priority order, or null.
 *
 * Shared because the priority-ordered selector lists in constants.ts are the
 * project's one story for "MagangHub may have renamed this": extraction, the
 * content script's injection points, and the health check must all walk them
 * the same way, or a selector that works for one silently fails another.
 */
export function queryFirst<T extends Element = Element>(
	root: ParentNode,
	selectors: readonly string[],
): T | null {
	for (const selector of selectors) {
		const el = root.querySelector<T>(selector);
		if (el) return el;
	}
	return null;
}

function textBySelector(
	root: HTMLElement,
	selectors: readonly string[],
): string {
	return queryFirst(root, selectors)?.textContent?.trim() ?? "";
}

/**
 * Capture an immutable snapshot of a card's visible fields. Missing fields come
 * back as empty strings (never throw) so a partially-parsed card still stars.
 */
export function extractSnapshot(
	card: HTMLElement,
	selectors: FieldSelectors = FIELD_SELECTORS,
): LowonganSnapshot {
	const logo = queryFirst(card, selectors.logo) as HTMLImageElement | null;
	const logoUrl = logo?.getAttribute("src") ?? undefined;
	return {
		title: textBySelector(card, selectors.title),
		organizer: textBySelector(card, selectors.organizer),
		location: textBySelector(card, selectors.location),
		kuota: textBySelector(card, selectors.kuota) || undefined,
		pelamar: textBySelector(card, selectors.pelamar) || undefined,
		logoUrl,
		capturedAt: new Date().toISOString(),
	};
}

/**
 * Capture a snapshot from a detail page. Same shape as a card snapshot but the
 * title comes from the page's `<h1>` (confirmed via camofox). `root` is the
 * detail container (e.g. `<main>`); missing fields are empty/undefined so a
 * partially-parsed detail page still stars (ADR-0002: snapshot is best-effort).
 */
export function extractDetailSnapshot(root: HTMLElement): LowonganSnapshot {
	return extractSnapshot(root, DETAIL_FIELD_SELECTORS);
}
