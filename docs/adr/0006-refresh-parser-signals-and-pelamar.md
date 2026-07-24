# Refresh parser signals & the Pelamar question (resolved)

Refreshing a Favorite's Status Lowongan fetches the public detail-page HTML and parses it (ADR-0003) inside an MV3 offscreen document (ADR-0005). This ADR records the concrete DOM signals the parser keys off, confirmed against the live MagangHub detail page via camofox (docs/agents/camofox-browser.md), and resolves the open question from issue #1 / #5: **whether Pelamar is obtainable on the detail page**, which determines whether `Filling` is reliable or merely best-effort.

## Confirmed detail-page structure (recorded via camofox)

The detail page renders its key facts as label/value info rows:

```html
<div class="flex items-center justify-between text-sm">
  <span class="text-muted-foreground">Kuota</span>
  <span class="font-semibold">5 orang</span>
</div>
```

…with rows for `Durasi Magang`, `Lokasi Magang`, `Kuota`, `Pelamar`, and `Tunjangan`. Batch is a badge: `<span class="mh-badge">Batch 1 · 2026</span>`. The apply action is a `<button>Lamar Sekarang</button>`. The values contain Next.js RSC text-splitting comments (`5<!-- --> orang`) which `textContent` collapses to `5 orang`, so the parser reads `textContent` and pulls the leading integer.

## Parser rules (`src/lib/parse.ts`)

- **open** — "Lamar Sekarang" button present.
- **filling** — "Lamar Sekarang" present AND Pelamar ≥ 80% of Kuota (both numbers must parse). Reliable whenever both numbers are available (they are — see below).
- **closed** — the page is recognisably a Lowongan page (has an `<h1>`, info rows, or a Batch badge) but "Lamar Sekarang" is absent. A hard HTTP 404/410 is also `closed` (handled at the fetch layer). This single signal covers Kuota full, Batch closed, and listing-removed-but-rendered, because all three surface as the apply button being gone.
- **unknown** — the page isn't a Lowongan page at all (e.g. a Cloudflare challenge, an empty 200). The parser throws `NotALowonganError`; the caller records `unknown` and preserves the last-known `liveStatus` (no data loss).

## The Pelamar question — resolved

**Pelamar IS obtainable on the detail page.** The live detail page exposes a `Pelamar` info row with the current applicant count (e.g. "1 orang"). `Filling` (Pelamar ≥ ~80% of Kuota) is therefore **reliable whenever both numbers parse**, not merely best-effort as the MVP spec hedged. The parser computes it directly; the only case `Filling` is unavailable is when the page stops exposing Pelamar or Kuota (a markup change), in which case the status falls back to `open`/`closed` and the breakage is surfaced as a parse failure → `unknown`, never silent.

## Trade-off

Parsing HTML couples the extension to MagangHub's markup (ADR-0003 already accepts this). The signals here are the least-fragile anchors available: semantic-ish class names (`mh-badge`), stable label text (`Kuota`, `Pelamar`, `Lamar Sekarang`), and structural row layout. If MagangHub redesigns, the fallback is "refresh gagal" + the last-known snapshot/liveStatus (no data loss), and the health surface in the popup tells the user the extension needs an update — never silent breakage.
