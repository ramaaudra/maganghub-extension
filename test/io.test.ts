import { describe, it, expect, beforeEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { exportFavorites, importFavorites, type ExportFile } from "@/lib/io";
import { SCHEMA_VERSION, type Favorite } from "@/lib/types";
import type { FavoriteV1 } from "@/lib/migrations";
import { setFavorite, listFavorites, getFavorite } from "@/lib/storage";

// The io module is pure-ish: export is a pure serializer, import writes through
// storage.ts. We exercise both against the in-memory fake browser that the
// vitest config wires up, so import round-trips through the real storage seam.

// Isolation: the fake browser persists across tests in a file, so reset its
// storage before every test (mirrors storage.test.ts).
beforeEach(() => {
	fakeBrowser.reset();
});

const baseFavorite = (uuid: string, title: string): Favorite => ({
	schemaVersion: SCHEMA_VERSION,
	uuid,
	detailUrl: `/magang-nasional/lowongan/${title.toLowerCase().replace(/\s+/g, "-")}-${uuid}`,
	savedSnapshot: {
		title,
		organizer: "PT Contoh",
		location: "Jakarta",
		capturedAt: "2026-01-01T00:00:00Z",
	},
	catatan: "",
	statusLamar: "not_applied",
	liveStatus: { status: "unknown", lastChecked: null },
	savedAt: "2026-01-01T00:00:00Z",
});

const v1Record = (uuid: string): FavoriteV1 => ({
	schemaVersion: 1,
	uuid,
	detailUrl: `/magang-nasional/lowongan/old-${uuid}`,
	savedSnapshot: {
		title: "Magang Lama",
		organizer: "PT Lama",
		location: "Bandung",
		capturedAt: "2025-01-01T00:00:00Z",
	},
	savedAt: "2025-01-01T00:00:00Z",
});

describe("exportFavorites", () => {
	it("serializes all favorites into an envelope with schemaVersion, exportedAt, and count", async () => {
		const a = baseFavorite("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "A");
		const b = baseFavorite("b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e", "B");
		await setFavorite(a);
		await setFavorite(b);

		const file = await exportFavorites();

		expect(file.schemaVersion).toBe(SCHEMA_VERSION);
		expect(file.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(file.count).toBe(2);
		expect(file.favorites).toHaveLength(2);
		// Exported records are exactly the stored Favorites (current schema).
		const uuids = file.favorites.map((f) => f.uuid).sort();
		expect(uuids).toEqual([a.uuid, b.uuid]);
	});

	it("export of an empty store produces a valid envelope with count 0", async () => {
		const file = await exportFavorites();
		expect(file.count).toBe(0);
		expect(file.favorites).toEqual([]);
	});
});

describe("importFavorites", () => {
	it("round-trips: export then import (into an empty store) preserves every Favorite", async () => {
		const a = baseFavorite("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "A");
		const b = baseFavorite("b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e", "B");
		await setFavorite(a);
		await setFavorite(b);
		const file = await exportFavorites();

		// Wipe the store, then import into it.
		await browser.storage.local.clear();
		const result = await importFavorites(file);

		expect(result.imported).toBe(2);
		expect(result.warnings).toEqual([]);
		const after = await listFavorites();
		expect(after.map((f) => f.uuid).sort()).toEqual([a.uuid, b.uuid]);
		// The imported records match the originals field-for-field.
		expect(await getFavorite(a.uuid)).toMatchObject({
			uuid: a.uuid,
			catatan: a.catatan,
			statusLamar: a.statusLamar,
			savedSnapshot: a.savedSnapshot,
		});
	});

	it("migrates an old-schema (v1) file up to the current schema on import", async () => {
		const v1 = v1Record("c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f");
		const file: ExportFile = {
			schemaVersion: 1,
			exportedAt: "2025-01-01T00:00:00Z",
			count: 1,
			favorites: [v1 as unknown as Favorite],
		};

		const result = await importFavorites(file);

		expect(result.imported).toBe(1);
		const migrated = await getFavorite(v1.uuid);
		expect(migrated?.schemaVersion).toBe(SCHEMA_VERSION);
		expect(migrated?.catatan).toBe(""); // v1→v2 default
		expect(migrated?.statusLamar).toBe("not_applied"); // v1→v2 default
		expect(migrated?.liveStatus).toEqual({
			status: "unknown",
			lastChecked: null,
		}); // v2→v3 default
		expect(migrated?.savedSnapshot).toEqual(v1.savedSnapshot);
	});

	it("rejects a file from a newer schema than current with a clear warning, importing nothing", async () => {
		const future = baseFavorite(
			"d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80",
			"Future",
		) as Favorite & { schemaVersion: number };
		future.schemaVersion = SCHEMA_VERSION + 1;
		const file: ExportFile = {
			schemaVersion: SCHEMA_VERSION + 1,
			exportedAt: "2099-01-01T00:00:00Z",
			count: 1,
			favorites: [future],
		};

		const result = await importFavorites(file);

		expect(result.imported).toBe(0);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toMatch(/newer|lebih baru|ahead/i);
		expect(await getFavorite(future.uuid)).toBeUndefined();
	});

	it("merge: local is authoritative on conflict — imported record does NOT overwrite a local Favorite's snapshot/savedAt", async () => {
		// Local has the favorite with a newer savedAt + edited catatan.
		const local = baseFavorite(
			"e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8091",
			"Local",
		);
		local.catatan = "catatan lokal";
		local.savedAt = "2026-06-01T00:00:00Z";
		await setFavorite(local);

		// Imported copy of the same UUID is older and has different data.
		const importedCopy = baseFavorite(local.uuid, "Imported Different");
		importedCopy.catatan = "catatan impor";
		importedCopy.savedAt = "2025-01-01T00:00:00Z";
		const file: ExportFile = {
			schemaVersion: SCHEMA_VERSION,
			exportedAt: "2025-01-01T00:00:00Z",
			count: 1,
			favorites: [importedCopy],
		};

		const result = await importFavorites(file);

		expect(result.imported).toBe(0); // already exists → not a new add
		const after = await getFavorite(local.uuid);
		// Local snapshot + savedAt win.
		expect(after?.savedSnapshot.title).toBe("Local");
		expect(after?.savedAt).toBe("2026-06-01T00:00:00Z");
		expect(after?.catatan).toBe("catatan lokal"); // local catatan kept
	});

	it("merge: imported Catatan/Status Lamar fill only when local is empty", async () => {
		// Local favorite exists with empty catatan and not_applied status.
		const local = baseFavorite(
			"f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8091a2",
			"Local Empty",
		);
		local.catatan = "";
		local.statusLamar = "not_applied";
		await setFavorite(local);

		// Imported copy carries a catatan + applied status.
		const importedCopy = baseFavorite(local.uuid, "Local Empty");
		importedCopy.catatan = "catatan impor";
		importedCopy.statusLamar = "applied";
		const file: ExportFile = {
			schemaVersion: SCHEMA_VERSION,
			exportedAt: "2025-01-01T00:00:00Z",
			count: 1,
			favorites: [importedCopy],
		};

		await importFavorites(file);

		const after = await getFavorite(local.uuid);
		expect(after?.catatan).toBe("catatan impor"); // local was empty → filled
		expect(after?.statusLamar).toBe("applied"); // local was not_applied → filled
	});

	it("merge: imported liveStatus is dropped — local liveStatus is kept (re-derived by refresh)", async () => {
		// Local favorite has a real liveStatus from a refresh.
		const local = baseFavorite(
			"07b8c9d0-e1f2-4a3b-4c5d-6e7f8091a2b3",
			"Local Live",
		);
		local.liveStatus = {
			status: "open",
			kuota: 50,
			pelamar: 12,
			batch: "Batch 1 · 2026",
			lastChecked: "2026-06-01T00:00:00Z",
		};
		await setFavorite(local);

		// Imported copy carries a DIFFERENT liveStatus (stale, from another device).
		const importedCopy = baseFavorite(local.uuid, "Local Live");
		importedCopy.liveStatus = {
			status: "closed",
			lastChecked: "2025-01-01T00:00:00Z",
		};
		const file: ExportFile = {
			schemaVersion: SCHEMA_VERSION,
			exportedAt: "2025-01-01T00:00:00Z",
			count: 1,
			favorites: [importedCopy],
		};

		await importFavorites(file);

		const after = await getFavorite(local.uuid);
		// Local liveStatus is authoritative; imported liveStatus is discarded.
		expect(after?.liveStatus.status).toBe("open");
		expect(after?.liveStatus.lastChecked).toBe("2026-06-01T00:00:00Z");
	});

	it("import into an empty store with a brand-new UUID adds the favorite as-is", async () => {
		const fresh = baseFavorite(
			"18b8c9d0-e1f2-4a3b-4c5d-6e7f8091a2b4",
			"Fresh",
		);
		const file: ExportFile = {
			schemaVersion: SCHEMA_VERSION,
			exportedAt: "2025-01-01T00:00:00Z",
			count: 1,
			favorites: [fresh],
		};

		const result = await importFavorites(file);

		expect(result.imported).toBe(1);
		const after = await getFavorite(fresh.uuid);
		expect(after?.savedSnapshot).toEqual(fresh.savedSnapshot);
		expect(after?.catatan).toBe(fresh.catatan);
	});
});