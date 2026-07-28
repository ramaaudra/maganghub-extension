import { describe, expect, it } from "vitest";
import { searchFavorites, sortFavorites } from "@/lib/filter";
import { type Favorite, SCHEMA_VERSION, type StatusLamar } from "@/lib/types";

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
	archivedAt?: string | null;
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
	statusLamar: undefined,
	liveStatus: { status: "unknown", lastChecked: null },
	savedAt: over.savedAt ?? "2026-01-01T00:00:00Z",
	archivedAt: over.archivedAt ?? null,
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

	it("sorts by archivedAt newest-first (terbaru diarsip on top)", () => {
		const list = [
			fav({ uuid: U.a, archivedAt: "2026-01-02T00:00:00Z" }),
			fav({ uuid: U.b, archivedAt: "2026-03-01T00:00:00Z" }),
			fav({ uuid: U.c, archivedAt: "2026-02-01T00:00:00Z" }),
		];

		const result = sortFavorites(list, "archivedAt");

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

// ─── stageSeats sort (issue #21) ─────────────────────────────────────────────
// A richer builder that can set the fields the stage-then-seats sort reads:
// Status Lamar (stage) and the liveStatus numbers (kuota/pelamar/status). The
// plain `fav` builder above stays for the savedAt/organizer/location tests.

const stageFav = (over: {
	uuid: string;
	title?: string;
	savedAt?: string;
	stage?: StatusLamar | undefined;
	status?: Favorite["liveStatus"]["status"];
	kuota?: number;
	pelamar?: number;
}): Favorite => ({
	schemaVersion: SCHEMA_VERSION,
	uuid: over.uuid,
	detailUrl: `/magang-nasional/lowongan/x-${over.uuid}`,
	savedSnapshot: {
		title: over.title ?? "Magang",
		organizer: "PT Contoh",
		location: "Jakarta",
		capturedAt: "2026-01-01T00:00:00Z",
	},
	catatan: "",
	statusLamar: over.stage,
	liveStatus: {
		status: over.status ?? "unknown",
		lastChecked:
			over.kuota !== undefined || over.pelamar !== undefined
				? "2026-01-01T00:00:00Z"
				: null,
		kuota: over.kuota,
		pelamar: over.pelamar,
	},
	savedAt: over.savedAt ?? "2026-01-01T00:00:00Z",
	archivedAt: null,
});

const S = {
	a: "11111111-1111-4111-8111-111111111111",
	b: "22222222-2222-4222-8222-222222222222",
	c: "33333333-3333-4333-8333-333333333333",
	d: "44444444-4444-4444-8444-444444444444",
	e: "55555555-5555-4555-8555-555555555555",
	f: "66666666-6666-4666-8666-666666666666",
};

describe("sortFavorites(stageSeats)", () => {
	it("orders active-with-seats above active-over-subscribed, above unrefreshed, above terminal", () => {
		// One per bucket, mixed stages, mixed savedAt — bucket must win.
		const list = [
			// terminal: Diterima.
			stageFav({
				uuid: S.e,
				title: "Epsilon",
				stage: "diterima",
				savedAt: "2026-01-07T00:00:00Z",
			}),
			// unrefreshed: active stage, no numbers.
			stageFav({ uuid: S.d, title: "Delta", savedAt: "2026-01-06T00:00:00Z" }),
			// over-subscribed: active stage, remaining −5.
			stageFav({
				uuid: S.c,
				title: "Gamma",
				stage: "dilamar",
				kuota: 50,
				pelamar: 55,
				savedAt: "2026-01-03T00:00:00Z",
			}),
			// with-seats: remaining 1 (closest-to-full).
			stageFav({
				uuid: S.b,
				title: "Beta",
				kuota: 50,
				pelamar: 49,
				savedAt: "2026-01-04T00:00:00Z",
			}),
			// with-seats: remaining 38.
			stageFav({
				uuid: S.a,
				title: "Alpha",
				kuota: 50,
				pelamar: 12,
				savedAt: "2026-01-05T00:00:00Z",
			}),
		];

		const result = sortFavorites(list, "stageSeats");

		expect(result.map((f) => f.uuid)).toEqual([S.b, S.a, S.c, S.d, S.e]);
	});

	it("within with-seats, sorts ascending by remaining (closest-to-full on top)", () => {
		const list = [
			stageFav({
				uuid: S.a,
				title: "Alpha",
				kuota: 50,
				pelamar: 12,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.b,
				title: "Beta",
				kuota: 50,
				pelamar: 49,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.c,
				title: "Charlie",
				kuota: 50,
				pelamar: 40,
				savedAt: "2026-01-01T00:00:00Z",
			}),
		];

		const result = sortFavorites(list, "stageSeats");

		// remaining: Beta 1, Charlie 10, Alpha 38.
		expect(result.map((f) => f.uuid)).toEqual([S.b, S.c, S.a]);
	});

	it("within over-subscribed, sorts ascending by remaining (most-over first)", () => {
		const list = [
			stageFav({
				uuid: S.a,
				title: "Alpha",
				kuota: 50,
				pelamar: 60,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.b,
				title: "Beta",
				kuota: 50,
				pelamar: 51,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.c,
				title: "Charlie",
				kuota: 50,
				pelamar: 55,
				savedAt: "2026-01-01T00:00:00Z",
			}),
		];

		const result = sortFavorites(list, "stageSeats");

		// remaining: Alpha −10, Charlie −5, Beta −1 → ascending puts −10 first
		// (most-over-subscribed first — one ascending rule covers both numeric
		// buckets, mirroring with-seats' closest-to-full first).
		expect(result.map((f) => f.uuid)).toEqual([S.a, S.c, S.b]);
	});

	it("treats remaining === 0 as over-subscribed (no seats), below any with-seats", () => {
		const list = [
			stageFav({
				uuid: S.a,
				title: "Full",
				kuota: 50,
				pelamar: 50,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.b,
				title: "Open",
				kuota: 50,
				pelamar: 1,
				savedAt: "2026-01-01T00:00:00Z",
			}),
		];

		const result = sortFavorites(list, "stageSeats");

		expect(result.map((f) => f.uuid)).toEqual([S.b, S.a]);
	});

	it("within unrefreshed, sorts newest-saved first (deterministic, no shuffling)", () => {
		const list = [
			stageFav({ uuid: S.a, title: "Old", savedAt: "2026-01-01T00:00:00Z" }),
			stageFav({ uuid: S.b, title: "New", savedAt: "2026-02-01T00:00:00Z" }),
			stageFav({ uuid: S.c, title: "Mid", savedAt: "2026-01-15T00:00:00Z" }),
		];

		const result = sortFavorites(list, "stageSeats");

		expect(result.map((f) => f.uuid)).toEqual([S.b, S.c, S.a]);
	});

	it("breaks ties on remaining by saved date, newest first", () => {
		const list = [
			stageFav({
				uuid: S.a,
				title: "Older",
				kuota: 50,
				pelamar: 10,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.b,
				title: "Newer",
				kuota: 50,
				pelamar: 40,
				savedAt: "2026-02-01T00:00:00Z",
			}),
		];

		const result = sortFavorites(list, "stageSeats");

		// Same remaining (40) → newest-saved first.
		expect(result.map((f) => f.uuid)).toEqual([S.b, S.a]);
	});

	it("terminal stages (Diterima/Ditolak) sort above Closed Status Lowongan only by saved date", () => {
		// All terminal regardless of seats/closed — terminal-stage wins even if seats remain.
		const list = [
			stageFav({
				uuid: S.a,
				title: "AcceptedWithSeats",
				stage: "diterima",
				kuota: 50,
				pelamar: 1,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.b,
				title: "Rejected",
				stage: "ditolak",
				kuota: 50,
				pelamar: 5,
				savedAt: "2026-02-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.c,
				title: "ClosedNoStage",
				status: "closed",
				kuota: 50,
				pelamar: 50,
				savedAt: "2026-03-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.d,
				title: "ActiveWithSeats",
				kuota: 50,
				pelamar: 1,
				savedAt: "2026-04-01T00:00:00Z",
			}),
		];

		const result = sortFavorites(list, "stageSeats");

		// ActiveWithSeats is the only non-terminal → first. Terminal three sort newest-saved.
		expect(result.map((f) => f.uuid)).toEqual([S.d, S.c, S.b, S.a]);
	});

	it("a Closed Status Lowongan is terminal even with an active stage", () => {
		const list = [
			stageFav({
				uuid: S.a,
				title: "DilamarClosed",
				stage: "dilamar",
				status: "closed",
				kuota: 50,
				pelamar: 50,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.b,
				title: "DilamarOpen",
				stage: "dilamar",
				kuota: 50,
				pelamar: 1,
				savedAt: "2026-01-01T00:00:00Z",
			}),
		];

		const result = sortFavorites(list, "stageSeats");

		expect(result.map((f) => f.uuid)).toEqual([S.b, S.a]);
	});

	it("Dilamar and Interview are active (above terminal), no-stage is active too", () => {
		const list = [
			stageFav({
				uuid: S.a,
				title: "None",
				kuota: 50,
				pelamar: 3,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.b,
				title: "Dilamar",
				stage: "dilamar",
				kuota: 50,
				pelamar: 2,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.c,
				title: "Interview",
				stage: "interview",
				kuota: 50,
				pelamar: 1,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.d,
				title: "Diterima",
				stage: "diterima",
				kuota: 50,
				pelamar: 0,
				savedAt: "2026-01-01T00:00:00Z",
			}),
		];

		const result = sortFavorites(list, "stageSeats");

		// All three active (remaining 47, 48, 49) above terminal Diterima, ascending.
		expect(result.map((f) => f.uuid)).toEqual([S.a, S.b, S.c, S.d]);
	});

	it("respects the active search: sorts within a filtered list", () => {
		// The popup applies search before sort. Here three Lowongan share
		// "Magang" in the title; searching "magang" keeps all three, and the
		// stageSeats order still holds. A fourth ("Other") is filtered out.
		const list = [
			stageFav({
				uuid: S.a,
				title: "Magang Alpha",
				stage: "diterima",
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.b,
				title: "Magang Beta",
				kuota: 50,
				pelamar: 1,
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.c,
				title: "Other",
				kuota: 50,
				pelamar: 2,
				savedAt: "2026-01-01T00:00:00Z",
			}),
		];

		const filtered = searchFavorites(list, "magang");
		const result = sortFavorites(filtered, "stageSeats");

		expect(result.map((f) => f.uuid)).toEqual([S.b, S.a]);
	});

	it("does not mutate the input list", () => {
		const list = [
			stageFav({
				uuid: S.a,
				title: "Alpha",
				stage: "diterima",
				savedAt: "2026-01-01T00:00:00Z",
			}),
			stageFav({
				uuid: S.b,
				title: "Beta",
				kuota: 50,
				pelamar: 1,
				savedAt: "2026-01-01T00:00:00Z",
			}),
		];

		sortFavorites(list, "stageSeats");

		expect(list.map((f) => f.uuid)).toEqual([S.a, S.b]);
	});
});
