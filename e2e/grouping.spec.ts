import { expect, test } from "./fixtures";
import { openPopup } from "./pages/popup";

/**
 * Issue #22 (C4): collapsible per-Penyelenggara grouping.
 *
 * A Penyelenggara with more than 3 Favorites collapses into a group with a
 * stage-summary header; at or below 3, cards stand alone. The summary counts
 * reflect the active search, not the whole storage set. Seeding Favorites
 * directly into extension storage (not star clicks) keeps the test about the
 * grouping, which is what the AC is about — prior art: `search-sort.spec.ts`.
 *
 * The grouping composes AFTER search + sort, so the popup's sort key still
 * orders favorites within a group (here left at the default newest-saved).
 */

/** Build a v4 Favorite record for storage seeding. */
function record(
	uuid: string,
	over: { title: string; organizer: string; stage?: string; savedAt: string },
): Record<string, unknown> {
	return {
		schemaVersion: 4,
		uuid,
		detailUrl: `/magang-nasional/lowongan/${over.title.toLowerCase().replace(/\s+/g, "-")}-${uuid}`,
		savedSnapshot: {
			title: over.title,
			organizer: over.organizer,
			location: "Jakarta",
			capturedAt: "2026-01-01T00:00:00Z",
		},
		catatan: "",
		statusLamar: over.stage,
		liveStatus: { status: "unknown", lastChecked: null },
		savedAt: over.savedAt,
	};
}

async function seed(
	page: import("@playwright/test").Page,
	records: Record<string, unknown>,
) {
	await page.evaluate(async (r) => {
		const api = (
			globalThis as unknown as {
				chrome: { storage: { local: { set(r: unknown): Promise<void> } } };
			}
		).chrome;
		await api.storage.local.set(r);
	}, records);
}

/** Titles of rendered Favorite cards, in display order. */
function renderedTitles(popup: import("@playwright/test").Page) {
	return popup.locator("[data-favorite-uuid] [data-favorite-title]");
}

// A Penyelenggara with 5 Favorites (3 aktif, 1 interview, 1 ditolak) and a
// second Penyelenggara with 2 (both aktif). Titles: the four non-ditolak
// Banyak favorites share "Alpha", the ditolak one is "Beta" — so an "Alpha"
// search narrows the group to 4 and drops the ditolak favorite, letting us
// assert the summary follows the filter.
const B = {
	b1: "11111111-1111-4111-8111-111111111111",
	b2: "22222222-2222-4222-8222-222222222222",
	b3: "33333333-3333-4333-8333-333333333333",
	b4: "44444444-4444-4444-8444-444444444444",
	b5: "55555555-5555-4555-8555-555555555555",
	s1: "66666666-6666-4666-8666-666666666666",
	s2: "77777777-7777-4777-8777-777777777777",
};

function bigSeed(): Record<string, unknown> {
	return {
		[`fav:${B.b1}`]: record(B.b1, {
			title: "Alpha Satu",
			organizer: "PT Banyak Sekali",
			stage: "dilamar",
			savedAt: "2026-01-01T00:00:00Z",
		}),
		[`fav:${B.b2}`]: record(B.b2, {
			title: "Alpha Dua",
			organizer: "PT Banyak Sekali",
			savedAt: "2026-01-02T00:00:00Z",
		}),
		[`fav:${B.b3}`]: record(B.b3, {
			title: "Alpha Tiga",
			organizer: "PT Banyak Sekali",
			stage: "interview",
			savedAt: "2026-01-03T00:00:00Z",
		}),
		[`fav:${B.b4}`]: record(B.b4, {
			title: "Alpha Empat",
			organizer: "PT Banyak Sekali",
			savedAt: "2026-01-04T00:00:00Z",
		}),
		[`fav:${B.b5}`]: record(B.b5, {
			title: "Beta Lima",
			organizer: "PT Banyak Sekali",
			stage: "ditolak",
			savedAt: "2026-01-05T00:00:00Z",
		}),
		[`fav:${B.s1}`]: record(B.s1, {
			title: "Sedikit Satu",
			organizer: "PT Sedikit",
			savedAt: "2026-01-06T00:00:00Z",
		}),
		[`fav:${B.s2}`]: record(B.s2, {
			title: "Sedikit Dua",
			organizer: "PT Sedikit",
			savedAt: "2026-01-07T00:00:00Z",
		}),
	};
}

test("a Penyelenggara with more than 3 Favorites collapses into a group with a stage-summary header", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await seed(popup, bigSeed());
	await expect(renderedTitles(popup)).toHaveCount(7, { timeout: 10_000 });

	// PT Banyak Sekali (5) → one group header; PT Sedikit (2) → no header.
	const groupHeader = popup.locator(
		'[data-group-organizer="PT Banyak Sekali"] [data-group-toggle]',
	);
	await expect(groupHeader).toBeVisible();
	expect(await popup.locator("[data-group-organizer]").count()).toBe(1);

	// Summary: 3 aktif (b1 dilamar, b2 none, b4 none), 1 interview (b3), 1 ditolak (b5).
	await expect(
		popup.locator(
			'[data-group-organizer="PT Banyak Sekali"] [data-group-summary]',
		),
	).toHaveText("3 aktif, 1 interview, 1 ditolak");

	// Default expanded: all 5 group favorites render, plus 2 solos = 7.
	await expect(renderedTitles(popup)).toHaveCount(7);

	// The two PT Sedikit cards stand alone (no group header wraps them).
	await expect(
		popup.locator(`[data-favorite-uuid="${B.s1}"]`).getByText("PT Sedikit"),
	).toBeVisible();
});

test("the group expands and collapses on demand", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await seed(popup, bigSeed());
	await expect(renderedTitles(popup)).toHaveCount(7, { timeout: 10_000 });

	const toggle = popup.locator(
		'[data-group-organizer="PT Banyak Sekali"] [data-group-toggle]',
	);
	// Starts expanded.
	await expect(toggle).toHaveAttribute("aria-expanded", "true");

	// Collapse — the 5 grouped cards hide, only the 2 solos remain.
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-expanded", "false");
	await expect(renderedTitles(popup)).toHaveCount(2);
	await expect(popup.locator(`[data-favorite-uuid="${B.b1}"]`)).toHaveCount(0);

	// Expand — the 5 grouped cards come back.
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-expanded", "true");
	await expect(renderedTitles(popup)).toHaveCount(7);
});

test("the group summary reflects the active search, not the whole storage set", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await seed(popup, bigSeed());
	await expect(renderedTitles(popup)).toHaveCount(7, { timeout: 10_000 });

	// Full list: group summary includes the ditolak favorite (b5 "Beta Lima").
	await expect(
		popup.locator(
			'[data-group-organizer="PT Banyak Sekali"] [data-group-summary]',
		),
	).toHaveText("3 aktif, 1 interview, 1 ditolak");

	// Narrow to the four "Alpha" titles — b5 ("Beta Lima") drops out. The group
	// stays (4 > 3) but its summary now reads "3 aktif, 1 interview" — the
	// counts follow the filtered list, never the whole storage set.
	await popup.getByPlaceholder("Cari favorit...").fill("alpha");
	await expect(renderedTitles(popup)).toHaveCount(4);
	await expect(
		popup.locator(
			'[data-group-organizer="PT Banyak Sekali"] [data-group-summary]',
		),
	).toHaveText("3 aktif, 1 interview");
});

test("a Penyelenggara reduced to ≤3 by a search stops grouping (cards stand alone)", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await seed(popup, bigSeed());
	await expect(renderedTitles(popup)).toHaveCount(7, { timeout: 10_000 });

	// "Beta" matches only b5 (the ditolak one) — 1 favorite from PT Banyak
	// Sekali, so no group header renders and the card stands alone.
	await popup.getByPlaceholder("Cari favorit...").fill("beta");
	await expect(renderedTitles(popup)).toHaveText(["Beta Lima"]);
	await expect(popup.locator("[data-group-organizer]")).toHaveCount(0);
});

test("a Penyelenggara with exactly 3 Favorites shows no group (threshold is strictly >3)", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	const T = {
		t1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		t2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		t3: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
	};
	await seed(popup, {
		[`fav:${T.t1}`]: record(T.t1, {
			title: "Tiga Satu",
			organizer: "PT Tiga",
			savedAt: "2026-01-01T00:00:00Z",
		}),
		[`fav:${T.t2}`]: record(T.t2, {
			title: "Tiga Dua",
			organizer: "PT Tiga",
			savedAt: "2026-01-02T00:00:00Z",
		}),
		[`fav:${T.t3}`]: record(T.t3, {
			title: "Tiga Tiga",
			organizer: "PT Tiga",
			savedAt: "2026-01-03T00:00:00Z",
		}),
	});
	await expect(renderedTitles(popup)).toHaveCount(3, { timeout: 10_000 });

	// Exactly 3 → no group, three solo cards.
	await expect(popup.locator("[data-group-organizer]")).toHaveCount(0);
	await expect(renderedTitles(popup)).toHaveText([
		"Tiga Tiga",
		"Tiga Dua",
		"Tiga Satu",
	]);
});

test("the sort still applies within a group (newest-saved first by default)", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await seed(popup, bigSeed());
	await expect(renderedTitles(popup)).toHaveCount(7, { timeout: 10_000 });

	// Default sort is newest-saved first. The two PT Sedikit solos (s2 Jan7,
	// s1 Jan6) are newest, then the PT Banyak group in savedAt order: b5 (5th),
	// b4 (4th), b3 (3rd), b2 (2nd), b1 (1st).
	await expect(renderedTitles(popup)).toHaveText([
		"Sedikit Dua",
		"Sedikit Satu",
		"Beta Lima",
		"Alpha Empat",
		"Alpha Tiga",
		"Alpha Dua",
		"Alpha Satu",
	]);
});
