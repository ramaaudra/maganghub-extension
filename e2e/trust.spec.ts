import { test, expect } from "./fixtures";
import { openPopup } from "./pages/popup";
import { readFileSync } from "node:fs";
import path from "node:path";

// Issue #7 e2e: the trust layer — make the credential-free safety story
// visible in the popup, and give each Favorite an "open official detail"
// link so the user applies themselves on the real MagangHub site (never via
// the extension, never via a third-party helper that would ask for the
// SiapKerja password).

const LIST_URL = "https://maganghub.kemnaker.go.id/magang-nasional/lowongan";
const FIRST_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const FIRST_DETAIL_URL =
	"https://maganghub.kemnaker.go.id/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

const readFixture = (name: string) =>
	readFileSync(path.join(process.cwd(), "test/fixtures", name), "utf8");

const listFixtureHtml = () => readFixture("lowongan-list.html");
const detailFixtureHtml = () => readFixture("lowongan-detail.html");

async function serveFixture(
	page: import("@playwright/test").Page,
): Promise<void> {
	await page.route("https://maganghub.kemnaker.go.id/**", (route) => {
		const isDetail = route
			.request()
			.url()
			.includes("/magang-nasional/lowongan/");
		return route.fulfill({
			status: 200,
			contentType: "text/html; charset=utf-8",
			body: isDetail ? detailFixtureHtml() : listFixtureHtml(),
		});
	});
}

test("the popup shows the one-line trust statement", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	// The credential-free promise, in plain Indonesian.
	await expect(
		popup.getByText(/tidak pernah minta password SiapKerja/i),
	).toBeVisible();
});

test("the popup includes a short explainer on why handing SiapKerja credentials to random sites is dangerous", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	const summary = popup.getByText(/Mengapa aman/i);
	await expect(summary).toBeVisible();
	// Expanding reveals the educational body. Scope to the details' body text so
	// we don't also match the one-line trust statement above (which also says
	// "password SiapKerja").
	await summary.click();
	await expect(popup.getByText(/Situs bantuan pihak ketiga/i)).toBeVisible();
});

test('each Favorite has an "open official detail" link to its MagangHub detail page', async ({
	page,
	context,
	extensionId,
}) => {
	await serveFixture(page);
	await page.goto(LIST_URL);
	await page.locator(".mh-lowongan-card .mh-favorite-host").first().click();

	const popup = await openPopup(context, extensionId);
	const card = popup.locator(`[data-favorite-uuid="${FIRST_UUID}"]`);

	// The link is an anchor that opens the real MagangHub detail URL in a new
	// tab (so the user applies themselves on the official site, not via the
	// extension). It carries the Favorite's detailUrl verbatim.
	const link = card.getByRole("link", { name: /Buka di MagangHub/i });
	await expect(link).toBeVisible();
	await expect(link).toHaveAttribute("href", FIRST_DETAIL_URL);
	await expect(link).toHaveAttribute("target", "_blank");
	// `rel` must include noopener (MV3 popups opening new tabs — defense in
	// depth against reverse tabnabbing, and avoids leaking window.opener).
	await expect(link).toHaveAttribute("rel", /noopener/);
});

test("the trust statement is present even with no favorites (empty state)", async ({
	context,
	extensionId,
}) => {
	const popup = await openPopup(context, extensionId);
	await expect(popup.getByText("Belum ada favorit")).toBeVisible();
	await expect(
		popup.getByText(/tidak pernah minta password SiapKerja/i),
	).toBeVisible();
});