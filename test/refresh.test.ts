import { describe, expect, it } from "vitest";
import {
	type OffscreenResponse,
	resolveDetailUrl,
	runWithConcurrency,
	toLiveStatus,
} from "@/lib/refresh";
import type { LiveStatus } from "@/lib/types";

describe("resolveDetailUrl", () => {
	it("prefixes the MagangHub origin to a relative detail path", () => {
		expect(
			resolveDetailUrl(
				"/magang-nasional/lowongan/x-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
			),
		).toBe(
			"https://maganghub.kemnaker.go.id/magang-nasional/lowongan/x-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
		);
	});

	it("leaves an already-absolute URL untouched", () => {
		const url = "https://maganghub.kemnaker.go.id/magang-nasional/lowongan/x";
		expect(resolveDetailUrl(url)).toBe(url);
	});
});

describe("toLiveStatus", () => {
	const now = "2026-01-05T00:00:00Z";

	it("replaces live fields on a successful parse", () => {
		const response: OffscreenResponse = {
			ok: true,
			uuid: "u1",
			parsed: {
				status: "open",
				kuota: 50,
				pelamar: 12,
				batch: "Batch 1 · 2026",
				tunjangan: "Dari Pemerintah",
			},
		};
		expect(toLiveStatus(response, undefined, now)).toEqual({
			status: "open",
			kuota: 50,
			pelamar: 12,
			batch: "Batch 1 · 2026",
			tunjangan: "Dari Pemerintah",
			lastChecked: now,
		});
	});

	it("maps a 404 to closed with no lastError", () => {
		const response: OffscreenResponse = {
			ok: false,
			uuid: "u2",
			error: "HTTP 404",
			httpStatus: 404,
		};
		expect(toLiveStatus(response, undefined, now)).toEqual({
			status: "closed",
			lastChecked: now,
			kuota: undefined,
			pelamar: undefined,
			batch: undefined,
			tunjangan: undefined,
		});
	});

	it("maps a non-gone HTTP failure to unknown and keeps the last-known numbers", () => {
		const previous: LiveStatus = {
			status: "open",
			kuota: 50,
			pelamar: 12,
			batch: "Batch 1 · 2026",
			lastChecked: "2026-01-01T00:00:00Z",
		};
		const response: OffscreenResponse = {
			ok: false,
			uuid: "u3",
			error: "HTTP 503",
			httpStatus: 503,
		};
		const live = toLiveStatus(response, previous, now);
		expect(live.status).toBe("unknown");
		expect(live.lastError).toBe("HTTP 503");
		// No data loss — last-known numbers preserved on failure.
		expect(live.kuota).toBe(50);
		expect(live.pelamar).toBe(12);
		expect(live.batch).toBe("Batch 1 · 2026");
	});

	it("maps a network/parse failure (no httpStatus) to unknown", () => {
		const response: OffscreenResponse = {
			ok: false,
			uuid: "u4",
			error: "network: timeout",
		};
		const live = toLiveStatus(response, undefined, now);
		expect(live.status).toBe("unknown");
		expect(live.lastError).toBe("network: timeout");
	});

	it("keeps the previous successful sample when kuota/pelamar/status change (B1)", () => {
		const previous: LiveStatus = {
			status: "open",
			kuota: 5,
			pelamar: 2,
			lastChecked: "2026-01-01T00:00:00Z",
		};
		const response: OffscreenResponse = {
			ok: true,
			uuid: "u5",
			parsed: { status: "open", kuota: 5, pelamar: 4 },
		};
		const live = toLiveStatus(response, previous, now);
		expect(live.previousSample).toEqual({
			at: "2026-01-01T00:00:00Z",
			status: "open",
			kuota: 5,
			pelamar: 2,
		});
		expect(live.pelamar).toBe(4);
	});

	it("does not set previousSample on the first successful refresh", () => {
		const previous: LiveStatus = {
			status: "unknown",
			lastChecked: null,
		};
		const response: OffscreenResponse = {
			ok: true,
			uuid: "u6",
			parsed: { status: "open", kuota: 5, pelamar: 2 },
		};
		expect(
			toLiveStatus(response, previous, now).previousSample,
		).toBeUndefined();
	});

	it("does not treat a failed refresh as a change (keeps prior previousSample)", () => {
		const previous: LiveStatus = {
			status: "open",
			kuota: 5,
			pelamar: 2,
			lastChecked: "2026-01-01T00:00:00Z",
			previousSample: {
				at: "2025-12-01T00:00:00Z",
				status: "open",
				kuota: 5,
				pelamar: 1,
			},
		};
		const response: OffscreenResponse = {
			ok: false,
			uuid: "u7",
			error: "HTTP 503",
			httpStatus: 503,
		};
		const live = toLiveStatus(response, previous, now);
		expect(live.status).toBe("unknown");
		// Existing previousSample preserved; the failed sample is not recorded.
		expect(live.previousSample).toEqual(previous.previousSample);
	});

	it("preserves previousSample across an unchanged successful refresh", () => {
		const previous: LiveStatus = {
			status: "open",
			kuota: 5,
			pelamar: 4,
			lastChecked: "2026-01-02T00:00:00Z",
			previousSample: {
				at: "2026-01-01T00:00:00Z",
				status: "open",
				kuota: 5,
				pelamar: 2,
			},
		};
		const response: OffscreenResponse = {
			ok: true,
			uuid: "u8",
			parsed: { status: "open", kuota: 5, pelamar: 4 },
		};
		const live = toLiveStatus(response, previous, now);
		expect(live.previousSample).toEqual(previous.previousSample);
	});

	it("freezes changedAt on a real change and keeps it frozen across a no-change refresh (#17)", () => {
		const before: LiveStatus = {
			status: "open",
			kuota: 5,
			pelamar: 2,
			lastChecked: "2026-01-01T00:00:00Z",
		};
		const changeResponse: OffscreenResponse = {
			ok: true,
			uuid: "c1",
			parsed: { status: "open", kuota: 5, pelamar: 4 },
		};
		const atChange = toLiveStatus(
			changeResponse,
			before,
			"2026-01-02T00:00:00Z",
		);
		expect(atChange.previousSample?.pelamar).toBe(2);
		// changedAt is the moment the change was observed, not the prior sample's `at`.
		expect(atChange.changedAt).toBe("2026-01-02T00:00:00Z");

		// Later: a no-change refresh re-confirms the same numbers. lastChecked
		// advances to 2026-01-08; changedAt must stay frozen at the change moment so
		// the toolbar badge does not re-count the already-seen change.
		const noChangeResponse: OffscreenResponse = {
			ok: true,
			uuid: "c1",
			parsed: { status: "open", kuota: 5, pelamar: 4 },
		};
		const afterNoChange = toLiveStatus(
			noChangeResponse,
			atChange,
			"2026-01-08T00:00:00Z",
		);
		expect(afterNoChange.lastChecked).toBe("2026-01-08T00:00:00Z");
		expect(afterNoChange.changedAt).toBe("2026-01-02T00:00:00Z");
		expect(afterNoChange.previousSample).toEqual(atChange.previousSample);
	});
});

describe("runWithConcurrency", () => {
	it("runs all items and returns results in input order, throttled to the limit", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		const items = [1, 2, 3, 4, 5];
		const results = await runWithConcurrency(items, 2, async (n) => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await Promise.resolve();
			inFlight--;
			return n * 10;
		});
		expect(maxInFlight).toBeLessThanOrEqual(2);
		expect(
			results.map((r) => (r as { status: "fulfilled"; value: number }).value),
		).toEqual([10, 20, 30, 40, 50]);
	});

	it("captures rejections as rejected results without aborting the batch", async () => {
		const results = await runWithConcurrency([1, 2, 3], 2, async (n) => {
			if (n === 2) throw new Error("boom");
			return n;
		});
		expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
		expect(results[1].status).toBe("rejected");
		expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
	});

	it("handles an empty input", async () => {
		expect(await runWithConcurrency([], 3, async (n) => n)).toEqual([]);
	});
});
