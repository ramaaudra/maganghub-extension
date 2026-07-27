# Feature backlog — post-MVP

Working notes from the 2026-07-25 brainstorming session, then a feature-by-
feature grilling on 2026-07-27. The grilling's outcomes are the authority now:
see `docs/grilling-decisions-2026-07-27.md` (decisions D0–D13) and
`docs/live-dom-recon-2026-07-25.md` (the DOM evidence several decisions rest on).

> **Revised 2026-07-25 after live DOM recon.** See
> `docs/live-dom-recon-2026-07-25.md` for the evidence. Four items changed
> shape: A1 (unblocked, buckets rebuilt), B2 (MagangHub already ships an
> urgency sort), C2 (the site publishes its own 5-step pipeline), and a new
> **P1b** — `FIELD_SELECTORS` misses 5 of 6 fields on the live page, which is a
> shipped bug, not backlog. **P1b is now committed** (`0ce264f`, branch
> `fix/list-card-selectors-p1b`).

Written in English to match `CONTEXT.md` / `PRODUCT.md` / `docs/adr/`; all
user-facing copy stays Indonesian.

Vocabulary is fixed by `CONTEXT.md`. Where a feature would *change* a term's
definition, that is called out explicitly — it is a domain decision, not an
implementation detail.

---

## Selected — status after grilling (D0–D13)

| ID | Feature | Decision | Schema | Blocked by |
|----|---------|----------|--------|-----------|
| A1 | Colour urgency signal on list cards | **D6** — colour only, AT text equivalent | — | P0, a11y |
| A2 | Per-stage chip on list cards | **D7** — short text chip per stage | — | P0, **C2** |
| A3 | Catatan tooltip on the star | **D11** — native `title`, desktop | — | P0 |
| B1 | Change notification + toolbar badge | **D5** — one previous sample, no history array | **v4** | — |
| B2 | Sort Favorites by stage then seats | **D9** — stage-first, seats secondary | — | **C2** |
| C2 | Status Lamar → 4 curated stages | **D2/D3/D4** — popup first, then detail card | **v4** | P0, domain |
| C4 | Collapsible per-Penyelenggara + stage summary | **D10** — threshold >3 | — | **C2** |
| W1 | Embedded summary widget | **D8** — demoted, revisit after A1/A2/C2 | — | — |

**Work order (D13):** LICENSE/README → health field-aware → P0 → C2 → A2/A3 →
A1 → B1 → B2/C4.

**Dependency corrections the grilling surfaced:**
- **C2 gates A2, B2, and C4**, not just "domain decision". A2's chip content,
  B2's stage-first ordering, and C4's stage summary all read `statusLamar`
  values that do not exist until D2 lands. The backlog originally listed A2 as
  blocked only by P0 and B2/C4 as popup-independent — both wrong.
- **B1's toolbar badge (D5) absorbs W1's ambient-summary job** (D8).
- **C4's stage summary absorbs the per-Penyelenggara slice of W1** (D10).

---

## Not selected, still open — NOT yet grilled

These were parked in the first session and have **not** been through the
grilling. Listed here so the next grilling round has them in one place. See the
bottom of this file for the parked/trust/polish items.

- **B3** scheduled refresh (`chrome.alarms`) — left half-open by D5; less
  load-bearing now that B1 is change-notification rather than velocity.
- **B5** desktop notifications — the only idea discussed that adds a line to
  the permission prompt.
- **C1** dashboard tab — not retired by W1; D8's "revisit" includes it.
- **C3** tags/categories.
- **A4** hide-applied filter.


---

## Prerequisites

These are not features. They are the shared work three features sit on top of.

### P0 — Widen the content-script updater protocol

Today `maganghub.content.ts` propagates one bit. `Registration.update` is
`(filled: boolean) => void`, and `setupStorageSync` derives that bit from
`changes[key].newValue !== undefined`.

A2 needs `statusLamar`. A3 needs `catatan`. W1 needs an aggregate. None of them
can be built on a boolean.

The change: carry the `Favorite | undefined` (or a narrow view of it) through
`notifyUpdaters` → `Registration.update`, and have `reflectState` pass the same
shape. Contained to one file; touches `injectStarIntoCard`, `injectDetailToggle`,
`setFilled`, `reflectState`, `notifyUpdaters`, `setupStorageSync`.

Do this once, before A2/A3/W1. Doing it three times, or bolting a second
channel alongside the boolean, is how this file becomes unreadable.

### P1 — Re-record the list fixture from the live DOM ✅ **DONE 2026-07-25**

**Answer: (a).** All 18 cards on page 1 expose both Kuota and Pelamar, and both
parse with the existing `parseCount` rule. A1 is unblocked and works on every
card, saved or not.

Two caveats that changed A1's design, both in the recon doc:

- Neither number has a per-field class. They are shadcn `Badge` pills sharing
  markup with the Hari Libur days, told apart by **label text** — the same
  pattern `INFO_ROW_LABELS` + `readInfoRows` already uses on the detail page.
- Real ratios top out at 33%, and Kuota is typically **2–5 places**. The
  fixture's 120/50 was invented. See A1 for what that does to the buckets.

### P1b — `FIELD_SELECTORS` is broken on the live page 🔴 **BUG, not backlog**

Recon simulated `extractSnapshot` against live cards. **Five of six fields
miss**: organizer, location, kuota, pelamar all return nothing; only title and
logo survive, and only via their structural `h3` / `img` fallbacks. Every
`mh-lowongan-*` field class was invented and matches zero elements page-wide.
`.mh-lowongan-card` and `.mh-container` are the only real ones.

This is not a future feature blocker — it degrades three shipped features
today. Starring from the **list** stores blank `organizer` and `location`, so:

- `FavoriteCard.svelte` renders empty Penyelenggara / Lokasi lines.
- `searchFavorites` cannot match those Favorites by Penyelenggara or Lokasi —
  its haystack is built from exactly those fields.
- `sortFavorites` collates on empty strings.

Starring from the **detail** page is unaffected (`extractDetailSnapshot` uses
confirmed selectors), so the bug hides in the flow we test least and lives in
the primary one. And per ADR-0002 the snapshot is immutable — refresh never
repairs it, so **already-saved Favorites need a backfill decision.**

The e2e suite is green because the fixture was hand-built to match the invented
classes. Fixing this means retuning the selectors *and* re-recording the
fixture; keep the old one as an `-altered` degradation case.

Full replacement selector strategy — icon-anchored (`svg.lucide-map-pin`) and
label-anchored, not utility-class soup — is in the recon doc §2.

**Do this before A1.** A1 lands in the same code path.

### P2 — Lift `parseCount` out of `parse.ts`

`parseCount` is private to `src/lib/parse.ts`. A1 needs it (card text →
number) and B2 needs it. Move to a shared module rather than duplicating the
Indonesian thousands-separator rule in two places.

---

## A1 — Pelamar/Kuota ratio badge on list cards

**What ships:** a small badge on each list card showing the fill ratio, colour-
bucketed.

**What it is actually worth.** The card already prints both numbers, so we are
not adding data — we are adding *interpretation*. The value is the word and the
bucket, not the digits. Frame it that way or it reads as redundant.

### Recon rewrote this section

The real numbers on page 1: peak fill is **33%**, thirteen of eighteen cards
sit at **0%**, and Kuota is typically **2–5 places**. The fixture's 120/50 was
invented, and the original bucket ladder was designed against it.

**Percentages are the wrong readout at this scale.** With Kuota 2, one
applicant is 50% and two is 100% — the whole range is three states, in whole
people. A percent badge would swing wildly on single applicants and imply a
precision the numbers do not have.

**Use remaining places. "Sisa 2 kursi" is the honest primary readout**; the
ratio is derived and secondary at best. This also settles B2 in favour of
sorting by remaining places ascending.

**Threshold discipline still applies.** Whatever "hampir penuh" means on the
card must agree with `FILLING_THRESHOLD` (0.8) in `parse.ts`, which drives the
popup's `filling` badge. A card saying "hampir penuh" while the popup says
"Buka" is worse than no badge. With Kuota 2–5, note that 80% and "sisa 1 kursi"
are nearly the same statement — the two framings may collapse into one rule.

**Open:** does Pelamar ever exceed Kuota? Nothing on page 1 does, so the
"lewat kuota" bucket may be unreachable. Page 1 is also under MagangHub's
default "Peluang Terbesar" sort, which may be surfacing low-competition
listings first — sample another page before concluding.

**Placement.** The star is an absolutely-positioned shadow host at top-right.
Decide whether the badge is a second host (simpler, doubles per-card DOM) or
shares the star's host (leaner, needs a small layout inside the shadow root).
On a list that MagangHub re-renders on every filter change, per-card cost is
not theoretical.

**Degradation.** If the fields do not parse on a card, render nothing. Silent
to the page, per principle #5. Whether a page-wide miss should raise `degraded`
health is open: `assessListMarkup` currently keys on card presence, not field
presence — which is precisely why P1b went undetected. Worth revisiting as part
of that fix.

**Blocked by P1b** (same code path, and the selectors must be right first).

---

## A2 — Mark applied Lowongan on list cards

**What ships:** a card the user has already marked "sudah dilamar" says so on
the list, without opening the popup.

Closes the half-built story #29 ("visually distinguish favorited Lowongan I've
already applied to") — today that distinction exists only in the popup.

**Treatment.** Prefer a chip inside our shadow host over dimming the card or
drawing a border on it.

Dimming makes a judgment on the user's behalf: someone who applied may still
want to re-read the listing, and a dimmed card fights them. It also means
restyling MagangHub's own element rather than our host. We already promote
`position: static → relative` on their card, which is invisible; changing
opacity or borders is not.

**Blocked by P0.**

---

## A3 — Catatan tooltip on the star

**What ships:** hovering a filled star shows that Favorite's Catatan.

**Start with the native `title` attribute.** A custom tooltip on a 32px control
inside a closed Shadow DOM, on a card wrapped in an `<a>`, means fighting
`overflow` and z-index on a layout we do not control. `title` costs one line
and cannot be clipped.

**Collision to handle:** `setFilled` currently manages `button.title` only when
it is already truthy (`if (button.title) button.title = label`) — a guard that
exists because the list star has no title and the detail toggle does. Giving
the list star a title changes which branch runs. Compose deliberately:
`catatan ? \`${label} — ${catatan}\` : label`.

**Blocked by P0.**

---

## B1 — liveStatus history + velocity

**The idea.** A Lowongan has no calendar deadline; it closes by filling its
Kuota. So the sharpest signal is not today's status but the *rate*: "Pelamar
12 → 34 dalam 3 hari". `liveStatus` is overwritten on every refresh, so that
rate is currently thrown away on each check.

This is the strongest differentiator on the list. The official site does not
remember a Lowongan's past; we can.

### Design decisions

**Where history lives.** Inside the Favorite, as `liveStatus.history[]`.

`setLiveStatus` already rewrites the whole record (`setFavorite({ ...favorite,
liveStatus })`), so appending costs nothing extra at write time. A separate
`hist:<uuid>` key would keep the record lean but orphan on `removeFavorite`,
complicate export/import, and split "the user's data" across two places against
principle #3.

**Sample shape:** `{ at: ISO, pelamar?, kuota?, status }` — roughly 60 bytes.

**Cap ~20–30 samples.** At 30 that is ~2 KB, doubling a Favorite's footprint.
`unlimitedStorage` is deliberately not requested (see issue #1 storage note),
so the cap is a real constraint, not a formality.

**Dedup rule — the part that decides whether this feature is useful.** Five
clicks of "Segarkan semua" in one minute must not push five identical samples
through a 20-slot buffer and evict a week of real history. Append only when
`pelamar` changed *or* the last sample is older than ~6 hours; otherwise update
the last sample's timestamp in place.

**Never append a failed refresh.** `status: "unknown"` is a fact about the
network, not about the Lowongan. Appending it puts holes in the series for
reasons the user cannot interpret.

**Display.** The derived sentence beats the chart: "+12 pelamar dalam 5 hari"
is one line, needs no SVG, and is the thing the user acts on. A sparkline is
feasible as inline SVG at ~80×20 in a 360px popup, but treat it as polish on
top of the sentence, not the deliverable.

### The honest weakness

Velocity needs at least two samples spanning meaningful time. With refresh
manual-only, most users will have exactly one, and the feature will mostly
render "belum cukup data".

**B1's value is gated on refresh frequency, not on B1's own quality.** The
natural partner is scheduled refresh via `chrome.alarms` (`alarms` adds no
warning line to the permission prompt). That was raised as B3 and not selected.
Worth reconsidering as part of B1 rather than as a separate feature — shipping
B1 alone risks building the storage layer for a readout that rarely populates.

### Schema

Needs **v4**. See the bundling note under C2.

---

## B2 — Sort by urgency

Cheapest item on the list. Recon moved where its value comes from.

### MagangHub already ships an urgency sort

The live list page has a shadcn Select labelled `Urutkan:`, currently set to
**"Peluang Terbesar"** — in substance the thing B2 proposed to add.

So B2 is no longer "give the user a sort the site lacks". It is **"sort *my
Favorites*"** — a set MagangHub cannot order because it does not know it
exists. Still real, and still cheap, but narrower than the original pitch. Say
so honestly rather than shipping it as a headline feature.

Two knock-ons:

- **Do not reuse "Peluang Terbesar"** for a different ordering. Colliding with
  the site's own label on the same page is worse than a duller name.
- **Follow-up recon:** open the dropdown, capture the full option list and any
  URL parameter. If MagangHub's ordering is legible, ours should not contradict
  it.

### Which ordering

**"Most urgent" is not "highest ratio".** Ratio-descending puts the
over-subscribed and closed ones first — where applying is pointless.

Recon settles this: with Kuota typically 2–5, **sort by remaining places
(`kuota - pelamar`) ascending, among open ones only.** Same reasoning as A1 —
at this scale, seats left is the meaningful quantity and percent is noise.

**Undefined ratios.** Only refreshed Favorites have numeric `liveStatus.kuota`
/ `.pelamar`. Unrefreshed ones must land last, deterministically, not
interleaved by accident.

**Small refactor:** `sortFavorites` currently indexes `savedSnapshot[key]` for
every non-`savedAt` key. A key that reads `liveStatus` does not fit that shape.

---

## C2 — Status Lamar → stages

**User's framing:** stages, with the UI on the detail page.

**This is a domain change before it is a feature.** `CONTEXT.md` defines Status
Lamar as *"a manual, self-reported **flag** … indicating **whether** the user
has applied"*. A pipeline is a different concept wearing the same name.
Required, and not optional:

- Update the term in `CONTEXT.md` (or introduce a new term and keep Status
  Lamar as the flag it is defined to be).
- Possibly an ADR — the manual-not-detected property must survive the change,
  since it is what ADR-0001 buys.

### Stages — use MagangHub's own, not ours

**Recon finding: the detail-page sidebar already publishes the real pipeline**,
as a numbered card titled **"Alur Lamaran"**:

```
1  Submit Lamaran   — Isi kuesioner dan konfirmasi persyaratan lamaran
2  Seleksi Lamaran  — Penyelenggara menseleksi & verifikasi lamaranmu
3  Interview        — Interview dengan perusahaan
4  Onboarding       — Lengkapi dokumen & persiapan magang
5  Mulai Magang     — Program magang berjalan
```

The earlier draft (`Tertarik → Dilamar → Wawancara → Diterima/Ditolak`) was
invented. Adopting the site's vocabulary makes the feature legible on sight and
settles the naming question with evidence instead of taste. It also hands us
the visual grammar to match (principle #4): `w-7 h-7 rounded-full
bg-primary/10 text-primary` numbered discs in a `space-y-4` stack.

**One deliberate divergence: the site has no rejection state.** "Alur Lamaran"
describes the happy path only. A personal tracker needs **Ditolak** — arguably
the most important state to record, since it is what stops you waiting. So C2 =
the official stages **plus** a terminal negative, not a copy.

Also note a stage the site cannot have: the user may save a Lowongan *before*
applying. Something like **Tersimpan** has to sit at position 0, outside the
official five. Decide whether that is a stage or simply "the Favorite exists
with no stage set" — the latter is cleaner and keeps the pipeline honest.

Terminal branches still need care: a stepper implies a line, but Ditolak and
Mulai Magang are ends, not step 6.

### Migration and interop

- Schema **v4**: `not_applied → <no stage>`, `applied → submit_lamaran`.
  (Was `→ tertarik` / `→ dilamar` before the stage names came from the site.)
- `io.ts` merge rule is currently "imported Catatan/Status Lamar fill only if
  local is empty". What counts as empty for a stage? `tertarik` is a real
  choice and also the default — indistinguishable without care.
- Export/import across versions in both directions: a v4 file read by a v3
  build, and vice versa.

### The detail-page UI — the part that needs care

A stage tracker rendered inside MagangHub's own page can read as *MagangHub
tracking your application*. `PRODUCT.md` is explicit: no affiliation with
Kemnaker may be implied, and implying it "would undermine the trust posture it
is built on".

**Recon makes this sharper, not softer.** The hazard was "it might look
official". Now that we know an "Alur Lamaran" card already sits in that
sidebar, a stage tracker styled to match would read as *a second instance of
the same component*. Near-identical geometry beside the real thing turns a
caution into a hard constraint.

Principle #4 (feel native) and the positioning pull opposite ways here. The
resolution is not to pick one: **native geometry, unmistakable attribution.**
Match spacing and control shapes; make authorship impossible to miss. The star
toggle gets away with no attribution because a bookmark star is self-evidently
a viewer-side action. A stage pipeline that mirrors the site's own is not.

**Placement.** The share cluster holds two 40×40 buttons and cannot host this.
The sidebar is where the material lives, but **do not mount adjacent to "Alur
Lamaran"** — that is the one spot where the confusion is maximal. Confirmed
sidebar structure (`div.space-y-5.order-1.lg:order-2`):

1. `div.bg-white.border.border-border.rounded-2xl.p-6` — info rows + "Lamar
   Sekarang" + the *"Gratis - nggak dipungut biaya sepeser pun"* footnote
2. the same card shape — **"Alur Lamaran"**
3. `a.block.group` — the Penyelenggara link

Any placement is a **new selector and therefore a new breakage surface** with
its own health signal. `SHARE_CLUSTER_SELECTORS` is layered three deep for
exactly this reason; this needs the same treatment.

**Copy register.** The sidebar says *"Gratis - nggak dipungut biaya sepeser
pun."* MagangHub is informal here, so our Indonesian can relax a notch and
still read native.

**Only render for a saved Favorite.** A stage picker on an unsaved Lowongan
implies state that does not exist. Either hide it until saved, or have picking
a stage save the Favorite as a side effect — decide, do not leave it emergent.

**Blocked by P0** and by the domain decision.

---

## C4 — Group Favorites by Penyelenggara

Sorting by Penyelenggara already clusters them adjacently, so headers alone are
marginal. **The value is collapsing** — one Penyelenggara with eight Lowongan
costs eight cards of scroll in a 360px panel.

Group counts must reflect the active search, not the whole list, or the header
contradicts what is under it.

---

## W1 — Embedded summary widget on MagangHub

**User's idea**, replacing the separate dashboard tab (C1) from the session.

**What it is good at.** Zero new permissions, no new entrypoint, and it keeps
the "missing feature of the site" framing. It puts a signal where the user's
attention already is, which is the whole argument for A1–A3 too.

**What it does not do.** It does not lift the space ceiling. The dashboard idea
came from "360px is a hard cap for tables, bulk actions, and side-by-side
comparison" — and a widget inside someone else's layout has *less* room than
the popup, not more. These solve different jobs:

- **W1** — ambient awareness while browsing.
- **C1** — managing forty Favorites.

Choosing W1 first is reasonable. It does not retire C1 — and recon strengthens
C1's case: MagangHub lists **28,428 active Lowongan across 1,580 pages**. A
shortlist drawn from a pool that size is a managing problem, not just a
glancing one.

**Scope it small.** A compact "Favoritku" summary: count, how many are hampir
penuh, how many sudah dilamar. Low content, low height, no scrolling of its
own. The moment it grows a list, it is a dashboard in the wrong place.

**Highest visibility, highest risk.** This is the most conspicuous thing the
extension would do to a government site. It needs the same attribution
treatment as C2, and a placement that does not overlay MagangHub's content — a
floating panel fights principle #4 rather than serving it.

**Blocked by P0.**

---

## Sequencing — superseded by D13

The order below was the pre-grilling sketch. The grilling settled it as **D13**
in `docs/grilling-decisions-2026-07-27.md`:

> LICENSE/README → health field-aware → P0 → C2 → A2/A3 → A1 → B1 → B2/C4.

Read D13 for the dependency corrections that moved B2 and C4 to **after** C2
(both now read stage values), and LICENSE/README to the **front** (D0 chose the
public path; D12 makes the auditability claim unmet without them).

**One schema bump, not two** still holds: B1 and C2 bundle into **v4**, one
migration, one round of import/export interop. B1 now rides cheaply (D5: one
optional `LiveStatus` field, no history array).

Two recon follow-ups remain worth slotting before the relevant features: read
the `Urutkan` dropdown's full option list (informs B2), and sample a later page
to test whether Pelamar ever exceeds Kuota (informs A1).

## Not selected, still open — NOT yet grilled

- **B3 scheduled refresh** (`chrome.alarms`) — left half-open by D5; less
  load-bearing now that B1 is change-notification rather than velocity.
- **B5 desktop notifications** — the only idea discussed that adds a line to
  the permission prompt. Would need explicit opt-in.
- **C1 dashboard tab** — not retired by W1; D8's "revisit" includes it. Recon
  strengthened its case (28,428 active Lowongan).
- **C3 tags/categories.**
- **A4 hide-applied filter.**
- **D1–D3 trust polish** (show real permissions in explainer; first-run page;
  export reminder).
- **E1–E3 polish** (copy favorite as text; CSV/Markdown export; empty state
  links to the Lowongan list).

**B4 toolbar badge count** is no longer open — D5 absorbed it into B1.

## Ruled out

- **SiapKerja phishing detection** — needs `<all_urls>`, i.e. the exact attack
  surface this product exists to avoid.
- **Auto-captured browsing history of viewed Lowongan** — records behaviour.
  Local storage does not make it not tracking. Only viable opt-in, default off,
  stated plainly.
- **Cross-device sync** — closed by ADR-0001; export/import is the answer until
  end-to-end encryption is decided.
