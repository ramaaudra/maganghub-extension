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
 * Catatan tooltip on the star (issue #18 / A3).
 *
 * The filled star's native `title` composes
 * `catatan ? \`${label} — ${catatan}\` : label`. Asserted on the shadow host's
 * interactive surface via a light-DOM data attribute mirror (`data-star-title`)
 * so e2e never pierces the closed shadow — same pattern as `data-stage`.
 *
 * The star's `title` is now the button's alone. The removed urgency band used
 * to write a competing `title` on the light-DOM host, so a saved card had two
 * tooltips racing on one control.
 */

const NOTE = "dekat rumah, batch 2";

test("a filled star with a Catatan shows the note in its title", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const host = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");
	// Fresh Favorite → no Catatan → bare on-label (no note).
	await expect(host).toHaveAttribute("data-star-title", "Hapus dari favorit");

	const popup = await openPopup(context, extensionId);
	const card = popup.locator(`[data-favorite-uuid="${FIRST_UUID}"]`);
	await card.getByPlaceholder("Kenapa lowongan ini?").fill(NOTE);
	await card.getByPlaceholder("Kenapa lowongan ini?").blur();
	await expect(card.getByText("Tersimpan")).toBeVisible();

	// Storage sync paints the composed title onto the list star.
	// `data-star-title` mirrors `button.title` (closed shadow; e2e can't pierce).
	await expect(host).toHaveAttribute(
		"data-star-title",
		`Hapus dari favorit — ${NOTE}`,
	);

	// Clearing Catatan reverts to the bare on-label.
	await card.getByPlaceholder("Kenapa lowongan ini?").fill("");
	await card.getByPlaceholder("Kenapa lowongan ini?").blur();
	await expect(host).toHaveAttribute("data-star-title", "Hapus dari favorit");

	// Unsaving drops the title mirror entirely (list stars stay title-less off).
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "false");
	await expect(host).not.toHaveAttribute("data-star-title");
});

test("editing Catatan in the popup updates the star title across tabs", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const listHost = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await listHost.click();

	const page2 = await context.newPage();
	await serveFixture(page2);
	await page2.goto(LIST_URL);
	const listHost2 = page2
		.locator(".mh-lowongan-card .mh-favorite-host")
		.first();
	await expect(listHost2).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	const card = popup.locator(`[data-favorite-uuid="${FIRST_UUID}"]`);
	await card.getByPlaceholder("Kenapa lowongan ini?").fill(NOTE);
	await card.getByPlaceholder("Kenapa lowongan ini?").blur();

	for (const host of [listHost, listHost2]) {
		await expect(host).toHaveAttribute(
			"data-star-title",
			`Hapus dari favorit — ${NOTE}`,
		);
	}

	const updated = "ganti alasan";
	await card.getByPlaceholder("Kenapa lowongan ini?").fill(updated);
	await card.getByPlaceholder("Kenapa lowongan ini?").blur();
	for (const host of [listHost, listHost2]) {
		await expect(host).toHaveAttribute(
			"data-star-title",
			`Hapus dari favorit — ${updated}`,
		);
	}
});

test("the detail toggle composes Catatan into its title too", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();

	const popup = await openPopup(context, extensionId);
	const card = popup.locator(`[data-favorite-uuid="${FIRST_UUID}"]`);
	await card.getByPlaceholder("Kenapa lowongan ini?").fill(NOTE);
	await card.getByPlaceholder("Kenapa lowongan ini?").blur();
	await expect(card.getByText("Tersimpan")).toBeVisible();
	await popup.close();

	await page.goto(DETAIL_URL);
	const detailHost = page.locator(".mh-favorite-detail-host");
	await expect(detailHost).toHaveAttribute("data-filled", "true");
	await expect(detailHost).toHaveAttribute(
		"data-star-title",
		`Hapus dari favorit — ${NOTE}`,
	);
});
