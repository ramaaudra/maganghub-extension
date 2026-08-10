import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());

async function readOrEmpty(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return "";
	}
}

describe("SakuMagang Route brand mark", () => {
	it("keeps the paper/blue palette and a balanced 15-unit inset", async () => {
		const svg = await readOrEmpty(resolve(root, "src/public/icon/route.svg"));

		expect(svg).toContain('viewBox="0 0 100 100"');
		expect(svg).toContain('fill="#f4f3ed"');
		expect(svg).toContain('stroke="#0069a8"');
		expect(svg).toContain(
			'<rect x="15" y="15" width="18" height="18"',
		);
		expect(svg).toContain(
			'<rect x="67" y="67" width="18" height="18"',
		);
	});

	it("uses the canonical Route asset in the icon renderer and popup header", async () => {
		const renderer = await readOrEmpty(resolve(root, "scripts/render-icon.mjs"));
		const app = await readOrEmpty(resolve(root, "src/entrypoints/popup/App.svelte"));

		expect(renderer).toContain("src/public/icon/route.svg");
		expect(renderer).toContain("route.svg");
		expect(app).toContain('src="/icon/route.svg"');
		expect(app).toContain("data-brand-icon");
	});
});
