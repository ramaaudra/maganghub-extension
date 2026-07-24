import { describe, it, expect } from "vitest";
import { relativeTimeAgo, terakhirDicek } from "@/lib/time";

describe("relativeTimeAgo", () => {
	it("returns 'baru saja' under a minute", () => {
		expect(relativeTimeAgo(0)).toBe("baru saja");
		expect(relativeTimeAgo(59_000)).toBe("baru saja");
	});

	it("returns 'X menit lalu' under an hour", () => {
		expect(relativeTimeAgo(60_000)).toBe("1 menit lalu");
		expect(relativeTimeAgo(5 * 60_000)).toBe("5 menit lalu");
	});

	it("returns 'X jam lalu' under a day", () => {
		expect(relativeTimeAgo(60 * 60_000)).toBe("1 jam lalu");
		expect(relativeTimeAgo(3 * 60 * 60_000)).toBe("3 jam lalu");
	});

	it("returns 'X hari lalu' for spans of a day or more", () => {
		expect(relativeTimeAgo(24 * 60 * 60_000)).toBe("1 hari lalu");
		expect(relativeTimeAgo(5 * 24 * 60 * 60_000)).toBe("5 hari lalu");
	});
});

describe("terakhirDicek", () => {
	it("formats the gap as 'terakhir dicek X lalu'", () => {
		const now = Date.parse("2026-01-05T00:00:00Z");
		// 10 minutes before `now`.
		expect(terakhirDicek("2026-01-04T23:50:00Z", now)).toBe(
			"terakhir dicek 10 menit lalu",
		);
	});

	it("returns null for a missing timestamp (never refreshed)", () => {
		expect(terakhirDicek(null)).toBeNull();
		expect(terakhirDicek(undefined)).toBeNull();
		expect(terakhirDicek("")).toBeNull();
	});

	it("returns null for an unparseable timestamp", () => {
		expect(terakhirDicek("not-a-date")).toBeNull();
	});
});
