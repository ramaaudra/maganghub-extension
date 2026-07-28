/**
 * Export + Import of Favorites (issue #9): the no-sync backup story.
 *
 * Export serializes all Favorites into a single JSON envelope. Import reads
 * such an envelope, migrates any older-schema records up via the registry,
 * and merges by UUID with local-authoritative-on-conflict semantics:
 *  - a UUID absent locally → added as-is (migrated to current schema).
 *  - a UUID present locally → local wins: the local snapshot, savedAt, and
 *    liveStatus are kept; imported `catatan` and `statusLamar` fill in ONLY
 *    when the local fields are empty (`""` / no stage). Imported `liveStatus`
 *    is always discarded — it is re-derived by refresh and is device-local
 *    (ADR-0002). `archivedAt` (ADR-0010) follows the same fill shape: an
 *    imported archive fills a local active record (`null` → timestamp), but
 *    an import never un-archives a locally-archived record.
 *
 * A file whose `schemaVersion` is newer than current is rejected wholesale
 * with a warning: importing a future shape would silently drop fields we don't
 * know about, which is a data-loss footgun. The user upgrades the extension
 * and re-imports.
 */

import type {
	FavoriteV1,
	FavoriteV2,
	FavoriteV3,
	FavoriteV4,
} from "./migrations";
import { migrateFavorite } from "./migrations";
import { getFavorite, listFavorites, setFavorite } from "./storage";
import type { Favorite } from "./types";
import { SCHEMA_VERSION } from "./types";

/** The on-disk export envelope. `favorites` may carry older-schema records. */
export interface ExportFile {
	/** Schema version of the *file*, not of each record. A file newer than
	 *  current is rejected on import. */
	schemaVersion: number;
	/** ISO timestamp of when the export was produced. */
	exportedAt: string;
	/** Number of favorites in the file. Cross-checked against `favorites.length`
	 *  on import — a mismatch surfaces as a warning but does not block import. */
	count: number;
	/** The favorites. Each is migrated individually on import. */
	favorites: Array<
		Favorite | FavoriteV1 | FavoriteV2 | FavoriteV3 | FavoriteV4
	>;
}

/** Outcome of an import, surfaced to the popup UI. */
export interface ImportResult {
	/** Number of favorites actually written to storage (new adds + conflict
	 *  fills that mutated a local record). */
	imported: number;
	/** Human-readable warnings (newer-schema rejection, malformed records). */
	warnings: string[];
}

/** Serialize all Favorites into a downloadable export envelope. */
export async function exportFavorites(): Promise<ExportFile> {
	const favorites = await listFavorites();
	return {
		schemaVersion: SCHEMA_VERSION,
		exportedAt: new Date().toISOString(),
		count: favorites.length,
		favorites,
	};
}

/**
 * Import an export envelope into local storage with the merge rules above.
 *
 * Errors per record (malformed/unknown shape) are collected into `warnings`
 * rather than aborting the whole import — a single bad record should not lose
 * the user the other ninety-nine.
 */
export async function importFavorites(file: ExportFile): Promise<ImportResult> {
	const warnings: string[] = [];

	// Sanity check: the envelope's `count` should match `favorites.length`. A
	// mismatch (hand-edited file, truncated download) is non-fatal — we still
	// import what's there — but surface it as a warning so the user knows the
	// file is not as-described.
	if (typeof file.count === "number" && file.count !== file.favorites.length) {
		warnings.push(
			`Jumlah favorit di file (${file.count}) tidak cocok dengan isinya (${file.favorites.length}). Mengimpor yang ada.`,
		);
	}

	// Future-schema guard: do not silently drop fields we don't understand.
	if (file.schemaVersion > SCHEMA_VERSION) {
		return {
			imported: 0,
			warnings: [
				`File berasal dari skema yang lebih baru (v${file.schemaVersion}) ` +
					`daripada extension ini (v${SCHEMA_VERSION}). ` +
					`Perbarui extension lalu impor ulang.`,
			],
		};
	}

	let imported = 0;
	for (const raw of file.favorites) {
		try {
			const migrated = migrateFavorite(raw);
			const local = await getFavorite(migrated.uuid);

			if (!local) {
				// Brand-new UUID → add as-is (already migrated to current schema).
				await setFavorite(migrated);
				imported += 1;
				continue;
			}

			// Conflict: local wins. Fill catatan/statusLamar only when local is
			// empty (no stage = `undefined`). Always keep the local liveStatus
			// (drop the imported one). archivedAt (ADR-0010): an imported archive
			// fills a local active record, but an import never un-archives a
			// locally-archived one — same "fill only when local is empty" shape as
			// catatan, where `archivedAt === null` is the empty state.
			const fillCatatan = local.catatan === "" && migrated.catatan !== "";
			const fillStatusLamar =
				local.statusLamar === undefined && migrated.statusLamar !== undefined;
			const fillArchivedAt =
				local.archivedAt === null && migrated.archivedAt !== null;
			if (fillCatatan || fillStatusLamar || fillArchivedAt) {
				await setFavorite({
					...local,
					catatan: fillCatatan ? migrated.catatan : local.catatan,
					statusLamar: fillStatusLamar
						? migrated.statusLamar
						: local.statusLamar,
					archivedAt: fillArchivedAt ? migrated.archivedAt : local.archivedAt,
				});
				imported += 1;
			}
			// If neither field needs filling, local is fully authoritative → no write.
		} catch (err) {
			warnings.push(
				`Lewati satu favorit yang rusak: ${String(err instanceof Error ? err.message : err)}`,
			);
		}
	}

	return { imported, warnings };
}
