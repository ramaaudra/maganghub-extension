import type { Favorite } from "./types";

/**
 * Search + sort helpers for the popup's Favorites list (issue #6). Pure
 * functions over `Favorite[]` so the popup can derive its rendered list without
 * touching storage, and so the edge cases are unit-testable without a browser.
 */

/**
 * Filter Favorites by a free-text query, matched against the saved snapshot's
 * title, Penyelenggara, and location.
 */
export function searchFavorites(
	favorites: readonly Favorite[],
	query: string,
): Favorite[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return [...favorites];
	return favorites.filter((fav) => haystack(fav).includes(needle));
}

/** The searchable text of one Favorite: title + Penyelenggara + location. */
function haystack(fav: Favorite): string {
	const { title, organizer, location } = fav.savedSnapshot;
	return `${title}\n${organizer}\n${location}`.toLowerCase();
}

/** The orders the popup offers. `savedAt` is newest-first; the rest are A→Z. */
export type SortKey = "savedAt" | "organizer" | "location";

/**
 * Sort Favorites by `key`, returning a new array (input untouched).
 *
 * `savedAt` is newest-first (matching the storage layer's default order);
 * `organizer` and `location` are A→Z, compared with Indonesian locale collation
 * so accents and case sort the way a reader expects. Ties fall back to
 * newest-first, so Favorites sharing a Penyelenggara or location keep a stable,
 * meaningful order instead of an arbitrary one.
 */
export function sortFavorites(
	favorites: readonly Favorite[],
	key: SortKey,
): Favorite[] {
	return [...favorites].sort((a, b) => {
		if (key !== "savedAt") {
			const byKey = collate(a.savedSnapshot[key], b.savedSnapshot[key]);
			if (byKey !== 0) return byKey;
		}
		return b.savedAt.localeCompare(a.savedAt);
	});
}

/**
 * Compare two display strings A→Z the way a reader scanning the list expects.
 *
 * Punctuation is ignored because it is formatting, not content, in both fields
 * we sort: locations read `Kota, Provinsi` (so "Jakarta, DKI Jakarta" belongs
 * before "Jakarta Pusat, DKI Jakarta" — D before P, the comma is noise), and a
 * Penyelenggara is written both "PT Maju" and "PT. Maju", which readers expect
 * to sort adjacent. Case and accents are folded for the same reason.
 */
function collate(a: string, b: string): number {
	return a.localeCompare(b, "id", {
		sensitivity: "base",
		ignorePunctuation: true,
	});
}
