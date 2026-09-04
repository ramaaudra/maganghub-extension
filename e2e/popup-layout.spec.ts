import { expect, FIRST_UUID, LIST_URL, serveFixture, test } from "./fixtures";
import { openCard, openPopup } from "./pages/popup";

test("keeps empty Aktif and Arsip at the same popup height", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);

	await expect(popup.getByText("Belum ada favorit")).toBeVisible();
	const activeLayout = await popup.evaluate(() => {
		const main = document.querySelector("main");
		const footer = document.querySelector("footer");
		if (!main || !footer) throw new Error("Popup shell is incomplete");
		return {
			mainHeight: Math.round(main.getBoundingClientRect().height),
			footerTop: Math.round(footer.getBoundingClientRect().top),
		};
	});

	await popup.getByRole("tab", { name: "Arsip" }).click();
	await expect(popup.getByText("Belum ada arsip")).toBeVisible();
	await expect(popup.locator("[data-empty-state-icon] svg")).toHaveCount(1);

	const archivedLayout = await popup.evaluate(() => {
		const main = document.querySelector("main");
		const footer = document.querySelector("footer");
		if (!main || !footer) throw new Error("Popup shell is incomplete");
		return {
			mainHeight: Math.round(main.getBoundingClientRect().height),
			footerTop: Math.round(footer.getBoundingClientRect().top),
		};
	});

	expect(archivedLayout).toEqual(activeLayout);
});

test("keeps popup text and action links inside the shell during refresh", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();

	const popup = await openPopup(context, extensionId);
	const card = await openCard(popup, FIRST_UUID);
	await popup.waitForTimeout(250);

	const before = await popup.evaluate(() => {
		const app = document.querySelector("#app");
		const footer = document.querySelector("footer");
		const trust = document.querySelector<HTMLElement>(
			"[data-slot=collapsible-trigger]",
		);
		const actions = document.querySelector<HTMLElement>(
			"[data-favorite-uuid] [data-slot=card-content] > div:last-of-type",
		);
		const link = document.querySelector<HTMLElement>(
			"[data-favorite-uuid] [data-slot=card-content] a",
		);
		if (!app || !footer || !trust || !actions || !link) {
			throw new Error("Popup layout is incomplete");
		}
		const rect = (element: HTMLElement) => {
			const box = element.getBoundingClientRect();
			return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
		};
		return {
			app: { clientWidth: app.clientWidth, scrollWidth: app.scrollWidth },
			footer: {
				clientWidth: footer.clientWidth,
				scrollWidth: footer.scrollWidth,
			},
			trust: rect(trust),
			link: rect(link),
			actions: rect(actions),
		};
	});

	expect(before.app.scrollWidth).toBeLessThanOrEqual(before.app.clientWidth);
	expect(before.footer.scrollWidth).toBeLessThanOrEqual(
		before.footer.clientWidth,
	);
	expect(before.trust.right).toBeLessThanOrEqual(before.footer.clientWidth);
	expect(before.link.right).toBeLessThanOrEqual(before.actions.right);

	await popup.evaluate(() => {
		const state = window as Window & { __popupCls?: number };
		state.__popupCls = 0;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const shift = entry as PerformanceEntry & {
					hadRecentInput?: boolean;
					value?: number;
				};
				if (!shift.hadRecentInput) {
					state.__popupCls = (state.__popupCls ?? 0) + (shift.value ?? 0);
				}
			}
		}).observe({ type: "layout-shift" });
	});

	const refresh = card.getByRole("button", {
		name: "Segarkan Status Kuota",
	});
	// Use a programmatic activation for the CLS assertion. A real pointer click
	// marks subsequent layout-shift entries as `hadRecentInput`, which correctly
	// excludes them from CLS but would let a refresh-induced reflow hide here.
	await refresh.evaluate((button) => (button as HTMLButtonElement).click());
	await expect(refresh).toContainText("Memperbarui…");
	const during = await card
		.getByRole("link", {
			name: "Buka di MagangHub",
		})
		.boundingBox();
	if (!during) throw new Error("Official detail link has no layout box");

	expect(during.x).toBe(before.link.x);
	expect(during.y).toBe(before.link.y);
	expect(during.x + during.width).toBe(before.link.right);

	await popup.waitForTimeout(300);
	const report = await popup.evaluate(() => {
		return (window as Window & { __popupCls?: number }).__popupCls ?? 0;
	});
	expect(report).toBe(0);
});
