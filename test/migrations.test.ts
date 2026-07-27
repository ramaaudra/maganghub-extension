import { describe, expect, it } from "vitest";
import type { FavoriteV1, FavoriteV2, FavoriteV3 } from "@/lib/migrations";
import { migrateFavorite } from "@/lib/migrations";
import type { Favorite } from "@/lib/types";
import { initialLiveStatus, SCHEMA_VERSION } from "@/lib/types";

describe("migrateFavorite", () => {
	it("migrates a v1 record to the current schema, adding catatan and statusLamar defaults", () => {
		const v1: FavoriteV1 = {
			schemaVersion: 1,
			uuid: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
			detailUrl:
				"/magang-nasional/lowongan/x-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
			savedSnapshot: {
				title: "Magang Data Analyst",
				organizer: "PT Maju Bersama",
				location: "Jakarta, DKI Jakarta",
				capturedAt: "2026-01-01T00:00:00Z",
			},
			savedAt: "2026-01-01T00:00:00Z",
		};

		const migrated = migrateFavorite(v1);

		expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
		expect(migrated.catatan).toBe("");
		// v1→v2 adds not_applied, then v3→v4 maps not_applied → no stage.
		expect(migrated.statusLamar).toBeUndefined();
		// Untouched fields carry over unchanged.
		expect(migrated.uuid).toBe(v1.uuid);
		expect(migrated.detailUrl).toBe(v1.detailUrl);
		expect(migrated.savedSnapshot).toEqual(v1.savedSnapshot);
		expect(migrated.savedAt).toBe(v1.savedAt);
	});

	it("migrates a v2 record to v3, adding a liveStatus initialised to never-refreshed", () => {
		const v2: FavoriteV2 = {
			schemaVersion: 2,
			uuid: "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
			detailUrl:
				"/magang-nasional/lowongan/z-c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
			savedSnapshot: {
				title: "Magang Frontend",
				organizer: "PT Contoh",
				location: "Surabaya",
				capturedAt: "2026-01-03T00:00:00Z",
			},
			catatan: "catatan lama",
			statusLamar: "not_applied",
			savedAt: "2026-01-03T00:00:00Z",
		};

		const migrated = migrateFavorite(v2);

		expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
		expect(migrated.liveStatus).toEqual(initialLiveStatus());
		// v2 fields carry over unchanged.
		expect(migrated.uuid).toBe(v2.uuid);
		expect(migrated.catatan).toBe("catatan lama");
		// v2's not_applied → v3→v4 no stage.
		expect(migrated.statusLamar).toBeUndefined();
		expect(migrated.savedSnapshot).toEqual(v2.savedSnapshot);
	});

	it("is a no-op for a record already at the current schema", () => {
		const current: Favorite = {
			schemaVersion: SCHEMA_VERSION,
			uuid: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
			detailUrl:
				"/magang-nasional/lowongan/y-b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
			savedSnapshot: {
				title: "Magang Backend",
				organizer: "PT Contoh",
				location: "Bandung",
				capturedAt: "2026-01-02T00:00:00Z",
			},
			catatan: "sudah dicatat",
			statusLamar: "dilamar",
			liveStatus: {
				status: "open",
				kuota: 5,
				pelamar: 1,
				batch: "Batch 1 · 2026",
				tunjangan: "Dari Pemerintah",
				lastChecked: "2026-01-05T00:00:00Z",
			},
			savedAt: "2026-01-02T00:00:00Z",
		};

		expect(migrateFavorite(current)).toEqual(current);
	});

	it("migrates a v3 record to v4: applied → dilamar, not_applied → no stage", () => {
		const applied: FavoriteV3 = {
			schemaVersion: 3,
			uuid: "d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a",
			detailUrl:
				"/magang-nasional/lowongan/x-d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a",
			savedSnapshot: {
				title: "Magang Sudah Dilamar",
				organizer: "PT Contoh",
				location: "Surabaya",
				capturedAt: "2026-01-01T00:00:00Z",
			},
			catatan: "",
			statusLamar: "applied",
			liveStatus: initialLiveStatus(),
			savedAt: "2026-01-01T00:00:00Z",
		};
		const notApplied: FavoriteV3 = {
			...applied,
			uuid: "e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b",
			detailUrl:
				"/magang-nasional/lowongan/x-e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b",
			statusLamar: "not_applied",
		};

		expect(migrateFavorite(applied).statusLamar).toBe("dilamar");
		expect(migrateFavorite(notApplied).statusLamar).toBeUndefined();
		for (const rec of [applied, notApplied]) {
			const migrated = migrateFavorite(rec);
			expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
			// previousSample is additive: old records carry none.
			expect(migrated.liveStatus.previousSample).toBeUndefined();
		}
	});

	it("v3→v4 migration is idempotent: re-running the step on a v4 record is a no-op", () => {
		// A v4 record at the current schema does not loop — migrateFavorite returns
		// it untouched, so there is no second mapping of `dilamar`/`undefined`.
		const v4: Favorite = {
			schemaVersion: SCHEMA_VERSION,
			uuid: "f3a4b5c6-d7e8-4f9a-0b1c-2d3e4f5a6b7c",
			detailUrl:
				"/magang-nasional/lowongan/x-f3a4b5c6-d7e8-4f9a-0b1c-2d3e4f5a6b7c",
			savedSnapshot: {
				title: "Magang V4",
				organizer: "PT Contoh",
				location: "Bandung",
				capturedAt: "2026-01-01T00:00:00Z",
			},
			catatan: "",
			statusLamar: "diterima",
			liveStatus: initialLiveStatus(),
			savedAt: "2026-01-01T00:00:00Z",
		};

		expect(migrateFavorite(v4)).toEqual(v4);
	});
});
