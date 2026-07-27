import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures";
import { openPopup } from "./pages/popup";

// Issue #17 (B1): change notification + toolbar badge.
// Two refreshes against differing fixture numbers must surface a one-line
// "sisa N kursi, tadinya M" notice on the card, and the toolbar badge must
// count the change then clear when the popup is (re)opened.

const LIST_URL = "https://maganghub.kemnaker.go.id/magang-nasional/lowongan";
const UUID_OPEN = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const DETAIL_PATH = `/magang-nasional/lowongan/magang-data-analyst-${UUID_OPEN}`;

const readFixture = (name: string) =>
	readFileSync(path.join(process.cwd(), "test/fixtures", name), "utf8");

const listHtml = () => readFixture("lowongan-list.html");
const openHtml = () => readFixture("lowongan-detail-open.html");
// Same structure as open, but Pelamar 49 / Kuota 50 → remaining 1
// (open is Pelamar 12 / Kuota 50 → remaining 38).
const almostFullHtml = () =>
	readFixture("lowongan-detail-open-almost-full.html");

declare const chrome: {
	storage: {
		local: {
			set(value: Record<string, unknown>): Promise<void>;
		};
	};
	action: {
		getBadgeText(details: Record<string, never>): Promise<string>;
	};
	runtime: {
		sendMessage(message: unknown): Promise<unknown>;
	};
};

async function routeList(
	context: import("@playwright/test").BrowserContext,
): Promise<void> {
	await context.route("https://maganghub.kemnaker.go.id/**", (route) => {
		return route.fulfill({
			status: 200,
			contentType: "text/html; charset=utf-8",
			body: listHtml(),
		});
	});
}

async function stageFixtures(
	page: import("@playwright/test").Page,
	fixtures: Record<string, { status: number; body: string }>,
): Promise<void> {
	await page.evaluate(
		(f) => chrome.storage.local.set({ __testDetailFixtures: f }),
		fixtures,
	);
}

async function getBadgeText(
	worker: import("@playwright/test").Worker,
): Promise<string> {
	return worker.evaluate(async () => {
		const g = globalThis as unknown as {
			chrome: {
				action: {
					getBadgeText(details: Record<string, never>): Promise<string>;
				};
			};
		};
		return await g.chrome.action.getBadgeText({});
	});
}

test("two refreshes with differing numbers show a change notice", async ({
	page,
	context,
	extensionId,
}) => {
	await routeList(context);
	await page.goto(LIST_URL);
	const host = page.locator(".mh-lowongan-card .mh-favorite-host").nth(0);
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	const card = popup.locator(`[data-favorite-uuid="${UUID_OPEN}"]`);

	// First refresh: baseline sample (kuota 50, pelamar 12 → sisa 38).
	await stageFixtures(popup, {
		[UUID_OPEN]: { status: 200, body: openHtml() },
	});
	await card.getByRole("button", { name: "Segarkan Status Lowongan" }).click();
	await expect(card.getByText("Buka", { exact: true })).toBeVisible();
	// No previous sample yet → no change notice.
	await expect(card.locator("[data-change-notice]")).toHaveCount(0);

	// Second refresh: pelamar jumped to 49 → sisa 1, tadinya 38.
	await stageFixtures(popup, {
		[UUID_OPEN]: { status: 200, body: almostFullHtml() },
	});
	await card.getByRole("button", { name: "Segarkan Status Lowongan" }).click();
	await expect(card.locator("[data-change-notice]")).toHaveText(
		"sisa 1 kursi, tadinya 38",
	);
});

test("toolbar badge appears after a change and clears on popup open", async ({
	page,
	context,
	extensionId,
}) => {
	await routeList(context);
	await page.goto(LIST_URL);
	const host = page.locator(".mh-lowongan-card .mh-favorite-host").nth(0);
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");

	const [worker] = context.serviceWorkers();

	// Establish the baseline sample via the popup, then close it.
	const popup1 = await openPopup(context, extensionId);
	const card1 = popup1.locator(`[data-favorite-uuid="${UUID_OPEN}"]`);
	await stageFixtures(popup1, {
		[UUID_OPEN]: { status: 200, body: openHtml() },
	});
	await card1.getByRole("button", { name: "Segarkan Status Lowongan" }).click();
	await expect(card1.getByText("Buka", { exact: true })).toBeVisible();
	// Badge is cleared while the popup is open.
	await expect.poll(async () => getBadgeText(worker)).toBe("");
	await popup1.close();

	// Drive the second refresh from a non-popup extension page so the popup's
	// App.svelte does not clear the badge after the background paints it.
	// (chrome.runtime.sendMessage from the service worker does not re-enter
	// the same SW's onMessage listener.)
	const harness = await context.newPage();
	await harness.goto(`chrome-extension://${extensionId}/offscreen.html`);
	await harness.evaluate(
		async ({ fixtures, lastOpened, uuid, detailUrl }) => {
			await chrome.storage.local.set({
				__testDetailFixtures: fixtures,
				"meta:popupLastOpenedAt": lastOpened,
			});
			await chrome.runtime.sendMessage({
				type: "refresh",
				uuid,
				detailUrl,
			});
		},
		{
			fixtures: {
				[UUID_OPEN]: { status: 200, body: almostFullHtml() },
			},
			lastOpened: "2020-01-01T00:00:00.000Z",
			uuid: UUID_OPEN,
			detailUrl: DETAIL_PATH,
		},
	);

	await expect.poll(async () => getBadgeText(worker)).toBe("1");
	await harness.close();

	// Opening the popup clears the badge; the card notice stays.
	const popup2 = await openPopup(context, extensionId);
	await expect.poll(async () => getBadgeText(worker)).toBe("");
	const card2 = popup2.locator(`[data-favorite-uuid="${UUID_OPEN}"]`);
	await expect(card2.locator("[data-change-notice]")).toHaveText(
		"sisa 1 kursi, tadinya 38",
	);
});
