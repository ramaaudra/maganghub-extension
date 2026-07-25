import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures";
import { openPopup } from "./pages/popup";

// Issue #5 e2e: refresh Status Lowongan from fixture detail HTML.
//
// Three favorites are starred on the list fixture, then "Segarkan semua" asks
// the background to refresh each. The background spins up the offscreen
// document (ADR-0005), which fetches each detail URL and parses it.
//
// Playwright cannot intercept fetches issued from an MV3 offscreen document
// (it isn't tracked as a context page), so live-network refreshes would hit
// Cloudflare and be flaky. Instead the e2e stages per-UUID fixture responses
// under `__testDetailFixtures` in storage; the background (which can read
// chrome.storage, unlike the offscreen) fronts the seam and passes the staged
// body in the fetchAndParse message. Production never sets that key. This
// exercises the full popup → background → offscreen → parse → liveStatus →
// popup pipeline deterministically against fixture HTML for the three states:
//   - open UUID       → lowongan-detail-open.html        (200) → Buka
//   - closed UUID     → lowongan-detail-closed.html      (200, no apply btn) → Tutup
//   - kuota-full UUID → lowongan-detail-kuota-full.html  (200, no apply btn) → Tutup
// A dedicated test below also covers the HTTP 404 (listing removed) → Tutup path.

const LIST_URL = "https://maganghub.kemnaker.go.id/magang-nasional/lowongan";

const UUID_OPEN = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const UUID_CLOSED = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const UUID_KUOTA_FULL = "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f";

const readFixture = (name: string) =>
	readFileSync(path.join(process.cwd(), "test/fixtures", name), "utf8");

const listHtml = () => readFixture("lowongan-list.html");
const openHtml = () => readFixture("lowongan-detail-open.html");
const closedHtml = () => readFixture("lowongan-detail-closed.html");
const kuotaFullHtml = () => readFixture("lowongan-detail-kuota-full.html");

// `chrome` exists in the extension page context where `popup.evaluate` runs;
// declare a minimal shape so the evaluate bodies typecheck without @types/chrome.
declare const chrome: {
	storage: { local: { set(value: Record<string, unknown>): Promise<void> } };
};

/** Route the list page to the list fixture (the list page IS a tracked page,
 *  so context.route intercepts its navigation + asset loads). */
async function routeList(
	context: import("@playwright/test").BrowserContext,
): Promise<void> {
	await context.route("https://maganghub.kemnaker.go.id/**", (route) => {
		// The detail pages are never navigated to in these tests — only fetched by
		// the offscreen, which bypasses route interception. Fulfill anything else
		// (the list page + its images) with the list fixture.
		return route.fulfill({
			status: 200,
			contentType: "text/html; charset=utf-8",
			body: listHtml(),
		});
	});
}

/** Stage per-UUID fixture responses for the offscreen test seam. */
async function stageFixtures(
	popup: import("@playwright/test").Page,
	fixtures: Record<string, { status: number; body: string }>,
): Promise<void> {
	await popup.evaluate(
		(f) => chrome.storage.local.set({ __testDetailFixtures: f }),
		fixtures,
	);
}

async function starAllCards(
	page: import("@playwright/test").Page,
): Promise<void> {
	await page.goto(LIST_URL);
	const hosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(hosts).toHaveCount(3);
	await hosts.nth(0).click();
	await hosts.nth(1).click();
	await hosts.nth(2).click();
	await expect(hosts.nth(0)).toHaveAttribute("data-filled", "true");
	await expect(hosts.nth(2)).toHaveAttribute("data-filled", "true");
}

test("refresh all computes Status Lowongan from fixture detail HTML (open / closed / kuota-full)", async ({
	page,
	context,
	extensionId,
}) => {
	await routeList(context);
	await starAllCards(page);

	const popup = await openPopup(context, extensionId);
	await expect(popup.locator("main")).toBeVisible();

	await stageFixtures(popup, {
		[UUID_OPEN]: { status: 200, body: openHtml() },
		[UUID_CLOSED]: { status: 200, body: closedHtml() },
		[UUID_KUOTA_FULL]: { status: 200, body: kuotaFullHtml() },
	});

	// Before refresh: no status badges yet (never refreshed → lastChecked null).
	// `{ exact: true }` so we don't match the per-Favorite "Buka di MagangHub"
	// link (issue #7), which legitimately contains the word "Buka".
	await expect(popup.getByText("Buka", { exact: true })).toHaveCount(0);
	await expect(popup.getByText("Tutup", { exact: true })).toHaveCount(0);

	await popup.getByRole("button", { name: "Segarkan semua" }).click();

	const openCard = popup.locator(`[data-favorite-uuid="${UUID_OPEN}"]`);
	const closedCard = popup.locator(`[data-favorite-uuid="${UUID_CLOSED}"]`);
	const fullCard = popup.locator(`[data-favorite-uuid="${UUID_KUOTA_FULL}"]`);

	await expect(openCard.getByText("Buka", { exact: true })).toBeVisible();
	await expect(closedCard.getByText("Tutup", { exact: true })).toBeVisible();
	await expect(fullCard.getByText("Tutup", { exact: true })).toBeVisible();

	// Each refreshed favorite shows "terakhir dicek …".
	await expect(openCard.getByText(/terakhir dicek/)).toBeVisible();
	await expect(closedCard.getByText(/terakhir dicek/)).toBeVisible();
});

test("a single-favorite refresh shows the open status badge", async ({
	page,
	context,
	extensionId,
}) => {
	await routeList(context);
	await page.goto(LIST_URL);
	const firstHost = page.locator(".mh-lowongan-card .mh-favorite-host").nth(0);
	await firstHost.click();
	await expect(firstHost).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	await stageFixtures(popup, {
		[UUID_OPEN]: { status: 200, body: openHtml() },
	});

	const card = popup.locator(`[data-favorite-uuid="${UUID_OPEN}"]`);
	await card.getByRole("button", { name: "Segarkan Status Lowongan" }).click();
	await expect(card.getByText("Buka", { exact: true })).toBeVisible();
	await expect(card.getByText(/terakhir dicek/)).toBeVisible();
});

test('a failed refresh (non-gone HTTP) shows "refresh gagal" with no data loss', async ({
	page,
	context,
	extensionId,
}) => {
	await routeList(context);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").nth(0).click();

	const popup = await openPopup(context, extensionId);
	await stageFixtures(popup, {
		[UUID_OPEN]: { status: 503, body: "<html><body>503</body></html>" },
	});

	const card = popup.locator(`[data-favorite-uuid="${UUID_OPEN}"]`);
	await card.getByRole("button", { name: "Segarkan Status Lowongan" }).click();

	// The refresh failed → "Refresh gagal" badge, and the snapshot is still shown.
	await expect(
		card.getByText("Refresh gagal", { exact: true }).first(),
	).toBeVisible();
	await expect(card.getByText("Magang Data Analyst")).toBeVisible();
});

test("a removed Lowongan (HTTP 404) shows Tutup", async ({
	page,
	context,
	extensionId,
}) => {
	await routeList(context);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").nth(1).click();

	const popup = await openPopup(context, extensionId);
	await stageFixtures(popup, {
		[UUID_CLOSED]: { status: 404, body: "<html><body>404</body></html>" },
	});

	const card = popup.locator(`[data-favorite-uuid="${UUID_CLOSED}"]`);
	await card.getByRole("button", { name: "Segarkan Status Lowongan" }).click();

	// A 404 means the listing is gone → closed (Tutup), not a failed refresh.
	await expect(card.getByText("Tutup", { exact: true })).toBeVisible();
});
