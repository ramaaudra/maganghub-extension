import { test, expect } from './fixtures';
import { openPopup } from './pages/popup';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LIST_URL = 'https://maganghub.kemnaker.go.id/magang-nasional/lowongan';

const fixtureHtml = () =>
  readFileSync(path.join(process.cwd(), 'test/fixtures/lowongan-list.html'), 'utf8');

// Serve the recorded MagangHub list fixture for the real MagangHub URL, so the
// content script's real `matches` still auto-injects (no extra permissions, no
// live network/Cloudflare). Deterministic — this is the e2e seam from issue #1.
async function serveFixture(page: import('@playwright/test').Page): Promise<void> {
  await page.route('https://maganghub.kemnaker.go.id/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: fixtureHtml(),
    }),
  );
}

test('stars inject into every Lowongan card', async ({ page }) => {
  await serveFixture(page);
  await page.goto(LIST_URL);

  const cards = page.locator('.mh-lowongan-card');
  await expect(cards).toHaveCount(3);

  // A star host is injected into each card. The star button itself lives in a
  // closed Shadow DOM (not piercable), but the host is in the light DOM.
  const starHosts = page.locator('.mh-lowongan-card .mh-favorite-host');
  await expect(starHosts).toHaveCount(3);
  await expect(starHosts.first()).toHaveAttribute('data-filled', 'false');
});

test('clicking a star toggles it, persists, and does not navigate', async ({ page }) => {
  await serveFixture(page);
  await page.goto(LIST_URL);

  const firstHost = page.locator('.mh-lowongan-card .mh-favorite-host').first();
  await expect(firstHost).toHaveAttribute('data-filled', 'false');

  await firstHost.click();

  // The card is wrapped in an <a>; the star must not navigate to the detail page.
  expect(page.url()).toContain('/magang-nasional/lowongan');
  await expect(firstHost).toHaveAttribute('data-filled', 'true');
});

test('a starred Lowongan appears in the popup with title, Penyelenggara, and location', async ({
  page,
  context,
  extensionId,
}) => {
  await serveFixture(page);
  await page.goto(LIST_URL);

  await page.locator('.mh-lowongan-card .mh-favorite-host').first().click();
  await expect(page.locator('.mh-lowongan-card .mh-favorite-host').first()).toHaveAttribute(
    'data-filled',
    'true',
  );

  const popup = await openPopup(context, extensionId);
  await expect(popup.locator('main')).toBeVisible();
  await expect(popup.getByText('Magang Data Analyst')).toBeVisible();
  await expect(popup.getByText('PT Maju Bersama')).toBeVisible();
  await expect(popup.getByText('Jakarta, DKI Jakarta')).toBeVisible();
});

test('the popup shows an empty state when there are no favorites', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByText('Belum ada favorit')).toBeVisible();
});
test('a favorited Lowongan shows filled on reload (state read from storage on inject)', async ({
  page,
}) => {
  await serveFixture(page);
  await page.goto(LIST_URL);

  const firstHost = page.locator('.mh-lowongan-card .mh-favorite-host').first();
  await expect(firstHost).toHaveAttribute('data-filled', 'false');
  await firstHost.click();
  await expect(firstHost).toHaveAttribute('data-filled', 'true');

  // Reload: the star must read persisted state on inject and render filled.
  await page.reload();
  await expect(page.locator('.mh-lowongan-card .mh-favorite-host').first()).toHaveAttribute(
    'data-filled',
    'true',
  );
});
