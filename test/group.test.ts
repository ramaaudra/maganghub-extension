import { describe, expect, it } from "vitest";
import {
	GROUP_THRESHOLD,
	groupFavorites,
	summarizeStages,
	summaryText,
	type StageSummary,
} from "@/lib/group";
import { type Favorite, SCHEMA_VERSION, type StatusLamar } from "@/lib/types";

/**
 * Contract tests for the popup's per-Penyyelenggara grouping (issue #22 / C4).
 * Pure functions over Favorite[] — the browser-level behaviour (collapsing a
 * group, the header rendering) is covered by the e2e spec; here we pin the
 * threshold + summary contracts that are cheaper to enumerate than to drive.
 *
 * Prior art: `test/filter.test.ts`. The grouping composes AFTER search + sort,
 * so every test passes an already-ordered list (grouping preserves that order
 * both between groups and within one).
 */

const fav = (over: {
	uuid: string;
	organizer: string;
	stage?: StatusLamar | undefined;
	savedAt?: string;
}): Favorite => ({
	schemaVersion: SCHEMA_VERSION,
	uuid: over.uuid,
	detailUrl: `/magang-nasional/lowongan/x-${over.uuid}`,
	savedSnapshot: {
		title: `Magang ${over.uuid.slice(0, 1)}`,
		organizer: over.organizer,
		location: "Jakarta",
		capturedAt: "2026-01-01T00:00:00Z",
	},
	catatan: "",
	statusLamar: over.stage,
	liveStatus: { status: "unknown", lastChecked: null },
	savedAt: over.savedAt ?? "2026-01-01T00:00:00Z",
});

const U = {
	a: "11111111-1111-4111-8111-111111111111",
	b: "22222222-2222-4222-8222-222222222222",
	c: "33333333-3333-4333-8333-333333333333",
	d: "44444444-4444-4444-8444-444444444444",
	e: "55555555-5555-4555-8555-555555555555",
	f: "66666666-6666-4666-8666-666666666666",
	g: "77777777-7777-4777-8777-777777777777",
	h: "88888888-8888-4888-8888-888888888888",
};

/** Flatten grouped items back to uuids, marking group boundaries with "|". */
function uuidOutline(items: ReturnType<typeof groupFavorites>): string[] {
	const out: string[] = [];
	for (const item of items) {
		if (item.kind === "solo") {
			out.push(item.favorite.uuid);
		} else {
			out.push("|");
			for (const f of item.favorites) out.push(f.uuid);
			out.push("|");
		}
	}
	return out;
}

describe("groupFavorites", () => {
	it("groups a Penyelenggara with more than 3 Favorites into one collapsible group", () => {
		const list = [
			fav({ uuid: U.a, organizer: "PT Banyak" }),
			fav({ uuid: U.b, organizer: "PT Banyak" }),
			fav({ uuid: U.c, organizer: "PT Banyak" }),
			fav({ uuid: U.d, organizer: "PT Banyak" }),
		];

		const items = groupFavorites(list);

		expect(items).toHaveLength(1);
		expect(items[0].kind).toBe("group");
		if (items[0].kind !== "group") return;
		expect(items[0].organizer).toBe("PT Banyak");
		expect(items[0].favorites.map((f) => f.uuid)).toEqual([U.a, U.b, U.c, U.d]);
	});

	it("does NOT group a Penyelenggara with exactly 3 Favorites (cards stand alone)", () => {
		const list = [
			fav({ uuid: U.a, organizer: "PT Tiga" }),
			fav({ uuid: U.b, organizer: "PT Tiga" }),
			fav({ uuid: U.c, organizer: "PT Tiga" }),
		];

		const items = groupFavorites(list);

		expect(items.every((i) => i.kind === "solo")).toBe(true);
		expect(
			items.map((i) => (i.kind === "solo" ? i.favorite.uuid : "")),
		).toEqual([U.a, U.b, U.c]);
	});

	it("threshold is strictly greater-than: 3 solos, 4 a group", () => {
		expect(GROUP_THRESHOLD).toBe(3);
		const three = [U.a, U.b, U.c].map((u) =>
			fav({ uuid: u, organizer: "PT Sama" }),
		);
		expect(groupFavorites(three).every((i) => i.kind === "solo")).toBe(true);

		const four = [...three, fav({ uuid: U.d, organizer: "PT Sama" })];
		const items = groupFavorites(four);
		expect(items).toHaveLength(1);
		expect(items[0].kind).toBe("group");
	});

	it("keeps solo cards from small Penyelenggara in their sorted position", () => {
		// PT Sedikit (2) sits between two PT Banyak favorites; the group still
		// emits at PT Banyak's first appearance, and PT Sedikit's two solos
		// stay in place.
		const list = [
			fav({ uuid: U.a, organizer: "PT Banyak" }),
			fav({ uuid: U.b, organizer: "PT Sedikit" }),
			fav({ uuid: U.c, organizer: "PT Sedikit" }),
			fav({ uuid: U.d, organizer: "PT Banyak" }),
			fav({ uuid: U.e, organizer: "PT Banyak" }),
			fav({ uuid: U.f, organizer: "PT Banyak" }),
		];

		const items = groupFavorites(list);

		// Group at first PT Banyak (consuming d/e/f too), then the two solos.
		expect(uuidOutline(items)).toEqual([
			"|",
			U.a,
			U.d,
			U.e,
			U.f,
			"|",
			U.b,
			U.c,
		]);
	});

	it("preserves the within-group order the sort established", () => {
		// Saved-newest-first order: f, e, d, a inside PT Banyak.
		const list = [
			fav({
				uuid: U.a,
				organizer: "PT Banyak",
				savedAt: "2026-01-01T00:00:00Z",
			}),
			fav({
				uuid: U.d,
				organizer: "PT Banyak",
				savedAt: "2026-01-04T00:00:00Z",
			}),
			fav({
				uuid: U.e,
				organizer: "PT Banyak",
				savedAt: "2026-01-05T00:00:00Z",
			}),
			fav({
				uuid: U.f,
				organizer: "PT Banyak",
				savedAt: "2026-01-06T00:00:00Z",
			}),
		];

		const items = groupFavorites(list);
		if (items[0].kind !== "group") throw new Error("expected a group");
		// Input order is preserved within the group (the sort already ran).
		expect(items[0].favorites.map((x) => x.uuid)).toEqual([U.a, U.d, U.e, U.f]);
	});

	it("handles multiple grouped Penyelenggara, each emitted at first appearance", () => {
		const list = [
			fav({ uuid: U.a, organizer: "PT Alpha" }),
			fav({ uuid: U.b, organizer: "PT Beta" }),
			fav({ uuid: U.c, organizer: "PT Alpha" }),
			fav({ uuid: U.d, organizer: "PT Beta" }),
			fav({ uuid: U.e, organizer: "PT Alpha" }),
			fav({ uuid: U.f, organizer: "PT Beta" }),
			fav({ uuid: U.g, organizer: "PT Alpha" }),
			fav({ uuid: U.h, organizer: "PT Beta" }),
		];

		const items = groupFavorites(list);

		// PT Alpha (4: a,c,e,g) and PT Beta (4: b,d,f,h) both group. Each group
		// emits at its organizer's first appearance, consuming the rest.
		expect(uuidOutline(items)).toEqual([
			"|",
			U.a,
			U.c,
			U.e,
			U.g,
			"|",
			"|",
			U.b,
			U.d,
			U.f,
			U.h,
			"|",
		]);
	});

	it("returns an empty list for an empty input", () => {
		expect(groupFavorites([])).toEqual([]);
	});

	it("does not mutate the input list", () => {
		const list = [
			fav({ uuid: U.a, organizer: "PT Banyak" }),
			fav({ uuid: U.b, organizer: "PT Banyak" }),
			fav({ uuid: U.c, organizer: "PT Banyak" }),
			fav({ uuid: U.d, organizer: "PT Banyak" }),
		];
		const snapshot = list.map((f) => f.uuid);

		groupFavorites(list);

		expect(list.map((f) => f.uuid)).toEqual(snapshot);
	});
});

// ─── Stage summary (issue #22 example: "3 aktif, 1 interview, 2 ditolak") ─────

describe("summarizeStages", () => {
	it("counts no-stage and Dilamar as aktif, and breaks out the other stages", () => {
		const group = [
			fav({ uuid: U.a, organizer: "PT", stage: undefined }),
			fav({ uuid: U.b, organizer: "PT", stage: "dilamar" }),
			fav({ uuid: U.c, organizer: "PT", stage: undefined }),
			fav({ uuid: U.d, organizer: "PT", stage: "interview" }),
			fav({ uuid: U.e, organizer: "PT", stage: "ditolak" }),
			fav({ uuid: U.f, organizer: "PT", stage: "ditolak" }),
		];

		expect(summarizeStages(group)).toEqual({
			aktif: 3,
			interview: 1,
			diterima: 0,
			ditolak: 2,
		});
	});

	it("counts Diterima in its own bucket", () => {
		const group = [
			fav({ uuid: U.a, organizer: "PT", stage: "diterima" }),
			fav({ uuid: U.b, organizer: "PT", stage: "diterima" }),
			fav({ uuid: U.c, organizer: "PT", stage: "dilamar" }),
		];

		expect(summarizeStages(group)).toEqual({
			aktif: 1,
			interview: 0,
			diterima: 2,
			ditolak: 0,
		});
	});

	it("the counts always sum to the group size (every favorite lands in one bucket)", () => {
		const group = [
			fav({ uuid: U.a, organizer: "PT", stage: "dilamar" }),
			fav({ uuid: U.b, organizer: "PT", stage: "interview" }),
			fav({ uuid: U.c, organizer: "PT", stage: "diterima" }),
			fav({ uuid: U.d, organizer: "PT", stage: "ditolak" }),
			fav({ uuid: U.e, organizer: "PT", stage: undefined }),
		];

		const s = summarizeStages(group);
		expect(s.aktif + s.interview + s.diterima + s.ditolak).toBe(group.length);
	});

	it("ignores Status Lowongan — a closed listing the user never applied to is not 'ditolak'", () => {
		const group = [
			// closed, no stage → aktif, not ditolak.
			fav({ uuid: U.a, organizer: "PT", stage: undefined }),
			// closed + dilamar → still aktif (dilamar bucket).
			fav({ uuid: U.b, organizer: "PT", stage: "dilamar" }),
		];
		// Force closed liveStatus to prove it does not feed the summary.
		group[0].liveStatus.status = "closed";
		group[1].liveStatus.status = "closed";

		expect(summarizeStages(group)).toEqual({
			aktif: 2,
			interview: 0,
			diterima: 0,
			ditolak: 0,
		});
	});

	it("returns all-zero for an empty group", () => {
		expect(summarizeStages([])).toEqual<StageSummary>({
			aktif: 0,
			interview: 0,
			diterima: 0,
			ditolak: 0,
		});
	});
});

describe("summaryText", () => {
	it("renders non-zero categories in fixed order, comma-joined", () => {
		expect(
			summaryText({ aktif: 3, interview: 1, diterima: 0, ditolak: 2 }),
		).toBe("3 aktif, 1 interview, 2 ditolak");
	});

	it("skips zero categories rather than rendering '0 interview'", () => {
		expect(
			summaryText({ aktif: 3, interview: 0, diterima: 0, ditolak: 0 }),
		).toBe("3 aktif");
	});

	it("renders only the terminal category when the org is all-rejected", () => {
		expect(
			summaryText({ aktif: 0, interview: 0, diterima: 0, ditolak: 4 }),
		).toBe("4 ditolak");
	});

	it("renders all four when every category is non-zero", () => {
		expect(
			summaryText({ aktif: 2, interview: 1, diterima: 1, ditolak: 1 }),
		).toBe("2 aktif, 1 interview, 1 diterima, 1 ditolak");
	});

	it("renders an empty string for an all-zero summary", () => {
		expect(
			summaryText({ aktif: 0, interview: 0, diterima: 0, ditolak: 0 }),
		).toBe("");
	});
});

describe("groupFavorites + summary composition (reflects the active list)", () => {
	it("the group summary reflects only the favorites in the passed-in list, not the whole storage set", () => {
		// PT Banyak has 5 total, but a search narrows to 4 of them, all aktif.
		// The summary must read "4 aktif" — the counts follow the filtered list.
		const all = [
			fav({ uuid: U.a, organizer: "PT Banyak", stage: "dilamar" }),
			fav({ uuid: U.b, organizer: "PT Banyak", stage: undefined }),
			fav({ uuid: U.c, organizer: "PT Banyak", stage: "interview" }),
			fav({ uuid: U.d, organizer: "PT Banyak", stage: undefined }),
			fav({ uuid: U.e, organizer: "PT Banyak", stage: "ditolak" }),
		];
		// Simulate a search that drops the interview favorite (c).
		const filtered = all.filter((f) => f.uuid !== U.c);

		const items = groupFavorites(filtered);
		expect(items).toHaveLength(1);
		if (items[0].kind !== "group") throw new Error("expected a group");
		expect(summaryText(items[0].summary)).toBe("3 aktif, 1 ditolak");
		expect(items[0].favorites).toHaveLength(4);
	});

	it("a Penyelenggara reduced to ≤3 by a search stops grouping (cards stand alone)", () => {
		// 5 favorites from PT Banyak → group. A search narrowing to 3 → solos.
		const all = [
			fav({ uuid: U.a, organizer: "PT Banyak" }),
			fav({ uuid: U.b, organizer: "PT Banyak" }),
			fav({ uuid: U.c, organizer: "PT Banyak" }),
			fav({ uuid: U.d, organizer: "PT Banyak" }),
			fav({ uuid: U.e, organizer: "PT Banyak" }),
		];
		const filtered = all.slice(0, 3);

		expect(groupFavorites(filtered).every((i) => i.kind === "solo")).toBe(true);
	});
});
