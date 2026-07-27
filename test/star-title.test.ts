import { describe, expect, it } from "vitest";
import { composeStarTitle } from "@/lib/star-title";

describe("composeStarTitle", () => {
	it("returns the bare label when Catatan is missing or empty", () => {
		expect(composeStarTitle("Hapus dari favorit", undefined)).toBe(
			"Hapus dari favorit",
		);
		expect(composeStarTitle("Hapus dari favorit", "")).toBe(
			"Hapus dari favorit",
		);
	});

	it("appends Catatan after an em dash when present", () => {
		expect(
			composeStarTitle("Hapus dari favorit", "dekat rumah, gaji oke"),
		).toBe("Hapus dari favorit — dekat rumah, gaji oke");
	});

	it("uses the off-label when composing an unfilled star", () => {
		// Callers pass the already-chosen label; the helper does not know filled.
		expect(composeStarTitle("Tandai sebagai favorit", "should not show")).toBe(
			"Tandai sebagai favorit — should not show",
		);
	});
});
