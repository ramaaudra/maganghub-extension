import { expect, test } from "./fixtures";
import { openPopup } from "./pages/popup";

test("popup header uses the production Route mark beside SakuMagang", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	const brandIcon = popup.locator("[data-brand-icon]");

	await expect(popup.locator("h1")).toHaveText("SakuMagang");
	await expect(brandIcon).toHaveAttribute("src", "/icon/route.svg");
	await expect(brandIcon).toHaveAttribute("aria-hidden", "true");
	await expect(brandIcon).toHaveAttribute("width", "24");
	await expect(brandIcon).toHaveAttribute("height", "24");
});
