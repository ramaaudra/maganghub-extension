import {
	CARD_SELECTOR,
	CARD_ANCHOR_SELECTOR,
	DETAIL_FIELD_SELECTORS,
} from "./constants";
import { queryFirst } from "./extract";

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
 * Assess a detail page's markup. The toggle anchors to the page title, so a
 * page with no recognizable title is one we can't inject into. Unlike the list,
 * there is no benign "zero results" case here — a detail page always has a
 * title.
 */
export function assessDetailMarkup(root: ParentNode): HealthStatus {
	return queryFirst(root, DETAIL_FIELD_SELECTORS.title) ? "ok" : "degraded";
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
