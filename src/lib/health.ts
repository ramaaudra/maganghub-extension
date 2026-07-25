import {
	CARD_ANCHOR_SELECTOR,
	CARD_SELECTOR,
	DETAIL_HEADER_SELECTORS,
} from "./constants";
import { findShareCluster, queryFirst } from "./extract";

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
 */
export function assessListMarkup(root: ParentNode): HealthStatus {
	if (root.querySelector(CARD_SELECTOR)) return "ok";
	// No cards. Is this a results list we've stopped recognizing, or a page with
	// no results? Links to Lowongan detail pages are the tell: they mean results
	// ARE rendered, we just can't find the card structure around them.
	return root.querySelector(CARD_ANCHOR_SELECTOR) ? "degraded" : "ok";
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
