import { expect, LIST_URL, serveFixture, test } from "./fixtures";
import { openPopup } from "./pages/popup";

// Issue #7 e2e: the trust layer — make the credential-free safety story
// visible in the popup, and give each Favorite an "open official detail"
// link so the user applies themselves on the real MagangHub site (never via
// the extension, never via a third-party helper that would ask for the
// SiapKerja password).

test("the popup shows the one-line trust statement", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	// The credential-free promise, in plain Indonesian.
	await expect(
		popup.getByText(/tidak pernah minta password SiapKerja/i),
	).toBeVisible();
});

test("the popup includes a short explainer on why handing SiapKerja credentials to random sites is dangerous", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	const summary = popup.getByText(/Mengapa aman/i);
	await expect(summary).toBeVisible();
	// Expanding reveals the educational body. Scope to the details' body text so
	// we don't also match the one-line trust statement above (which also says
	// "password SiapKerja").
	await summary.click();
	await expect(popup.getByText(/Situs bantuan pihak ketiga/i)).toBeVisible();
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
		const card = popup.locator(`[data-favorite-uuid="${c.uuid}"]`);
		const link = card.getByRole("link", { name: /Buka di MagangHub/i });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute("href", c.href);
		await expect(link).toHaveAttribute("target", "_blank");
		// `rel` must include noopener (MV3 popups opening new tabs — defense in
		// depth against reverse tabnabbing, and avoids leaking window.opener).
		await expect(link).toHaveAttribute("rel", /noopener/);
	}
});

test("the trust statement is present even with no favorites (empty state)", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText("Belum ada favorit")).toBeVisible();
	await expect(
		popup.getByText(/tidak pernah minta password SiapKerja/i),
	).toBeVisible();
});
