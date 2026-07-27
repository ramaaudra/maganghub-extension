import type { Favorite } from "./types";

/**
 * Collapsible per-Penyelenggara grouping (issue #22 / C4, D10).
 *
 * Pure functions over the already-searched, already-sorted `Favorite[]` so the
 * popup can derive its rendered list without touching storage, and so the
 * threshold + summary edge cases are unit-testable without a browser
 * (prior art: `src/lib/filter.ts`). The popup composes
 * `groupFavorites(searchFavorites(favorites, q) |> sortFavorites)`, so the
 * summary reflects the active search, never the whole storage set — the header
 * never contradicts the cards under it.
 *
 * A Penyelenggara with more than {@link GROUP_THRESHOLD} Favorites forms a
 * collapsible group with a stage-summary header; at or below the threshold,
 * cards stand alone with no header. The stage summary is what makes the
 * Penyelenggara relationship meaningful (someone who applied to eight Lowongan
 * from one org wants the org's applications as a whole, not card by card).
 */

/** A Penyelenggara with more than this many Favorites collapses into a group. */
export const GROUP_THRESHOLD = 3;

/**
 * The stage-summary categories shown on a group header (issue #22 example:
 * "PT Maju · 3 aktif, 1 interview, 2 ditolak").
 *
 * - `aktif`: no stage, or Dilamar — the applications the user is still waiting
 *   to hear back from before an interview. Matches D9's active block minus
 *   Interview, broken out so "aktif" + "interview" never read as one blob.
 * - `interview`: the Interview stage, broken out because a user with several
 *   applications at one org specifically wants to see how many are advancing.
 * - `diterima` / `ditolak`: terminal stages.
 *
 * Every favorite falls into exactly one category (no-stage and Dilamar both
 * count as `aktif`, the rest map to their own bucket), so the counts always
 * sum to the group's size — the header never under- or over-counts the cards
 * it summarises.
 */
export interface StageSummary {
	aktif: number;
	interview: number;
	diterima: number;
	ditolak: number;
}

/** Display labels for each summary category, in render order. */
const SUMMARY_LABELS: ReadonlyArray<readonly [keyof StageSummary, string]> = [
	["aktif", "aktif"],
	["interview", "interview"],
	["diterima", "diterima"],
	["ditolak", "ditolak"],
];

/**
 * One render item: a standalone card, or a collapsible Penyelenggara group.
 *
 * The popup iterates this in order. A `solo` item renders one `FavoriteCard`;
 * a `group` item renders a header + the group's favorites (kept in their
 * already-sorted order) under a collapse toggle.
 */
export type GroupedItem =
	| { kind: "solo"; favorite: Favorite }
	| {
			kind: "group";
			organizer: string;
			favorites: Favorite[];
			summary: StageSummary;
	  };

/**
 * The Penyelenggara name a Favorite groups under. Lives in the immutable
 * snapshot (ADR-0002) — the organizer a card was saved with is the one the
 * group header shows, even if MagangHub later renames it.
 */
function organizerOf(fav: Favorite): string {
	return fav.savedSnapshot.organizer;
}

/**
 * Count a group's favorites into the four summary categories.
 *
 * A stage is the only input — Status Lowongan (open/closed) does NOT feed the
 * summary, because the summary answers "where do my applications to this org
 * stand?", and a closed listing the user never applied to is not "ditolak".
 */
export function summarizeStages(favorites: readonly Favorite[]): StageSummary {
	const summary: StageSummary = {
		aktif: 0,
		interview: 0,
		diterima: 0,
		ditolak: 0,
	};
	for (const fav of favorites) {
		const stage = fav.statusLamar;
		if (stage === "interview") summary.interview += 1;
		else if (stage === "diterima") summary.diterima += 1;
		else if (stage === "ditolak") summary.ditolak += 1;
		// No stage or Dilamar → still in the active, pre-interview block.
		else summary.aktif += 1;
	}
	return summary;
}

/**
 * Render a summary as a comma-joined "{n} {label}" string, skipping zeros.
 *
 * "3 aktif, 1 interview, 2 ditolak" — never "3 aktif, 0 interview, 0 diterima,
 * 2 ditolak", so a clean org reads at a glance instead of as a wall of zeros.
 */
export function summaryText(summary: StageSummary): string {
	return SUMMARY_LABELS.filter(([key]) => summary[key] > 0)
		.map(([key, label]) => `${summary[key]} ${label}`)
		.join(", ");
}

/**
 * Group the (already-filtered, already-sorted) Favorites by Penyelenggara.
 *
 * A group collects EVERY favorite from one organizer into one block, even when
 * the active sort interleaves them — the Penyelenggara relationship is the
 * point of C4, so splitting one org across two blocks would defeat it. Each
 * group renders at the position of its organizer's FIRST appearance in the
 * sorted list, and within a group the favorites keep their sorted order, so
 * the sort the user chose still reads top-to-bottom.
 *
 * Penyelenggara with ≤ {@link GROUP_THRESHOLD} favorites emit as `solo` items in
 * place; no header is rendered for them (the cards stand alone).
 */
export function groupFavorites(favorites: readonly Favorite[]): GroupedItem[] {
	const counts = new Map<string, number>();
	for (const fav of favorites) {
		const organizer = organizerOf(fav);
		counts.set(organizer, (counts.get(organizer) ?? 0) + 1);
	}

	const groupedOrganizers = new Set<string>();
	for (const [organizer, count] of counts) {
		if (count > GROUP_THRESHOLD) groupedOrganizers.add(organizer);
	}

	const items: GroupedItem[] = [];
	const emittedGroups = new Set<string>();
	for (const fav of favorites) {
		const organizer = organizerOf(fav);
		if (!groupedOrganizers.has(organizer)) {
			items.push({ kind: "solo", favorite: fav });
			continue;
		}
		// Emit the group once, at the organizer's first appearance; later
		// appearances of the same organizer are consumed into this block.
		if (emittedGroups.has(organizer)) continue;
		emittedGroups.add(organizer);
		const groupFavoritesList = favorites.filter(
			(f) => organizerOf(f) === organizer,
		);
		items.push({
			kind: "group",
			organizer,
			favorites: groupFavoritesList,
			summary: summarizeStages(groupFavoritesList),
		});
	}
	return items;
}
