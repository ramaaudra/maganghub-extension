import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
	countUnseenChanges,
	countsAsUnseenChange,
	markPopupOpened,
	POPUP_LAST_OPENED_KEY,
	readPopupLastOpenedAt,
	syncToolbarBadge,
} from "@/lib/badge";
import type { Favorite } from "@/lib/types";
import { initialLiveStatus, SCHEMA_VERSION } from "@/lib/types";

function makeFavorite(
	uuid: string,
	liveStatus: Favorite["liveStatus"],
): Favorite {
	return {
		schemaVersion: SCHEMA_VERSION,
		uuid,
		detailUrl: `/magang-nasional/lowongan/x-${uuid}`,
		savedSnapshot: {
			title: "Magang",
			organizer: "PT Contoh",
			location: "Jakarta",
			capturedAt: "2026-01-01T00:00:00Z",
		},
		catatan: "",
		statusLamar: undefined,
		liveStatus,
		savedAt: "2026-01-01T00:00:00Z",
		archivedAt: null,
	};
}

describe("countsAsUnseenChange / countUnseenChanges", () => {
	const changed = makeFavorite("u1", {
		status: "open",
		kuota: 5,
		pelamar: 4,
		lastChecked: "2026-01-05T12:00:00Z",
		previousSample: {
			at: "2026-01-01T00:00:00Z",
			status: "open",
			kuota: 5,
			pelamar: 2,
		},
		// The change was observed at this refresh; frozen across later no-change refreshes.
		changedAt: "2026-01-05T12:00:00Z",
	});
	const unchanged = makeFavorite("u2", {
		status: "open",
		kuota: 5,
		pelamar: 2,
		lastChecked: "2026-01-05T12:00:00Z",
	});
	const unrefreshed = makeFavorite("u3", initialLiveStatus());

	it("counts a Favorite with a change notice after last open", () => {
		expect(countsAsUnseenChange(changed, "2026-01-04T00:00:00Z")).toBe(true);
		expect(
			countUnseenChanges(
				[changed, unchanged, unrefreshed],
				"2026-01-04T00:00:00Z",
			),
		).toBe(1);
	});

	it("does not count a change observed before the popup was last opened", () => {
		expect(countsAsUnseenChange(changed, "2026-01-06T00:00:00Z")).toBe(false);
	});

	it("counts when the popup has never been opened", () => {
		expect(countsAsUnseenChange(changed, null)).toBe(true);
	});

	it("does not count unrefreshed or unchanged Favorites", () => {
		expect(countsAsUnseenChange(unchanged, null)).toBe(false);
		expect(countsAsUnseenChange(unrefreshed, null)).toBe(false);
	});

	it("does not re-count an already-seen change on a later no-change refresh (#17)", () => {
		// Change observed at T1 (changedAt frozen there). User opened popup at
		// T2 (badge cleared). A refresh at T3 re-confirms the same numbers —
		// lastChecked advances to T3 but changedAt stays T1, so the still-present
		// change notice must NOT re-count as unseen.
		const reconfirmed = makeFavorite("u9", {
			status: "open",
			kuota: 5,
			pelamar: 4,
			lastChecked: "2026-01-08T00:00:00Z",
			previousSample: {
				at: "2026-01-01T00:00:00Z",
				status: "open",
				kuota: 5,
				pelamar: 2,
			},
			changedAt: "2026-01-05T12:00:00Z",
		});
		expect(countsAsUnseenChange(reconfirmed, "2026-01-06T00:00:00Z")).toBe(
			false,
		);
	});
});

describe("popup last-opened storage + toolbar badge", () => {
	beforeEach(() => {
		fakeBrowser.reset();
	});

	it("round-trips the last-opened timestamp", async () => {
		expect(await readPopupLastOpenedAt()).toBeNull();
		await markPopupOpened("2026-01-05T00:00:00Z");
		expect(await readPopupLastOpenedAt()).toBe("2026-01-05T00:00:00Z");
		const stored = await browser.storage.local.get(POPUP_LAST_OPENED_KEY);
		expect(stored[POPUP_LAST_OPENED_KEY]).toBe("2026-01-05T00:00:00Z");
	});

	it("paints and clears the toolbar badge via browser.action", async () => {
		const setBadgeText = vi.fn(async () => {});
		const setBadgeBackgroundColor = vi.fn(async () => {});
		// fake-browser may not ship action; stub the surface B1 uses.
		(browser as unknown as { action: unknown }).action = {
			setBadgeText,
			setBadgeBackgroundColor,
		};

		const changed = makeFavorite("u1", {
			status: "open",
			kuota: 5,
			pelamar: 4,
			lastChecked: "2026-01-05T12:00:00Z",
			previousSample: {
				at: "2026-01-01T00:00:00Z",
				status: "open",
				kuota: 5,
				pelamar: 2,
			},
			changedAt: "2026-01-05T12:00:00Z",
		});

		await syncToolbarBadge([changed], "2026-01-04T00:00:00Z");
		expect(setBadgeText).toHaveBeenCalledWith({ text: "1" });
		expect(setBadgeBackgroundColor).toHaveBeenCalled();

		await syncToolbarBadge([changed], "2026-01-06T00:00:00Z");
		expect(setBadgeText).toHaveBeenLastCalledWith({ text: "" });
	});

	it("does not count an archived Favorite even when it has an unseen change", () => {
		const activeChanged = makeFavorite("u1", {
			status: "open",
			kuota: 5,
			pelamar: 4,
			lastChecked: "2026-01-05T12:00:00Z",
			previousSample: {
				at: "2026-01-01T00:00:00Z",
				status: "open",
				kuota: 5,
				pelamar: 2,
			},
			changedAt: "2026-01-05T12:00:00Z",
		});
		const archived = {
			...activeChanged,
			uuid: "u-archived",
			archivedAt: "2026-01-09T00:00:00Z",
		};
		// Same change that would count for an active Favorite, but archived.
		expect(countsAsUnseenChange(archived, "2026-01-04T00:00:00Z")).toBe(false);
		expect(
			countUnseenChanges([activeChanged, archived], "2026-01-04T00:00:00Z"),
		).toBe(1);
	});
});
