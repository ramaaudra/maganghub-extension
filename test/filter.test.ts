import { describe, it, expect } from "vitest";
import { searchFavorites, sortFavorites } from "@/lib/filter";
import { SCHEMA_VERSION, type Favorite } from "@/lib/types";

/**
 * Contract tests for the popup's search + sort helpers (issue #6). These are
 * pure functions over Favorite[] — the browser-level behavior (typing in the
 * search box, choosing a sort) is covered by the e2e spec; here we pin the
 * input→output contract for the edge cases that are cheaper to enumerate.
 */

const fav = (over: {
	uuid: string;
	title?: string;
	organizer?: string;
	location?: string;
	savedAt?: string;
}): Favorite => ({
	schemaVersion: SCHEMA_VERSION,
	uuid: over.uuid,
	detailUrl: `/magang-nasional/lowongan/x-${over.uuid}`,
	savedSnapshot: {
		title: over.title ?? "Magang",
		organizer: over.organizer ?? "PT Contoh",
		location: over.location ?? "Jakarta",
		capturedAt: "2026-01-01T00:00:00Z",
	},
	catatan: "",
	statusLamar: "not_applied",
	liveStatus: { status: "unknown", lastChecked: null },
	savedAt: over.savedAt ?? "2026-01-01T00:00:00Z",
});

const U = {
	a: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
	b: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
	c: "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
};

describe("searchFavorites", () => {
	it("keeps only Favorites whose title matches the query", () => {
		const list = [
			fav({ uuid: U.a, title: "Magang Data Analyst" }),
			fav({ uuid: U.b, title: "Magang UI/UX Designer" }),
		];

		const result = searchFavorites(list, "data");

		expect(result.map((f) => f.uuid)).toEqual([U.a]);
	});

	it("matches Penyelenggara as well as title", () => {
		const list = [
			fav({ uuid: U.a, title: "Magang Data Analyst", organizer: "PT Maju" }),
			fav({
				uuid: U.b,
				title: "Magang Desainer",
				organizer: "Kementerian Komunikasi",
			}),
		];

		const result = searchFavorites(list, "kementerian");

		expect(result.map((f) => f.uuid)).toEqual([U.b]);
	});

	it("matches location as well as title and Penyelenggara", () => {
		const list = [
			fav({ uuid: U.a, location: "Jakarta, DKI Jakarta" }),
			fav({ uuid: U.b, location: "Bandung, Jawa Barat" }),
		];

		const result = searchFavorites(list, "bandung");

		expect(result.map((f) => f.uuid)).toEqual([U.b]);
	});

	it("returns every Favorite for an empty or whitespace-only query", () => {
		const list = [fav({ uuid: U.a }), fav({ uuid: U.b })];

		expect(searchFavorites(list, "").map((f) => f.uuid)).toEqual([U.a, U.b]);
		expect(searchFavorites(list, "   ").map((f) => f.uuid)).toEqual([U.a, U.b]);
	});

	it("ignores case and surrounding whitespace in the query", () => {
		const list = [fav({ uuid: U.a, title: "Magang Data Analyst" })];

		expect(searchFavorites(list, "  DATA  ").map((f) => f.uuid)).toEqual([U.a]);
	});

	it("returns nothing when no Favorite matches", () => {
		const list = [fav({ uuid: U.a, title: "Magang Data Analyst" })];

		expect(searchFavorites(list, "akuntansi")).toEqual([]);
	});

	it("does not mutate the input list", () => {
		const list = [fav({ uuid: U.a }), fav({ uuid: U.b })];

		searchFavorites(list, "jakarta");

		expect(list.map((f) => f.uuid)).toEqual([U.a, U.b]);
	});
});

describe("sortFavorites", () => {
	it("sorts by saved date, newest first", () => {
		const list = [
			fav({ uuid: U.a, savedAt: "2026-01-02T00:00:00Z" }),
			fav({ uuid: U.b, savedAt: "2026-03-01T00:00:00Z" }),
			fav({ uuid: U.c, savedAt: "2026-02-01T00:00:00Z" }),
		];

		const result = sortFavorites(list, "savedAt");

		expect(result.map((f) => f.uuid)).toEqual([U.b, U.c, U.a]);
	});

	it("sorts by Penyelenggara A→Z", () => {
		const list = [
			fav({ uuid: U.a, organizer: "PT Maju Bersama" }),
			fav({ uuid: U.b, organizer: "Kementerian Komunikasi" }),
			fav({ uuid: U.c, organizer: "Zenith Digital" }),
		];

		const result = sortFavorites(list, "organizer");

		expect(result.map((f) => f.uuid)).toEqual([U.b, U.a, U.c]);
	});

	it("sorts by location A→Z", () => {
		const list = [
			fav({ uuid: U.a, location: "Surabaya, Jawa Timur" }),
			fav({ uuid: U.b, location: "Bandung, Jawa Barat" }),
			fav({ uuid: U.c, location: "Jakarta, DKI Jakarta" }),
		];

		const result = sortFavorites(list, "location");

		expect(result.map((f) => f.uuid)).toEqual([U.b, U.c, U.a]);
	});

	it("does not mutate the input list", () => {
		const list = [
			fav({ uuid: U.a, savedAt: "2026-01-01T00:00:00Z" }),
			fav({ uuid: U.b, savedAt: "2026-05-01T00:00:00Z" }),
		];

		sortFavorites(list, "savedAt");

		expect(list.map((f) => f.uuid)).toEqual([U.a, U.b]);
	});

	it("breaks ties on Penyelenggara by saved date, newest first", () => {
		const list = [
			fav({
				uuid: U.a,
				organizer: "PT Sama",
				savedAt: "2026-01-01T00:00:00Z",
			}),
			fav({
				uuid: U.b,
				organizer: "PT Sama",
				savedAt: "2026-04-01T00:00:00Z",
			}),
		];

		const result = sortFavorites(list, "organizer");

		expect(result.map((f) => f.uuid)).toEqual([U.b, U.a]);
	});

	it("orders 'Kota, Provinsi' locations by word, not by punctuation", () => {
		// "Jakarta, DKI Jakarta" belongs before "Jakarta Pusat, DKI Jakarta":
		// the comma is formatting, so the comparison falls to D before P.
		const list = [
			fav({ uuid: U.a, location: "Jakarta Pusat, DKI Jakarta" }),
			fav({ uuid: U.b, location: "Jakarta, DKI Jakarta" }),
		];

		const result = sortFavorites(list, "location");

		expect(result.map((f) => f.uuid)).toEqual([U.b, U.a]);
	});

	it("sorts a Penyelenggara written 'PT Maju' and 'PT. Maju' adjacently", () => {
		const list = [
			fav({ uuid: U.a, organizer: "PT Zenith" }),
			fav({ uuid: U.b, organizer: "PT. Maju" }),
			fav({ uuid: U.c, organizer: "PT Maju Bersama" }),
		];

		const result = sortFavorites(list, "organizer");

		expect(result.map((f) => f.uuid)).toEqual([U.b, U.c, U.a]);
	});
});
