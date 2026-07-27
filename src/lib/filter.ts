import type { Favorite, StatusLamar } from "./types";

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

/**
 * The orders the popup offers. `savedAt` is newest-first; `organizer` and
 * `location` are A→Z; `stageSeats` (issue #21) orders by Status Lamar first
 * (active above terminal), then by remaining seats within the active block.
 */
export type SortKey = "savedAt" | "organizer" | "location" | "stageSeats";

/**
 * The terminal Status Lamar stages (D9's active block): a Favorite still in
 * progress vs one the user is done with. Diterima and Ditolak are terminal.
 * Complementary to the on-card `ACTIVE_STAGES` set ({dilamar, interview}) in
 * FavoriteCard.svelte — both encode the same active/terminal partition, but
 * are defined separately (a shared `src/lib/stages.ts` would dedupe; kept
 * separate here to scope #21 to the sort, not a card refactor).
 */
const TERMINAL_STAGES: ReadonlySet<StatusLamar> = new Set([
	"diterima",
	"ditolak",
]);

/**
 * The sort bucket a Favorite lands in under `stageSeats` (issue #21). Lower
 * ranks sort first. Buckets, in priority order:
 *
 * - `withSeats` (0): active stage, kuota + pelamar known, remaining > 0 — the
 *   Lowongan still has open seats. Sorted ascending by remaining so the
 *   closest-to-full rises to the top (the urgency the user can still act on).
 * - `overSubscribed` (1): active stage, remaining ≤ 0 — futile, no seats left.
 *   Kept below `withSeats`; ordered ascending by remaining too, so the
 *   most-over-subscribed (smallest remaining, e.g. −10 before −1) sorts first
 *   — one rule (ascending by remaining) covers both numeric buckets.
 * - `unrefreshed` (2): active stage, but kuota/pelamar unknown (never refreshed
 *   or refresh failed with no prior numbers). No remaining to order by, so
 *   newest-saved first — the recently-saved Lowongan the user might still want
 *   to refresh lands above older stale ones.
 * - `terminal` (3): Status Lamar is Diterima/Ditolak, or Status Lowongan is
 *   Closed — the user is done with this one. Newest-saved first.
 *
 * "Active" = no stage, Dilamar, or Interview. A terminal Status Lamar always
 * wins (a Diterima Favorite is done even if seats remain); a Closed Status
 * Lowongan wins over the active buckets even with an active stage. See D9 and
 * issue #21's acceptance criteria.
 */
type StageSeatsRank = 0 | 1 | 2 | 3;

function stageSeatsRank(fav: Favorite): StageSeatsRank {
	if (fav.statusLamar && TERMINAL_STAGES.has(fav.statusLamar)) return 3;
	if (fav.liveStatus.status === "closed") return 3;
	const remaining = remainingSeats(fav);
	if (remaining === undefined) return 2;
	return remaining > 0 ? 0 : 1;
}

/**
 * Remaining seats = kuota − pelamar, or `undefined` when either number is
 * unknown (never refreshed, or refresh failed with no prior numbers). Used by
 * both the ranker (to pick the bucket) and the comparator (to order within it),
 * so the two never disagree on what "remaining" means.
 */
function remainingSeats(fav: Favorite): number | undefined {
	const { kuota, pelamar } = fav.liveStatus;
	if (kuota === undefined || pelamar === undefined) return undefined;
	return kuota - pelamar;
}

/**
 * Compare two Favorites under `stageSeats` (issue #21). Bucket first (active
 * above terminal, then seats within active); within a numeric bucket order by
 * remaining ascending; break ties newest-saved so the order is always stable.
 */
function compareByStageSeats(a: Favorite, b: Favorite): number {
	const rankA = stageSeatsRank(a);
	const rankB = stageSeatsRank(b);
	if (rankA !== rankB) return rankA - rankB;
	if (rankA === 0 || rankA === 1) {
		// Rank 0/1 guarantees both have numbers, so the ?? 0 fallback is unreachable.
		const remainingA = remainingSeats(a) ?? 0;
		const remainingB = remainingSeats(b) ?? 0;
		if (remainingA !== remainingB) return remainingA - remainingB;
	}
	return b.savedAt.localeCompare(a.savedAt);
}

/**
 * Sort Favorites by `key`, returning a new array (input untouched).
 *
 * `savedAt` is newest-first (matching the storage layer's default order);
 * `organizer` and `location` are A→Z, compared with Indonesian locale collation
 * so accents and case sort the way a reader expects. `stageSeats` (issue #21)
 * orders by Status Lamar first (active above terminal), then by remaining
 * seats within the active block — see `compareByStageSeats`. All keys fall back
 * to newest-first on ties, so every sort is stable and meaningful.
 */
export function sortFavorites(
	favorites: readonly Favorite[],
	key: SortKey,
): Favorite[] {
	const sorted = [...favorites];
	if (key === "stageSeats") {
		sorted.sort(compareByStageSeats);
		return sorted;
	}
	sorted.sort((a, b) => {
		if (key !== "savedAt") {
			const byKey = collate(a.savedSnapshot[key], b.savedSnapshot[key]);
			if (byKey !== 0) return byKey;
		}
		return b.savedAt.localeCompare(a.savedAt);
	});
	return sorted;
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
