import type { Locator, Page } from "@playwright/test";
import {
	expect,
	FIRST_DETAIL_URL,
	FIRST_UUID,
	LIST_URL,
	serveFixture,
	test,
} from "./fixtures";
import { openCard, openPopup } from "./pages/popup";

const SYNTHETIC_CARD_LAYOUT = `
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #172033; }
  a { color: inherit; text-decoration: none; }
  h3, p { margin: 0; }
  .mh-container { max-width: 900px; margin-inline: auto; padding: 20px; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
  @media (min-width: 768px) {
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  .block { display: block; }
  .inline-flex { display: inline-flex; }
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .flex-wrap { flex-wrap: wrap; }
  .flex-1 { flex: 1 1 0%; }
  .items-start { align-items: flex-start; }
  .items-center { align-items: center; }
  .gap-4 { gap: 16px; }
  .gap-2 { gap: 8px; }
  .gap-1\\.5 { gap: 6px; }
  .gap-x-4 { column-gap: 16px; }
  .gap-y-1 { row-gap: 4px; }
  .h-full { height: 100%; }
  .min-w-0 { min-width: 0; }
  .shrink-0 { flex-shrink: 0; }
  .w-12 { width: 48px; }
  .h-12 { height: 48px; }
  .p-5 { padding: 20px; }
  .px-2\\.5 { padding-inline: 10px; }
  .py-0\\.5 { padding-block: 2px; }
  .border { border: 1px solid #e1e7ef; }
  .mt-4 { margin-top: 16px; }
  .mt-3 { margin-top: 12px; }
  .mt-2 { margin-top: 8px; }
  .mt-auto { margin-top: auto; }
  .pt-4 { padding-top: 16px; }
  .mb-4 { margin-bottom: 16px; }
  .mb-2 { margin-bottom: 8px; }
  .text-sm { font-size: 14px; }
  .text-xs { font-size: 12px; }
  .font-semibold { font-weight: 600; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mh-lowongan-card {
    position: relative; border: 1px solid #e1e7ef; border-radius: 12px;
    overflow: hidden; background: white;
  }
  .mh-lowongan-card svg { width: 14px; height: 14px; }
  .mh-lowongan-card img { width: 48px; height: 48px; }
  [data-layout-badge] {
    position: absolute; inset: 0 0 auto auto; z-index: 10;
    padding: 4px 12px; height: 32px; background: #0866ef;
    color: white; font-size: 14px; border-bottom-left-radius: 12px;
  }
`;

async function showCards(page: Page, url = LIST_URL): Promise<void> {
	await serveFixture(page);
	await page.goto(url);
	await page.addStyleTag({ content: SYNTHETIC_CARD_LAYOUT });
	await page
		.locator(".mh-lowongan-card")
		.first()
		.evaluate((card) => {
			const badge = document.createElement("span");
			badge.setAttribute("data-layout-badge", "");
			badge.textContent = "♿ Ramah Disabilitas";
			card.prepend(badge);
			const title = card.querySelector("h3");
			if (!title) throw new Error("Fixture card title missing");
			title.textContent =
				"Mandarin Translator Intern untuk Pengembangan Operasional dan Kemitraan";
		});
}

async function expectCompactStar(card: Locator): Promise<void> {
	const host = card.locator(".mh-favorite-host");
	await expect(host).toBeVisible();
	const layout = await card.evaluate((element) => {
		const host = element.querySelector(".mh-favorite-host");
		if (!host) throw new Error("Favorite control missing");
		const star = host.getBoundingClientRect();
		const bounds = element.getBoundingClientRect();
		const overlaps = (rect: DOMRect) =>
			star.left < rect.right &&
			star.right > rect.left &&
			star.top < rect.bottom &&
			star.bottom > rect.top;
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let textOverlap = false;
		while (walker.nextNode()) {
			const node = walker.currentNode;
			if (!node.textContent?.trim() || host.contains(node)) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			if ([...range.getClientRects()].some(overlaps)) textOverlap = true;
		}
		return {
			inBottomRight:
				bounds.right - star.right >= 8 &&
				bounds.right - star.right <= 16 &&
				bounds.bottom - star.bottom >= 8 &&
				bounds.bottom - star.bottom <= 16,
			textOverlap,
			decorationOverlap: [
				...element.querySelectorAll("img, hr, [data-layout-badge]"),
			].some((item) => overlaps(item.getBoundingClientRect())),
		};
	});
	expect(
		layout,
		"The bottom-right star must leave native card content clear",
	).toEqual({
		inBottomRight: true,
		textOverlap: false,
		decorationOverlap: false,
	});
}

async function expectOriginalCardSize(page: Page): Promise<void> {
	const differences = await page
		.locator(".mh-lowongan-card")
		.evaluateAll((cards) => {
			const hosts = cards.map((card) =>
				card.querySelector<HTMLElement>(".mh-favorite-host"),
			);
			if (hosts.some((host) => !host))
				throw new Error("Favorite control missing");
			const sizes = cards.map((card) => {
				const rect = card.getBoundingClientRect();
				return { width: rect.width, height: rect.height };
			});
			for (const host of hosts)
				host?.style.setProperty("display", "none", "important");
			const differences = cards.map((card, index) => {
				const rect = card.getBoundingClientRect();
				return {
					width: sizes[index].width - rect.width,
					height: sizes[index].height - rect.height,
				};
			});
			for (const host of hosts) host?.style.removeProperty("display");
			return differences;
		});
	for (const difference of differences) {
		expect(difference.width, "Favoriting must not widen a card").toBe(0);
		expect(difference.height, "Favoriting must not increase card height").toBe(
			0,
		);
	}
}

for (const width of [1280, 390, 320]) {
	test(`bottom-right stars preserve card size at ${width}px`, async ({
		page,
		context,
		extensionId,
	}, testInfo) => {
		await page.setViewportSize({ width, height: 900 });
		await showCards(page);
		const cards = page.locator(".mh-lowongan-card");
		await expect(cards).toHaveCount(3);
		await expectOriginalCardSize(page);
		for (const card of await cards.all()) await expectCompactStar(card);

		const host = cards.first().locator(".mh-favorite-host");
		await host.click();
		await expect(host).toHaveAttribute("data-filled", "true");
		await expect(page).toHaveURL(LIST_URL);

		const popup = await openPopup(context, extensionId);
		const favorite = await openCard(popup, FIRST_UUID);
		await favorite.getByLabel("Status Lamar").selectOption("interview");
		await expect(favorite.getByLabel("Status Lamar")).toHaveValue("interview");
		await expect(host.locator("[data-stage-chip]")).toHaveCount(0);
		await expectCompactStar(cards.first());
		await expectOriginalCardSize(page);

		await page.bringToFront();
		await cards.first().screenshot({
			path: testInfo.outputPath("bottom-right-star.png"),
		});
		await host.click();
		await expect(host).toHaveAttribute("data-filled", "false");
		await expect(page).toHaveURL(LIST_URL);
		await cards.first().locator("h3").click();
		await expect(page).toHaveURL(FIRST_DETAIL_URL);
	});
}

test("similar listing stars preserve card size", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 900 });
	await showCards(page, FIRST_DETAIL_URL);
	const cards = page.locator(".mh-lowongan-card");
	await expect(cards).toHaveCount(2);
	await expectOriginalCardSize(page);
	for (const card of await cards.all()) await expectCompactStar(card);
	const host = cards.first().locator(".mh-favorite-host");
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");
	await expect(page).toHaveURL(FIRST_DETAIL_URL);
});

test("favorite actions remain reachable by keyboard", async ({ page }) => {
	await showCards(page);
	const host = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await page.locator(`a[href$="${FIRST_UUID}"]`).focus();
	await page.keyboard.press("Tab");
	// Focus inside the closed shadow is exposed as its host in the document.
	await expect(host).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(host).toHaveAttribute("data-filled", "true");
	await expect(page).toHaveURL(LIST_URL);
	await page.keyboard.press("Space");
	await expect(host).toHaveAttribute("data-filled", "false");
	await expect(page).toHaveURL(LIST_URL);
});
