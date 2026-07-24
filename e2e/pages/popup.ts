import type { BrowserContext, Page } from "@playwright/test";

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
