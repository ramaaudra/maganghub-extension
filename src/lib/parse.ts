import { statusKuotaFromCounts, type StatusKuota } from "./types";

/**
 * Pure refresh parser (ADR-0003). Turns a MagangHub Lowongan detail-page HTML
 * string into the fields that drive Status Kuota — no browser, no network.
 * Unit-tested against fixture fragments; called from the offscreen document
 * (ADR-0005) on the fetched HTML.
 *
 * Selectors are CONFIRMED against the live detail page via camofox (see
 * docs/agents/camofox-browser.md and ADR-0006). The detail page renders info
 * rows as:
 *   <div class="flex items-center justify-between text-sm">
 *     <span class="text-muted-foreground">Kuota</span>
 *     <span class="font-semibold">5 orang</span>
 *   </div>
 * Batch is a `<span class="mh-badge">Batch 1 · 2026</span>`. The presence of
 * an apply button is intentionally not used: registration follows the global
 * Kemnaker registration window, while the card only reports quota pressure.
 */

/** Result of parsing a detail page (no lastChecked — the caller stamps that). */
export interface ParsedDetail {
	status: StatusKuota;
	kuota?: number;
	pelamar?: number;
	batch?: string;
	tunjangan?: string;
}

/** Thrown when the HTML doesn't look like a Lowongan detail page at all —
 *  e.g. a Cloudflare challenge or an empty 200. The caller treats this as a
 *  failed refresh (`status: "unknown"`). */
export class NotALowonganError extends Error {
	constructor(message = "not a Lowongan detail page") {
		super(message);
		this.name = "NotALowonganError";
	}
}

/** Selector matching every label/value info row on the detail page. */
const INFO_ROW_SELECTOR = ".flex.items-center.justify-between.text-sm";
/** Label span inside an info row. */
const LABEL_SELECTOR = ".text-muted-foreground";
/** Value span inside an info row. */
const VALUE_SELECTOR = ".font-semibold";
/** Batch badge (text starts with "Batch"). */
const BATCH_BADGE_SELECTOR = ".mh-badge";

/** Pelamar ≥ this fraction of Kuota → tighter visual emphasis in the seat line.
 * This is presentation-only; it is not a Status Kuota and never means that
 * registration is closed. */
export const NEAR_FULL_THRESHOLD = 0.8;

/** Parse the first count out of a value string like "5 orang", "120 orang",
 *  "1.234 orang", or a card badge "Kuota: 5". Indonesian uses '.' as a
 *  thousands separator (not a decimal point) and Lowongan counts are whole
 *  numbers of people, so we strip every non-digit character and parse the rest
 *  as an integer — never a float. Returns undefined when there are no digits.
 *
 *  Exported so the list-card urgency band (issue #16) can turn badge text into
 *  the same numbers the refresh parser produces from detail-page info rows. */
export function parseCount(value: string): number | undefined {
	const digits = value.replace(/[^0-9]/g, "");
	if (!digits) return undefined;
	const n = Number.parseInt(digits, 10);
	return Number.isFinite(n) ? n : undefined;
}

/** Read an element's text with *interior* whitespace collapsed to single
 *  spaces, not merely trimmed at the ends.
 *
 *  The detail page is server-rendered with hydration comments (`<!-- -->`) and
 *  wraps lines at arbitrary points, so a single logical value routinely arrives
 *  as `"Batch 1\n        ·\n        2026"`. Comparing or map-keying that raw
 *  text fails for reasons that have nothing to do with the page's meaning, so
 *  every label and value goes through here first. */
function textOf(el: Element | null | undefined): string {
	return normalizeWhitespace(el?.textContent ?? "");
}

/** Collapse all whitespace runs (newlines, tabs, non-breaking spaces) to a
 *  single space and trim. `\s` covers U+00A0 in JS regex, which matters because
 *  the page uses `&nbsp;` in places.
 *
 *  Exported for the same reason `readInfoRows` is: the list card has the same
 *  hazard as the detail page — a Next.js `<!-- -->` marker splits "Kuota: " from
 *  "5", and lines wrap at arbitrary points — so the snapshot extractor must
 *  normalize text the identical way the refresh parser does. */
export function normalizeWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Build a label → value map from the detail page's info rows.
 *
 * Exported and typed on `ParentNode` so the live-DOM snapshot extractor can
 * read the same rows this parser does (issue #10). Refresh runs against a
 * `DOMParser` document, snapshotting runs against the live page — but both are
 * reading the same rows off the same page, and two independent readers would
 * eventually disagree with only one of them getting fixed.
 *
 * Keys are lowercased so callers can match labels case-insensitively.
 */
export function readInfoRows(root: ParentNode): Map<string, string> {
	const map = new Map<string, string>();
	for (const row of root.querySelectorAll<HTMLElement>(INFO_ROW_SELECTOR)) {
		const label = textOf(row.querySelector(LABEL_SELECTOR));
		const value = textOf(row.querySelector(VALUE_SELECTOR));
		if (label) map.set(label.toLowerCase(), value);
	}
	return map;
}

function readBatch(doc: Document): string | undefined {
	for (const badge of doc.querySelectorAll(BATCH_BADGE_SELECTOR)) {
		const text = textOf(badge);
		if (/batch/i.test(text)) return text;
	}
	return undefined;
}

/** A page is recognisably a Lowongan detail page if it has a title, info rows,
 *  or a Batch badge — otherwise it's a challenge/empty page. */
function looksLikeLowonganPage(
	doc: Document,
	info: Map<string, string>,
	batch: string | undefined,
): boolean {
	return !!doc.querySelector("h1") || info.size > 0 || batch !== undefined;
}

/**
 * Parse a detail page's HTML into a {@link ParsedDetail}.
 *
 * Rules (Status Kuota):
 *  - `belum_penuh`: Pelamar is below Kuota.
 *  - `penuh`: Pelamar is equal to or above Kuota. The apply button does not
 *    override this: registration remains possible during the registration
 *    window and selection happens afterward.
 *  - `unknown`: Kuota or Pelamar is unavailable.
 *  - throws {@link NotALowonganError} for a non-Lowongan page (challenge/empty)
 *    → caller records `unknown` (refresh failed), preserving the last-known
 *    liveStatus.
 */
export function parseDetailHtml(html: string): ParsedDetail {
	const doc = new DOMParser().parseFromString(html, "text/html");
	const info = readInfoRows(doc);
	const batch = readBatch(doc);

	if (!looksLikeLowonganPage(doc, info, batch)) {
		throw new NotALowonganError();
	}

	const kuota = parseCount(info.get("kuota") ?? "");
	const pelamar = parseCount(info.get("pelamar") ?? "");
	const tunjangan = info.get("tunjangan") || undefined;

	const status = statusKuotaFromCounts(kuota, pelamar);

	const result: ParsedDetail = { status };
	if (kuota !== undefined) result.kuota = kuota;
	if (pelamar !== undefined) result.pelamar = pelamar;
	if (batch) result.batch = batch;
	if (tunjangan) result.tunjangan = tunjangan;
	return result;
}
