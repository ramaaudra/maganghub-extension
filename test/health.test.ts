import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
	assessDetailMarkup,
	assessListMarkup,
	readHealth,
	reportHealth,
} from "@/lib/health";
import { exportFavorites } from "@/lib/io";
import { listFavorites } from "@/lib/storage";

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

// A realistic card: the wrapper PLUS the inner structure `extractSnapshot`
// reads — an organizer `<p>` and a map-pin-anchored location span. Recon
// (docs/live-dom-recon-2026-07-25.md §2) confirmed this is what the live card
// looks like; the old `mh-lowongan-*` field classes match nothing.
const CARD_WITH_FIELDS = `
	<a class="group block h-full" href="/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d">
		<div class="mh-lowongan-card">
			<h3>Magang Data Analyst</h3>
			<p class="text-sm font-medium text-foreground">PT Data Nusantara</p>
			<span class="flex items-center gap-1.5"><svg class="lucide lucide-map-pin"></svg>Kota Jakarta</span>
		</div>
	</a>`;

describe("assessListMarkup", () => {
	it("reports ok when a card with readable fields is found", () => {
		expect(assessListMarkup(markup(CARD_WITH_FIELDS))).toBe("ok");
	});

	it("reports ok when only one of organizer/location is empty — one blank field is real data, not breakage", () => {
		// A card with an organizer but no location span. D1: a single empty field
		// can be real data; both empty on a card that exists is the only signal
		// that the structure broke. Flagging this would cry wolf on any card that
		// genuinely omits a location.
		const noLocation = markup(`
			<a class="group block h-full" href="/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d">
				<div class="mh-lowongan-card">
					<h3>Magang Data Analyst</h3>
					<p class="text-sm font-medium text-foreground">PT Data Nusantara</p>
				</div>
			</a>`);

		expect(assessListMarkup(noLocation)).toBe("ok");
	});

	it("reports ok when only location is present and organizer is empty — the symmetric case", () => {
		// D1's "both empty" rule is symmetric, so the inverse of the case above
		// must also stay ok: a card with a map-pin-anchored location but no
		// organizer `<p>` the selectors can read. One empty field is still real
		// data, not a broken structure.
		const noOrganizer = markup(`
			<a class="group block h-full" href="/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d">
				<div class="mh-lowongan-card">
					<h3>Magang Data Analyst</h3>
					<span class="flex items-center gap-1.5"><svg class="lucide lucide-map-pin"></svg>Kota Jakarta</span>
				</div>
			</a>`);

		expect(assessListMarkup(noOrganizer)).toBe("ok");
	});

	it("reports degraded when the card wrapper survives but its inner fields are gone (P1b)", () => {
		// The exact failure P1b exposed: `.mh-lowongan-card` is still on the page,
		// but the organizer `<p>` and the location span are not — so starring
		// would store blank organizer/location. Card presence alone missed this
		// for weeks; the field-aware check is what closes that hole (D1).
		const wrapperOnly = markup(`
			<a class="group block h-full" href="/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d">
				<div class="mh-lowongan-card"><h3>Magang Data Analyst</h3></div>
			</a>`);

		expect(assessListMarkup(wrapperOnly)).toBe("degraded");
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
	const detailPage = (inner: string) =>
		markup(
			`<div class="flex flex-col sm:flex-row items-start gap-5">${inner}</div>`,
		);

	it("reports ok when both the title and the injection point are present", () => {
		const detail = detailPage(
			`<div class="flex-1"><h1>Magang Data Analyst</h1></div>
       <div class="flex gap-2 self-start"><button aria-label="Bagikan"></button></div>`,
		);

		expect(assessDetailMarkup(detail)).toBe("ok");
	});

	it("reports degraded when no title anchor is found", () => {
		const detail = detailPage(
			`<div class="flex-1"><div class="headline-v2">Magang Data Analyst</div></div>
       <div class="flex gap-2 self-start"><button aria-label="Bagikan"></button></div>`,
		);

		expect(assessDetailMarkup(detail)).toBe("degraded");
	});

	it("reports degraded when the share cluster the toggle mounts into is gone", () => {
		// Issue #10 removed the fallback injection point, so a missing cluster
		// means no toggle renders at all. Reporting "ok" here would leave the user
		// with no button and no explanation.
		const detail = detailPage(
			`<div class="flex-1"><h1>Magang Data Analyst</h1></div>`,
		);

		expect(assessDetailMarkup(detail)).toBe("degraded");
	});

	it("stays ok when the Lowongan Serupa section is empty", () => {
		// Those cards are injected into, but their absence is not a broken page —
		// folding assessListMarkup in here would cry wolf.
		const detail = detailPage(
			`<div class="flex-1"><h1>Magang Data Analyst</h1></div>
       <div class="flex gap-2 self-start"><button aria-label="Bagikan"></button></div>`,
		);

		expect(assessDetailMarkup(detail)).toBe("ok");
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
