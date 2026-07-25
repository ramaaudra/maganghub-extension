import { describe, expect, it } from "vitest";
import {
	extractDetailSnapshot,
	extractDetailUrl,
	extractSnapshot,
	extractUuidFromHref,
	findDetailHeader,
	findShareCluster,
} from "@/lib/extract";

describe("extractUuidFromHref", () => {
	it("extracts the UUID from a Lowongan detail href", () => {
		expect(
			extractUuidFromHref(
				"/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
			),
		).toBe("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d");
	});

	it("returns null when the href has no UUID", () => {
		expect(
			extractUuidFromHref("/magang-nasional/lowongan/no-uuid-here"),
		).toBeNull();
	});

	it("returns null for null/undefined/empty", () => {
		expect(extractUuidFromHref(null)).toBeNull();
		expect(extractUuidFromHref(undefined)).toBeNull();
		expect(extractUuidFromHref("")).toBeNull();
	});
});

describe("extractDetailUrl", () => {
	it("returns the relative detail path from the anchor href attribute", () => {
		const a = document.createElement("a");
		a.setAttribute(
			"href",
			"/magang-nasional/lowongan/x-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
		);
		expect(extractDetailUrl(a)).toBe(
			"/magang-nasional/lowongan/x-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
		);
	});
});

describe("extractSnapshot", () => {
	// DOMParser builds the fixture from a string without innerHTML/outerHTML.
	const buildCard = (html: string): HTMLElement =>
		new DOMParser().parseFromString(html, "text/html").body
			.firstElementChild as HTMLElement;

	it("captures title, organizer, location, kuota, pelamar, and logo from a card", () => {
		const card = buildCard(`<div>
      <img class="mh-lowongan-logo" src="https://example.com/logo.png" alt="logo" />
      <h3 class="mh-lowongan-title">Magang Data Analyst</h3>
      <p class="mh-penyelenggara">PT Maju Bersama</p>
      <p class="mh-lowongan-location">Jakarta, DKI Jakarta</p>
      <span class="mh-lowongan-kuota">Kuota: 50</span>
      <span class="mh-lowongan-pelamar">Pelamar: 120</span>
    </div>`);
		const snap = extractSnapshot(card);
		expect(snap.title).toBe("Magang Data Analyst");
		expect(snap.organizer).toBe("PT Maju Bersama");
		expect(snap.location).toBe("Jakarta, DKI Jakarta");
		expect(snap.kuota).toBe("Kuota: 50");
		expect(snap.pelamar).toBe("Pelamar: 120");
		expect(snap.logoUrl).toBe("https://example.com/logo.png");
		expect(typeof snap.capturedAt).toBe("string");
	});

	it("returns empty strings (never throws) for a card missing the fields", () => {
		const card = buildCard("<div></div>");
		const snap = extractSnapshot(card);
		expect(snap.title).toBe("");
		expect(snap.organizer).toBe("");
		expect(snap.location).toBe("");
		expect(snap.kuota).toBeUndefined();
		expect(snap.pelamar).toBeUndefined();
		expect(snap.logoUrl).toBeUndefined();
	});
});

describe("findDetailHeader / findShareCluster", () => {
	const buildPage = (html: string): Document =>
		new DOMParser().parseFromString(html, "text/html");

	it("resolves the header block two levels above the h1", () => {
		const doc =
			buildPage(`<div class="flex flex-col sm:flex-row items-start gap-5">
      <div class="w-16 h-16"><img src="https://example.com/logo.png" alt="logo" /></div>
      <div class="flex-1"><h1>Magang Data Analyst</h1><p class="text-muted-foreground">PT Maju Bersama</p></div>
      <div class="flex gap-2 self-start"><button aria-label="Bagikan"></button></div>
    </div>`);
		const header = findDetailHeader(doc);
		expect(header?.className).toContain("items-start");
		expect(header?.querySelector("h1")?.textContent).toBe(
			"Magang Data Analyst",
		);
	});

	it("finds the share cluster via the Bagikan aria-label", () => {
		const doc = buildPage(
			`<div class="whatever"><button aria-label="Bagikan"></button></div>`,
		);
		expect(findShareCluster(doc)?.className).toBe("whatever");
	});

	it("falls back to the cluster's utility classes when the label is renamed", () => {
		const doc = buildPage(
			`<div class="flex gap-2 self-start"><button aria-label="Share"></button></div>`,
		);
		expect(findShareCluster(doc)?.className).toBe("flex gap-2 self-start");
	});

	it("falls back to the lucide share icon when label and classes both change", () => {
		const doc = buildPage(
			`<div class="actions"><button><svg class="lucide lucide-share2"></svg></button></div>`,
		);
		expect(findShareCluster(doc)?.className).toBe("actions");
	});

	it("returns null when no layer matches (caller injects nothing, health degrades)", () => {
		const doc = buildPage(`<div><h1>Magang Data Analyst</h1></div>`);
		expect(findShareCluster(doc)).toBeNull();
	});
});

describe("extractDetailSnapshot", () => {
	// The detail page splits identity (header block) from numbers (sidebar info
	// rows) across disjoint subtrees, so extraction takes both scopes.
	const buildPage = (html: string): Document =>
		new DOMParser().parseFromString(html, "text/html");

	const PAGE = `
    <div class="mh-container py-2"><img src="https://example.com/phone.svg" alt="phone" /></div>
    <div class="flex flex-col sm:flex-row items-start gap-5">
      <div class="w-16 h-16"><img src="https://example.com/logo.png" alt="Organizer logo" /></div>
      <div class="flex-1"><h1>Magang Data Analyst</h1><p class="text-muted-foreground">PT Maju Bersama</p></div>
      <div class="flex gap-2 self-start"><button aria-label="Bagikan"></button></div>
    </div>
    <div class="space-y-4 mb-6">
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Durasi Magang</span><span class="font-semibold">5 hari/minggu</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Lokasi Magang</span><span class="font-semibold">Jakarta, DKI Jakarta</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Kuota</span><span class="font-semibold">50 orang</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Pelamar</span><span class="font-semibold">12 orang</span>
      </div>
    </div>`;

	it("captures title, organizer and logo from the header, and the numbers from the info rows", () => {
		const doc = buildPage(PAGE);
		const snap = extractDetailSnapshot(findDetailHeader(doc), doc);
		expect(snap.title).toBe("Magang Data Analyst");
		expect(snap.organizer).toBe("PT Maju Bersama");
		expect(snap.location).toBe("Jakarta, DKI Jakarta");
		expect(snap.kuota).toBe("50 orang");
		expect(snap.pelamar).toBe("12 orang");
		expect(snap.logoUrl).toBe("https://example.com/logo.png");
		expect(typeof snap.capturedAt).toBe("string");
	});

	it("scopes the logo to the header block, never the first image on the page", () => {
		// The live page's call-centre bar puts an icon before the organizer logo;
		// picking it up would persist the wrong logo forever (the snapshot is
		// immutable — ADR-0002).
		const doc = buildPage(PAGE);
		expect(doc.querySelector("img")?.getAttribute("src")).toBe(
			"https://example.com/phone.svg",
		);
		const snap = extractDetailSnapshot(findDetailHeader(doc), doc);
		expect(snap.logoUrl).toBe("https://example.com/logo.png");
	});

	it("scopes the organizer to the header block when the page has many muted <p>", () => {
		const doc = buildPage(
			`${PAGE}<p class="text-muted-foreground">Gratis - nggak dipungut biaya</p>`,
		);
		const snap = extractDetailSnapshot(findDetailHeader(doc), doc);
		expect(snap.organizer).toBe("PT Maju Bersama");
	});

	it("still stars when the header is missing entirely (never throws)", () => {
		const doc = buildPage("<div></div>");
		const snap = extractDetailSnapshot(null, doc);
		expect(snap.title).toBe("");
		expect(snap.organizer).toBe("");
		expect(snap.location).toBe("");
		expect(snap.kuota).toBeUndefined();
		expect(snap.pelamar).toBeUndefined();
		expect(snap.logoUrl).toBeUndefined();
	});

	it("leaves the numbers undefined when the info rows are absent", () => {
		const doc =
			buildPage(`<div class="flex flex-col sm:flex-row items-start gap-5">
      <div class="w-16 h-16"></div>
      <div class="flex-1"><h1>Magang Data Analyst</h1><p class="text-muted-foreground">PT Maju Bersama</p></div>
    </div>`);
		const snap = extractDetailSnapshot(findDetailHeader(doc), doc);
		expect(snap.title).toBe("Magang Data Analyst");
		expect(snap.organizer).toBe("PT Maju Bersama");
		expect(snap.location).toBe("");
		expect(snap.kuota).toBeUndefined();
		expect(snap.pelamar).toBeUndefined();
	});
});
