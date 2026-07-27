import {
	FIRST_DETAIL_URL as DETAIL_URL,
	expect,
	LIST_URL,
	serveFixture,
	test,
} from "./fixtures";

/**
 * Issue #8 e2e: the star toggle has to survive the real MagangHub SPA.
 *
 * MagangHub is Next.js: changing a filter or paginating swaps cards in without
 * a page load, and moving list ↔ detail is a client-side route change. The
 * content script's `main()` only runs on a real document load, so without
 * re-injection every one of those interactions silently drops the stars.
 *
 * These tests drive the page the way the SPA does — `history.pushState` for
 * navigation, direct DOM insertion for new cards — rather than reloading, so
 * they fail if re-injection regresses back to load-time-only.
 */

const STAR_HOST = ".mh-lowongan-card .mh-favorite-host";

/**
 * The element these tests swap content into, standing in for what MagangHub's
 * router replaces on a client-side navigation.
 *
 * The live page has no `<main>` and no `<section>` — the cards sit in a bare
 * `div.grid` inside `.mh-container` (2026-07-25 recon). Targeting a container
 * that isn't there fails silently: `innerHTML` never runs, the old cards stay,
 * and the assertion that follows reads as a re-injection bug rather than as a
 * broken test. Hence a single constant, asserted on before use.
 */
const ROUTE_CONTAINER = ".mh-container";

/** Markup of one Lowongan card, matching the recorded list fixture's shape. */
function cardHtml(uuid: string, title: string): string {
	return `
		<a class="group block h-full" href="/magang-nasional/lowongan/${title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")}-${uuid}">
			<div class="rounded-xl border bg-card mh-lowongan-card overflow-hidden h-full flex flex-col">
				<div class="p-5 flex flex-col h-full">
					<div class="flex items-start gap-4 h-full">
						<div class="w-12 h-12 rounded-lg shrink-0 overflow-hidden">
							<img alt="Organizer logo" class="w-full h-full object-contain" src="https://maganghub.kemnaker.go.id/logos/tambahan.png" />
						</div>
						<div class="flex-1 min-w-0 h-full flex flex-col">
							<div>
								<h3 class="font-semibold text-base leading-snug">${title}</h3>
								<p class="text-sm font-medium text-foreground">PT Tambahan</p>
								<p class="text-sm text-muted-foreground truncate">Manajemen</p>
								<div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
									<span class="flex items-center gap-1.5"><svg class="lucide lucide-map-pin w-3.5 h-3.5"></svg>Semarang, Jawa Tengah</span>
								</div>
							</div>
							<div class="mt-4 flex flex-wrap gap-2">
								<div class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold border-transparent bg-secondary text-secondary-foreground text-xs">Kuota: <!-- -->2</div>
								<div class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold border-transparent bg-secondary text-secondary-foreground text-xs">Pelamar: <!-- -->0</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</a>`;
}

/** Swap the route container's contents, the way MagangHub's router does. */
async function swapRoute(
	page: import("@playwright/test").Page,
	html: string,
	url?: string,
): Promise<void> {
	await page.evaluate(
		({ container, html, url }) => {
			if (url) history.pushState({}, "", url);
			const root = document.querySelector(container);
			if (!root) throw new Error(`route container ${container} not found`);
			root.innerHTML = html;
		},
		{ container: ROUTE_CONTAINER, html, url },
	);
}

test("stars re-inject after a client-side route change back to the list", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await expect(page.locator(STAR_HOST)).toHaveCount(3);

	// Navigate to a detail page the way the SPA does: push the URL and swap the
	// DOM, with no document load (so the content script does not re-run). The
	// swapped-in markup carries the header block AND the share cluster, because
	// that cluster is where the toggle mounts (issue #10) — an `<h1>` alone is
	// not a detail page the extension can inject into.
	await swapRoute(
		page,
		`<div class="flex flex-col sm:flex-row items-start gap-5">
				<div class="w-16 h-16"></div>
				<div class="flex-1"><h1>Magang Data Analyst</h1><p class="text-muted-foreground">PT Maju Bersama</p></div>
				<div class="flex gap-2 self-start"><button aria-label="Bagikan"></button></div>
			</div>`,
		DETAIL_URL,
	);

	await expect(page.locator(".mh-favorite-detail-host")).toHaveCount(1);

	// ...and back to the list, again without a load.
	await swapRoute(
		page,
		`<div class="grid grid-cols-1 md:grid-cols-2 gap-5">${
			cardHtml("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "Magang Data Analyst") +
			cardHtml(
				"b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
				"Magang Software Engineer",
			)
		}</div>`,
		LIST_URL,
	);

	await expect(page.locator(STAR_HOST)).toHaveCount(2);
});

test("stars inject into cards added dynamically by a filter or pagination", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await expect(page.locator(STAR_HOST)).toHaveCount(3);

	// A filter change appends a page of results without navigating.
	await page.evaluate(
		(html) => {
			const grid = document.querySelector(".grid");
			if (!grid) throw new Error("card grid not found");
			grid.insertAdjacentHTML("beforeend", html);
		},
		cardHtml("d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80", "Magang Analis Keuangan"),
	);

	await expect(page.locator(STAR_HOST)).toHaveCount(4);
});

test("re-injection never double-injects a star into the same card", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await expect(page.locator(STAR_HOST)).toHaveCount(3);

	// Poke the DOM repeatedly around the existing cards. Every mutation wakes the
	// observer; an injection that isn't idempotent stacks a second star on each
	// card and this count goes past three.
	await page.evaluate(() => {
		const grid = document.querySelector(".grid");
		if (!grid) throw new Error("card grid not found");
		for (let i = 0; i < 5; i++) {
			const filler = document.createElement("div");
			filler.textContent = `filler ${i}`;
			grid.append(filler);
		}
	});

	await expect(page.locator(STAR_HOST)).toHaveCount(3);
	// Each card carries exactly one host, not merely three hosts overall.
	const perCard = await page.evaluate(() =>
		[...document.querySelectorAll(".mh-lowongan-card")].map(
			(card) => card.querySelectorAll(".mh-favorite-host").length,
		),
	);
	expect(perCard).toEqual([1, 1, 1]);
});

test("a star injected after a route change still toggles and persists", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	// Replace the list with a fresh card via a client-side route change.
	await swapRoute(
		page,
		`<div class="grid grid-cols-1 md:grid-cols-2 gap-5">${cardHtml(
			"e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8091",
			"Magang Penulis",
		)}</div>`,
		LIST_URL,
	);

	const host = page.locator(STAR_HOST);
	await expect(host).toHaveCount(1);

	// The re-injected star must be fully wired, not just present.
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");
});

test("a star that replaces a swapped-out card still tracks storage", async ({
	page,
}) => {
	// Cleanup regression (issue #8 AC: "cleanup on card removal"). Paginating
	// repeatedly replaces the card list wholesale; the toggles registered for
	// the discarded cards must not linger and must not keep the surviving ones
	// from reflecting storage.
	await serveFixture(page);
	await page.goto(LIST_URL);
	await expect(page.locator(STAR_HOST)).toHaveCount(3);

	const uuid = "f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8091a2";
	for (let round = 0; round < 3; round++) {
		await swapRoute(
			page,
			`<div class="grid grid-cols-1 md:grid-cols-2 gap-5">${cardHtml(
				uuid,
				"Magang Berulang",
			)}</div>`,
		);
		await expect(page.locator(STAR_HOST)).toHaveCount(1);
	}

	// The surviving star is the live one: toggling it persists, and the state
	// round-trips through storage rather than being painted onto a stale node.
	const host = page.locator(STAR_HOST);
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");

	await page.reload();
	await expect(page.locator(STAR_HOST).first()).toHaveCount(1);
});
