import { expect, FIRST_UUID, LIST_URL, serveFixture, test } from "./fixtures";
import {
	expandCard,
	favoriteCard,
	openFirstCard,
	openPopup,
} from "./pages/popup";

// ADR-0010 e2e: archive is a soft-hide. Archiving moves a Favorite from the
// Aktif tab to the Arsip tab without losing data; the star on MagangHub's page
// stays filled (the record still exists in storage). Restore returns it to
// Aktif. "Hapus permanen" is irreversible and guarded by an inline confirm.
//
// Card actions live behind the card's disclosure (the resting card is title +
// Penyelenggara + seats + status, so a shortlist fits the 360×600 popup), so
// each spec opens the card via `openFirstCard` before reaching a button. A card
// re-renders on the storage write that follows every archive/restore, which
// collapses it — so the tray is re-opened after each such action.

test("archiving a favorite moves it to the Arsip tab and keeps the star filled on MagangHub", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	// Star one favorite from the list page.
	const star = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await star.click();

	const popup = await openPopup(context, extensionId);

	// The favorite is in the Aktif tab with an Arsipkan button.
	await openFirstCard(popup);
	await expect(popup.getByRole("button", { name: "Arsipkan" })).toBeVisible();

	// Archive it.
	await popup.getByRole("button", { name: "Arsipkan" }).click();

	// The Aktif tab is now empty (no Arsipkan button, empty state shown).
	await expect(popup.getByRole("button", { name: "Arsipkan" })).toHaveCount(0);

	// The Arsip tab shows a count of 1.
	await expect(popup.getByRole("tab", { name: /Arsip/ })).toContainText("(1)");

	// Switch to the Arsip tab — the archived favorite is there with a
	// Pulihkan button (and no Segarkan, since archived records are skipped by
	// refresh).
	await popup.getByRole("tab", { name: /Arsip/ }).click();
	await openFirstCard(popup);
	await expect(
		popup.getByRole("button", { name: "Pulihkan ke daftar aktif" }),
	).toBeVisible();
	await expect(
		popup.getByRole("button", { name: "Segarkan Status Lowongan" }),
	).toHaveCount(0);

	// The star on MagangHub's page is still filled — archiving never un-stars,
	// because the record still exists in storage.
	await expect(star).toHaveAttribute("data-filled", "true");
});

test("restoring an archived favorite returns it to the Aktif tab", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();

	const popup = await openPopup(context, extensionId);
	await openFirstCard(popup);
	await popup.getByRole("button", { name: "Arsipkan" }).click();

	// Switch to Arsip and restore.
	await popup.getByRole("tab", { name: /Arsip/ }).click();
	await openFirstCard(popup);
	await popup.getByRole("button", { name: "Pulihkan ke daftar aktif" }).click();

	// Switch back to the Aktif tab — the restored favorite reappears with a
	// Segarkan button (restored favorites can be refreshed again).
	await popup.getByRole("tab", { name: "Aktif" }).click();
	await openFirstCard(popup);
	await expect(
		popup.getByRole("button", { name: "Segarkan Status Lowongan" }),
	).toBeVisible();
	await expect(popup.getByRole("button", { name: "Arsipkan" })).toBeVisible();
	// The Arsip tab count is gone (0 archived).
	await expect(popup.getByRole("tab", { name: /Arsip/ })).not.toContainText(
		"(0)",
	);
});

test("delete permanent is guarded by an inline confirm and removes the favorite permanently", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	const star = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await star.click();

	const popup = await openPopup(context, extensionId);
	await openFirstCard(popup);
	await popup.getByRole("button", { name: "Arsipkan" }).click();
	await popup.getByRole("tab", { name: /Arsip/ }).click();
	await openFirstCard(popup);

	// Clicking "Hapus permanen" does NOT immediately delete — it swaps the row
	// for an inline "Yakin? [Ya, hapus] [Batal]" confirm.
	await popup.getByRole("button", { name: "Hapus permanen" }).click();
	await expect(
		popup.getByRole("button", { name: "Ya, hapus permanen" }),
	).toBeVisible();
	await expect(
		popup.getByRole("button", { name: "Batal hapus" }),
	).toBeVisible();

	// Confirming deletes the record. The Arsip tab is now empty, and the star
	// on MagangHub's page is cleared (the record is gone from storage).
	await popup.getByRole("button", { name: "Ya, hapus permanen" }).click();
	await expect(popup.getByText(/Belum ada arsip/i)).toBeVisible();
	await expect(star).toHaveAttribute("data-filled", "false");
});

test("canceling the delete confirm keeps the archived favorite", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();

	const popup = await openPopup(context, extensionId);
	await openFirstCard(popup);
	await popup.getByRole("button", { name: "Arsipkan" }).click();
	await popup.getByRole("tab", { name: /Arsip/ }).click();
	await openFirstCard(popup);

	await popup.getByRole("button", { name: "Hapus permanen" }).click();
	await popup.getByRole("button", { name: "Batal hapus" }).click();

	// The confirm is gone, the Pulihkan button is back, the favorite remains.
	await expect(
		popup.getByRole("button", { name: "Pulihkan ke daftar aktif" }),
	).toBeVisible();
	await expect(
		popup.getByRole("button", { name: "Ya, hapus permanen" }),
	).toHaveCount(0);
});

test("the resting card shows the saved Kuota and Pelamar before any refresh", async ({
	page,
	context,
	extensionId,
}) => {
	// The collapsed card has to carry a real reading, not a "tekan Segarkan"
	// instruction — the snapshot captured at star time already holds the numbers
	// the user saw on the card they starred. The list fixture's first card is
	// Kuota: 5 / Pelamar: 1, so remaining is 4 and the source is the snapshot.
	await serveFixture(page);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();

	const popup = await openPopup(context, extensionId);
	const card = favoriteCard(popup, FIRST_UUID);
	const strip = card.locator("[data-signal-strip]");

	await expect(strip).toContainText("sisa 4 kursi");
	await expect(strip).toContainText("1 dari 5");
	// The doubled label the raw snapshot string used to produce: the popup
	// rendered a hand-written "Kuota" in front of a value that already read
	// "Kuota: 5", giving "Kuota Kuota: 5".
	await expect(strip).not.toContainText("Kuota: 5");

	// The resting row leaves provenance to the "Belum dicek" chip and keeps the
	// seat line on one line; the words live in the tray, said once.
	await expect(strip).toContainText("Belum dicek");
	await expect(strip).not.toContainText("saat disimpan");

	await expandCard(card);
	await expect(card.locator("[data-provenance]")).toContainText(
		"saat disimpan",
	);
});
