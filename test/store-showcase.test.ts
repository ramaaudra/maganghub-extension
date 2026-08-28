import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const showcasePath = resolve("store-assets/sakumagang-showcase.html");

async function readShowcase(): Promise<string> {
	return readFile(showcasePath, "utf8");
}

describe("Chrome Web Store showcase", () => {
	it("provides five 1280x800 screenshot scenes in one standalone HTML file", async () => {
		const html = await readShowcase();

		expect(html.match(/data-scene="[1-5]"/g)).toHaveLength(5);
		expect(html).toContain("--canvas-width: 1280px");
		expect(html).toContain("--canvas-height: 800px");
		expect(html).not.toMatch(/<link\b[^>]*rel=["']stylesheet["']/i);
		expect(html).not.toMatch(/<(?:img|script)\b[^>]*src=["']https?:\/\//i);
	});

	it("faithfully includes every shipped user-facing surface", async () => {
		const html = await readShowcase();

		expect(html).toContain('class="browser-window');
		expect(html).toContain('class="list-star');
		expect(html).toContain('class="popup-shell');
		expect(html).toContain('class="stage-card');
		expect(html).toContain("SakuMagang");
		expect(html).toContain("Status Lamar");
		expect(html).toContain("Status Lowongan");
		expect(html).toContain("Buka di MagangHub");
	});

	it("uses the recorded MagangHub fixture content and production wording", async () => {
		const html = await readShowcase();

		expect(html).toContain("Magang Data Analyst");
		expect(html).toContain("PT Maju Bersama");
		expect(html).toContain("Magang Software Engineer");
		expect(html).toContain("Kementerian Komunikasi dan Informatika");
		expect(html).toContain("Magang UI/UX Designer");
		expect(html).toContain("PT Kreatif Nusantara");
		expect(html).toContain("sisa 4 kursi · 1 dari 5");
		expect(html).toContain("sisa 1 kursi · 4 dari 5");
		expect(html).toContain("penuh · 40 dari 2");
		expect(html).toContain("Bukan fitur MagangHub. Disimpan di browser kamu.");
	});

	it("uses factual local-first claims and canonical brand tokens", async () => {
		const html = await readShowcase();

		expect(html).toContain("#0069a8");
		expect(html).toContain("#f4f3ed");
		expect(html).toContain("tanpa akun, tanpa server, tanpa telemetri");
		expect(html).not.toMatch(
			/editor.?s choice|nomor satu|#1(?:\s|<)|rating|pengguna aktif/i,
		);
	});

	it("supports choosing a scene from the query string and keyboard", async () => {
		const html = await readShowcase();

		expect(html).toContain("new URLSearchParams(window.location.search)");
		expect(html).toContain('addEventListener("keydown"');
		expect(html).toContain('aria-label="Pilih tampilan screenshot"');
	});
});
