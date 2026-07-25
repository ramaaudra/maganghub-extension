import { expect, LIST_URL, serveFixture, test } from "./fixtures";
import { openPopup } from "./pages/popup";

/**
 * Issue #8 e2e: graceful degradation.
 *
 * MagangHub is a site we don't control. When it redesigns, the extension must
 * fail the way a good tool fails — quietly on the page, loudly enough in the
 * popup that the user knows it's a known breakage needing an update, not a
 * silent bug in their favorites.
 *
 * `lowongan-list-altered.html` is the same page with the card classes renamed.
 */

const ALTERED = { listFixture: "lowongan-list-altered.html" };

test("the content script no-ops silently when MagangHub's markup changes", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	page.on("pageerror", (err) => errors.push(String(err)));

	await serveFixture(page, ALTERED);
	await page.goto(LIST_URL);

	// The page itself still renders — we broke nothing.
	await expect(page.locator(".vacancy-card-v2")).toHaveCount(2);
	// No stars, because there's nothing we recognize to attach them to.
	await expect(page.locator(".mh-favorite-host")).toHaveCount(0);
	// And crucially: no crash, no console noise in the user's page.
	expect(errors).toEqual([]);
});

test("the popup shows a health indicator after a page it cannot inject into", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page, ALTERED);
	await page.goto(LIST_URL);
	await expect(page.locator(".vacancy-card-v2")).toHaveCount(2);

	const popup = await openPopup(context, extensionId);

	await expect(popup.getByText(/tampilan MagangHub berubah/i)).toBeVisible();
});

test("a healthy page shows no health indicator", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await expect(page.locator(".mh-lowongan-card .mh-favorite-host")).toHaveCount(
		3,
	);

	const popup = await openPopup(context, extensionId);

	await expect(popup.getByText(/tampilan MagangHub berubah/i)).toHaveCount(0);
});

test("the health indicator clears once MagangHub renders normally again", async ({
	page,
	context,
	extensionId,
}) => {
	// A broken deploy...
	await serveFixture(page, ALTERED);
	await page.goto(LIST_URL);
	await expect(page.locator(".vacancy-card-v2")).toHaveCount(2);

	let popup = await openPopup(context, extensionId);
	await expect(popup.getByText(/tampilan MagangHub berubah/i)).toBeVisible();
	await popup.close();

	// ...that MagangHub then fixes. The warning must retract itself; a banner
	// that never goes away just trains the user to ignore it.
	await page.unrouteAll({ behavior: "ignoreErrors" });
	await serveFixture(page);
	await page.goto(LIST_URL);
	await expect(page.locator(".mh-lowongan-card .mh-favorite-host")).toHaveCount(
		3,
	);

	popup = await openPopup(context, extensionId);
	await expect(popup.getByText(/tampilan MagangHub berubah/i)).toHaveCount(0);
});

test("favorites saved before a MagangHub redesign are still listed", async ({
	page,
	context,
	extensionId,
}) => {
	// Star something while the site is healthy.
	await serveFixture(page);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "true");

	// MagangHub redesigns. The user's data must survive it (AC: "my favorites
	// data isn't lost and I'm told the extension needs an update").
	await page.unrouteAll({ behavior: "ignoreErrors" });
	await serveFixture(page, ALTERED);
	await page.goto(LIST_URL);
	await expect(page.locator(".vacancy-card-v2")).toHaveCount(2);

	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText("Magang Data Analyst")).toBeVisible();
	await expect(popup.getByText(/tampilan MagangHub berubah/i)).toBeVisible();
});
