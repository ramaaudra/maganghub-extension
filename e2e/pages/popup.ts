import type { BrowserContext, Locator, Page } from "@playwright/test";

/** Opens the extension popup in a fresh tab and waits for it to render. */
export async function openPopup(
	context: BrowserContext,
	extensionId: string,
): Promise<Page> {
	const page = await context.newPage();
	await page.goto(`chrome-extension://${extensionId}/popup.html`);
	await page.waitForSelector("header");
	return page;
}

/**
 * A Favorite card by UUID. The resting card shows title, Penyelenggara, seats,
 * and the two status chips; every *control* (Status Lamar, Catatan, Segarkan,
 * Arsipkan, Buka di MagangHub) lives behind its disclosure. Use
 * {@link expandCard} before driving a control.
 */
export function favoriteCard(popup: Page, uuid: string): Locator {
	return popup.locator(`[data-favorite-uuid="${uuid}"]`);
}

/**
 * Open a Favorite card's control tray, idempotently.
 *
 * The card collapses by default so a shortlist of eight fits the 360×600 popup
 * (the always-expanded card was ~180px, so two filled the viewport). Tests that
 * assert on a control therefore have to open the card the way a user would.
 * Reads `aria-expanded` first so calling this twice is safe — a blind click
 * would close a card another step already opened.
 */
export async function expandCard(card: Locator): Promise<void> {
	const toggle = card.locator("[data-favorite-toggle]");
	if ((await toggle.getAttribute("aria-expanded")) !== "true") {
		await toggle.click();
	}
}

/** Locate a card by UUID and open its control tray in one step. */
export async function openCard(popup: Page, uuid: string): Promise<Locator> {
	const card = favoriteCard(popup, uuid);
	await expandCard(card);
	return card;
}

/**
 * Open the first Favorite card in the list, whatever its UUID. For specs that
 * star one Lowongan and do not care which record it is.
 */
export async function openFirstCard(popup: Page): Promise<Locator> {
	const card = popup.locator("[data-favorite-uuid]").first();
	await expandCard(card);
	return card;
}
