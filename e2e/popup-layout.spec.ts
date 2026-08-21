import { expect, test } from "./fixtures";
import { openPopup } from "./pages/popup";

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
