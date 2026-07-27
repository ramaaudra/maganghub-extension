import {
	CARD_ANCHOR_SELECTOR,
	CARD_SELECTOR,
	DETAIL_HEADER_SELECTORS,
} from "./constants";
import { extractSnapshot, findShareCluster, queryFirst } from "./extract";

/**
 * Injection health (issue #8). MagangHub is a site we don't control; when its
 * markup changes, the content script must fail silently rather than crash, and
 * the popup must say so ("extension mungkin butuh update") instead of leaving
 * the user to wonder why stars vanished.
 */

/** Whether the content script can still find what it needs on the page. */
export type HealthStatus = "ok" | "degraded";

/**
 * Assess a list page's markup.
 *
 * `degraded` means "we no longer recognize this page", which is NOT the same as
 * "there is nothing to inject into": a filter with no results, or a list that
 * hasn't rendered its cards yet, is a healthy page with zero cards. Only the
 * absence of the whole card *structure* on a page that should have one counts.
 *
 * Field-aware (D1): card *presence* alone is not health. P1b shipped for weeks
 * with `.mh-lowongan-card` present on every page but `organizer`/`location`
 * silently empty, because this check only looked for the wrapper — which is why
 * the bug survived 40 e2e tests and ten commits. A card that plainly exists yet
 * carries neither organizer nor location means we lost the inner structure, not
 * the data: the same failure `extractSnapshot` would store blank. One empty
 * field can be real data; both empty on a card that exists means the page broke.
 *
 * Only the **first** card is inspected. Scanning all 18 cards on every mutation
 * is exactly the DOM work AC #45 forbids ("must not slow down MagangHub page
 * loads"), and one structurally-broken card means the page is broken — there is
 * no per-card health, only per-page.
 */
export function assessListMarkup(root: ParentNode): HealthStatus {
	const card = root.querySelector<HTMLElement>(CARD_SELECTOR);
	if (!card) {
		// No cards. Is this a results list we've stopped recognizing, or a page
		// with no results? Links to Lowongan detail pages are the tell: they mean
		// results ARE rendered, we just can't find the card structure around them.
		return root.querySelector(CARD_ANCHOR_SELECTOR) ? "degraded" : "ok";
	}
	// Reuse `extractSnapshot` so the health check sees exactly what starring
	// sees — the same selectors, the same failure mode — rather than a parallel
	// read that could drift out of sync (the invariant `queryFirst` exists for).
	const { organizer, location } = extractSnapshot(card);
	return organizer === "" && location === "" ? "degraded" : "ok";
}

/**
 * Assess a detail page's markup.
 *
 * Checks BOTH the title (can we read the page?) and the share cluster (can we
 * inject into it?). Title alone is not enough: since issue #10 removed the
 * fallback injection point, a missing share cluster means no toggle is
 * rendered at all — and reporting `ok` there would leave the user staring at a
 * page with no button and no explanation, which is the worst outcome
 * available. Unlike the list, there is no benign "zero results" case: a detail
 * page always has both.
 *
 * The "Lowongan Serupa" cards further down the page are deliberately NOT part
 * of this signal. That section may legitimately be empty, and folding
 * `assessListMarkup` in would fire a false `degraded` on a perfectly healthy
 * page.
 */
export function assessDetailMarkup(root: ParentNode): HealthStatus {
	const hasTitle = queryFirst(root, DETAIL_HEADER_SELECTORS.title) !== null;
	const hasInjectionPoint = findShareCluster(root) !== null;
	return hasTitle && hasInjectionPoint ? "ok" : "degraded";
}

/**
 * Storage key for the health signal. Deliberately outside the `fav:` prefix so
 * `listFavorites` never sees it and export never carries it — this is a
 * transient observation about the site, not user data.
 */
export const HEALTH_KEY = "__health";

/**
 * Record the latest injection health. Called on every scan, so a site that
 * breaks and is then fixed clears its own warning — a banner that never goes
 * away just teaches the user to ignore it.
 */
export async function reportHealth(status: HealthStatus): Promise<void> {
	await browser.storage.local.set({ [HEALTH_KEY]: status });
}

/** The last reported health. Defaults to `ok` — assume nothing is wrong. */
export async function readHealth(): Promise<HealthStatus> {
	const stored = await browser.storage.local.get(HEALTH_KEY);
	return stored[HEALTH_KEY] === "degraded" ? "degraded" : "ok";
}
