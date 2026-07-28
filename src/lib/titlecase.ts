/**
 * Title-case repair for SCREAMING SNAPSHOT TITLES.
 *
 * MagangHub publishes many Lowongan titles and Penyelenggara names in full
 * caps ("PERAWAT KESEHATAN", "RUMAH TAHANAN NEGARA KELAS I"). All-caps runs
 * read measurably slower — the word-shape cue is gone and every glyph has the
 * same box — and in a 360px popup they also wrap to two or three lines where a
 * sentence-cased title takes one. That cost is paid on every card, so it is
 * worth a display-time repair.
 *
 * Display-time only. `savedSnapshot` stays byte-identical to what the page
 * showed (ADR-0002: the snapshot is immutable), and `searchFavorites` keeps
 * matching the raw string — it lowercases both sides already. This module is
 * a pure view function: same input, same output, no storage, no dates.
 *
 * Deliberately conservative:
 *   - Only strings that are *entirely* uppercase are touched. A title that
 *     already has mixed case is the author's choice and is returned as-is.
 *   - Known acronyms (PT, CV, RSUD, UPT, …) stay upper.
 *   - Indonesian particles (dan, di, ke, dari, …) go lower, except in first
 *     position, where they start the phrase.
 *   - Roman numerals (I, II, IIA, XIV) stay upper — "KELAS I" must not become
 *     "Kelas i".
 *   - Anything with a digit is left alone ("2026", "S1", "D3").
 */

/**
 * Tokens that are acronyms or initialisms in this domain and must stay
 * uppercase. Sourced from what actually appears on MagangHub: legal entity
 * forms, ministries, hospital/prison/office prefixes, and education levels.
 */
const ACRONYMS: ReadonlySet<string> = new Set([
	// Legal entity forms
	"PT",
	"CV",
	"UD",
	"PD",
	"NV",
	"TBK",
	// Government / institutional prefixes
	"RI",
	"RSUD",
	"RSU",
	"RSUP",
	"RSJ",
	"RS",
	"UPT",
	"UPTD",
	"BPJS",
	"BUMN",
	"BUMD",
	"KPP",
	"KPPN",
	"BPS",
	"BKD",
	"BKN",
	"LPP",
	"LKPP",
	"PN",
	"PA",
	"KUA",
	"SMK",
	"SMA",
	"SMP",
	"SD",
	"MTS",
	"MAN",
	"MIN",
	"PAUD",
	"TK",
	// State-owned enterprises and agencies that appear as Penyelenggara
	"PLN",
	"KAI",
	"BRI",
	"BNI",
	"BTN",
	"BCA",
	"PDAM",
	"POS",
	"LKBN",
	"LIPI",
	"BRIN",
	"BMKG",
	"BNPB",
	"BPOM",
	"KPK",
	"OJK",
	"PPATK",
	// Domain / technical
	"IT",
	"HR",
	"HRD",
	"K3",
	"QC",
	"QA",
	"UI",
	"UX",
	"API",
	"SDM",
	"TI",
	"TIK",
	"GA",
	"CS",
	"SEO",
	"CSR",
	"PPIC",
	"SOP",
	"ISO",
	// Education levels
	"S1",
	"S2",
	"S3",
	"D1",
	"D2",
	"D3",
	"D4",
]);

/**
 * Indonesian function words that stay lowercase inside a title (never in
 * first position). Kept short and unambiguous — a word that could also be a
 * content word in a job title is left out.
 */
const PARTICLES: ReadonlySet<string> = new Set([
	"dan",
	"atau",
	"di",
	"ke",
	"dari",
	"pada",
	"untuk",
	"yang",
	"dengan",
	"serta",
	"the",
	"of",
	"and",
	"for",
	"in",
	"at",
]);

/**
 * Roman numerals as they appear in institutional names — "KELAS I",
 * "KELAS IIA", "WILAYAH XIV". Restricted to I/V/X (1–39, plus an A/B class
 * suffix) rather than the full I/V/X/L/C/D/M alphabet on purpose: a permissive
 * numeral pattern also matches ordinary Indonesian words. "DI" is a
 * well-formed roman 501, so `[IVXLCDM]+` classified the preposition *di* as a
 * numeral and shouted it back as "DI". Institutional classes do not reach L,
 * so dropping L/C/D/M costs nothing and removes the whole collision class.
 */
const ROMAN_NUMERAL = /^X{0,3}(IX|IV|V?I{0,3})[AB]?$/;

/**
 * True when `value` reads as SHOUTED: it has at least one cased letter and no
 * lowercase letter anywhere. Digits, punctuation and spaces are ignored, so
 * "RUMAH TAHANAN NEGARA KELAS I" qualifies and "Magang Data Analyst" does not.
 */
export function isAllCaps(value: string): boolean {
	if (!/\p{Lu}/u.test(value)) return false;
	return !/\p{Ll}/u.test(value);
}

/**
 * Case one whitespace-free token, given whether it opens the string.
 *
 * Order matters: acronym and roman-numeral checks run before the particle
 * check so "DI" as a province abbreviation is not silently downcased by the
 * "di" preposition rule — neither set contains it, so it falls through to the
 * capitalize branch, which is the safe middle.
 */
function caseToken(token: string, isFirst: boolean): string {
	// Split leading/trailing punctuation so "(PERSERO)" and "KELAS," still match
	// against the sets by their bare word.
	const match = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(token);
	if (!match) return token;
	const [, lead, word, trail] = match;
	if (!word) return token;

	const upper = word.toUpperCase();

	// Anything containing a digit is left exactly as it came: "2026", "S1",
	// "KELAS-2" carry no case information worth rewriting.
	if (/\p{N}/u.test(word)) return `${lead}${word}${trail}`;

	let cased: string;
	if (ACRONYMS.has(upper)) {
		cased = upper;
	} else if (ROMAN_NUMERAL.test(upper)) {
		cased = upper;
	} else if (!isFirst && PARTICLES.has(upper.toLowerCase())) {
		cased = upper.toLowerCase();
	} else {
		// Handle interior hyphens/slashes as sub-word boundaries so
		// "SUKA-SUKA" → "Suka-Suka" and "UI/UX" keeps both sides.
		cased = upper
			.toLowerCase()
			.split(/([-/])/)
			.map((part) => {
				if (part === "-" || part === "/") return part;
				const partUpper = part.toUpperCase();
				if (ACRONYMS.has(partUpper)) return partUpper;
				return part.charAt(0).toUpperCase() + part.slice(1);
			})
			.join("");
	}

	return `${lead}${cased}${trail}`;
}

/**
 * Convert an all-caps string to Title Case. Any string that is not entirely
 * uppercase is returned unchanged — this repairs shouting, it does not
 * normalize case generally.
 *
 * ```
 * titleCase("PERAWAT KESEHATAN")            // "Perawat Kesehatan"
 * titleCase("RUMAH TAHANAN NEGARA KELAS I") // "Rumah Tahanan Negara Kelas I"
 * titleCase("PT PLN (PERSERO)")             // "PT PLN (PERSERO)" → "PT PLN (Persero)"
 * titleCase("Magang Data Analyst")          // unchanged
 * ```
 */
export function titleCase(value: string): string {
	if (!isAllCaps(value)) return value;
	// Preserve the original whitespace runs — splitting on /(\s+)/ keeps the
	// separators as array members, so a double space or newline survives.
	let seenWord = false;
	return value
		.split(/(\s+)/)
		.map((token) => {
			if (!token || /^\s+$/.test(token)) return token;
			const cased = caseToken(token, !seenWord);
			if (/\p{L}/u.test(token)) seenWord = true;
			return cased;
		})
		.join("");
}
