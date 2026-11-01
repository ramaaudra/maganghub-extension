import {
	expect,
	FIRST_DETAIL_URL as DETAIL_URL,
	FIRST_UUID,
	LIST_URL,
	serveFixture,
	test,
} from "./fixtures";
import { openCard, openPopup } from "./pages/popup";

test("saved stages stay in the popup without adding labels to listing stars", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	const host = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	const card = await openCard(popup, FIRST_UUID);
	await card.getByLabel("Status Lamar").selectOption("interview");
	await popup.reload();
	const reopened = await openCard(popup, FIRST_UUID);
	await expect(reopened.getByLabel("Status Lamar")).toHaveValue("interview");

	await page.reload();
	await expect(host).toHaveAttribute("data-filled", "true");
	await expect(host.locator("[data-stage-chip]")).toHaveCount(0);
	await expect(host).not.toHaveAttribute("data-stage", /.+/);

	await reopened.getByLabel("Status Lamar").selectOption("");
	await expect(reopened.getByLabel("Status Lamar")).toHaveValue("");
	await expect(host).toHaveAttribute("data-filled", "true");
	await expect(host.locator("[data-stage-chip]")).toHaveCount(0);
});

test("changing a saved stage never adds a chip in other tabs", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	const host = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await host.click();
	await expect(host).toHaveAttribute("data-filled", "true");

	const page2 = await context.newPage();
	await serveFixture(page2);
	await page2.goto(LIST_URL);
	const host2 = page2.locator(".mh-lowongan-card .mh-favorite-host").first();
	await expect(host2).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	const card = await openCard(popup, FIRST_UUID);
	await card.getByLabel("Status Lamar").selectOption("ditolak");
	await popup.reload();
	const reopened = await openCard(popup, FIRST_UUID);
	await expect(reopened.getByLabel("Status Lamar")).toHaveValue("ditolak");

	for (const tab of [page, page2]) await tab.reload();
	for (const star of [host, host2]) {
		await expect(star).toHaveAttribute("data-filled", "true");
		await expect(star.locator("[data-stage-chip]")).toHaveCount(0);
		await expect(star).not.toHaveAttribute("data-stage", /.+/);
	}
});

test("similar listing stars have no status chip while their saved stage persists", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(DETAIL_URL);
	const hosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(hosts).toHaveCount(2);
	const star = hosts.first();
	await star.click();
	await expect(star).toHaveAttribute("data-filled", "true");
	const uuid = await star.evaluate((element) =>
		element.closest("[data-mh-star]")?.getAttribute("data-mh-star"),
	);
	if (!uuid) throw new Error("Fixture listing UUID missing");

	const popup = await openPopup(context, extensionId);
	const card = await openCard(popup, uuid);
	await card.getByLabel("Status Lamar").selectOption("diterima");
	await popup.reload();
	const reopened = await openCard(popup, uuid);
	await expect(reopened.getByLabel("Status Lamar")).toHaveValue("diterima");

	await page.reload();
	await expect(star).toHaveAttribute("data-filled", "true");
	await expect(star.locator("[data-stage-chip]")).toHaveCount(0);
	await expect(star).not.toHaveAttribute("data-stage", /.+/);
});
