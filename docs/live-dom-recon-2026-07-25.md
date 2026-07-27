# Live DOM recon — 2026-07-25

Camofox session against the real MagangHub, run to settle **P1** (does a list
card expose Pelamar?) before designing A1. It answered that and turned up four
things nobody was looking for.

Pages probed:
- `https://maganghub.kemnaker.go.id/magang-nasional/lowongan?keyword=`
- `https://maganghub.kemnaker.go.id/magang-nasional/lowongan/fisikawan-medis-a2438a37-0579-43b8-a13d-471040e230eb`

No login, public pages only (ADR-0001). Server stopped and tab closed after.

---

## 1. P1 answered: (a) — both numbers are on every card

Every one of the 18 cards on page 1 exposes **Kuota and Pelamar**, and both
parse cleanly with `parse.ts`'s `parseCount` rule:

```
coverage: { total: 18, both: 18, kuotaOnly: 0, neither: 0 }
```

**A1 is unblocked and works on every card, saved or not.** No fallback needed.

### But the shape is not what the fixture assumed

Both render as shadcn `Badge` pills, and the count is split from its label by a
Next.js hydration comment:

```html
<div class="inline-flex items-center rounded-full border px-2.5 py-0.5
            font-semibold transition-colors border-transparent
            bg-secondary text-secondary-foreground text-xs">Kuota: <!-- -->5</div>
```

Consequences for A1:

- `textContent` yields `"Kuota: 5"` — the comment vanishes, so `parseCount`
  works unchanged. The existing `normalizeWhitespace` handling in `parse.ts`
  covers the same hazard on the detail page.
- **There is no per-field class.** Kuota, Pelamar, and each Hari Libur day
  (`Sabtu`, `Minggu`) are the *same* `div.rounded-full` component. They differ
  only by their `bg-secondary` vs `bg-white` variant and by label text.
  Distinguish by **label text**, exactly as `INFO_ROW_LABELS` + `readInfoRows`
  already does on the detail page.

That is the same failure mode `constants.ts` documents for the detail sidebar:
*"structurally identical rows told apart by label text."* It holds on the list
too. One approach now covers both surfaces.

---

## 2. `FIELD_SELECTORS` is broken — 5 of 6 fields miss on the live page

Simulating `extractSnapshot` against live cards:

| Field | Selector tried | Live result |
|---|---|---|
| title | `.mh-lowongan-title` → `h3` | ✅ via the `h3` fallback |
| organizer | `.mh-penyelenggara`, `[data-field="organizer"]` | ❌ **MISS** |
| location | `.mh-lowongan-location`, `[data-field="location"]` | ❌ **MISS** |
| kuota | `.mh-lowongan-kuota`, `[data-field="kuota"]` | ❌ **MISS** |
| pelamar | `.mh-lowongan-pelamar`, `[data-field="pelamar"]` | ❌ **MISS** |
| logo | `img.mh-lowongan-logo` → `img` | ✅ via the `img` fallback |

Class census across the whole live list page:

```
mh-lowongan-card:    18   ← the ONE confirmed anchor, still valid
mh-container:         6
mh-lowongan-title:    0
mh-penyelenggara:     0
mh-lowongan-location: 0
mh-lowongan-kuota:    0
mh-lowongan-pelamar:  0
mh-lowongan-logo:     0
mh-badge:             0   ← on the list page; it DOES exist on detail
```

**Only `.mh-lowongan-card` and `.mh-container` are real.** Every
`mh-lowongan-*` field class was invented and matches nothing. This is exactly
what the PROVISIONAL warning in `constants.ts` predicted; recon confirms it.

### Severity: worse than "a snapshot field is blank"

`extractSnapshot` is what runs when a user stars a card on the list. Today it
stores `organizer: ""`, `location: ""`, `kuota: undefined`,
`pelamar: undefined` — title and logo survive on structural fallbacks.

That degrades three shipped features, silently:

- `FavoriteCard.svelte` renders empty Penyelenggara and Lokasi lines.
- `searchFavorites` builds its haystack from `title + organizer + location`, so
  **searching by Penyelenggara or Lokasi cannot match a list-starred Favorite.**
- `sortFavorites` collates on those same empty strings.

A Favorite starred from the *detail* page is fine — `extractDetailSnapshot`
uses the confirmed selectors. So the bug is invisible in the detail flow and
present in the primary one.

And the snapshot is immutable by ADR-0002: refresh never repairs it. Every
Favorite starred from the list before this fix keeps its blank fields forever.
**A backfill (from `liveStatus`, or a one-time re-fetch) is a real question,
not a nicety.**

The e2e suite passes because `test/fixtures/lowongan-list.html` was hand-built
to match the invented classes. It proves the extension works against our
assumption. This is the fixture-debt `PRODUCT.md` flagged, now measured.

### Where the fields actually live

Confirmed structure inside `.mh-lowongan-card`:

```html
<div class="mh-lowongan-card rounded-xl border bg-card … flex flex-col">
  <div class="p-5 flex flex-col h-full">
    <div class="flex items-start gap-4 h-full">
      <div class="w-12 h-12 …"><img class="w-full h-full object-contain" …></div>
      <div class="flex-1 min-w-0 h-full flex flex-col">
        <div>
          <h3 class="font-semibold text-base leading-snug">Fisikawan Medis</h3>
          <p class="text-sm font-medium text-foreground">Rumah Sakit Umum Pusat Dr. Kariadi Semarang</p>  ← Penyelenggara
          <p class="text-sm text-muted-foreground truncate">Fisika</p>                                     ← study program
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 …">
            <span class="flex items-center gap-1.5"><svg class="lucide lucide-map-pin …"/>Kota Semarang</span>  ← Lokasi
          </div>
          <div class="… mt-2 …">
            <span…><svg class="lucide lucide-graduation-cap …"/><span>Profesi</span></span>   ← education level
            <span…><svg class="lucide lucide-calendar …"/>5<!-- --> hari/minggu</span>        ← working days
          </div>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <div class="…rounded-full…bg-secondary…">Kuota: <!-- -->5</div>
          <div class="…rounded-full…bg-secondary…">Pelamar: <!-- -->0</div>
        </div>
        <div class="mt-auto pt-4">
          <hr><p class="text-xs font-semibold …">Hari Libur</p>
          <div class="flex flex-wrap gap-1.5">
            <div class="…rounded-full…bg-white">Sabtu</div>
            <div class="…rounded-full…bg-white">Minggu</div>
          </div>
        </div>
```

Anchor and grid, both stable:

```html
<div class="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">   ← 18 children
  <a class="group block h-full" href="/magang-nasional/lowongan/<slug>-<uuid>">
```

**Retuning strategy.** Prefer icon-anchored and label-anchored lookups over
Tailwind utility soup:

- **Penyelenggara** — first `p.text-foreground` inside the card (the
  `text-muted-foreground` sibling is the study program, so `p:first-of-type`
  alone is fragile if order changes).
- **Lokasi** — `svg.lucide-map-pin` → `closest('span')`. Lucide class names are
  semantic and survive restyling; this mirrors the `svg.lucide-share2` layer
  already used in `SHARE_CLUSTER_SELECTORS`.
- **Kuota / Pelamar** — scan `div.rounded-full` and match the label text, the
  `readInfoRows` pattern.

Two fields the current snapshot does not capture but the card offers cheaply:
**study program** (`Fisika`) and **education level** (`Profesi`). Issue #1's
record shape lists `educationLevels` / `studyPrograms` / `workingDays` /
`daysOff` — all present on the card, none currently extracted.

---

## 3. Detail page: every confirmed selector still holds

Re-verified after issue #10. No drift:

| Thing | Result |
|---|---|
| header block `div[class*="items-start"][class*="gap-5"]` | ✅ `flex flex-col sm:flex-row items-start gap-5` |
| `h1` title | ✅ `Fisikawan Medis` |
| organizer `p.text-muted-foreground` | ✅ `Rumah Sakit Umum Pusat Dr. Kariadi Semarang` |
| exactly one `img` in header block | ✅ 1 |
| `button[aria-label="Bagikan"]` | ✅ found |
| share cluster `div.flex.gap-2.self-start` | ✅ 1 child (our toggle would be 2nd) |
| `.mh-badge` | ✅ `Batch 1 · 2026` |
| "Lamar Sekarang" | ✅ present |
| `.mh-lowongan-card` in "Lowongan Serupa" | ✅ 5 |

Info rows read exactly as `parse.ts` expects:

```
Durasi Magang  → 5 hari/minggu
Lokasi Magang  → Kota Semarang
Kuota          → 5 orang
Pelamar        → 0 orang
Tunjangan      → Dari Pemerintah
```

**One new edge case.** `INFO_ROW_SELECTOR` also matches a row whose label is
`"(6 materi)"` with an empty value — a course/materi widget elsewhere on the
page reusing the same utility classes. Harmless today (label matching ignores
it), but it proves the selector is not exclusive to the sidebar. Worth a
regression fixture so a future "read all rows" change does not trip on it.

---

## 4. Four unlooked-for findings

### 4a. MagangHub already sorts by "Peluang Terbesar" — this reshapes B2

The list page has a shadcn Select labelled `Urutkan:` whose current value is
**"Peluang Terbesar"** (best opportunity):

```html
<div class="bg-white flex items-stretch">
  <div class="border … bg-gray-50">Urutkan:</div>
  <button type="button" role="combobox" aria-label="Urutkan" …>
    <span>Peluang Terbesar</span>
```

Which is, in substance, the urgency sort B2 proposed — MagangHub ships it on
the live list already. Two consequences:

- **B2's value moves.** It is no longer "give the user an urgency sort they
  lack"; it is "sort *my Favorites* by urgency", a set the site cannot order
  because it does not know it exists. Real, but narrower than the pitch.
- **Copy must not collide.** Our sort should not reuse "Peluang Terbesar"
  meaning something different, and ideally should not contradict its ordering.
  Worth opening the dropdown in a follow-up recon to read the full option list
  and, if it is URL-driven, its query parameter.

### 4b. The detail page already has a 5-step "Alur Lamaran" — this reshapes C2

The sidebar carries a numbered pipeline card:

```
Alur Lamaran
1  Submit Lamaran   — Isi kuesioner dan konfirmasi persyaratan lamaran
2  Seleksi Lamaran  — Penyelenggara menseleksi & verifikasi lamaranmu
3  Interview        — Interview dengan perusahaan
4  Onboarding       — Lengkapi dokumen & persiapan magang
5  Mulai Magang     — Program magang berjalan
```

Rendered as `w-7 h-7 rounded-full bg-primary/10 text-primary` numbered discs in
a `space-y-4` stack, inside a `bg-white border border-border rounded-2xl p-6`
card.

This is the single most useful finding for C2, and it cuts two ways.

**The gift.** The draft stages (`Tertarik → Dilamar → Wawancara →
Diterima/Ditolak`) were invented. MagangHub publishes the real pipeline, in its
own words, on the page. Aligning to *its* vocabulary — Submit Lamaran, Seleksi
Lamaran, Interview, Onboarding, Mulai Magang — makes the feature legible on
sight and settles a naming argument with evidence instead of taste. The visual
grammar for a stage tracker is also right there to match (principle #4).

Note the mismatch with the draft: the site's pipeline has **no rejection
state**. It describes the happy path only. A user's tracker needs "Ditolak",
which the site never shows — so C2 is the official stages *plus* a terminal
negative, not a copy.

**The hazard, now sharper.** A stage tracker in that sidebar, styled like that
card, adjacent to the real one, is no longer merely "might look official" — it
would look like a *second instance of the same component*. `PRODUCT.md`'s
no-implied-affiliation rule stops being a caution and becomes a hard
constraint: near-identical geometry demands unmistakable attribution, or
deliberate visual distance. Recommend not mounting directly beside "Alur
Lamaran".

Also note the sidebar's own footnote copy: *"Gratis - nggak dipungut biaya
sepeser pun."* MagangHub speaks informally here. Our Indonesian copy can relax
slightly and still read native.

### 4c. Scale: 28,428 active Lowongan, 1,580 pages

The list header reads `Ditemukan 28428 lowongan magang aktif`, and pagination
runs `1 2 3 … 1580` at 18 cards per page.

This changes the mental model of the popup from "a handful of bookmarks" to a
shortlist drawn from a very large pool. It strengthens C4 (grouping) and W1
(ambient summary), and revives **C1 (dashboard)** — a 360px panel is a tight
place to manage a shortlist filtered from 28k listings. Also a reminder that
"refresh all" politeness (`REFRESH_CONCURRENCY = 3`, 250 ms stagger) is aimed
at a site of real size.

### 4d. Pelamar counts are low — A1's buckets are miscalibrated

Actual ratios on page 1 (Pelamar/Kuota):

```
0/5, 0/3, 4/15, 0/2, 0/2, 0/2, 0/2, 0/2, 1/3, 1/3,
0/2, 0/2, 0/2, 0/2, 0/2, 1/3, 0/2, 1/3
```

Peak is 33%. Thirteen of eighteen sit at 0%. The fixture's `Pelamar: 120 /
Kuota: 50` (240%) is invented and misled the earlier design.

Two things follow:

- **Kuota is tiny** — mostly 2–5 places. With Kuota 2, a single applicant is
  50% and two applicants fill it. A percentage-based bucket ladder is noise at
  that scale: 0% → 50% → 100% is the entire range, in whole applicants.
  **Remaining places ("sisa 2 kursi") is the honest readout; the ratio is the
  derived one.** This also reinforces B2's option 2 (sort by remaining places
  ascending) over ratio-descending.
- **The "lewat kuota" bucket may be unreachable.** Nothing on page 1 exceeds
  100%. Whether MagangHub caps applications at Kuota or lets them overflow is
  now an open question — the earlier design assumed overflow purely because
  the invented fixture showed it. Note that this is page 1 under the default
  "Peluang Terbesar" sort, which may itself surface low-competition listings
  first; a sample from a later page or a different sort would test that.

---

## Actions

**Immediate (bug, not a feature):**

1. ✅ **Done** — retuned the list-card selectors in `src/lib/constants.ts`
   against §2. `FieldSelectors` now covers only what a CSS selector can isolate
   (title / organizer / logo); location moved to `CARD_LOCATION_SELECTORS`
   (icon-anchored, read by `findCardLocation`) and Kuota/Pelamar to
   `CARD_BADGE_SELECTOR` + `CARD_BADGE_LABELS` (label-matched, read by
   `readCardBadges`). `normalizeWhitespace` is now exported from `parse.ts` and
   shared, so the card's `<!-- -->` hydration markers are handled the same way
   the detail page's already were.
2. ✅ **Done** — re-recorded `test/fixtures/lowongan-list.html` from the live
   DOM; the PROVISIONAL notice is gone. The invented-class version is kept as
   `lowongan-list-invented-classes.html`, a *milder* degradation case than
   `-altered`: the card class still matches so stars inject, but the inner
   fields are unreachable. `lowongan-list-altered.html` remains the hard case
   where health must go `degraded`.
3. ⬜ **Open** — the backfill for Favorites already saved with blank fields.
   Deliberately not bundled with the fix: repairing an immutable snapshot is a
   decision against ADR-0002, not a bug fix.

Verification after (1) and (2): 102 unit tests and 44 e2e pass (up from 97 and
40); `tsc --noEmit` and `svelte-check` clean.

Two things the fix surfaced that the recon had not:

- **`savedSnapshot.kuota` / `.pelamar` have no consumer yet.** Nothing in
  `src/` or `e2e/` reads them, so the user-visible damage was confined to
  `organizer` and `location`. They are captured as display strings (`"Kuota:
  5"`), unchanged in shape from before.
- **The SPA e2e tests were swapping `document.querySelector("main")`**, and the
  live page has no `<main>` — so on the re-recorded fixture the swap silently
  did nothing and the old cards survived. Four tests failed in a way that read
  like a re-injection regression but was a broken test helper. They now go
  through one `swapRoute` helper that targets `.mh-container` and **throws** if
  the container is missing, so the same class of mistake fails loudly next
  time.

**Design changes to `docs/feature-backlog.md`:**

4. **A1** — unblocked; buckets rebuilt around remaining places, not percent.
5. **B2** — repositioned against MagangHub's existing `Urutkan` control.
6. **C2** — adopt the site's own stage vocabulary; add a terminal rejection
   state it lacks; do not mount beside "Alur Lamaran".
7. **C1** — revisit, given 28k listings.

**Follow-up recon (small, worth doing before B2/C2 land):**

8. Open the `Urutkan` dropdown; capture the full option list and any URL param.
9. Sample a later page or a different sort to test whether Pelamar ever exceeds
   Kuota.
