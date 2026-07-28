import {
	expect,
	FIRST_DETAIL_URL as DETAIL_URL,
	LIST_URL,
	serveFixture,
	test,
} from "./fixtures";

/**
 * The list-card star carries ONE ring, and it means saved / not saved.
 *
 * This file used to assert the opposite: an urgency colour band (issue #16 /
 * A1) painted as a second ring at `inset: -3px` around the star. It shipped as
 * a visible double border on every card, and it duplicated — sometimes
 * contradicted — MagangHub's own "Peluang …(NN%)" pill, which states the same
 * competition signal with a real percentage. The band was removed; these tests
 * now guard that it stays removed, because "add a ring to the star" is exactly
 * the change that would quietly reintroduce the defect.
 *
 * `src/lib/urgency.ts` still exists and `test/urgency.test.ts` still covers its
 * band math — it is simply no longer wired to the star.
 */

test("list cards carry no urgency band on the star", async ({ page }) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const hosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(hosts).toHaveCount(3);

	// Fixture cards are 5/1 (calm), 5/4 (hampir_penuh) and 2/40 (lewat_kuota) —
	// one card per band under the old rules, so if any band still painted, one
	// of these three would carry it.
	for (const nth of [0, 1, 2]) {
		await expect(hosts.nth(nth)).not.toHaveAttribute("data-urgency", /.+/);
		// The band's AT text equivalent rode the host's title/aria-label.
		await expect(hosts.nth(nth)).not.toHaveAttribute("title", /.+/);
		await expect(hosts.nth(nth)).not.toHaveAttribute("aria-label", /.+/);
	}
});

/**
 * The ring count itself is NOT asserted here, and cannot be: the star's shadow
 * root is closed (ADR-0004), so `elementFromPoint` retargets to the host and no
 * page-side script can enumerate the button or its computed border. That
 * opacity is the security property the ADR is buying, not a gap to work around
 * — reaching for an open root to make this testable would trade the isolation
 * for a test. The band's observable trace (`data-urgency`, and the host `title`
 * / `aria-label` it wrote) is asserted above instead, and the single-ring
 * invariant lives in `STAR_CSS`, where it is one declaration to read.
 */
test("the star's saved state stays on the star, not the host", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const host = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await expect(host).toBeVisible();
	await expect(host).toHaveAttribute("data-filled", "false");

	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");
	// Saving writes the star's own tooltip and nothing onto the host — the band
	// used to own a competing host `title`.
	await expect(host).toHaveAttribute("data-star-title", "Hapus dari favorit");
	await expect(host).not.toHaveAttribute("title", /.+/);

	await host.click();
	await expect(host).toHaveAttribute("data-filled", "false");
	await expect(host).not.toHaveAttribute("data-star-title");
});

test("Lowongan Serupa cards carry no urgency band either", async ({ page }) => {
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	const serupaHosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(serupaHosts).toHaveCount(2);
	await expect(serupaHosts.nth(0)).not.toHaveAttribute("data-urgency", /.+/);
	await expect(serupaHosts.nth(1)).not.toHaveAttribute("data-urgency", /.+/);
});
