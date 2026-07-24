import { describe, it, expect, beforeEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { listFavorites } from "@/lib/storage";
import { exportFavorites } from "@/lib/io";
import {
	assessListMarkup,
	assessDetailMarkup,
	reportHealth,
	readHealth,
} from "@/lib/health";

/**
 * Contract tests for the injection-health signal (issue #8). The content script
 * must tell a page whose markup we no longer understand ("the extension needs
 * an update") apart from a page that simply has nothing to inject into (a
 * filter with no results, or a list that hasn't rendered yet) — reporting
 * "degraded" for the latter would cry wolf on a perfectly healthy site.
 */

// The fake browser persists across tests in a file; reset before each.
beforeEach(() => {
	fakeBrowser.reset();
});

function markup(html: string): HTMLElement {
	const root = document.createElement("div");
	root.innerHTML = html;
	return root;
}

const CARD = `
	<a class="group block h-full" href="/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d">
		<div class="mh-lowongan-card"><h3 class="mh-lowongan-title">Magang Data Analyst</h3></div>
	</a>`;

describe("assessListMarkup", () => {
	it("reports ok when Lowongan cards are found", () => {
		expect(assessListMarkup(markup(CARD))).toBe("ok");
	});

	it("reports ok for an empty result list — nothing to inject is not breakage", () => {
		// A filter that matched no Lowongan. The page is healthy; it just has no
		// cards. Flagging this would cry wolf on every empty search.
		const empty = markup(`
			<section class="grid"></section>
			<p>Tidak ada lowongan yang cocok dengan filter kamu.</p>`);

		expect(assessListMarkup(empty)).toBe("ok");
	});

	it("reports degraded when MagangHub renamed the card class out from under us", () => {
		// Results ARE on the page (each links to a Lowongan detail URL), but the
		// card structure we hang the star on is gone. This is the case the health
		// indicator exists for.
		const renamed = markup(`
			<a class="group block h-full" href="/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d">
				<div class="vacancy-card-v2"><h3>Magang Data Analyst</h3></div>
			</a>`);

		expect(assessListMarkup(renamed)).toBe("degraded");
	});
});

describe("assessDetailMarkup", () => {
	it("reports ok when the detail page exposes a title to anchor the toggle to", () => {
		const detail = markup(`<main><h1>Magang Data Analyst</h1></main>`);

		expect(assessDetailMarkup(detail)).toBe("ok");
	});

	it("reports degraded when no title anchor is found", () => {
		const detail = markup(
			`<main><div class="headline-v2">Magang Data Analyst</div></main>`,
		);

		expect(assessDetailMarkup(detail)).toBe("degraded");
	});
});

describe("reportHealth / readHealth", () => {
	it("reads back ok before anything has been reported", async () => {
		expect(await readHealth()).toBe("ok");
	});

	it("surfaces a reported degraded signal", async () => {
		await reportHealth("degraded");

		expect(await readHealth()).toBe("degraded");
	});

	it("clears a stale degraded signal once a page injects cleanly again", async () => {
		// MagangHub shipped a broken deploy, then fixed it. The warning must go
		// away on its own — a permanent banner would train the user to ignore it.
		await reportHealth("degraded");

		await reportHealth("ok");

		expect(await readHealth()).toBe("ok");
	});

	it("keeps the health signal out of the Favorites keyspace", async () => {
		await reportHealth("degraded");

		const stored = await browser.storage.local.get(null);
		const favoriteKeys = Object.keys(stored).filter((k) =>
			k.startsWith("fav:"),
		);
		expect(favoriteKeys).toEqual([]);
	});

	it("is not carried into an export or counted as a Favorite", async () => {
		// The signal shares storage.local with Favorites. It must stay invisible
		// to the favorites layer: never listed, never exported to another device
		// (it describes THIS browser's view of MagangHub, not the user's data).
		await reportHealth("degraded");

		expect(await listFavorites()).toEqual([]);
		const file = await exportFavorites();
		expect(file.count).toBe(0);
		expect(file.favorites).toEqual([]);
	});
});
