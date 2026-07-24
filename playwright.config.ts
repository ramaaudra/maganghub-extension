import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "e2e",
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	// The extension loads in a single persistent context per test.
	workers: 1,
	reporter: process.env.CI ? "list" : "list",
	use: {
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
