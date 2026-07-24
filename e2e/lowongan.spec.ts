import { test, expect } from "./fixtures";
import { openPopup } from "./pages/popup";
import { readFileSync } from "node:fs";
import path from "node:path";

const LIST_URL = "https://maganghub.kemnaker.go.id/magang-nasional/lowongan";
// Same UUID as the first card in lowongan-list.html, so favoriting on the list
// and visiting this detail page exercise the same Favorite record (issue #3).
const DETAIL_URL =
	"https://maganghub.kemnaker.go.id/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

const readFixture = (name: string) =>
	readFileSync(path.join(process.cwd(), "test/fixtures", name), "utf8");

const listFixtureHtml = () => readFixture("lowongan-list.html");
const detailFixtureHtml = () => readFixture("lowongan-detail.html");

// Serve the recorded MagangHub fixtures for the real MagangHub URLs, so the
// content script's real `matches` still auto-injects (no extra permissions, no
// live network/Cloudflare). Deterministic — this is the e2e seam from issue #1.
// The detail path is routed to the detail fixture; everything else (the list
// URL) gets the list fixture.
async function serveFixture(
	page: import("@playwright/test").Page,
): Promise<void> {
	await page.route("https://maganghub.kemnaker.go.id/**", (route) => {
		const isDetail = route
			.request()
			.url()
			.includes("/magang-nasional/lowongan/");
		return route.fulfill({
			status: 200,
			contentType: "text/html; charset=utf-8",
			body: isDetail ? detailFixtureHtml() : listFixtureHtml(),
		});
	});
}

test("stars inject into every Lowongan card", async ({ page }) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const cards = page.locator(".mh-lowongan-card");
	await expect(cards).toHaveCount(3);

	// A star host is injected into each card. The star button itself lives in a
	// closed Shadow DOM (not piercable), but the host is in the light DOM.
	const starHosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(starHosts).toHaveCount(3);
	await expect(starHosts.first()).toHaveAttribute("data-filled", "false");
});

test("clicking a star toggles it, persists, and does not navigate", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const firstHost = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await expect(firstHost).toHaveAttribute("data-filled", "false");

	await firstHost.click();

	// The card is wrapped in an <a>; the star must not navigate to the detail page.
	expect(page.url()).toContain("/magang-nasional/lowongan");
	await expect(firstHost).toHaveAttribute("data-filled", "true");
});

test("a starred Lowongan appears in the popup with title, Penyelenggara, and location", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	await expect(popup.locator("main")).toBeVisible();
	await expect(popup.getByText("Magang Data Analyst")).toBeVisible();
	await expect(popup.getByText("PT Maju Bersama")).toBeVisible();
	await expect(popup.getByText("Jakarta, DKI Jakarta")).toBeVisible();
});

test("the popup shows an empty state when there are no favorites", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText("Belum ada favorit")).toBeVisible();
});
test("a favorited Lowongan shows filled on reload (state read from storage on inject)", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const firstHost = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await expect(firstHost).toHaveAttribute("data-filled", "false");
	await firstHost.click();
	await expect(firstHost).toHaveAttribute("data-filled", "true");

	// Reload: the star must read persisted state on inject and render filled.
	await page.reload();
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "true");
});

test("a favorite toggle is injected near the title on a Lowongan detail page", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	await expect(page.locator("h1")).toHaveText("Magang Data Analyst");

	const detailHost = page.locator(".mh-favorite-detail-host");
	await expect(detailHost).toHaveCount(1);
	await expect(detailHost).toHaveAttribute("data-filled", "false");
});

test("the detail toggle reflects a Lowongan already favorited from the list (state sync via storage)", async ({
	page,
}) => {
	await serveFixture(page);

	// Favorite from the list first.
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "true");

	// Same UUID's detail page must read the same Favorite record as filled.
	await page.goto(DETAIL_URL);
	await expect(page.locator(".mh-favorite-detail-host")).toHaveAttribute(
		"data-filled",
		"true",
	);
});

test("clicking the detail toggle unfavorites the same record the list star reads", async ({
	page,
}) => {
	await serveFixture(page);

	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "true");

	await page.goto(DETAIL_URL);
	const detailHost = page.locator(".mh-favorite-detail-host");
	await expect(detailHost).toHaveAttribute("data-filled", "true");

	// Toggle off from the detail page.
	await detailHost.click();
	await expect(detailHost).toHaveAttribute("data-filled", "false");

	// The list star reads the same (now cleared) Favorite record on next load.
	await page.goto(LIST_URL);
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "false");
});

test("favoriting from the detail page persists a snapshot the popup can render", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	const detailHost = page.locator(".mh-favorite-detail-host");
	await expect(detailHost).toHaveAttribute("data-filled", "false");
	await detailHost.click();
	await expect(detailHost).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText("Magang Data Analyst")).toBeVisible();
	await expect(popup.getByText("PT Maju Bersama")).toBeVisible();
});

test("editing Catatan and toggling Status Lamar persists across popup reopen", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();

	let popup = await openPopup(context, extensionId);
	const uuid = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
	const card = popup.locator(`[data-favorite-uuid="${uuid}"]`);

	await card
		.getByPlaceholder("Tambahkan catatan...")
		.fill("alasan aku simpan ini");
	await card.getByPlaceholder("Tambahkan catatan...").blur();
	await expect(card.getByText("Tersimpan")).toBeVisible();

	const statusLamarCheckbox = card.getByLabel("Sudah dilamar");
	await expect(statusLamarCheckbox).not.toBeChecked();
	await statusLamarCheckbox.check();
	await expect(statusLamarCheckbox).toBeChecked();
	await popup.close();

	// Reopen: both must have persisted to storage.
	popup = await openPopup(context, extensionId);
	const reopenedCard = popup.locator(`[data-favorite-uuid="${uuid}"]`);
	await expect(
		reopenedCard.getByPlaceholder("Tambahkan catatan..."),
	).toHaveValue("alasan aku simpan ini");
	await expect(reopenedCard.getByLabel("Sudah dilamar")).toBeChecked();
});
