/**
 * Toolbar badge for B1 change notification (D5).
 *
 * Counts Favorites whose Status Lowongan changed since the popup was last
 * opened. Uses `browser.action.setBadgeText` — no new permission. The card
 * notice (`formatChangeNotice`) stays up as long as `previousSample` differs;
 * the badge is the unseen-count and clears on popup open.
 */

import { formatChangeNotice } from "./change";
import { listFavorites } from "./storage";
import type { Favorite } from "./types";

/** Storage key for the ISO timestamp of the last popup open. */
export const POPUP_LAST_OPENED_KEY = "meta:popupLastOpenedAt";

/**
 * A Favorite counts toward the badge when it has a change notice AND the
 * change landed after the popup was last opened (or the popup has never been
 * opened). `lastChecked` is the moment the new sample was written, so it
 * doubles as "when the change was observed".
 */
export function countsAsUnseenChange(
	favorite: Favorite,
	lastOpenedAt: string | null | undefined,
): boolean {
	if (!formatChangeNotice(favorite.liveStatus)) return false;
	const changedAt = favorite.liveStatus.lastChecked;
	if (!changedAt) return false;
	if (!lastOpenedAt) return true;
	return changedAt > lastOpenedAt;
}

/** Count Favorites with an unseen change notice. */
export function countUnseenChanges(
	favorites: readonly Favorite[],
	lastOpenedAt: string | null | undefined,
): number {
	let n = 0;
	for (const fav of favorites) {
		if (countsAsUnseenChange(fav, lastOpenedAt)) n++;
	}
	return n;
}

/** Read the last-popup-opened timestamp from storage. */
export async function readPopupLastOpenedAt(): Promise<string | null> {
	const result = await browser.storage.local.get(POPUP_LAST_OPENED_KEY);
	const value = result[POPUP_LAST_OPENED_KEY];
	return typeof value === "string" ? value : null;
}

/** Record that the popup is open now (clears the unseen window). */
export async function markPopupOpened(
	now: string = new Date().toISOString(),
): Promise<void> {
	await browser.storage.local.set({ [POPUP_LAST_OPENED_KEY]: now });
}

/**
 * Recompute the toolbar badge from current Favorites + last-opened stamp.
 * Empty string clears the badge. Safe no-op when `browser.action` is missing
 * (unit tests under fake-browser).
 */
export async function syncToolbarBadge(
	favorites: readonly Favorite[],
	lastOpenedAt: string | null | undefined,
): Promise<void> {
	const count = countUnseenChanges(favorites, lastOpenedAt);
	const text = count > 0 ? String(count) : "";
	const action = browser.action;
	if (!action?.setBadgeText) return;
	await action.setBadgeText({ text });
	// Amber so a non-zero badge reads as "attention" next to the grey default.
	if (count > 0 && action.setBadgeBackgroundColor) {
		await action.setBadgeBackgroundColor({ color: "#d97706" });
	}
}

/** Convenience: read storage, count, paint the badge. */
export async function refreshToolbarBadge(): Promise<void> {
	const [favorites, lastOpenedAt] = await Promise.all([
		listFavorites(),
		readPopupLastOpenedAt(),
	]);
	await syncToolbarBadge(favorites, lastOpenedAt);
}
