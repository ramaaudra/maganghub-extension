import {
	DETAIL_HEADER_SELECTORS,
	FIELD_SELECTORS,
	type FieldSelectors,
	INFO_ROW_LABELS,
	SHARE_CLUSTER_SELECTORS,
} from "./constants";
import { readInfoRows } from "./parse";
import { type LowonganSnapshot, UUID_REGEX } from "./types";

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
 * The detail page's header block — the subtree holding the logo, `h1` and
 * organizer. Resolved from the `h1` upward rather than by matching the block's
 * own utility classes: `h1` is the one anchor on this page confirmed stable,
 * and the block is exactly two levels above it (`h1` → `div.flex-1` → block).
 * The class-based selectors are a fallback for the day that nesting changes.
 */
export function findDetailHeader(root: ParentNode): HTMLElement | null {
	const title = queryFirst<HTMLElement>(root, DETAIL_HEADER_SELECTORS.title);
	const block = title?.parentElement?.parentElement;
	if (block) return block;
	return queryFirst<HTMLElement>(root, DETAIL_HEADER_SELECTORS.block);
}

/**
 * The share cluster the favorite toggle mounts into, or null (issue #10).
 *
 * Each layer needs its own step back to the cluster, so this can't be a plain
 * `queryFirst` over `SHARE_CLUSTER_SELECTORS`: the "Bagikan" button and the
 * lucide icon are landmarks *inside* the cluster, while the utility-class
 * selector matches the cluster itself.
 *
 * Returning null is a real outcome, not a failure to handle: the caller
 * injects nothing and reports `degraded` (issue #10) rather than falling back
 * to a second injection point that would never run in practice and would rot.
 */
export function findShareCluster(root: ParentNode): HTMLElement | null {
	const [shareButton, clusterClass, shareIcon] = SHARE_CLUSTER_SELECTORS;

	const byLabel = root.querySelector<HTMLElement>(shareButton);
	if (byLabel?.parentElement) return byLabel.parentElement;

	const byClass = root.querySelector<HTMLElement>(clusterClass);
	if (byClass) return byClass;

	const byIcon = root.querySelector<SVGElement>(shareIcon);
	const iconButton = byIcon?.closest("button");
	return iconButton?.parentElement ?? null;
}

/**
 * Capture a snapshot from a detail page (issue #10).
 *
 * Takes TWO scopes because the page has two: `header` is the block holding the
 * logo, `h1` and organizer; `page` is the whole document, where the sidebar's
 * info rows live. They are disjoint subtrees whose only common ancestor is
 * essentially the entire page — and searching that wide is not merely
 * imprecise, it is destructive: page-wide, the first `img` is a call-centre
 * icon and `p.text-muted-foreground` matches 15 elements. Since the saved
 * snapshot is immutable (ADR-0002) and refresh only touches `liveStatus`, a
 * wrong logo or organizer persists forever. Empty is recoverable; wrong is not.
 *
 * Location/Kuota/Pelamar come from label lookup rather than selectors — the
 * rows are structurally identical and distinguished only by their label text —
 * and share `readInfoRows` with the refresh parser.
 *
 * Missing fields stay empty/undefined so a partially-parsed page still stars
 * (ADR-0002: the snapshot is best-effort).
 */
export function extractDetailSnapshot(
	header: HTMLElement | null,
	page: ParentNode,
): LowonganSnapshot {
	const logo = header
		? (queryFirst(
				header,
				DETAIL_HEADER_SELECTORS.logo,
			) as HTMLImageElement | null)
		: null;
	const info = readInfoRows(page);
	return {
		title: header ? textBySelector(header, DETAIL_HEADER_SELECTORS.title) : "",
		organizer: header
			? textBySelector(header, DETAIL_HEADER_SELECTORS.organizer)
			: "",
		location: info.get(INFO_ROW_LABELS.location) ?? "",
		kuota: info.get(INFO_ROW_LABELS.kuota) || undefined,
		pelamar: info.get(INFO_ROW_LABELS.pelamar) || undefined,
		logoUrl: logo?.getAttribute("src") ?? undefined,
		capturedAt: new Date().toISOString(),
	};
}
