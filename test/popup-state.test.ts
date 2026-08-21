import { describe, expect, it } from "vitest";
import { shouldRefreshPopupForStorageKey } from "@/lib/popup-state";

describe("popup storage refresh boundary", () => {
	it("refreshes for favorite records and the content-script health signal", () => {
		expect(shouldRefreshPopupForStorageKey("fav:first")).toBe(true);
		expect(shouldRefreshPopupForStorageKey("__health")).toBe(true);
	});

	it("ignores popup bookkeeping and unrelated local storage writes", () => {
		expect(
			shouldRefreshPopupForStorageKey("meta:popupLastOpenedAt"),
		).toBe(false);
		expect(shouldRefreshPopupForStorageKey("__testDetailFixtures")).toBe(false);
	});
});
