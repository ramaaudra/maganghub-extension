import { describe, expect, it } from "vitest";
import { isAllCaps, titleCase } from "../src/lib/titlecase";

describe("isAllCaps", () => {
	it("is true for a fully uppercase phrase", () => {
		expect(isAllCaps("PERAWAT KESEHATAN")).toBe(true);
	});

	it("is false when any lowercase letter is present", () => {
		expect(isAllCaps("Perawat Kesehatan")).toBe(false);
		expect(isAllCaps("PERAWAT Kesehatan")).toBe(false);
	});

	it("is false for strings with no cased letters at all", () => {
		// A digits/punctuation-only string has nothing to repair; treating it as
		// "all caps" would send it through the token caser for no reason.
		expect(isAllCaps("2026")).toBe(false);
		expect(isAllCaps("---")).toBe(false);
		expect(isAllCaps("")).toBe(false);
	});

	it("ignores digits and punctuation when judging case", () => {
		expect(isAllCaps("BATCH 2 - 2026")).toBe(true);
	});
});

describe("titleCase", () => {
	it("title-cases the screaming titles MagangHub actually publishes", () => {
		expect(titleCase("PERAWAT KESEHATAN")).toBe("Perawat Kesehatan");
		expect(titleCase("NUTRISIONIS")).toBe("Nutrisionis");
		expect(titleCase("RUMAH TAHANAN NEGARA KELAS I")).toBe(
			"Rumah Tahanan Negara Kelas I",
		);
	});

	it("leaves already-cased strings completely alone", () => {
		// The repair targets shouting, not case normalization in general. A title
		// the author cased themselves is their call.
		expect(titleCase("Magang Data Analyst")).toBe("Magang Data Analyst");
		expect(titleCase("Magang UI/UX Designer")).toBe("Magang UI/UX Designer");
		expect(titleCase("iOS Developer")).toBe("iOS Developer");
	});

	it("keeps domain acronyms uppercase", () => {
		expect(titleCase("PT MAJU BERSAMA")).toBe("PT Maju Bersama");
		expect(titleCase("RSUD DR SOETOMO")).toBe("RSUD Dr Soetomo");
		expect(titleCase("UPT PELAYANAN TERPADU")).toBe("UPT Pelayanan Terpadu");
		expect(titleCase("STAF IT SUPPORT")).toBe("Staf IT Support");
	});

	it("keeps acronyms uppercase inside parentheses", () => {
		expect(titleCase("PT PLN (PERSERO)")).toBe("PT PLN (Persero)");
	});

	it("lowercases Indonesian particles except in first position", () => {
		expect(titleCase("DINAS KESEHATAN DAN SOSIAL")).toBe(
			"Dinas Kesehatan dan Sosial",
		);
		expect(titleCase("DAN LAIN LAIN")).toBe("Dan Lain Lain");
		expect(titleCase("ASISTEN DI LABORATORIUM")).toBe(
			"Asisten di Laboratorium",
		);
	});

	it("keeps roman numerals uppercase", () => {
		expect(titleCase("LAPAS KELAS IIA")).toBe("Lapas Kelas IIA");
		expect(titleCase("KANTOR WILAYAH XIV")).toBe("Kantor Wilayah XIV");
	});

	it("leaves tokens containing digits untouched", () => {
		expect(titleCase("MAGANG BATCH 2 TAHUN 2026")).toBe(
			"Magang Batch 2 Tahun 2026",
		);
		expect(titleCase("LULUSAN S1 TEKNIK")).toBe("Lulusan S1 Teknik");
	});

	it("cases both sides of a hyphen or slash", () => {
		expect(titleCase("ADMIN GUDANG-LOGISTIK")).toBe("Admin Gudang-Logistik");
		expect(titleCase("DESAINER UI/UX")).toBe("Desainer UI/UX");
	});

	it("preserves the original whitespace runs", () => {
		// The snapshot is captured off page markup; a double space or newline in
		// the source must not be silently collapsed by a display helper.
		expect(titleCase("PERAWAT  KESEHATAN")).toBe("Perawat  Kesehatan");
		expect(titleCase("PERAWAT\nKESEHATAN")).toBe("Perawat\nKesehatan");
	});

	it("returns empty and punctuation-only input unchanged", () => {
		expect(titleCase("")).toBe("");
		expect(titleCase("—")).toBe("—");
	});
});
