import { describe, it, expect } from "vitest";
import { migrateFavorite } from "@/lib/migrations";
import { SCHEMA_VERSION, initialLiveStatus } from "@/lib/types";
import type { FavoriteV1, FavoriteV2 } from "@/lib/migrations";
import type { Favorite } from "@/lib/types";

describe("migrateFavorite", () => {
	it("migrates a v1 record to the current schema, adding catatan and statusLamar defaults", () => {
		const v1: FavoriteV1 = {
			schemaVersion: 1,
			uuid: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
			detailUrl: "/magang-nasional/lowongan/x-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
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
		expect(migrated.statusLamar).toBe("not_applied");
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
			detailUrl: "/magang-nasional/lowongan/z-c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
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
		expect(migrated.statusLamar).toBe("not_applied");
		expect(migrated.savedSnapshot).toEqual(v2.savedSnapshot);
	});

	it("is a no-op for a record already at the current schema", () => {
		const current: Favorite = {
			schemaVersion: SCHEMA_VERSION,
			uuid: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
			detailUrl: "/magang-nasional/lowongan/y-b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
			savedSnapshot: {
				title: "Magang Backend",
				organizer: "PT Contoh",
				location: "Bandung",
				capturedAt: "2026-01-02T00:00:00Z",
			},
			catatan: "sudah dicatat",
			statusLamar: "applied",
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
});
