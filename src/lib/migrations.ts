import type { Favorite, LowonganSnapshot } from "./types";
import { SCHEMA_VERSION } from "./types";

/**
 * Schema migration registry for stored Favorites (issue #4). Lazily migrates
 * a persisted record to the current shape on load (`storage.ts`'s read
 * paths), so old installs upgrade without a bulk migration pass. Each step
 * is a pure, additive shape transform — no data loss, and applying it to an
 * already-current record is a no-op (idempotent) so the registry can just
 * loop until `schemaVersion === SCHEMA_VERSION`.
 */

/** v1 shape (issue #2): pre-Catatan/Status Lamar. */
export interface FavoriteV1 {
	schemaVersion: 1;
	uuid: string;
	detailUrl: string;
	savedSnapshot: LowonganSnapshot;
	savedAt: string;
}

/** v1 → v2: adds `catatan` (empty) and `statusLamar` (`not_applied`) defaults. */
function migrateV1ToV2(record: FavoriteV1): Favorite {
	return {
		...record,
		schemaVersion: 2,
		catatan: "",
		statusLamar: "not_applied",
	};
}

const MIGRATIONS: Record<number, (record: never) => Favorite> = {
	1: migrateV1ToV2 as (record: never) => Favorite,
};

/**
 * Migrate a stored record (any past schema version) to the current schema.
 * No-op for a record already at `SCHEMA_VERSION`.
 */
export function migrateFavorite(record: FavoriteV1 | Favorite): Favorite {
	let current: Favorite | FavoriteV1 = record;
	while (current.schemaVersion < SCHEMA_VERSION) {
		const step = MIGRATIONS[current.schemaVersion];
		if (!step) {
			throw new Error(
				`No migration registered from schemaVersion ${current.schemaVersion}`,
			);
		}
		current = step(current as never);
	}
	return current as Favorite;
}
