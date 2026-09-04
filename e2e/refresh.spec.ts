import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures";
import { expandCard, favoriteCard, openCard, openPopup } from "./pages/popup";

// Issue #5 e2e: refresh Status Kuota from fixture detail HTML.
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
// popup pipeline deterministically against fixture HTML for the quota states:
//   - open UUID       → lowongan-detail-open.html        (200) → Kuota belum penuh
//   - closed UUID     → lowongan-detail-closed.html      (200, no apply btn) → Kuota belum penuh
//   - kuota-full UUID → lowongan-detail-kuota-full.html  (200, no apply btn) → Kuota penuh
// A dedicated test below also covers the HTTP 404 as a refresh failure.

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
const missingPelamarHtml =
	'<!doctype html><html><body><h1>Magang Data Analyst</h1><div class="flex items-center justify-between text-sm"><span class="text-muted-foreground">Kuota</span><span class="font-semibold">50 orang</span></div><span class="mh-badge">Batch 1 · 2026</span></body></html>';

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

async function expectSignalStripToFit(
	row: import("@playwright/test").Locator,
): Promise<void> {
	const geometry = await row
		.locator("[data-signal-strip]")
		.evaluate((strip) => {
			const badge = strip.querySelector<HTMLElement>('[data-slot="badge"]');
			const seats = strip.querySelector<HTMLElement>(
				":scope > span:first-child",
			);
			if (!badge || !seats) throw new Error("Status Kuota strip is incomplete");
			const stripRect = strip.getBoundingClientRect();
			const badgeRect = badge.getBoundingClientRect();
			return {
				stripClientWidth: strip.clientWidth,
				stripScrollWidth: strip.scrollWidth,
				badgeRight: badgeRect.right,
				stripRight: stripRect.right,
				badgeClientWidth: badge.clientWidth,
				badgeScrollWidth: badge.scrollWidth,
				seatsClientWidth: seats.clientWidth,
				seatsScrollWidth: seats.scrollWidth,
				badgeHeight: badgeRect.height,
				stripHeight: stripRect.height,
			};
		});
	expect(geometry.stripScrollWidth).toBeLessThanOrEqual(
		geometry.stripClientWidth,
	);
	expect(geometry.badgeScrollWidth).toBeLessThanOrEqual(
		geometry.badgeClientWidth,
	);
	expect(geometry.seatsScrollWidth).toBeLessThanOrEqual(
		geometry.seatsClientWidth,
	);
	expect(geometry.badgeRight).toBeLessThanOrEqual(geometry.stripRight + 0.5);
	expect(geometry.badgeHeight).toBeLessThanOrEqual(geometry.stripHeight);
}

test("refresh all computes Status Kuota from fixture detail HTML", async ({
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

	// Before refresh: no quota result yet (never refreshed → lastChecked null).
	await expect(
		popup.getByText("Kuota belum penuh", { exact: true }),
	).toHaveCount(0);
	await expect(popup.getByText("Kuota penuh", { exact: true })).toHaveCount(0);

	await popup.getByRole("button", { name: "Segarkan semua" }).click();

	const openRow = favoriteCard(popup, UUID_OPEN);
	const closedRow = favoriteCard(popup, UUID_CLOSED);
	const fullRow = favoriteCard(popup, UUID_KUOTA_FULL);

	// The Status Kuota chip is on the resting card — a refresh-all must be
	// readable without opening anything, which is the whole point of the button.
	await expect(
		openRow.getByText("Kuota belum penuh", { exact: true }),
	).toBeVisible();
	await expect(
		closedRow.getByText("Kuota belum penuh", { exact: true }),
	).toBeVisible();
	await expect(fullRow.getByText("Kuota penuh", { exact: true })).toBeVisible();

	// Resting-state labels stay inside the signal strip. The flex contract is
	// min-width: 0 on seats + shrink-0 on the status group, so a full quota
	// never pushes text outside the card or clips the badge.
	for (const row of [openRow, closedRow, fullRow]) {
		await expectSignalStripToFit(row);
	}

	// Live seats replace the "saat disimpan" snapshot reading on the same line.
	await expect(openRow.locator("[data-signal-strip]")).toContainText(
		"12 dari 50",
	);
	await expect(openRow.locator("[data-signal-strip]")).not.toContainText(
		"saat disimpan",
	);

	// "terakhir dicek …" is provenance for the numbers above it, so it reads in
	// the expanded tray rather than competing with them on the resting row.
	for (const row of [openRow, closedRow]) {
		await expandCard(row);
		await expect(row.getByText(/terakhir dicek/)).toBeVisible();
	}
});

test("missing Pelamar renders the unknown quota label without clipping", async ({
	page,
	context,
	extensionId,
}) => {
	await routeList(context);
	await page.goto(LIST_URL);
	const firstHost = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await firstHost.click();
	await expect(firstHost).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	await stageFixtures(popup, {
		[UUID_OPEN]: { status: 200, body: missingPelamarHtml },
	});

	const card = await openCard(popup, UUID_OPEN);
	await card.getByRole("button", { name: "Segarkan Status Kuota" }).click();
	await expect(
		card.getByText("Kuota belum diketahui", { exact: true }),
	).toBeVisible();
	await expectSignalStripToFit(card);
});

test("refresh feedback renders a Hugeicons loading icon", async ({
	page,
	context,
	extensionId,
}) => {
	await routeList(context);
	await starAllCards(page);

	const popup = await openPopup(context, extensionId);
	await popup.evaluate(() => {
		const runtime = (
			globalThis as unknown as {
				browser: { runtime: { sendMessage: () => Promise<never> } };
			}
		).browser.runtime;
		runtime.sendMessage = () => new Promise<never>(() => {});
	});

	const refreshButton = popup.locator('header [data-slot="button"]');
	await expect(refreshButton).toBeEnabled();
	await refreshButton.click();
	await expect(refreshButton).toHaveAttribute("aria-busy", "true");
	await expect(refreshButton.locator("svg[data-refresh-icon]")).toHaveCount(1);
	await expect(refreshButton.locator("span.mh-spin")).toHaveCount(0);

	const card = popup.locator("[data-favorite-uuid]").first();
	await expandCard(card);
	await expect(card.locator("svg[data-refresh-icon]")).toHaveCount(1);
	await expect(card.locator("span.mh-spin")).toHaveCount(0);
});

test("a single-favorite refresh shows the quota status badge", async ({
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

	const card = await openCard(popup, UUID_OPEN);
	await card.getByRole("button", { name: "Segarkan Status Kuota" }).click();
	await expect(
		card.getByText("Kuota belum penuh", { exact: true }),
	).toBeVisible();
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

	const card = await openCard(popup, UUID_OPEN);
	await card.getByRole("button", { name: "Segarkan Status Kuota" }).click();

	// The refresh failed → "Refresh gagal" badge, and the snapshot is still shown.
	await expect(
		card.getByText("Refresh gagal", { exact: true }).first(),
	).toBeVisible();
	await expect(card.getByText("Magang Data Analyst")).toBeVisible();
});

test("a removed Lowongan (HTTP 404) shows refresh failure", async ({
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

	const card = await openCard(popup, UUID_CLOSED);
	await card.getByRole("button", { name: "Segarkan Status Kuota" }).click();

	// A 404 cannot tell us the Kemnaker registration-window state.
	await expect(card.getByText("Refresh gagal", { exact: true })).toBeVisible();
});
