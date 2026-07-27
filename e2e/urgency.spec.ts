import {
	expect,
	LIST_URL,
	FIRST_DETAIL_URL as DETAIL_URL,
	serveFixture,
	test,
} from "./fixtures";

/**
 * Urgency colour signal on list (and Serupa) cards — issue #16 / A1.
 *
 * The band is computed from the card's own Kuota/Pelamar pills and painted
 * inside the star's closed shadow. The host carries `data-urgency` so e2e can
 * assert the band without piercing Shadow DOM. Fixture numbers (see the header
 * comment in lowongan-list.html):
 *   card 1 — 5/1  → calm
 *   card 2 — 5/4  → hampir_penuh
 *   card 3 — 2/40 → lewat_kuota
 */

test("list cards paint calm / hampir_penuh / lewat_kuota from their Kuota/Pelamar pills", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const hosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(hosts).toHaveCount(3);

	await expect(hosts.nth(0)).toHaveAttribute("data-urgency", "calm");
	await expect(hosts.nth(0)).toHaveAttribute("title", "Masih ada kursi");
	await expect(hosts.nth(0)).toHaveAttribute("aria-label", "Masih ada kursi");

	await expect(hosts.nth(1)).toHaveAttribute("data-urgency", "hampir_penuh");
	await expect(hosts.nth(1)).toHaveAttribute("title", "Hampir penuh");

	await expect(hosts.nth(2)).toHaveAttribute("data-urgency", "lewat_kuota");
	await expect(hosts.nth(2)).toHaveAttribute("title", "Lewat kuota");
});

test("Lowongan Serupa cards get the same urgency signal", async ({ page }) => {
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	// Two Serupa cards: calm (5/1) and lewat_kuota (2/40).
	const serupaHosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(serupaHosts).toHaveCount(2);
	await expect(serupaHosts.nth(0)).toHaveAttribute("data-urgency", "calm");
	await expect(serupaHosts.nth(1)).toHaveAttribute(
		"data-urgency",
		"lewat_kuota",
	);
});

test("a card without parseable Kuota/Pelamar shows no urgency signal", async ({
	page,
}) => {
	// The SPA fixture injects a bare card with no badges after a filter click;
	// reuse that shape inline so this case doesn't depend on SPA behaviour.
	await serveFixture(page);
	await page.goto(LIST_URL);

	// Strip the badges from the first card and force a re-scan by removing the
	// injection marker + host, then appending a clone without badges. The
	// MutationObserver re-injects; without numbers the host has no data-urgency.
	await page.evaluate(() => {
		const card = document.querySelector<HTMLElement>(".mh-lowongan-card");
		if (!card) return;
		for (const pill of card.querySelectorAll("div.rounded-full")) {
			const text = (pill.textContent ?? "").toLowerCase();
			if (text.includes("kuota") || text.includes("pelamar")) pill.remove();
		}
		// Drop the existing star so the next scan re-injects against the bare card.
		card.removeAttribute("data-mh-star");
		card.querySelector(".mh-favorite-host")?.remove();
	});

	// Wait for re-injection.
	const host = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await expect(host).toBeVisible();
	await expect(host).not.toHaveAttribute("data-urgency", /.+/);
});
