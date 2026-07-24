import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDetailHtml, NotALowonganError } from "@/lib/parse";

const readFixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "test/fixtures", name), "utf8");

const openHtml = () => readFixture("lowongan-detail-open.html");
const kuotaFullHtml = () => readFixture("lowongan-detail-kuota-full.html");

describe("parseDetailHtml", () => {
  it("parses an open detail page: open status + Kuota/Pelamar/Batch/Tunjangan", () => {
    const parsed = parseDetailHtml(openHtml());
    expect(parsed.status).toBe("open");
    expect(parsed.kuota).toBe(50);
    expect(parsed.pelamar).toBe(12);
    expect(parsed.batch).toBe("Batch 1 · 2026");
    expect(parsed.tunjangan).toBe("Dari Pemerintah");
  });

  it("reports closed when the Lamar Sekarang button is absent (kuota full)", () => {
    // Pelamar (150) exceeds Kuota (50), but with no apply button the only
    // honest status is closed — Filling never overrides a missing apply button.
    const parsed = parseDetailHtml(kuotaFullHtml());
    expect(parsed.status).toBe("closed");
    expect(parsed.kuota).toBe(50);
    expect(parsed.pelamar).toBe(150);
  });

  it("reports filling when Pelamar >= 80% of Kuota and the apply button is present", () => {
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
    expect(parsed.status).toBe("filling");
    expect(parsed.kuota).toBe(50);
    expect(parsed.pelamar).toBe(45);
  });

  it("treats Pelamar at exactly the 80% threshold as filling", () => {
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
    expect(parseDetailHtml(html).status).toBe("filling");
  });

  it("reports open just below the filling threshold", () => {
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
    expect(parseDetailHtml(html).status).toBe("open");
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
    // 1234 >= 80% of 1500 (1200) → filling.
    expect(parsed.status).toBe("filling");
  });

  it("reports open when Pelamar is absent (open without applicant count)", () => {
    const html = `<main>
      <h1>Magang Backend</h1>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Kuota</span>
        <span class="font-semibold">50 orang</span>
      </div>
      <button>Lamar Sekarang</button>
    </main>`;
    const parsed = parseDetailHtml(html);
    expect(parsed.status).toBe("open");
    expect(parsed.kuota).toBe(50);
    expect(parsed.pelamar).toBeUndefined();
  });

  it("reports closed for a recognisable Lowongan page with no apply button", () => {
    const html = `<main>
      <h1>Magang Backend</h1>
      <span class="mh-badge">Batch 1 · 2026</span>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Kuota</span>
        <span class="font-semibold">50 orang</span>
      </div>
      <div class="rounded-md bg-muted p-2 text-center">Batch Ditutup</div>
    </main>`;
    expect(parseDetailHtml(html).status).toBe("closed");
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