import {
	expect,
	FIRST_DETAIL_URL as DETAIL_URL,
	FIRST_UUID,
	LIST_URL,
	serveFixture,
	test,
} from "./fixtures";
import { openPopup } from "./pages/popup";

/**
 * On-card stage chip (issue #19 / A2).
 *
 * The chip is a light-DOM child of the star host (`[data-stage-chip]`), so e2e
 * can assert text + aria without piercing the closed shadow. The host carries
 * `data-stage` as a band-style mirror of the same state. Colour is neutral, so
 * Dilamar and Ditolak are told apart by text (D7) — the star's own amber is
 * reserved for saved state and nothing else.
 */

test("a starred card with a stage shows a chip; no stage shows none", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const host = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");
	// Fresh Favorite → no stage → no chip.
	await expect(host).not.toHaveAttribute("data-stage", /.+/);
	await expect(host.locator("[data-stage-chip]")).toHaveCount(0);

	const popup = await openPopup(context, extensionId);
	const card = popup.locator(`[data-favorite-uuid="${FIRST_UUID}"]`);
	await card.getByLabel("Status Lamar").selectOption("dilamar");
	await expect(card.getByLabel("Status Lamar")).toHaveValue("dilamar");

	// Storage sync paints the chip on the list card.
	await expect(host).toHaveAttribute("data-stage", "dilamar");
	const chip = host.locator("[data-stage-chip]");
	await expect(chip).toBeVisible();
	await expect(chip).toHaveText("Dilamar");
	await expect(chip).toHaveAttribute("aria-label", "Status Lamar: Dilamar");

	// The chip never brings a colour band back onto the star (see urgency.spec).
	await expect(host).not.toHaveAttribute("data-urgency", /.+/);

	// Clear stage → chip goes away; star stays filled.
	await card.getByLabel("Status Lamar").selectOption("");
	await expect(host).not.toHaveAttribute("data-stage", /.+/);
	await expect(host.locator("[data-stage-chip]")).toHaveCount(0);
	await expect(host).toHaveAttribute("data-filled", "true");
});

test("changing the stage in the popup updates the chip across tabs", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const listHost = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await listHost.click();

	// Second tab on the same list URL — both hosts for FIRST_UUID must update.
	const page2 = await context.newPage();
	await serveFixture(page2);
	await page2.goto(LIST_URL);
	const listHost2 = page2
		.locator(".mh-lowongan-card .mh-favorite-host")
		.first();
	await expect(listHost2).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	const card = popup.locator(`[data-favorite-uuid="${FIRST_UUID}"]`);
	await card.getByLabel("Status Lamar").selectOption("interview");

	for (const host of [listHost, listHost2]) {
		await expect(host).toHaveAttribute("data-stage", "interview");
		await expect(host.locator("[data-stage-chip]")).toHaveText("Interview");
		await expect(host.locator("[data-stage-chip]")).toHaveAttribute(
			"aria-label",
			"Status Lamar: Interview",
		);
	}

	// Terminal stage still distinguishes by text (D7: Ditolak ≠ Dilamar).
	await card.getByLabel("Status Lamar").selectOption("ditolak");
	for (const host of [listHost, listHost2]) {
		await expect(host).toHaveAttribute("data-stage", "ditolak");
		await expect(host.locator("[data-stage-chip]")).toHaveText("Ditolak");
	}
});

test("Lowongan Serupa cards show the stage chip too", async ({
	page,
	context,
	extensionId,
}) => {
	// Star the first list card (FIRST_UUID), set a stage, then open the detail
	// page where that UUID also appears as a Serupa card in some fixtures —
	// the detail fixture's Serupa cards use different UUIDs, so star one of
	// those from the detail page and set its stage via the popup.
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	const serupaHosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(serupaHosts).toHaveCount(2);

	const serupa = serupaHosts.first();
	await serupa.click();
	await expect(serupa).toHaveAttribute("data-filled", "true");

	// Resolve the Serupa UUID from the host's injection marker on the card.
	const serupaUuid = await serupa.evaluate((el) => {
		const card = el.closest("[data-mh-star]");
		return card?.getAttribute("data-mh-star") ?? "";
	});
	expect(serupaUuid).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
	);

	const popup = await openPopup(context, extensionId);
	const card = popup.locator(`[data-favorite-uuid="${serupaUuid}"]`);
	await expect(card).toBeVisible();
	await card.getByLabel("Status Lamar").selectOption("diterima");

	await expect(serupa).toHaveAttribute("data-stage", "diterima");
	await expect(serupa.locator("[data-stage-chip]")).toHaveText("Diterima");
	// Serupa cards stay band-free too.
	await expect(serupa).not.toHaveAttribute("data-urgency", /.+/);
});
