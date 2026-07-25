import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type BrowserContext, test as base, chromium } from "@playwright/test";

const pathToExtension = path.resolve(".output/chrome-mv3");

/**
 * Playwright fixture that loads the built WXT extension into a fresh Chromium
 * persistent context. Each test gets its own profile dir (so storage starts
 * empty) and its own extensionId.
 *
 * Headless: the e2e environment has no display, so we run headless. Recent
 * Playwright loads MV3 extensions (service workers) in the new headless mode.
 */
export const test = base.extend<{
	context: BrowserContext;
	extensionId: string;
}>({
	context: async ({}, use) => {
		const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-ext-"));
		const context = await chromium.launchPersistentContext(profileDir, {
			// `channel: 'chromium'` (the bundled Playwright Chromium) is what enables
			// loading MV3 extensions in headless mode — Chrome/Edge dropped the
			// side-load flags. See https://playwright.dev/docs/chrome-extensions
			channel: "chromium",
			headless: true,
			args: [
				`--disable-extensions-except=${pathToExtension}`,
				`--load-extension=${pathToExtension}`,
			],
		});
		await use(context);
		await context.close();
		fs.rmSync(profileDir, { recursive: true, force: true });
	},
	extensionId: async ({ context }, use) => {
		let background: { url(): string };
		[background] = context.serviceWorkers();
		if (!background) background = await context.waitForEvent("serviceworker");
		// background.url() looks like chrome-extension://<id>/background.js
		let extensionId: string;
		try {
			extensionId = new URL(background.url()).host;
		} catch {
			throw new Error(
				`Could not parse extension id from service worker url: ${background.url()}`,
			);
		}
		await use(extensionId);
	},
});

export const expect = test.expect;

// ─── Shared fixture helpers (issue #7/#9 deduplication) ─────────────────────
// The lowongan, trust, and import-export specs all serve the recorded
// MagangHub HTML for the real MagangHub URLs, so the content script's real
// `matches` still auto-injects (no extra permissions, no live
// network/Cloudflare). The detail path routes to the detail fixture;
// everything else (the list URL) gets the list fixture.

import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

export const LIST_URL =
	"https://maganghub.kemnaker.go.id/magang-nasional/lowongan";

/** UUID of the first card in lowongan-list.html (and its detail fixture). */
export const FIRST_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
/** The first card's detail-page URL (matches lowongan-detail.html). */
export const FIRST_DETAIL_URL = `https://maganghub.kemnaker.go.id/magang-nasional/lowongan/magang-data-analyst-${FIRST_UUID}`;

const readFixture = (name: string) =>
	readFileSync(path.join(process.cwd(), "test/fixtures", name), "utf8");

const listFixtureHtml = () => readFixture("lowongan-list.html");
const detailFixtureHtml = () => readFixture("lowongan-detail.html");

/**
 * Serve the recorded list/detail fixtures for the real MagangHub URLs.
 *
 * `listFixture` / `detailFixture` override which recorded page is served — pass
 * "lowongan-list-altered.html" or "lowongan-detail-altered.html" to simulate
 * MagangHub renaming the markup out from under the extension (issue #8's
 * graceful-degradation case, and issue #10's missing share cluster).
 */
export async function serveFixture(
	page: Page,
	options: { listFixture?: string; detailFixture?: string } = {},
): Promise<void> {
	const listHtml = options.listFixture
		? () => readFixture(options.listFixture as string)
		: listFixtureHtml;
	const detailHtml = options.detailFixture
		? () => readFixture(options.detailFixture as string)
		: detailFixtureHtml;
	await page.route("https://maganghub.kemnaker.go.id/**", (route) => {
		const isDetail = route
			.request()
			.url()
			.includes("/magang-nasional/lowongan/");
		return route.fulfill({
			status: 200,
			contentType: "text/html; charset=utf-8",
			body: isDetail ? detailHtml() : listHtml(),
		});
	});
}
