import { describe, expect, it } from "vitest";
import {
	formatChangeNotice,
	hasMeaningfulChange,
	isSuccessfulSample,
	toLiveStatusSample,
} from "@/lib/change";
import type { LiveStatus, LiveStatusSample } from "@/lib/types";

describe("isSuccessfulSample", () => {
	it("rejects never-refreshed and failed-refresh liveStatus", () => {
		expect(isSuccessfulSample({ status: "unknown", lastChecked: null })).toBe(
			false,
		);
		expect(
			isSuccessfulSample({
				status: "unknown",
				lastChecked: "2026-01-05T00:00:00Z",
				lastError: "HTTP 503",
			}),
		).toBe(false);
	});

	it("accepts belum_penuh / penuh samples with a lastChecked", () => {
		expect(
			isSuccessfulSample({
				status: "belum_penuh",
				kuota: 5,
				pelamar: 2,
				lastChecked: "2026-01-05T00:00:00Z",
			}),
		).toBe(true);
		expect(
			isSuccessfulSample({
				status: "penuh",
				kuota: 5,
				pelamar: 5,
				lastChecked: "2026-01-05T00:00:00Z",
			}),
		).toBe(true);
	});
});

describe("hasMeaningfulChange", () => {
	const prev: LiveStatusSample = {
		at: "2026-01-01T00:00:00Z",
		status: "belum_penuh",
		kuota: 5,
		pelamar: 2,
	};

	it("is true when kuota, pelamar, or status differs", () => {
		expect(
			hasMeaningfulChange(
				{ status: "belum_penuh", kuota: 5, pelamar: 4, lastChecked: "t" },
				prev,
			),
		).toBe(true);
		expect(
			hasMeaningfulChange(
				{ status: "belum_penuh", kuota: 3, pelamar: 2, lastChecked: "t" },
				prev,
			),
		).toBe(true);
		expect(
			hasMeaningfulChange(
				{ status: "penuh", kuota: 5, pelamar: 5, lastChecked: "t" },
				prev,
			),
		).toBe(true);
	});

	it("is false when kuota/pelamar/status are unchanged", () => {
		expect(
			hasMeaningfulChange(
				{ status: "belum_penuh", kuota: 5, pelamar: 2, lastChecked: "t" },
				prev,
			),
		).toBe(false);
	});

	it("is false for a failed refresh (status unknown), even if numbers differ", () => {
		// Failure path keeps last-known numbers but must not count as a change.
		expect(
			hasMeaningfulChange(
				{
					status: "unknown",
					kuota: 5,
					pelamar: 2,
					lastChecked: "t",
					lastError: "HTTP 503",
				},
				prev,
			),
		).toBe(false);
	});
});

describe("formatChangeNotice", () => {
	it("returns null when there is no meaningful change", () => {
		const prev: LiveStatusSample = {
			at: "2026-01-01T00:00:00Z",
			status: "belum_penuh",
			kuota: 5,
			pelamar: 2,
		};
		const current: LiveStatus = {
			status: "belum_penuh",
			kuota: 5,
			pelamar: 2,
			lastChecked: "2026-01-05T00:00:00Z",
			previousSample: prev,
		};
		expect(formatChangeNotice(current)).toBeNull();
	});

	it("returns null when unrefreshed or missing previousSample", () => {
		expect(
			formatChangeNotice({ status: "unknown", lastChecked: null }),
		).toBeNull();
		expect(
			formatChangeNotice({
				status: "belum_penuh",
				kuota: 5,
				pelamar: 2,
				lastChecked: "2026-01-05T00:00:00Z",
			}),
		).toBeNull();
	});

	it('returns null for a failed refresh (status: "unknown")', () => {
		const current: LiveStatus = {
			status: "unknown",
			kuota: 5,
			pelamar: 2,
			lastChecked: "2026-01-05T00:00:00Z",
			lastError: "HTTP 503",
			previousSample: {
				at: "2026-01-01T00:00:00Z",
				status: "belum_penuh",
				kuota: 5,
				pelamar: 1,
			},
		};
		expect(formatChangeNotice(current)).toBeNull();
	});

	it('phrases a seat drop as "sisa N kursi, tadinya M"', () => {
		// remaining 3 → 1
		const current: LiveStatus = {
			status: "belum_penuh",
			kuota: 5,
			pelamar: 4,
			lastChecked: "2026-01-05T00:00:00Z",
			previousSample: {
				at: "2026-01-01T00:00:00Z",
				status: "belum_penuh",
				kuota: 5,
				pelamar: 2,
			},
		};
		expect(formatChangeNotice(current)).toBe("sisa 1 kursi, tadinya 3");
	});

	it('phrases a newly-full Lowongan as "penuh sejak terakhir dicek"', () => {
		const fromSeats: LiveStatus = {
			status: "penuh",
			kuota: 5,
			pelamar: 5,
			lastChecked: "2026-01-05T00:00:00Z",
			previousSample: {
				at: "2026-01-01T00:00:00Z",
				status: "belum_penuh",
				kuota: 5,
				pelamar: 2,
			},
		};
		expect(formatChangeNotice(fromSeats)).toBe("penuh sejak terakhir dicek");

		// Over-subscribed still reads as full.
		const over: LiveStatus = {
			status: "penuh",
			kuota: 50,
			pelamar: 150,
			lastChecked: "2026-01-05T00:00:00Z",
			previousSample: {
				at: "2026-01-01T00:00:00Z",
				status: "belum_penuh",
				kuota: 50,
				pelamar: 12,
			},
		};
		expect(formatChangeNotice(over)).toBe("penuh sejak terakhir dicek");
	});

	it("phrases a remaining drop to zero as full", () => {
		// remaining ≤ 0 is full, even though registration can still be submitted.
		const current: LiveStatus = {
			status: "penuh",
			kuota: 5,
			pelamar: 5,
			lastChecked: "2026-01-05T00:00:00Z",
			previousSample: {
				at: "2026-01-01T00:00:00Z",
				status: "belum_penuh",
				kuota: 5,
				pelamar: 2,
			},
		};
		expect(formatChangeNotice(current)).toBe("penuh sejak terakhir dicek");
	});
});

describe("toLiveStatusSample", () => {
	it("copies the comparable fields off a successful liveStatus", () => {
		expect(
			toLiveStatusSample({
				status: "belum_penuh",
				kuota: 5,
				pelamar: 2,
				batch: "Batch 1 · 2026",
				lastChecked: "2026-01-01T00:00:00Z",
			}),
		).toEqual({
			at: "2026-01-01T00:00:00Z",
			status: "belum_penuh",
			kuota: 5,
			pelamar: 2,
		});
	});
});
