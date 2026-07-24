import {
	test,
	expect,
	serveFixture,
	LIST_URL,
	FIRST_DETAIL_URL as DETAIL_URL,
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

/** Markup of one Lowongan card, matching the recorded list fixture's shape. */
function cardHtml(uuid: string, title: string): string {
	return `
		<a class="group block h-full" href="/magang-nasional/lowongan/${title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")}-${uuid}">
			<div class="mh-lowongan-card rounded-lg border p-4">
				<h3 class="mh-lowongan-title">${title}</h3>
				<p class="mh-penyelenggara">PT Tambahan</p>
				<span class="mh-lowongan-location">Semarang, Jawa Tengah</span>
			</div>
		</a>`;
}

test("stars re-inject after a client-side route change back to the list", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await expect(page.locator(STAR_HOST)).toHaveCount(3);

	// Navigate to a detail page the way the SPA does: push the URL and swap the
	// DOM, with no document load (so the content script does not re-run).
	await page.evaluate((detailUrl) => {
		history.pushState({}, "", detailUrl);
		const main = document.querySelector("main");
		if (main) main.innerHTML = "<h1>Magang Data Analyst</h1>";
	}, DETAIL_URL);

	await expect(page.locator(".mh-favorite-detail-host")).toHaveCount(1);

	// ...and back to the list, again without a load.
	await page.evaluate(
		({ listUrl, html }) => {
			history.pushState({}, "", listUrl);
			const main = document.querySelector("main");
			if (main) main.innerHTML = `<section class="grid">${html}</section>`;
		},
		{
			listUrl: LIST_URL,
			html:
				cardHtml(
					"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
					"Magang Data Analyst",
				) +
				cardHtml(
					"b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
					"Magang Software Engineer",
				),
		},
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
			document.querySelector("section")?.insertAdjacentHTML("beforeend", html);
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
		const section = document.querySelector("section");
		for (let i = 0; i < 5; i++) {
			const filler = document.createElement("div");
			filler.textContent = `filler ${i}`;
			section?.append(filler);
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
	await page.evaluate(
		({ listUrl, html }) => {
			history.pushState({}, "", listUrl);
			const main = document.querySelector("main");
			if (main) main.innerHTML = `<section class="grid">${html}</section>`;
		},
		{
			listUrl: LIST_URL,
			html: cardHtml("e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8091", "Magang Penulis"),
		},
	);

	const host = page.locator(STAR_HOST);
	await expect(host).toHaveCount(1);

	// The re-injected star must be fully wired, not just present.
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");
});
