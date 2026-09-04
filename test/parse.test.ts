import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NotALowonganError, parseDetailHtml } from "@/lib/parse";

const readFixture = (name: string) =>
	readFileSync(path.join(process.cwd(), "test/fixtures", name), "utf8");

const openHtml = () => readFixture("lowongan-detail-open.html");
const kuotaFullHtml = () => readFixture("lowongan-detail-kuota-full.html");

describe("parseDetailHtml", () => {
	it("parses a detail page: quota is not full + Kuota/Pelamar/Batch/Tunjangan", () => {
		const parsed = parseDetailHtml(openHtml());
		expect(parsed.status).toBe("belum_penuh");
		expect(parsed.kuota).toBe(50);
		expect(parsed.pelamar).toBe(12);
		expect(parsed.batch).toBe("Batch 1 · 2026");
		expect(parsed.tunjangan).toBe("Dari Pemerintah");
	});

	it("reports penuh when Pelamar reaches Kuota, even without an apply button", () => {
		// The registration window, not the button, determines whether a user can
		// submit. The quota signal only describes Pelamar versus Kuota.
		const parsed = parseDetailHtml(kuotaFullHtml());
		expect(parsed.status).toBe("penuh");
		expect(parsed.kuota).toBe(50);
		expect(parsed.pelamar).toBe(150);
	});

	it("reports belum_penuh while Pelamar is below Kuota, even at 90%", () => {
		const html = `<main>
      <h1>Magang Backend</h1>
      <span class="mh-badge">Batch 1 · 2026</span>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Kuota</span>
        <span class="font-semibold">50 orang</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Pelamar</span>
        <span class="font-semibold">45 orang</span>
      </div>
      <button>Lamar Sekarang</button>
    </main>`;
		const parsed = parseDetailHtml(html);
		expect(parsed.status).toBe("belum_penuh");
		expect(parsed.kuota).toBe(50);
		expect(parsed.pelamar).toBe(45);
	});

	it("treats Pelamar at exactly 80% as belum_penuh", () => {
		const html = `<main>
      <h1>Magang Backend</h1>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Kuota</span>
        <span class="font-semibold">50 orang</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Pelamar</span>
        <span class="font-semibold">40 orang</span>
      </div>
      <button>Lamar Sekarang</button>
    </main>`;
		expect(parseDetailHtml(html).status).toBe("belum_penuh");
	});

	it("reports belum_penuh just below the quota", () => {
		const html = `<main>
      <h1>Magang Backend</h1>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Kuota</span>
        <span class="font-semibold">50 orang</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Pelamar</span>
        <span class="font-semibold">39 orang</span>
      </div>
      <button>Lamar Sekarang</button>
    </main>`;
		expect(parseDetailHtml(html).status).toBe("belum_penuh");
	});

	it("parses Indonesian thousands separators (1.234 orang → 1234)", () => {
		const html = `<main>
      <h1>Magang Populer</h1>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Kuota</span>
        <span class="font-semibold">1.500 orang</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Pelamar</span>
        <span class="font-semibold">1.234 orang</span>
      </div>
      <button>Lamar Sekarang</button>
    </main>`;
		const parsed = parseDetailHtml(html);
		expect(parsed.kuota).toBe(1500);
		expect(parsed.pelamar).toBe(1234);
		// 1234 is below the quota, so the quota is not full.
		expect(parsed.status).toBe("belum_penuh");
	});

	it("reports unknown when Pelamar is absent", () => {
		const html = `<main>
      <h1>Magang Backend</h1>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Kuota</span>
        <span class="font-semibold">50 orang</span>
      </div>
      <button>Lamar Sekarang</button>
    </main>`;
		const parsed = parseDetailHtml(html);
		expect(parsed.status).toBe("unknown");
		expect(parsed.kuota).toBe(50);
		expect(parsed.pelamar).toBeUndefined();
	});

	it("reports unknown when Pelamar is unavailable, regardless of the apply button", () => {
		const html = `<main>
      <h1>Magang Backend</h1>
      <span class="mh-badge">Batch 1 · 2026</span>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Kuota</span>
        <span class="font-semibold">50 orang</span>
      </div>
      <div class="rounded-md bg-muted p-2 text-center">Batch Ditutup</div>
    </main>`;
		expect(parseDetailHtml(html).status).toBe("unknown");
	});

	it("normalizes interior whitespace in values when markup is line-wrapped", () => {
		// Real markup wraps unpredictably: a prettified/minified page, a different
		// viewport, or an SSR hydration comment can split a value across lines. The
		// parser must collapse interior whitespace, not just trim the ends —
		// otherwise `batch` comes back as "Batch 1\n·\n2026".
		const html = `<main>
      <h1>
        Magang Data Analyst
      </h1>
      <span
        class="mh-badge"
        >Batch 1<!-- -->
        ·
        <!-- -->2026</span
      >
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Kuota</span>
        <span class="font-semibold"
          >50<!-- -->
          orang</span
        >
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Tunjangan</span>
        <span class="font-semibold text-primary"
          >Dari Pemerintah</span
        >
      </div>
      <button class="bg-primary text-white">
        Lamar Sekarang<!-- -->
        <svg></svg>
      </button>
    </main>`;
		const parsed = parseDetailHtml(html);
		expect(parsed.status).toBe("unknown");
		expect(parsed.kuota).toBe(50);
		expect(parsed.batch).toBe("Batch 1 · 2026");
		expect(parsed.tunjangan).toBe("Dari Pemerintah");
	});

	it("matches a line-wrapped Kuota label with surrounding whitespace", () => {
		// The label side needs the same normalization as the value side, otherwise
		// the info-row map is keyed by "kuota\n" and every lookup misses.
		const html = `<main>
      <h1>Magang Backend</h1>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">
          Kuota
        </span>
        <span class="font-semibold">50 orang</span>
      </div>
      <button>Lamar Sekarang</button>
    </main>`;
		expect(parseDetailHtml(html).kuota).toBe(50);
	});

	it("throws NotALowonganError for a Cloudflare challenge / non-Lowongan page", () => {
		const challenge = `<!doctype html><html><head><title>Just a moment...</title></head>
      <body><div id="challenge-form"><h2>Checking your browser</h2></div></body></html>`;
		expect(() => parseDetailHtml(challenge)).toThrow(NotALowonganError);
	});

	it("throws for an empty page", () => {
		expect(() => parseDetailHtml("<html><body></body></html>")).toThrow(
			NotALowonganError,
		);
	});
});
