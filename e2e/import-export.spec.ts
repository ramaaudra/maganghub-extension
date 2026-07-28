import { expect, FIRST_UUID, LIST_URL, serveFixture, test } from "./fixtures";
import { openPopup } from "./pages/popup";

// Issue #9 e2e: export → import round-trip, including an old-schema (v1) file
// that must migrate up to the current schema on import.

test("export produces a downloadable JSON file with schemaVersion, exportedAt, and count", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	// Star one favorite so the export has content.
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();

	const popup = await openPopup(context, extensionId);

	// Playwright exposes downloads from the extension page via the standard
	// download event. The export button triggers a Blob download.
	const downloadPromise = popup.waitForEvent("download");
	await popup.getByRole("button", { name: /Ekspor/i }).click();
	const download = await downloadPromise;

	// Filename mentions "maganghub" + "favorit" + .json.
	expect(download.suggestedFilename()).toMatch(/maganghub.*favorit.*\.json$/i);

	// The content is valid JSON with the expected envelope shape.
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(chunk as Buffer);
	const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

	expect(body.schemaVersion).toBe(5);
	expect(typeof body.exportedAt).toBe("string");
	expect(body.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	expect(body.count).toBe(1);
	expect(Array.isArray(body.favorites)).toBe(true);
	expect(body.favorites[0].uuid).toBe(FIRST_UUID);
});

test("import of a v1 (old-schema) file migrates records up to the current schema", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	// No favorites starred — the store starts empty (fresh profile per test).

	const popup = await openPopup(context, extensionId);

	// A v1 export file (no catatan/statusLamar/liveStatus). On import it must
	// migrate to v5 and appear in the popup with the v1 snapshot's title.
	const v1File = {
		schemaVersion: 1,
		exportedAt: "2025-01-01T00:00:00Z",
		count: 1,
		favorites: [
			{
				schemaVersion: 1,
				uuid: FIRST_UUID,
				detailUrl:
					"/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
				savedSnapshot: {
					title: "Magang Data Analyst Impor Lama",
					organizer: "PT Impor",
					location: "Bandung",
					capturedAt: "2025-01-01T00:00:00Z",
				},
				savedAt: "2025-01-01T00:00:00Z",
			},
		],
	};

	// Set the file the hidden <input type="file"> will pick up.
	const fileInput = popup.locator('input[type="file"]');
	await fileInput.setInputFiles({
		name: "maganghub-favorit-v1.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(v1File)),
	});

	// Import succeeded → the migrated favorite appears with its v1 title, and
	// a success indicator is shown.
	await expect(
		popup.getByText(/Magang Data Analyst Impor Lama/i),
	).toBeVisible();
	await expect(popup.getByText(/Berhasil/i)).toBeVisible();
});

test("import rejects a file from a newer schema than current with a warning, importing nothing", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	const popup = await openPopup(context, extensionId);

	const futureFile = {
		schemaVersion: 99,
		exportedAt: "2099-01-01T00:00:00Z",
		count: 1,
		favorites: [
			{
				schemaVersion: 99,
				uuid: "00000000-0000-4000-8000-000000000000",
				detailUrl: "/x",
				savedSnapshot: {
					title: "Future",
					organizer: "X",
					location: "Y",
					capturedAt: "2099-01-01T00:00:00Z",
				},
				savedAt: "2099-01-01T00:00:00Z",
			},
		],
	};

	const fileInput = popup.locator('input[type="file"]');
	await fileInput.setInputFiles({
		name: "future.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(futureFile)),
	});

	// Warning surfaced; no favorite added.
	await expect(popup.getByText(/lebih baru|Perbarui extension/i)).toBeVisible();
	await expect(popup.getByText("Future")).toHaveCount(0);
});

test("export then import round-trips favorites across a fresh profile", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	// Star two favorites.
	const hosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await hosts.nth(0).click();
	await hosts.nth(1).click();

	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText("Magang Data Analyst")).toBeVisible();

	// Export.
	const downloadPromise = popup.waitForEvent("download");
	await popup.getByRole("button", { name: /Ekspor/i }).click();
	const download = await downloadPromise;
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(chunk as Buffer);
	const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	expect(body.count).toBe(2);

	// Wipe the profile's storage so the store is empty, then re-import the
	// exported file. This simulates restoring on a fresh device.
	// @ts-expect-error chrome is in-scope in the extension page evaluate context
	await popup.evaluate(() => chrome.storage.local.clear());
	await expect(popup.getByText("Belum ada favorit")).toBeVisible();

	const fileInput = popup.locator('input[type="file"]');
	await fileInput.setInputFiles({
		name: "maganghub-favorit.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(body)),
	});

	// Both favorites come back.
	await expect(popup.getByText("Magang Data Analyst")).toBeVisible();
	await expect(popup.getByText(/Berhasil/i)).toBeVisible();
});
