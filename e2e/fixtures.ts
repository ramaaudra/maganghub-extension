import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const pathToExtension = path.resolve('.output/chrome-mv3');

/**
 * Playwright fixture that loads the built WXT extension into a fresh Chromium
 * persistent context. Each test gets its own profile dir (so storage starts
 * empty) and its own extensionId.
 *
 * Headless: the e2e environment has no display, so we run headless. Recent
 * Playwright loads MV3 extensions (service workers) in the new headless mode.
 */
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-ext-'));
    const context = await chromium.launchPersistentContext(profileDir, {
      // `channel: 'chromium'` (the bundled Playwright Chromium) is what enables
      // loading MV3 extensions in headless mode — Chrome/Edge dropped the
      // side-load flags. See https://playwright.dev/docs/chrome-extensions
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let background: { url(): string };
    [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    // background.url() looks like chrome-extension://<id>/background.js
    let extensionId: string;
    try {
      extensionId = new URL(background.url()).host;
    } catch {
      throw new Error(`Could not parse extension id from service worker url: ${background.url()}`);
    }
    await use(extensionId);
  },
});

export const expect = test.expect;