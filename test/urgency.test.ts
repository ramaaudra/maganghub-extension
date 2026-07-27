import { describe, expect, it } from "vitest";
import { FILLING_THRESHOLD } from "@/lib/parse";
import { urgencyBand } from "@/lib/urgency";

/**
 * Banding rules (issue #16):
 *   remaining = kuota − pelamar
 *   lewat_kuota  → remaining ≤ 0
 *   hampir_penuh → remaining ≤ 1 OR pelamar ≥ FILLING_THRESHOLD × kuota
 *   calm         → seats left and not near full
 *   undefined    → either number missing
 */
describe("urgencyBand", () => {
	it("returns calm when seats remain and the Lowongan is not near full", () => {
		// kuota 5, pelamar 1 → remaining 4, 20% filled
		expect(urgencyBand(5, 1)).toBe("calm");
		// kuota 3, pelamar 0 → remaining 3
		expect(urgencyBand(3, 0)).toBe("calm");
	});

	it("returns hampir_penuh when only one seat remains", () => {
		// remaining === 1, regardless of fill ratio
		expect(urgencyBand(3, 2)).toBe("hampir_penuh");
		expect(urgencyBand(5, 4)).toBe("hampir_penuh");
	});

	it("returns hampir_penuh at the shared FILLING_THRESHOLD (80%)", () => {
		// 40/50 = 0.8 exactly — same line parse.ts uses for `filling`
		expect(FILLING_THRESHOLD).toBe(0.8);
		expect(urgencyBand(50, 40)).toBe("hampir_penuh");
	});

	it("returns hampir_penuh above the threshold while seats remain", () => {
		// 20/25 = 80% with remaining 5 (> 1) — ratio alone must trip hampir_penuh
		expect(urgencyBand(25, 20)).toBe("hampir_penuh");
		// Just under 80% with remaining > 1 stays calm
		expect(urgencyBand(50, 39)).toBe("calm");
	});

	it("returns lewat_kuota when remaining is zero", () => {
		expect(urgencyBand(5, 5)).toBe("lewat_kuota");
	});

	it("returns lewat_kuota when remaining is negative (over-subscribed)", () => {
		// Recon measured Pelamar at 200%–8850% of Kuota under most_applicants.
		expect(urgencyBand(2, 4)).toBe("lewat_kuota");
		expect(urgencyBand(5, 150)).toBe("lewat_kuota");
	});

	it("returns undefined when Kuota or Pelamar is missing", () => {
		expect(urgencyBand(undefined, 1)).toBeUndefined();
		expect(urgencyBand(5, undefined)).toBeUndefined();
		expect(urgencyBand(undefined, undefined)).toBeUndefined();
	});
});
