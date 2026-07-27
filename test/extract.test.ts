import { describe, expect, it } from "vitest";
import {
	extractDetailSnapshot,
	extractDetailUrl,
	extractSnapshot,
	extractUuidFromHref,
	findDetailHeader,
	findShareCluster,
	findStageSidebar,
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

	/**
	 * The live card, structure-for-structure (2026-07-25 recon). Every hazard the
	 * retune exists for is present here on purpose:
	 *  - no `mh-lowongan-*` field classes (they never existed on the real page);
	 *  - the Penyelenggara `<p>` is followed by a muted `<p>` holding the study
	 *    program, so a naive "first muted p" would pick the wrong one;
	 *  - the location span is identified only by its lucide icon, and sits beside
	 *    two structurally identical spans;
	 *  - Kuota/Pelamar are Badge pills sharing markup with the Hari Libur days;
	 *  - `<!-- -->` hydration markers split each label from its number.
	 */
	const LIVE_CARD = `<div class="rounded-xl border bg-card mh-lowongan-card overflow-hidden h-full flex flex-col">
    <div class="p-5 flex flex-col h-full">
      <div class="flex items-start gap-4 h-full">
        <div class="w-12 h-12 rounded-lg shrink-0 overflow-hidden">
          <img alt="Organizer logo" loading="lazy" class="w-full h-full object-contain" src="https://example.com/logo.png" />
        </div>
        <div class="flex-1 min-w-0 h-full flex flex-col">
          <div>
            <h3 class="font-semibold text-base leading-snug">Fisikawan Medis</h3>
            <p class="text-sm font-medium text-foreground">Rumah Sakit Umum Pusat Dr. Kariadi Semarang</p>
            <p class="text-sm text-muted-foreground truncate">Fisika</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
              <span class="flex items-center gap-1.5"><svg class="lucide lucide-map-pin w-3.5 h-3.5"></svg>Kota Semarang</span>
            </div>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span class="flex items-center gap-1.5"><svg class="lucide lucide-graduation-cap w-3.5 h-3.5"></svg><span>Profesi</span></span>
              <span class="flex items-center gap-1.5"><svg class="lucide lucide-calendar w-3.5 h-3.5"></svg>5<!-- --> hari/minggu</span>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <div class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold border-transparent bg-secondary text-secondary-foreground text-xs">Kuota: <!-- -->5</div>
            <div class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold border-transparent bg-secondary text-secondary-foreground text-xs">Pelamar: <!-- -->0</div>
          </div>
          <div class="mt-auto pt-4">
            <hr class="mb-4" />
            <p class="text-xs font-semibold text-foreground mb-2">Hari Libur</p>
            <div class="flex flex-wrap gap-1.5">
              <div class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold text-foreground text-xs bg-white">Sabtu</div>
              <div class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold text-foreground text-xs bg-white">Minggu</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

	it("captures title, organizer, location, kuota, pelamar, and logo from a live card", () => {
		const snap = extractSnapshot(buildCard(LIVE_CARD));
		expect(snap.title).toBe("Fisikawan Medis");
		expect(snap.organizer).toBe("Rumah Sakit Umum Pusat Dr. Kariadi Semarang");
		expect(snap.location).toBe("Kota Semarang");
		expect(snap.kuota).toBe("Kuota: 5");
		expect(snap.pelamar).toBe("Pelamar: 0");
		expect(snap.logoUrl).toBe("https://example.com/logo.png");
		expect(typeof snap.capturedAt).toBe("string");
	});

	it("reads the Penyelenggara, not the study program that follows it", () => {
		// Both are <p> inside the same block; the muted one is the study program.
		// On the DETAIL page `p.text-muted-foreground` IS the organizer, so the
		// same class means opposite things on the two surfaces.
		const snap = extractSnapshot(buildCard(LIVE_CARD));
		expect(snap.organizer).not.toBe("Fisika");
	});

	it("picks the location span by its icon, not by position among its siblings", () => {
		// The education-level and working-days spans are structurally identical to
		// the location span and sit right after it.
		const snap = extractSnapshot(buildCard(LIVE_CARD));
		expect(snap.location).toBe("Kota Semarang");
		expect(snap.location).not.toContain("Profesi");
		expect(snap.location).not.toContain("hari/minggu");
	});

	it("does not mistake a Hari Libur pill for Kuota or Pelamar", () => {
		// Same component, same shape, no label — they must not be picked up.
		const snap = extractSnapshot(buildCard(LIVE_CARD));
		expect(snap.kuota).not.toContain("Sabtu");
		expect(snap.pelamar).not.toContain("Minggu");
	});

	it("survives the Next.js hydration marker splitting a label from its number", () => {
		// textContent drops <!-- -->, but the value still arrives with whatever
		// whitespace the server emitted around it.
		const snap = extractSnapshot(buildCard(LIVE_CARD));
		expect(snap.kuota).toBe("Kuota: 5");
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

	it("still captures what it can when MagangHub renames its utility classes", () => {
		// The retuned selectors are layered so a restyle degrades field-by-field
		// rather than all at once: the h3/img anchors and the lucide icon are
		// independent of the Tailwind classes around them.
		const card = buildCard(`<div class="card-v2">
      <img src="https://example.com/logo.png" alt="logo" />
      <h3>Magang Data Analyst</h3>
      <p class="org-v2">PT Maju Bersama</p>
      <span class="loc-v2"><svg class="lucide lucide-map-pin"></svg>Jakarta, DKI Jakarta</span>
    </div>`);
		const snap = extractSnapshot(card);
		expect(snap.title).toBe("Magang Data Analyst");
		expect(snap.organizer).toBe("PT Maju Bersama");
		expect(snap.location).toBe("Jakarta, DKI Jakarta");
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

describe("findStageSidebar", () => {
	const buildPage = (html: string): Document =>
		new DOMParser().parseFromString(html, "text/html");

	it("finds the sidebar via the Alur Lamaran heading (layer 1)", () => {
		const doc = buildPage(`
			<div class="space-y-5 order-1 lg:order-2">
				<div class="bg-white border rounded-2xl p-6">
					<h3>Alur Lamaran</h3>
					<ol><li>Submit Lamaran</li></ol>
				</div>
				<div class="bg-white border rounded-2xl p-5">
					<button type="button">Lamar Sekarang</button>
				</div>
			</div>`);
		const sidebar = findStageSidebar(doc);
		expect(sidebar?.className).toContain("space-y-5");
		expect(sidebar?.querySelector("h3")?.textContent).toBe("Alur Lamaran");
	});

	it("falls back to the Lamar Sekarang button when Alur Lamaran is absent (layer 2)", () => {
		// The recorded fixture today has the CTA but not yet the Alur Lamaran
		// card — layer 2 is what makes the stage card mount on that page.
		const doc = buildPage(`
			<div class="space-y-5 order-1 lg:order-2">
				<div class="bg-white border rounded-2xl p-5">
					<button type="button">Lamar Sekarang</button>
				</div>
			</div>`);
		const sidebar = findStageSidebar(doc);
		expect(sidebar?.className).toContain("space-y-5");
		expect(sidebar?.querySelector("button")?.textContent?.trim()).toBe(
			"Lamar Sekarang",
		);
	});

	it("falls back to the Penyelenggara a.block.group when CTA and heading both miss (layer 3)", () => {
		const doc = buildPage(`
			<div class="space-y-5 order-1 lg:order-2">
				<a class="block group" href="/magang-nasional/penyelenggara/pt-maju">
					<p>PT Maju Bersama</p>
				</a>
			</div>`);
		const sidebar = findStageSidebar(doc);
		expect(sidebar?.className).toContain("space-y-5");
		expect(sidebar?.querySelector("a.block.group")).not.toBeNull();
	});

	it("ignores Lowongan Serupa card links that share the group/block utilities", () => {
		// Serupa cards are `a.group.block.h-full` wrapping `.mh-lowongan-card`.
		// Without this guard, layer 3 would mount the stage card into the grid.
		const doc = buildPage(`
			<div class="grid gap-4">
				<a class="group block h-full" href="/magang-nasional/lowongan/x-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d">
					<div class="mh-lowongan-card"><h3>Magang UI Designer</h3></div>
				</a>
			</div>`);
		expect(findStageSidebar(doc)).toBeNull();
	});

	it("returns null when no layer matches (caller injects nothing, health degrades)", () => {
		const doc = buildPage(`
			<div class="flex-1"><h1>Magang Data Analyst</h1></div>
			<div class="flex gap-2 self-start"><button aria-label="Bagikan"></button></div>`);
		expect(findStageSidebar(doc)).toBeNull();
	});

	it("does not treat a non-sidebar space-y-5 as the mount point via a stray heading", () => {
		// A main-column section that happens to use space-y-5 must not steal the
		// mount when the real sidebar is findable via the CTA.
		const doc = buildPage(`
			<div class="lg:col-span-2 space-y-5">
				<section><h3>Deskripsi</h3></section>
			</div>
			<div class="space-y-5 order-1 lg:order-2" data-sidebar>
				<button type="button">Lamar Sekarang</button>
			</div>`);
		const sidebar = findStageSidebar(doc);
		expect(sidebar?.hasAttribute("data-sidebar")).toBe(true);
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
