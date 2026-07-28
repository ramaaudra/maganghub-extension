import {
	FIRST_DETAIL_URL as DETAIL_URL,
	FIRST_UUID,
	expect,
	LIST_URL,
	serveFixture,
	test,
} from "./fixtures";
import { openCard, openPopup } from "./pages/popup";

// DETAIL_URL (imported as FIRST_DETAIL_URL from the shared fixtures) uses the
// same UUID as the first card in lowongan-list.html, so favoriting on the list
// and visiting this detail page exercise the same Favorite record (issue #3).

// `chrome` exists in the extension page context where `popup.evaluate` runs;
// declare a minimal shape so the evaluate bodies typecheck without @types/chrome.
declare const chrome: {
	storage: { local: { get(keys: null): Promise<Record<string, unknown>> } };
};

test("stars inject into every Lowongan card", async ({ page }) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const cards = page.locator(".mh-lowongan-card");
	await expect(cards).toHaveCount(3);

	// A star host is injected into each card. The star button itself lives in a
	// closed Shadow DOM (not piercable), but the host is in the light DOM.
	const starHosts = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(starHosts).toHaveCount(3);
	await expect(starHosts.first()).toHaveAttribute("data-filled", "false");
});

test("clicking a star toggles it, persists, and does not navigate", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const firstHost = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await expect(firstHost).toHaveAttribute("data-filled", "false");

	await firstHost.click();

	// The card is wrapped in an <a>; the star must not navigate to the detail page.
	expect(page.url()).toContain("/magang-nasional/lowongan");
	await expect(firstHost).toHaveAttribute("data-filled", "true");
});

test("a starred Lowongan appears in the popup with title, Penyelenggara, and location", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	await expect(popup.locator("main")).toBeVisible();
	await expect(popup.getByText("Magang Data Analyst")).toBeVisible();
	await expect(popup.getByText("PT Maju Bersama")).toBeVisible();
	await expect(popup.getByText("Jakarta, DKI Jakarta")).toBeVisible();
});

test("the popup shows an empty state when there are no favorites", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText("Belum ada favorit")).toBeVisible();
});
test("a favorited Lowongan shows filled on reload (state read from storage on inject)", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);

	const firstHost = page.locator(".mh-lowongan-card .mh-favorite-host").first();
	await expect(firstHost).toHaveAttribute("data-filled", "false");
	await firstHost.click();
	await expect(firstHost).toHaveAttribute("data-filled", "true");

	// Reload: the star must read persisted state on inject and render filled.
	await page.reload();
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "true");
});

test("a favorite toggle is injected into the share cluster on a Lowongan detail page", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	await expect(page.locator("h1")).toHaveText("Magang Data Analyst");

	const detailHost = page.locator(".mh-favorite-detail-host");
	await expect(detailHost).toHaveCount(1);
	await expect(detailHost).toHaveAttribute("data-filled", "false");

	// It mounts beside "Bagikan", as the cluster's second child — not next to
	// the title, where it used to split the title block (issue #10).
	const cluster = page.locator('div:has(> button[aria-label="Bagikan"])');
	await expect(cluster.locator("> .mh-favorite-detail-host")).toHaveCount(1);
});

test("no toggle is injected when the share cluster is gone, and health degrades", async ({
	page,
	context,
	extensionId,
}) => {
	// There is deliberately no fallback placement (issue #10): a fallback path
	// that never runs in practice is an unverified safety claim. The user is told
	// instead, via the health banner #8 already built.
	await serveFixture(page, { detailFixture: "lowongan-detail-altered.html" });
	await page.goto(DETAIL_URL);

	await expect(page.locator("h1")).toHaveText("Magang Data Analyst");
	await expect(page.locator(".mh-favorite-detail-host")).toHaveCount(0);

	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText(/butuh update/i)).toBeVisible();
});

test("Lowongan Serupa cards on the detail page get stars too", async ({
	page,
}) => {
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	// Same `.mh-lowongan-card` markup as the list page, so it stars the same way
	// — a card that looks identical but behaves differently would teach the user
	// the star can't be relied on (issue #10).
	const serupaStars = page.locator(".mh-lowongan-card .mh-favorite-host");
	await expect(serupaStars).toHaveCount(2);
	await expect(serupaStars.first()).toHaveAttribute("data-filled", "false");

	await serupaStars.first().click();
	await expect(serupaStars.first()).toHaveAttribute("data-filled", "true");
	// Starring a similar-Lowongan card must not navigate away.
	expect(page.url()).toContain("magang-data-analyst");
});

test("the detail toggle reflects a Lowongan already favorited from the list (state sync via storage)", async ({
	page,
}) => {
	await serveFixture(page);

	// Favorite from the list first.
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "true");

	// Same UUID's detail page must read the same Favorite record as filled.
	await page.goto(DETAIL_URL);
	await expect(page.locator(".mh-favorite-detail-host")).toHaveAttribute(
		"data-filled",
		"true",
	);
});

test("clicking the detail toggle unfavorites the same record the list star reads", async ({
	page,
}) => {
	await serveFixture(page);

	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "true");

	await page.goto(DETAIL_URL);
	const detailHost = page.locator(".mh-favorite-detail-host");
	await expect(detailHost).toHaveAttribute("data-filled", "true");

	// Toggle off from the detail page.
	await detailHost.click();
	await expect(detailHost).toHaveAttribute("data-filled", "false");

	// The list star reads the same (now cleared) Favorite record on next load.
	await page.goto(LIST_URL);
	await expect(
		page.locator(".mh-lowongan-card .mh-favorite-host").first(),
	).toHaveAttribute("data-filled", "false");
});

test("favoriting from the detail page persists a snapshot the popup can render", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	const detailHost = page.locator(".mh-favorite-detail-host");
	await expect(detailHost).toHaveAttribute("data-filled", "false");
	await detailHost.click();
	await expect(detailHost).toHaveAttribute("data-filled", "true");

	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText("Magang Data Analyst")).toBeVisible();
	await expect(popup.getByText("PT Maju Bersama")).toBeVisible();
	// Location comes from the sidebar's info rows, in a different subtree from
	// the title — the whole reason extraction takes two scopes (issue #10).
	await expect(popup.getByText("Jakarta, DKI Jakarta")).toBeVisible();

	// Assert the stored record directly: the popup renders only some fields, so
	// a green render is not evidence the snapshot is populated. Before #10 every
	// field but the title came back empty, and the snapshot is immutable
	// (ADR-0002) — a wrong one never heals.
	const snapshot = await popup.evaluate(async () => {
		const all = await chrome.storage.local.get(null);
		const key = Object.keys(all).find((k) => k.startsWith("fav:"));
		return key
			? (all[key] as { savedSnapshot: Record<string, string | undefined> })
					.savedSnapshot
			: null;
	});
	expect(snapshot).toMatchObject({
		title: "Magang Data Analyst",
		organizer: "PT Maju Bersama",
		location: "Jakarta, DKI Jakarta",
		kuota: "50 orang",
		pelamar: "12 orang",
		// Scoped to the header block: the page's FIRST <img> is a call-centre
		// icon, which a document-wide lookup would have persisted as the logo.
		logoUrl: "https://maganghub.kemnaker.go.id/logos/pt-maju.png",
	});
});

test("the stage card mounts as the last sidebar child only after the Lowongan is saved", async ({
	page,
}) => {
	// Issue #20: the Status Lamar card lives at the sidebar tail (away from
	// "Alur Lamaran") and only renders for a saved Favorite. Attribution copy
	// is in the closed shadow, so e2e observes the light-DOM host + select.
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	const stageHost = page.locator(".mh-stage-card-host");
	await expect(stageHost).toHaveCount(1);
	// Host is present (idempotency marker is set) but hidden until favorited.
	await expect(stageHost).toHaveAttribute("data-visible", "false");
	await expect(stageHost).toBeHidden();

	// Last child of the sidebar that holds "Alur Lamaran" — furthest from it.
	const sidebar = page.locator("div.space-y-5:has(h3:text-is('Alur Lamaran'))");
	await expect(sidebar.locator("> .mh-stage-card-host")).toHaveCount(1);
	const lastChildIsStage = await sidebar.evaluate((el) => {
		const last = el.lastElementChild;
		return last?.classList.contains("mh-stage-card-host") ?? false;
	});
	expect(lastChildIsStage).toBe(true);

	// Favoriting reveals the card. Attribution rides on the host (closed shadow
	// keeps the visual copy isolated from MagangHub's CSS — ADR-0004).
	await page.locator(".mh-favorite-detail-host").click();
	await expect(stageHost).toHaveAttribute("data-visible", "true");
	await expect(stageHost).toBeVisible();
	await expect(stageHost).toHaveAttribute(
		"data-stage-title",
		"Lamaranku · catatan pribadi",
	);
	await expect(stageHost).toHaveAttribute(
		"aria-label",
		/Bukan fitur MagangHub/i,
	);
	await expect(stageHost.getByLabel("Status Lamar")).toHaveValue("");
});

test("setting a stage on the detail card persists and syncs to the popup", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	// Save first so the stage card becomes interactive.
	await page.locator(".mh-favorite-detail-host").click();
	const stageSelect = page.locator(".mh-stage-card-host").getByLabel("Status Lamar");
	await expect(stageSelect).toBeVisible();
	await stageSelect.selectOption("interview");
	await expect(stageSelect).toHaveValue("interview");

	// Popup reads the same Favorite record.
	const popup = await openPopup(context, extensionId);
	const card = await openCard(popup, FIRST_UUID);
	await expect(card.getByLabel("Status Lamar")).toHaveValue("interview");
	await expect(
		card.locator("span").filter({ hasText: "Interview" }),
	).toBeVisible();
});

test("picking a stage on an unsaved Lowongan saves it first", async ({
	page,
	context,
	extensionId,
}) => {
	// The card is hidden while unsaved, but the select still lives in the light
	// DOM. Forcing a stage via evaluate exercises the save-first path the
	// change handler owns (issue #20 AC: a stage never exists without a Favorite).
	await serveFixture(page);
	await page.goto(DETAIL_URL);

	const detailHost = page.locator(".mh-favorite-detail-host");
	await expect(detailHost).toHaveAttribute("data-filled", "false");

	await page.locator(".mh-stage-card-host select").evaluate((el) => {
		const select = el as HTMLSelectElement;
		select.value = "dilamar";
		select.dispatchEvent(new Event("change", { bubbles: true }));
	});

	// Favorite was created and the stage applied.
	await expect(detailHost).toHaveAttribute("data-filled", "true");
	const stageHost = page.locator(".mh-stage-card-host");
	await expect(stageHost).toHaveAttribute("data-visible", "true");
	await expect(stageHost.getByLabel("Status Lamar")).toHaveValue("dilamar");

	const popup = await openPopup(context, extensionId);
	const card = await openCard(popup, FIRST_UUID);
	await expect(card.getByLabel("Status Lamar")).toHaveValue("dilamar");
	await expect(popup.getByText("Magang Data Analyst")).toBeVisible();
});

test("missing stage sidebar reports degraded and stages stay settable in the popup", async ({
	page,
	context,
	extensionId,
}) => {
	// D4: all-miss → no injection + degraded. The popup is the safety net.
	await serveFixture(page, {
		detailFixture: "lowongan-detail-no-stage-sidebar.html",
	});
	await page.goto(DETAIL_URL);

	await expect(page.locator("h1")).toHaveText("Magang Data Analyst");
	// Share cluster still works — only the stage mount is gone.
	await expect(page.locator(".mh-favorite-detail-host")).toHaveCount(1);
	await expect(page.locator(".mh-stage-card-host")).toHaveCount(0);

	// Favorite via the share-cluster toggle, then set the stage in the popup.
	await page.locator(".mh-favorite-detail-host").click();
	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText(/butuh update/i)).toBeVisible();
	const card = await openCard(popup, FIRST_UUID);
	await card.getByLabel("Status Lamar").selectOption("ditolak");
	await expect(card.getByLabel("Status Lamar")).toHaveValue("ditolak");
	await expect(
		card.locator("span").filter({ hasText: "Ditolak" }),
	).toBeVisible();
});

test("editing Catatan and toggling Status Lamar persists across popup reopen", async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();

	let popup = await openPopup(context, extensionId);
	const uuid = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
	const card = await openCard(popup, uuid);

	await card
		.getByPlaceholder("Kenapa lowongan ini?")
		.fill("alasan aku simpan ini");
	await card.getByPlaceholder("Kenapa lowongan ini?").blur();
	await expect(card.getByText("Tersimpan")).toBeVisible();

	// Status Lamar is a stage selector (v4). Default is "Belum dilamar" (no stage);
	// set it to Dilamar and confirm the chip appears before closing.
	const statusLamarSelect = card.getByLabel("Status Lamar");
	await expect(statusLamarSelect).toHaveValue("");
	await statusLamarSelect.selectOption("dilamar");
	await expect(statusLamarSelect).toHaveValue("dilamar");
	// The stage chip is a <span>; the <option> "Dilamar" is not a span, so this
	// targets the chip only (not the select's options).
	await expect(
		card.locator("span").filter({ hasText: "Dilamar" }),
	).toBeVisible();
	await popup.close();

	// Reopen: both must have persisted to storage.
	popup = await openPopup(context, extensionId);
	const reopenedCard = await openCard(popup, uuid);
	await expect(
		reopenedCard.getByPlaceholder("Kenapa lowongan ini?"),
	).toHaveValue("alasan aku simpan ini");
	await expect(reopenedCard.getByLabel("Status Lamar")).toHaveValue("dilamar");
	await expect(
		reopenedCard.locator("span").filter({ hasText: "Dilamar" }),
	).toBeVisible();

	// Clearing the stage back to "no stage" also persists (no stage is a real
	// default, not just the initial state).
	await reopenedCard.getByLabel("Status Lamar").selectOption("");
	await popup.close();

	popup = await openPopup(context, extensionId);
	const clearedCard = await openCard(popup, uuid);
	await expect(clearedCard.getByLabel("Status Lamar")).toHaveValue("");
	// No stage → no chip.
	await expect(
		clearedCard.locator("span").filter({ hasText: "Dilamar" }),
	).toHaveCount(0);
});
