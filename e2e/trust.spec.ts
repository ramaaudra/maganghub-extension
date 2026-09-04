import { expect, LIST_URL, serveFixture, test } from "./fixtures";
import { openCard, openPopup } from "./pages/popup";

// Issue #7 e2e: the trust layer — make the credential-free safety story
// visible in the popup, and give each Favorite an "open official detail"
// link so the user applies themselves on the real MagangHub site (never via
// the extension, never via a third-party helper that would ask for the
// SiapKerja password).

test("the popup shows the creator attribution in the footer", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	const creator = popup.getByRole("link", { name: "Created by @ramaaudra" });
	await expect(creator).toBeVisible();
	await expect(creator).toHaveAttribute(
		"href",
		"https://ramaaudra.vercel.app",
	);
	await expect(creator).toHaveAttribute("target", "_blank");
	await expect(creator).toHaveAttribute("rel", /noopener/);
});

test("the popup keeps trust details behind the disclosure", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	const summary = popup.getByText(
		"Kenapa SakuMagang tidak minta password?",
		{ exact: true },
	);
	await expect(summary).toBeVisible();
	const content = popup.locator("footer [data-slot=collapsible-content]");
	await expect(content).toBeHidden();

	await summary.click();
	await expect(content).toContainText(
		"SakuMagang tidak pernah meminta atau mengakses password SiapKerja.",
	);
	await expect(content).toContainText(
		"Favorite, Catatan, dan Status Lamar tersimpan lokal di browser ini.",
	);
	await expect(content).toContainText(
		"SakuMagang adalah ekstensi pihak ketiga, bukan produk resmi MagangHub.",
	);
});

test('each Favorite has an "open official detail" link to its MagangHub detail page', async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	// Star all three favorites on the list so we can assert the link is
	// present per-Favorite (not just on one).
	const hosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await hosts.nth(0).click();
	await hosts.nth(1).click();
	await hosts.nth(2).click();

	const popup = await openPopup(context, extensionId);

	// Each favorited card must carry its own "Buka di MagangHub" link, with the
	// correct detail URL, target=_blank, and rel~=noopener. The three UUIDs
	// match the first three cards in lowongan-list.html.
	const cards = [
		{
			uuid: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
			href: "https://maganghub.kemnaker.go.id/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
		},
		{
			uuid: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
			href: "https://maganghub.kemnaker.go.id/magang-nasional/lowongan/magang-software-engineer-b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
		},
		{
			uuid: "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
			href: "https://maganghub.kemnaker.go.id/magang-nasional/lowongan/magang-ui-ux-designer-c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
		},
	];
	for (const c of cards) {
		// The exit link lives in the card's expanded tray with the other actions;
		// the resting card is reading only. Every Favorite must still have its own.
		const card = await openCard(popup, c.uuid);
		const link = card.getByRole("link", { name: /Buka di MagangHub/i });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute("href", c.href);
		await expect(link).toHaveAttribute("target", "_blank");
		// `rel` must include noopener (MV3 popups opening new tabs — defense in
		// depth against reverse tabnabbing, and avoids leaking window.opener).
		await expect(link).toHaveAttribute("rel", /noopener/);
	}
});

test("the creator attribution is present even with no favorites (empty state)", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText("Belum ada favorit")).toBeVisible();
	await expect(
		popup.getByRole("link", { name: "Created by @ramaaudra" }),
	).toBeVisible();
});
