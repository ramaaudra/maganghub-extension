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
