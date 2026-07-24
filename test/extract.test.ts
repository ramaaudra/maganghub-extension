import { describe, it, expect } from "vitest";
import {
	extractUuidFromHref,
	extractDetailUrl,
	extractSnapshot,
	extractDetailSnapshot,
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

describe("extractDetailSnapshot", () => {
	// The detail page leads with an <h1> title (confirmed via camofox); the rest
	// of the fields reuse the .mh-lowongan-* convention. Built from a fixture
	// fragment the same way the card tests are.
	const buildDetail = (html: string): HTMLElement =>
		new DOMParser().parseFromString(html, "text/html").body
			.firstElementChild as HTMLElement;

	it("captures title from <h1>, organizer, location, kuota, pelamar, and logo from a detail page", () => {
		const main = buildDetail(`<main>
      <img class="mh-lowongan-logo" src="https://example.com/logo.png" alt="logo" />
      <h1>Magang Data Analyst</h1>
      <p class="mh-penyelenggara">PT Maju Bersama</p>
      <p class="mh-lowongan-location">Jakarta, DKI Jakarta</p>
      <span class="mh-lowongan-kuota">Kuota: 50</span>
      <span class="mh-lowongan-pelamar">Pelamar: 120</span>
    </main>`);
		const snap = extractDetailSnapshot(main);
		expect(snap.title).toBe("Magang Data Analyst");
		expect(snap.organizer).toBe("PT Maju Bersama");
		expect(snap.location).toBe("Jakarta, DKI Jakarta");
		expect(snap.kuota).toBe("Kuota: 50");
		expect(snap.pelamar).toBe("Pelamar: 120");
		expect(snap.logoUrl).toBe("https://example.com/logo.png");
		expect(typeof snap.capturedAt).toBe("string");
	});

	it("still stars when detail fields are missing (never throws, empty strings)", () => {
		const main = buildDetail("<main><h1>Magang Data Analyst</h1></main>");
		const snap = extractDetailSnapshot(main);
		expect(snap.title).toBe("Magang Data Analyst");
		expect(snap.organizer).toBe("");
		expect(snap.location).toBe("");
		expect(snap.kuota).toBeUndefined();
		expect(snap.pelamar).toBeUndefined();
		expect(snap.logoUrl).toBeUndefined();
	});
});
