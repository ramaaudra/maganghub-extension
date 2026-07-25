import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { FavoriteV1 } from "@/lib/migrations";
import {
	createFavorite,
	FAVORITE_KEY_PREFIX,
	getFavorite,
	isFavorited,
	listFavorites,
	removeFavorite,
	setCatatan,
	setFavorite,
	setLiveStatus,
	setStatusLamar,
} from "@/lib/storage";
import type { Favorite, LiveStatus } from "@/lib/types";
import { initialLiveStatus, SCHEMA_VERSION } from "@/lib/types";

function makeFavorite(uuid: string, savedAt: string, title: string): Favorite {
	return {
		schemaVersion: SCHEMA_VERSION,
		uuid,
		detailUrl: `/magang-nasional/lowongan/${title.toLowerCase().replace(/\s+/g, "-")}-${uuid}`,
		savedSnapshot: {
			title,
			organizer: "PT Contoh",
			location: "Jakarta",
			capturedAt: savedAt,
		},
		catatan: "",
		statusLamar: "not_applied",
		liveStatus: initialLiveStatus(),
		savedAt,
	};
}

function makeFavoriteV1(
	uuid: string,
	savedAt: string,
	title: string,
): FavoriteV1 {
	return {
		schemaVersion: 1,
		uuid,
		detailUrl: `/magang-nasional/lowongan/${title.toLowerCase().replace(/\s+/g, "-")}-${uuid}`,
		savedSnapshot: {
			title,
			organizer: "PT Contoh",
			location: "Jakarta",
			capturedAt: savedAt,
		},
		savedAt,
	};
}

describe("favorites storage", () => {
	beforeEach(() => {
		fakeBrowser.reset();
	});

	it("round-trips a favorite keyed by UUID", async () => {
		const fav = makeFavorite(
			"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
			"2026-01-01T00:00:00Z",
			"Magang A",
		);
		await setFavorite(fav);
		expect(await getFavorite(fav.uuid)).toEqual(fav);
		expect(await isFavorited(fav.uuid)).toBe(true);
	});

	it("reports not-favorited for an unknown UUID", async () => {
		expect(await isFavorited("11111111-1111-4111-8111-111111111111")).toBe(
			false,
		);
		expect(
			await getFavorite("11111111-1111-4111-8111-111111111111"),
		).toBeUndefined();
	});

	it("removes a favorite", async () => {
		const fav = makeFavorite(
			"b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
			"2026-01-02T00:00:00Z",
			"Magang B",
		);
		await setFavorite(fav);
		await removeFavorite(fav.uuid);
		expect(await isFavorited(fav.uuid)).toBe(false);
	});

	it("lists favorites newest-first by savedAt", async () => {
		await setFavorite(
			makeFavorite(
				"11111111-1111-4111-8111-111111111111",
				"2026-01-01T00:00:00Z",
				"Old",
			),
		);
		await setFavorite(
			makeFavorite(
				"22222222-2222-4222-8222-222222222222",
				"2026-01-03T00:00:00Z",
				"New",
			),
		);
		await setFavorite(
			makeFavorite(
				"33333333-3333-4333-8333-333333333333",
				"2026-01-02T00:00:00Z",
				"Mid",
			),
		);
		const list = await listFavorites();
		expect(list.map((f) => f.uuid)).toEqual([
			"22222222-2222-4222-8222-222222222222",
			"33333333-3333-4333-8333-333333333333",
			"11111111-1111-4111-8111-111111111111",
		]);
	});

	it("createFavorite stamps the current schema version and a savedAt timestamp", () => {
		const fav = createFavorite({
			uuid: "44444444-4444-4444-8444-444444444444",
			detailUrl:
				"/magang-nasional/lowongan/x-44444444-4444-4444-8444-444444444444",
			savedSnapshot: {
				title: "T",
				organizer: "O",
				location: "L",
				capturedAt: "2026-01-01T00:00:00Z",
			},
		});
		expect(fav.schemaVersion).toBe(SCHEMA_VERSION);
		expect(fav.uuid).toBe("44444444-4444-4444-8444-444444444444");
		expect(typeof fav.savedAt).toBe("string");
	});

	it("createFavorite defaults catatan to empty and statusLamar to not_applied", () => {
		const fav = createFavorite({
			uuid: "55555555-5555-4555-8555-555555555555",
			detailUrl:
				"/magang-nasional/lowongan/x-55555555-5555-4555-8555-555555555555",
			savedSnapshot: {
				title: "T",
				organizer: "O",
				location: "L",
				capturedAt: "2026-01-01T00:00:00Z",
			},
		});
		expect(fav.catatan).toBe("");
		expect(fav.statusLamar).toBe("not_applied");
	});

	it("setCatatan updates the Catatan on a stored favorite", async () => {
		const fav = makeFavorite(
			"66666666-6666-4666-8666-666666666666",
			"2026-01-01T00:00:00Z",
			"Magang C",
		);
		await setFavorite(fav);
		await setCatatan(fav.uuid, "alasan aku simpan ini");
		expect((await getFavorite(fav.uuid))?.catatan).toBe(
			"alasan aku simpan ini",
		);
	});

	it("setCatatan edits an existing Catatan to a new value", async () => {
		const fav = makeFavorite(
			"a6a6a6a6-a6a6-4a6a-8a6a-a6a6a6a6a6a6",
			"2026-01-01T00:00:00Z",
			"Magang G",
		);
		await setFavorite(fav);
		await setCatatan(fav.uuid, "catatan pertama");
		await setCatatan(fav.uuid, "catatan kedua yang lebih panjang");
		expect((await getFavorite(fav.uuid))?.catatan).toBe(
			"catatan kedua yang lebih panjang",
		);
	});

	it("setCatatan can clear a Catatan back to empty (delete)", async () => {
		const fav = makeFavorite(
			"b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7",
			"2026-01-01T00:00:00Z",
			"Magang H",
		);
		await setFavorite(fav);
		await setCatatan(fav.uuid, "akan dihapus");
		await setCatatan(fav.uuid, "");
		expect((await getFavorite(fav.uuid))?.catatan).toBe("");
	});

	it("setStatusLamar updates Status Lamar on a stored favorite", async () => {
		const fav = makeFavorite(
			"77777777-7777-4777-8777-777777777777",
			"2026-01-01T00:00:00Z",
			"Magang D",
		);
		await setFavorite(fav);
		await setStatusLamar(fav.uuid, "applied");
		expect((await getFavorite(fav.uuid))?.statusLamar).toBe("applied");
	});

	it("setLiveStatus writes a refreshed liveStatus without touching the snapshot", async () => {
		const fav = makeFavorite(
			"77777777-7777-4777-8777-77777777777a",
			"2026-01-01T00:00:00Z",
			"Magang D2",
		);
		await setFavorite(fav);

		const live: LiveStatus = {
			status: "open",
			kuota: 50,
			pelamar: 12,
			batch: "Batch 1 · 2026",
			tunjangan: "Dari Pemerintah",
			lastChecked: "2026-01-02T00:00:00Z",
		};
		await setLiveStatus(fav.uuid, live);

		const stored = await getFavorite(fav.uuid);
		expect(stored?.liveStatus).toEqual(live);
		// The saved snapshot is immutable — refresh must not touch it.
		expect(stored?.savedSnapshot).toEqual(fav.savedSnapshot);
		expect(stored?.catatan).toBe(fav.catatan);
		expect(stored?.statusLamar).toBe(fav.statusLamar);
	});

	it("setLiveStatus records a failed refresh as unknown with lastError", async () => {
		const fav = makeFavorite(
			"77777777-7777-4777-8777-77777777777b",
			"2026-01-01T00:00:00Z",
			"Magang D3",
		);
		await setFavorite(fav);
		await setLiveStatus(fav.uuid, {
			status: "unknown",
			lastChecked: "2026-01-02T00:00:00Z",
			lastError: "network: timeout",
		});
		const stored = await getFavorite(fav.uuid);
		expect(stored?.liveStatus.status).toBe("unknown");
		expect(stored?.liveStatus.lastError).toBe("network: timeout");
	});

	it("getFavorite lazily migrates a v1 record to the current schema", async () => {
		const v1 = makeFavoriteV1(
			"88888888-8888-4888-8888-888888888888",
			"2026-01-01T00:00:00Z",
			"Magang E",
		);
		await browser.storage.local.set({
			[`${FAVORITE_KEY_PREFIX}${v1.uuid}`]: v1,
		});

		const migrated = await getFavorite(v1.uuid);
		expect(migrated?.schemaVersion).toBe(SCHEMA_VERSION);
		expect(migrated?.catatan).toBe("");
		expect(migrated?.statusLamar).toBe("not_applied");
	});

	it("listFavorites lazily migrates v1 records to the current schema", async () => {
		const v1 = makeFavoriteV1(
			"99999999-9999-4999-8999-999999999999",
			"2026-01-01T00:00:00Z",
			"Magang F",
		);
		await browser.storage.local.set({
			[`${FAVORITE_KEY_PREFIX}${v1.uuid}`]: v1,
		});

		const [migrated] = await listFavorites();
		expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
		expect(migrated.catatan).toBe("");
		expect(migrated.statusLamar).toBe("not_applied");
	});
});
