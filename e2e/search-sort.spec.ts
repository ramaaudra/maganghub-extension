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
// the popup orders them: with-seats (ascending) → over-subscribed → unrefreshed
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
			// over-subscribed, remaining -5 (futile).
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
			// terminal: Status Lowongan Closed (oldest-saved among terminal).
			"fav:66666666-6666-4666-8666-666666666666": {
				schemaVersion: 4,
				uuid: "66666666-6666-4666-8666-666666666666",
				detailUrl:
					"/magang-nasional/lowongan/magang-zeta-66666666-6666-4666-8666-666666666666",
				savedSnapshot: {
					title: "Zeta Tutup",
					organizer: "PT Contoh",
					location: "Jakarta",
					capturedAt: "2026-01-01T00:00:00Z",
				},
				catatan: "",
				statusLamar: undefined,
				liveStatus: {
					status: "closed",
					lastChecked: "2026-01-01T00:00:00Z",
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

	// with-seats ascending (Beta 1, Alpha 38) → over-subscribed (Gamma -5)
	// → unrefreshed (Delta) → terminal newest-saved (Epsilon, Zeta).
	await expect(renderedTitles(popup)).toHaveText([
		"Beta Kursi 1",
		"Alpha Kursi 38",
		"Gamma Over",
		"Delta Belum Refresh",
		"Epsilon Diterima",
		"Zeta Tutup",
	]);
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
