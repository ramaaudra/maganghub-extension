import { expect, LIST_URL, serveFixture, test } from "./fixtures";
import { openPopup } from "./pages/popup";

// Issue #6 e2e: search + sort the Favorites list in the popup. The three cards
// in lowongan-list.html give us distinct titles, Penyelenggara, and locations:
//
//   Magang Data Analyst      · PT Maju Bersama                       · Jakarta, DKI Jakarta
//   Magang Software Engineer · Kementerian Komunikasi dan Informatika · Jakarta Pusat, DKI Jakarta
//   Magang UI/UX Designer    · PT Kreatif Nusantara                  · Bandung, Jawa Barat

/** Star all three Lowongan on the list so the popup has something to filter. */
async function starAllThree(page: import("@playwright/test").Page) {
	await serveFixture(page);
	await page.goto(LIST_URL);
	const hosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(hosts).toHaveCount(3);
	for (let i = 0; i < 3; i++) {
		await hosts.nth(i).click();
		await expect(hosts.nth(i)).toHaveAttribute("data-filled", "true");
	}
}

/** Titles of the rendered Favorite cards, in display order. */
function renderedTitles(popup: import("@playwright/test").Page) {
	return popup.locator("[data-favorite-uuid] [data-favorite-title]");
}

test("searching filters the Favorites list by title", async ({
	page,
	context,
	extensionId,
}) => {
	await starAllThree(page);
	const popup = await openPopup(context, extensionId);
	await expect(renderedTitles(popup)).toHaveCount(3);

	await popup.getByPlaceholder("Cari favorit...").fill("data");

	await expect(renderedTitles(popup)).toHaveText(["Magang Data Analyst"]);
});

test("searching matches Penyelenggara and location, not just the title", async ({
	page,
	context,
	extensionId,
}) => {
	await starAllThree(page);
	const popup = await openPopup(context, extensionId);
	const search = popup.getByPlaceholder("Cari favorit...");

	// Penyelenggara — no title contains "kementerian".
	await search.fill("kementerian");
	await expect(renderedTitles(popup)).toHaveText(["Magang Software Engineer"]);

	// Location — no title contains "bandung".
	await search.fill("bandung");
	await expect(renderedTitles(popup)).toHaveText(["Magang UI/UX Designer"]);
});

test("a search with no matches shows an empty-result message, not the no-favorites state", async ({
	page,
	context,
	extensionId,
}) => {
	await starAllThree(page);
	const popup = await openPopup(context, extensionId);

	await popup.getByPlaceholder("Cari favorit...").fill("akuntansi");

	await expect(renderedTitles(popup)).toHaveCount(0);
	await expect(popup.getByText(/Tidak ada favorit yang cocok/i)).toBeVisible();
	// The "you have no favorites at all" state must NOT appear — the user does
	// have favorites, they just don't match the query.
	await expect(popup.getByText("Belum ada favorit")).toHaveCount(0);
});

test("clearing the search restores the full list", async ({
	page,
	context,
	extensionId,
}) => {
	await starAllThree(page);
	const popup = await openPopup(context, extensionId);
	const search = popup.getByPlaceholder("Cari favorit...");

	await search.fill("data");
	await expect(renderedTitles(popup)).toHaveCount(1);

	await search.fill("");

	await expect(renderedTitles(popup)).toHaveCount(3);
});

test("sorting by Penyelenggara orders the Favorites A→Z", async ({
	page,
	context,
	extensionId,
}) => {
	await starAllThree(page);
	const popup = await openPopup(context, extensionId);

	await popup.getByLabel("Urutkan").selectOption("organizer");

	// Kementerian Komunikasi… < PT Kreatif Nusantara < PT Maju Bersama
	await expect(renderedTitles(popup)).toHaveText([
		"Magang Software Engineer",
		"Magang UI/UX Designer",
		"Magang Data Analyst",
	]);
});

test("sorting by location orders the Favorites A→Z", async ({
	page,
	context,
	extensionId,
}) => {
	await starAllThree(page);
	const popup = await openPopup(context, extensionId);

	await popup.getByLabel("Urutkan").selectOption("location");

	// Bandung, Jawa Barat < Jakarta, DKI Jakarta < Jakarta Pusat, DKI Jakarta
	await expect(renderedTitles(popup)).toHaveText([
		"Magang UI/UX Designer",
		"Magang Data Analyst",
		"Magang Software Engineer",
	]);
});

test("the default order is newest-saved first", async ({
	page,
	context,
	extensionId,
}) => {
	await starAllThree(page);
	const popup = await openPopup(context, extensionId);

	// Starred in list order, so the last one starred sorts first.
	await expect(renderedTitles(popup)).toHaveText([
		"Magang UI/UX Designer",
		"Magang Software Engineer",
		"Magang Data Analyst",
	]);
});

test("search and sort compose: filtering then ordering the remainder", async ({
	page,
	context,
	extensionId,
}) => {
	await starAllThree(page);
	const popup = await openPopup(context, extensionId);

	// Both Jakarta Lowongan, ordered by Penyelenggara.
	await popup.getByPlaceholder("Cari favorit...").fill("dki jakarta");
	await popup.getByLabel("Urutkan").selectOption("organizer");

	await expect(renderedTitles(popup)).toHaveText([
		"Magang Software Engineer",
		"Magang Data Analyst",
	]);
});

test("the list stays responsive with many Favorites", async ({
	context,
	extensionId,
}) => {
	// Seed 300 Favorites directly into extension storage — far past any real
	// user's list — then assert search + sort still respond promptly. Seeding
	// through storage (not 300 star clicks) keeps the test about the popup's
	// rendering, which is what the AC is about.
	const popup = await openPopup(context, extensionId);
	await popup.evaluate(async () => {
		const records: Record<string, unknown> = {};
		for (let i = 0; i < 300; i++) {
			const n = String(i).padStart(4, "0");
			const uuid = `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b${n}`;
			records[`fav:${uuid}`] = {
				schemaVersion: 3,
				uuid,
				detailUrl: `/magang-nasional/lowongan/magang-${n}-${uuid}`,
				savedSnapshot: {
					title: `Magang Nomor ${n}`,
					organizer: `PT Contoh ${n}`,
					location:
						i % 2 === 0 ? "Jakarta, DKI Jakarta" : "Bandung, Jawa Barat",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: "not_applied",
				liveStatus: { status: "unknown", lastChecked: null },
				savedAt: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
			};
		}
		// `chrome` is ambient inside the extension page, not in the Node-side
		// types this spec compiles under.
		const api = (
			globalThis as unknown as {
				chrome: { storage: { local: { set(r: unknown): Promise<void> } } };
			}
		).chrome;
		await api.storage.local.set(records);
	});

	await expect(renderedTitles(popup)).toHaveCount(300, { timeout: 15_000 });

	// Searching narrows a 300-item list promptly.
	const started = Date.now();
	await popup.getByPlaceholder("Cari favorit...").fill("Nomor 0042");
	await expect(renderedTitles(popup)).toHaveText(["Magang Nomor 0042"]);
	expect(Date.now() - started).toBeLessThan(3_000);

	// Sorting the full list stays correct at this size.
	await popup.getByPlaceholder("Cari favorit...").fill("");
	await popup.getByLabel("Urutkan").selectOption("organizer");
	await expect(renderedTitles(popup).first()).toHaveText("Magang Nomor 0000");
});

// Issue #21 (B2): stage-then-seats sort. Seeds Favorites directly into storage
// with Status Lamar + liveStatus numbers covering every bucket, then asserts
// the popup orders them: with-seats (ascending) → full quota → unrefreshed
// → terminal. Seeding through storage (not star clicks) keeps the test about the
// sort, which is what the AC is about.
test("sorting by Status Lamar + sisa kursi orders by stage then seats", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await popup.evaluate(async () => {
		// One Favorite per bucket, with distinct titles and savedAt so the
		// within-bucket tie-break (newest-saved) is also exercised.
		const records: Record<string, unknown> = {
			// with-seats, remaining 1 (closest-to-full) → top of the list.
			"fav:11111111-1111-4111-8111-111111111111": {
				schemaVersion: 4,
				uuid: "11111111-1111-4111-8111-111111111111",
				detailUrl:
					"/magang-nasional/lowongan/magang-beta-11111111-1111-4111-8111-111111111111",
				savedSnapshot: {
					title: "Beta Kursi 1",
					organizer: "PT Contoh",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: undefined,
				liveStatus: {
					status: "open",
					lastChecked: "2026-01-01T00:00:00Z",
					kuota: 50,
					pelamar: 49,
				},
				savedAt: "2026-01-04T00:00:00Z",
			},
			// with-seats, remaining 38.
			"fav:22222222-2222-4222-8222-222222222222": {
				schemaVersion: 4,
				uuid: "22222222-2222-4222-8222-222222222222",
				detailUrl:
					"/magang-nasional/lowongan/magang-alpha-22222222-2222-4222-8222-222222222222",
				savedSnapshot: {
					title: "Alpha Kursi 38",
					organizer: "PT Contoh",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: undefined,
				liveStatus: {
					status: "open",
					lastChecked: "2026-01-01T00:00:00Z",
					kuota: 50,
					pelamar: 12,
				},
				savedAt: "2026-01-05T00:00:00Z",
			},
			// full quota, remaining -5 (still registrable during the window).
			"fav:33333333-3333-4333-8333-333333333333": {
				schemaVersion: 4,
				uuid: "33333333-3333-4333-8333-333333333333",
				detailUrl:
					"/magang-nasional/lowongan/magang-gamma-33333333-3333-4333-8333-333333333333",
				savedSnapshot: {
					title: "Gamma Over",
					organizer: "PT Contoh",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: "dilamar",
				liveStatus: {
					status: "filling",
					lastChecked: "2026-01-01T00:00:00Z",
					kuota: 50,
					pelamar: 55,
				},
				savedAt: "2026-01-03T00:00:00Z",
			},
			// unrefreshed: no kuota/pelamar, active stage. Newest-saved in its
			// bucket (only one here, but savedAt is newer than the with-seats
			// ones, so it must NOT jump above them).
			"fav:44444444-4444-4444-8444-444444444444": {
				schemaVersion: 4,
				uuid: "44444444-4444-4444-8444-444444444444",
				detailUrl:
					"/magang-nasional/lowongan/magang-delta-44444444-4444-4444-8444-444444444444",
				savedSnapshot: {
					title: "Delta Belum Refresh",
					organizer: "PT Contoh",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: undefined,
				liveStatus: { status: "unknown", lastChecked: null },
				savedAt: "2026-01-06T00:00:00Z",
			},
			// terminal: Diterima (newest-saved among terminal).
			"fav:55555555-5555-4555-8555-555555555555": {
				schemaVersion: 4,
				uuid: "55555555-5555-4555-8555-555555555555",
				detailUrl:
					"/magang-nasional/lowongan/magang-epsilon-55555555-5555-4555-8555-555555555555",
				savedSnapshot: {
					title: "Epsilon Diterima",
					organizer: "PT Contoh",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: "diterima",
				liveStatus: { status: "unknown", lastChecked: null },
				savedAt: "2026-01-07T00:00:00Z",
			},
			// full quota without a Status Lamar stage (oldest-saved in the full bucket).
			"fav:66666666-6666-4666-8666-666666666666": {
				schemaVersion: 4,
				uuid: "66666666-6666-4666-8666-666666666666",
				detailUrl:
					"/magang-nasional/lowongan/magang-zeta-66666666-6666-4666-8666-666666666666",
				savedSnapshot: {
					title: "Zeta Kuota Penuh",
					organizer: "PT Contoh",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: undefined,
				liveStatus: {
					status: "closed",
					lastChecked: "2026-01-01T00:00:00Z",
					kuota: 50,
					pelamar: 50,
				},
				savedAt: "2026-01-02T00:00:00Z",
			},
		};
		const api = (
			globalThis as unknown as {
				chrome: { storage: { local: { set(r: unknown): Promise<void> } } };
			}
		).chrome;
		await api.storage.local.set(records);
	});

	await expect(renderedTitles(popup)).toHaveCount(6, { timeout: 10_000 });

	await popup.getByLabel("Urutkan").selectOption("stageSeats");

	// with-seats ascending (Beta 1, Alpha 38) → full quota (Gamma -5, Zeta 0)
	// → unrefreshed (Delta) → terminal (Epsilon).
	await expect(renderedTitles(popup)).toHaveText([
		"Beta Kursi 1",
		"Alpha Kursi 38",
		"Gamma Over",
		"Zeta Kuota Penuh",
		"Delta Belum Refresh",
		"Epsilon Diterima",
	]);
});

// Audit W3: the Tahap filter isolates one Status Lamar — the real way to
// answer "which favorites are Interview?". Seeds stages directly into storage
// (the star flow sets no stage), covering the filter, its no-match state, and
// clearing back to all stages.
test("filtering by Tahap isolates one Status Lamar", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await popup.evaluate(async () => {
		const records: Record<string, unknown> = {
			"fav:11111111-1111-4111-8111-111111111111": {
				schemaVersion: 4,
				uuid: "11111111-1111-4111-8111-111111111111",
				detailUrl:
					"/magang-nasional/lowongan/magang-a-11111111-1111-4111-8111-111111111111",
				savedSnapshot: {
					title: "Alpha Interview",
					organizer: "PT Satu",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: "interview",
				liveStatus: { status: "unknown", lastChecked: null },
				savedAt: "2026-01-01T00:00:00Z",
			},
			"fav:22222222-2222-4222-8222-222222222222": {
				schemaVersion: 4,
				uuid: "22222222-2222-4222-8222-222222222222",
				detailUrl:
					"/magang-nasional/lowongan/magang-b-22222222-2222-4222-8222-222222222222",
				savedSnapshot: {
					title: "Beta Dilamar",
					organizer: "PT Dua",
					location: "Bandung",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: "dilamar",
				liveStatus: { status: "unknown", lastChecked: null },
				savedAt: "2026-01-02T00:00:00Z",
			},
			"fav:33333333-3333-4333-8333-333333333333": {
				schemaVersion: 4,
				uuid: "33333333-3333-4333-8333-333333333333",
				detailUrl:
					"/magang-nasional/lowongan/magang-c-33333333-3333-4333-8333-333333333333",
				savedSnapshot: {
					title: "Gamma Ditolak",
					organizer: "PT Tiga",
					location: "Surabaya",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: "ditolak",
				liveStatus: { status: "unknown", lastChecked: null },
				savedAt: "2026-01-03T00:00:00Z",
			},
		};
		const api = (
			globalThis as unknown as {
				chrome: { storage: { local: { set(r: unknown): Promise<void> } } };
			}
		).chrome;
		await api.storage.local.set(records);
	});

	await expect(renderedTitles(popup)).toHaveCount(3, { timeout: 10_000 });

	// Isolate one stage.
	await popup.getByLabel("Tahap").selectOption("interview");
	await expect(renderedTitles(popup)).toHaveText(["Alpha Interview"]);

	// A stage with no matches shows the no-match state, not the empty state.
	await popup.getByLabel("Tahap").selectOption("diterima");
	await expect(renderedTitles(popup)).toHaveCount(0);
	await expect(popup.getByText(/Tidak ada favorit yang cocok/i)).toBeVisible();

	// Back to all stages restores the full list.
	await popup.getByLabel("Tahap").selectOption("");
	await expect(renderedTitles(popup)).toHaveCount(3);
});

// Audit W4: the chosen sort is remembered per tab for the browser session
// (chrome.storage.session), so closing and reopening the popup keeps the
// order — and peeking at the Arsip tab no longer discards the Aktif choice.
test("the chosen sort survives popup close/reopen within the session", async ({
	page,
	context,
	extensionId,
}) => {
	await starAllThree(page);
	const popup = await openPopup(context, extensionId);
	await expect(renderedTitles(popup)).toHaveCount(3);

	await popup.getByLabel("Urutkan").selectOption("organizer");
	await expect(renderedTitles(popup)).toHaveText([
		"Magang Software Engineer",
		"Magang UI/UX Designer",
		"Magang Data Analyst",
	]);

	await popup.close();

	const reopened = await openPopup(context, extensionId);
	await expect(renderedTitles(reopened)).toHaveCount(3);
	await expect(reopened.getByLabel("Urutkan")).toHaveValue("organizer");
	await expect(renderedTitles(reopened)).toHaveText([
		"Magang Software Engineer",
		"Magang UI/UX Designer",
		"Magang Data Analyst",
	]);
});

test("switching tabs restores each tab's own remembered sort", async ({
	page,
	context,
	extensionId,
}) => {
	await starAllThree(page);
	const popup = await openPopup(context, extensionId);

	// One archived Favorite so the Arsip tab has content. Seeded at the
	// CURRENT schema (5): a v4 record would be migrated and have its
	// `archivedAt` overwritten to null (active) by migrateV4ToV5.
	await popup.evaluate(async () => {
		const api = (
			globalThis as unknown as {
				chrome: { storage: { local: { set(r: unknown): Promise<void> } } };
			}
		).chrome;
		await api.storage.local.set({
			"fav:99999999-9999-4999-8999-999999999999": {
				schemaVersion: 5,
				uuid: "99999999-9999-4999-8999-999999999999",
				detailUrl:
					"/magang-nasional/lowongan/magang-z-99999999-9999-4999-8999-999999999999",
				savedSnapshot: {
					title: "Zeta Arsip",
					organizer: "PT Zeta",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: undefined,
				liveStatus: { status: "unknown", lastChecked: null },
				savedAt: "2026-01-01T00:00:00Z",
				archivedAt: "2026-02-01T00:00:00Z",
			},
		});
	});

	await expect(renderedTitles(popup)).toHaveCount(3, { timeout: 10_000 });

	// Aktif's choice.
	await popup.getByLabel("Urutkan").selectOption("organizer");
	await popup.getByRole("tab", { name: /Arsip/ }).click();
	// Arsip has no remembered choice yet → its own default.
	await expect(popup.getByLabel("Urutkan")).toHaveValue("archivedAt");
	await popup.getByRole("tab", { name: "Aktif" }).click();
	// Aktif's remembered choice is restored — the tab switch did not clobber it.
	await expect(popup.getByLabel("Urutkan")).toHaveValue("organizer");
});

// Issue #21 (B2): the stageSeats sort respects the active search — the filtered
// list is sorted within the filter, never escaping it.
test("stageSeats sort respects the active search", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await popup.evaluate(async () => {
		const records: Record<string, unknown> = {
			// with-seats, title matches "Jakarta".
			"fav:11111111-1111-4111-8111-111111111111": {
				schemaVersion: 4,
				uuid: "11111111-1111-4111-8111-111111111111",
				detailUrl:
					"/magang-nasional/lowongan/magang-a-11111111-1111-4111-8111-111111111111",
				savedSnapshot: {
					title: "A Jakarta Seats",
					organizer: "PT Contoh",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: undefined,
				liveStatus: {
					status: "open",
					lastChecked: "2026-01-01T00:00:00Z",
					kuota: 50,
					pelamar: 1,
				},
				savedAt: "2026-01-01T00:00:00Z",
			},
			// terminal, title matches "Jakarta".
			"fav:22222222-2222-4222-8222-222222222222": {
				schemaVersion: 4,
				uuid: "22222222-2222-4222-8222-222222222222",
				detailUrl:
					"/magang-nasional/lowongan/magang-b-22222222-2222-4222-8222-222222222222",
				savedSnapshot: {
					title: "B Jakarta Diterima",
					organizer: "PT Contoh",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: "diterima",
				liveStatus: { status: "unknown", lastChecked: null },
				savedAt: "2026-01-02T00:00:00Z",
			},
			// with-seats, title does NOT match "jakarta" — filtered out.
			"fav:33333333-3333-4333-8333-333333333333": {
				schemaVersion: 4,
				uuid: "33333333-3333-4333-8333-333333333333",
				detailUrl:
					"/magang-nasional/lowongan/magang-c-33333333-3333-4333-8333-333333333333",
				savedSnapshot: {
					title: "C Bandung Seats",
					organizer: "PT Contoh",
					location: "Bandung",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: undefined,
				liveStatus: {
					status: "open",
					lastChecked: "2026-01-01T00:00:00Z",
					kuota: 50,
					pelamar: 2,
				},
				savedAt: "2026-01-03T00:00:00Z",
			},
		};
		const api = (
			globalThis as unknown as {
				chrome: { storage: { local: { set(r: unknown): Promise<void> } } };
			}
		).chrome;
		await api.storage.local.set(records);
	});

	await expect(renderedTitles(popup)).toHaveCount(3, { timeout: 10_000 });

	await popup.getByPlaceholder("Cari favorit...").fill("jakarta");
	await popup.getByLabel("Urutkan").selectOption("stageSeats");

	// C is filtered out; with-seats A sorts above terminal B within the filter.
	await expect(renderedTitles(popup)).toHaveText([
		"A Jakarta Seats",
		"B Jakarta Diterima",
	]);
});
