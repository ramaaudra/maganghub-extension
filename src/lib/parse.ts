import type { StatusLowongan } from "./types";

/**
 * Pure refresh parser (ADR-0003). Turns a MagangHub Lowongan detail-page HTML
 * string into the fields that drive Status Lowongan — no browser, no network.
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
 * Batch is a `<span class="mh-badge">Batch 1 · 2026</span>`, and "Lamar Sekarang"
 * is a `<button>` (its presence is the open signal; ADR-0006).
 */

/** Result of parsing a detail page (no lastChecked — the caller stamps that). */
export interface ParsedDetail {
  status: StatusLowongan;
  kuota?: number;
  pelamar?: number;
  batch?: string;
  tunjangan?: string;
}

/** Thrown when the HTML doesn't look like a Lowongan detail page at all —
 *  e.g. a Cloudflare challenge or an empty 200. The caller treats this as a
 *  failed refresh (`status: "unknown"`), distinct from a real "closed" page. */
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

const LAMAR_SEKARANG = "Lamar Sekarang";
/** Pelamar ≥ this fraction of Kuota → Filling (issue #1 taxonomy). */
const FILLING_THRESHOLD = 0.8;

/** Parse the first count out of a value string like "5 orang", "120 orang",
 *  or "1.234 orang". Indonesian uses '.' as a thousands separator (not a
 *  decimal point) and Lowongan counts are whole numbers of people, so we
 *  strip every non-digit character and parse the rest as an integer — never a
 *  float. Returns undefined when there are no digits. */
function parseCount(value: string): number | undefined {
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : undefined;
}

function textOf(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? "";
}

/** True if any button or link's trimmed text contains "Lamar Sekarang". */
function hasLamarSekarang(doc: Document): boolean {
  return [...doc.querySelectorAll("button, a")].some((el) =>
    (el.textContent ?? "").trim().includes(LAMAR_SEKARANG),
  );
}

/** Build a label → value map from the detail page's info rows. */
function readInfoRows(doc: Document): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of doc.querySelectorAll<HTMLElement>(INFO_ROW_SELECTOR)) {
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
 *  or a Batch badge — otherwise it's a challenge/empty page, not "closed". */
function looksLikeLowonganPage(
  doc: Document,
  info: Map<string, string>,
  batch: string | undefined,
): boolean {
  return (
    !!doc.querySelector("h1") ||
    info.size > 0 ||
    batch !== undefined
  );
}

/**
 * Parse a detail page's HTML into a {@link ParsedDetail}.
 *
 * Rules (issue #1 taxonomy, confirmed via camofox — ADR-0006):
 *  - `open`  : "Lamar Sekarang" present.
 *  - `filling`: "Lamar Sekarang" present AND Pelamar ≥ 80% of Kuota (both
 *    numbers must parse). Pelamar IS exposed on the detail page, so this is
 *    reliable whenever both numbers are available.
 *  - `closed`: the page is a recognisable Lowongan page but "Lamar Sekarang"
 *    is absent (listing removed-but-rendered, Kuota full, or Batch closed all
 *    surface this way). A 404 is handled by the caller as `closed` too.
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

  const lamarPresent = hasLamarSekarang(doc);

  let status: StatusLowongan;
  if (lamarPresent) {
    if (
      kuota !== undefined &&
      pelamar !== undefined &&
      kuota > 0 &&
      pelamar >= kuota * FILLING_THRESHOLD
    ) {
      status = "filling";
    } else {
      status = "open";
    }
  } else {
    // Recognisable Lowongan page with no apply button → closed (kuota full /
    // batch closed / listing removed-but-rendered). A hard 404 is closed too.
    status = "closed";
  }

  const result: ParsedDetail = { status };
  if (kuota !== undefined) result.kuota = kuota;
  if (pelamar !== undefined) result.pelamar = pelamar;
  if (batch) result.batch = batch;
  if (tunjangan) result.tunjangan = tunjangan;
  return result;
}