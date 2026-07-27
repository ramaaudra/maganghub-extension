# Grilling decisions — 2026-07-27

Outcome of grilling `docs/feature-backlog.md` feature by feature, after the
2026-07-25 live DOM recon. These are **decisions**, not options: where this
document and the backlog disagree, this document wins.

Still open at the end of this session: B2, C4, A3 detail, the LICENSE/README
question, and the final work order.

---

## D0 — Audience: public, sideload first

Open-source/technical audience. Feature depth before the Web Store listing, so
the repo is worth looking at. The store path is not abandoned, just later.

**Consequences:**
- Screenshot-legibility is a real tiebreaker — C2 and on-card work are what a
  visitor sees.
- The repo has no LICENSE and no README, and `PRODUCT.md` rests the entire
  auditability claim on the repo being public. A repo without a LICENSE is
  legally not open source. Flagged, not yet decided.

---

## D1 — Empty snapshots: make detection field-aware, defer backfill

**Decision:** `assessListMarkup` becomes field-aware. Backfill is deferred.

The real failure in P1b was never "the data is empty" — it was **"empty and
nobody knew."** `src/lib/health.ts:26-32` only checks for card *presence*, which
is why the bug survived 40 e2e tests and ten commits. `PRODUCT.md` principle #5
says *break loudly to the user, silently to the page*; at field level the
extension broke silently to both. The channel already exists; it just was not
wired at this layer.

**Why not backfill now:**

1. **Zero users.** The only damaged records are the developer's own, and can be
   re-starred. A repair engine with nothing to repair.
2. **It does not fix the worst case.** A Lowongan removed from MagangHub returns
   404 — no page to parse, fields stay empty forever. Those are exactly the
   records where the snapshot is the only surviving trace (ADR-0002).
3. **It loosens ADR-0002 permanently for a temporary problem.** Once refresh may
   write to the snapshot, that boundary is gone — and ADR-0002 explicitly warns
   future engineers against "tidying" the hybrid model.
4. **It is not free.** `ParsedDetail` (`src/lib/parse.ts:21-27`) carries only
   `{status, kuota, pelamar, batch, tunjangan}` — no `title`, `organizer`, or
   `location`. Backfill means widening `ParsedDetail` and `OffscreenResponse`,
   a new offscreen→background path, and new merge logic.

**Honest counter-argument:** if MagangHub changes and a user stars 20 Lowongan
during the broken window, the health indicator tells them "extension needs an
update" — but those 20 records stay damaged until re-starred one by one.
Backfill would heal them silently. This argument gains weight as the user count
grows. Today it is zero.

**If backfill is ever built,** the rule must be narrow and written down: write
only to fields that are the empty string, never overwrite a populated one,
`capturedAt` unchanged — plus an ADR-0002 amendment stating that rule, not
smuggled through.

### Threshold design

- Fire `degraded` only when a card **is** found but `organizer` **and**
  `location` are both empty. One empty field can be real data; both empty on a
  card that plainly exists means we lost the structure, not the data.
- Check the **first card only**, not all of them. Scanning 18 cards on every
  mutation is exactly the DOM work AC #45 forbids ("must not slow down
  MagangHub page loads").

---

## D2 — C2 stages: four curated, not MagangHub's five

**Decision:** `(none) → Dilamar → Interview → Diterima / Ditolak`

Recon found MagangHub publishes its own pipeline in the detail sidebar:
`Submit Lamaran → Seleksi Lamaran → Interview → Onboarding → Mulai Magang`,
with no rejection state.

**Why not mirror it.** Those five describe **what MagangHub and the Penyelenggara
do**, not what the user does. "Seleksi Lamaran" and "Onboarding" are other
parties' activities; the user cannot report them honestly unless they happen to
receive news. Mirroring all five yields a tracker whose states are mostly
unfillable.

What survives is what the user can self-report **and** what changes their
decisions:

| Stage | Why it exists |
|---|---|
| *(none)* | Saved, not applied — the majority of Favorites |
| **Dilamar** | MagangHub's "Submit Lamaran" in the user's words. They know exactly when |
| **Interview** | Real news the user receives. MagangHub's own word |
| **Diterima** | Terminal positive. The site calls it Onboarding/Mulai Magang — two steps past the decision |
| **Ditolak** | Terminal negative. **Absent from MagangHub's pipeline entirely** — and the state that stops the user waiting |

"Seleksi Lamaran" is dropped: it is indistinguishable from "applied, no news
yet", which is the default condition after applying.

Vocabulary borrowed from the site where it fits, so the feature is legible on
sight without a legend.

---

## D3 — C2 attribution: own card, explicitly labelled, far from "Alur Lamaran"

**Decision:** a separate sidebar card, placed away from MagangHub's own "Alur
Lamaran" card, titled to state ownership (e.g. *"Lamaranku · catatan pribadi"*),
with deliberate visual difference — no numbered discs, not MagangHub's primary
colour — while adopting their spacing and radius so it does not read as bolted
on.

**Why this is the sharpest risk in the backlog.** The sidebar already holds an
"Alur Lamaran" card (`bg-white border border-border rounded-2xl p-6`, with
`w-7 h-7 rounded-full bg-primary/10 text-primary` numbered discs). A stage
tracker styled to match, in the same sidebar, reads as **a second instance of
the same component** — i.e. as a MagangHub feature. `PRODUCT.md` forbids
implying affiliation with Kemnaker, and says doing so "would undermine the trust
posture it is built on."

Principle #4 (feel native) and the positioning pull opposite ways here. What
resolves it: **the star toggle gets away with no attribution because bookmarking
is self-evidently a viewer-side action. An application pipeline is not** —
tracking applications is something MagangHub itself would plausibly do, so the
user has no way to tell unless we say so.

Native geometry, explicit ownership. Not one or the other.

---

## D4 — C2 failure: degrade loudly, stages stay usable in the popup

**Decision:** `assessDetailMarkup` also checks C2's mount point → `degraded`.
Stages remain fully settable from the popup, so the feature is partially
crippled rather than gone.

**Binding consequence: the popup stage UI is not optional.** It is the safety
net, so it ships before or alongside the detail-page card.

**Why this matters more than for the star.** Recon confirmed the sidebar offers
no stable handle: `div.space-y-5.order-1.lg:order-2` holds three children, two
of which share identical classes (`bg-white border border-border rounded-2xl
p-6`), distinguishable only by heading text or position. Compare
`SHARE_CLUSTER_SELECTORS`, layered three deep (aria-label, utility classes,
lucide icon) with each layer failing independently. **C2's mount point will be
the most fragile injection surface the extension has.**

No fallback mount point. Issue #10 deliberately *removed* the star's fallback
because a path that rarely runs rots undetected — and a misplaced fallback would
make the attribution risk worse, not better.

---

## D5 — B1 becomes change notification, not history + velocity

**Decision:** drop `history[]` and the sparkline. Keep **one previous sample**
and surface meaningful change: *"kursi tinggal 1 (tadinya 3)"*, *"penuh sejak
terakhir dicek"*. Plus a toolbar badge count (`action.setBadgeText` — no new
permission) for how many Favorites changed.

**Why the original shape does not survive the real numbers.** Recon: Kuota is
mostly **2–5**, Pelamar peaks at **33%**, thirteen of eighteen cards sit at 0%.
With Kuota 3, the entire possible history is `0 → 1 → 2 → 3` — **four data
points over the Lowongan's whole life.** A sparkline over four integers is not a
chart, and *"+1 pelamar dalam 5 hari"* is true but nearly useless.

Velocity is a concept borrowed from large numbers. At this scale the valuable
thing is not the *rate* but the **event**: seats down to one, full, closed.
That is a status change, not a trend — which matches the domain: a Lowongan
closes by an event, not by a curve.

**Second weakness this also fixes.** Velocity needs two samples separated in
time; with manual-only refresh most users would have one, and the readout would
say "belum cukup data". B1's value was gated on refresh frequency rather than on
B1's own quality. Change notification degrades gracefully — with one sample it
simply says nothing.

**Schema:** v4 is still needed (D2 changes `statusLamar`'s *values* — a real
migration), but B1 now rides along cheaply as one optional field on
`LiveStatus`.

`chrome.alarms` scheduled refresh is **not** adopted as part of this. It stays
open, and is now less load-bearing than it was.

---

## D6 — A1 becomes a colour signal, no new text

**Decision:** no badge containing numbers. A three-band urgency colour cue on
`remaining = kuota − pelamar`:

- `remaining > 0`, plenty → calm (still worth applying)
- `remaining > 0`, small (≤ 1 seat, or ≥ 80% of Kuota filled) → amber (hampir penuh)
- `remaining ≤ 0` → strong/red (lewat kuota — futile to apply)

**Why the original shape does not survive recon.** The live card already renders
`Kuota: 5` and `Pelamar: 1` as two adjacent pills. A1 adds no data — it adds
arithmetic. And at Kuota 2–5 the arithmetic is `5 − 1 = 4`: a single-digit
subtraction of two numbers already sitting side by side.

What remains valuable: when scanning 18 cards, the eye catches colour far faster
than it reads two numbers and subtracts. **A1's surviving value is the colour,
not the number** — a pre-attentive urgency signal, not new information.

**Revised by the 2026-07-27 recon (§5b).** The earlier read ("lewat kuota may be
unreachable") was wrong — it sampled only the default "Peluang Terbesar" sort,
which biases toward low-competition listings. Under `sort=most_applicants`, all
18 cards are over-subscribed (ratios 200%–8850%). So the over-subscribed band is
not a tail case to drop — it is **the most valuable band**: a pre-attentive
"don't bother, 354 applicants for 4 seats" cue. "Sisa kursi" goes negative and
is nonsensical at this end, so the bucket must be on the sign of `remaining`,
not its magnitude. The 80% line ties to `FILLING_THRESHOLD` in `parse.ts` so the
card and the popup's `filling` badge agree.

**Second reason:** A1, A2 and A3 all attach to the same card, which already
carries our absolutely-positioned star at `top: 8px; right: 8px`. Three of our
things on someone else's card starts to read as an overlay rather than a missing
feature.

**Binding accessibility requirement (not a question, a condition):** colour
alone violates WCAG 1.4.1 (Use of Color), and `PRODUCT.md` sets WCAG 2.2 AA as
the working floor. The signal must carry a `title` / `aria-label` textual
equivalent on the same element — no added visual text, but a real equivalent for
assistive tech.

---

## D7 — A2 shows a short per-stage text chip

**Decision:** a small chip carrying the stage word — *"Dilamar"*, *"Interview"*,
*"Ditolak"*. No stage → no chip, so the majority of Favorites leave the card
clean.

**Dependency correction the backlog got wrong.** It listed A2 as blocked only by
P0. In fact **C2 gates A2's content**: once `statusLamar` stops being a boolean
and becomes five states, "Sudah dilamar" has to represent all five. C2 is
upstream of A2, not parallel to it.

**Why text, not colour.** On a list being scanned, a **Ditolak** card and a
**Dilamar** card demand opposite reactions. Rendering both with an identical chip
is worse than rendering nothing. Text separates five states without making the
user memorise a colour legend — and it leaves the colour channel entirely to A1
(D6), so the two signals never collide on the same card.

Unlike A1, this shows data that **genuinely is not on the page**. That is real
value, not re-stated arithmetic.

---

## D8 — W1 demoted

**Decision:** drop the embedded summary widget for now. Revisit after A1/A2/C2
are proven on the page.

**Why.** D5 gave B1 a toolbar badge count, which is the same ambient summary W1
was for — at zero new selectors, zero attribution risk, zero permissions. W1
would restate it at the highest cost in the backlog: the most conspicuous thing
the extension could do to a government site (our own panel on their page, not a
button in an existing cluster), requiring the same attribution treatment as C2
plus another fragile injection point.

If it returns, the version worth building is the one the badge *cannot* give:
something that only makes sense in page context — e.g. how many of the 18 cards
on this page are already saved.

---

## Decision summary

| ID | Feature | Decision |
|----|---------|----------|
| D0 | Audience | Public, sideload first |
| D1 | Empty snapshots | Field-aware health; backfill deferred |
| D2 | C2 stages | `(none) → Dilamar → Interview → Diterima / Ditolak` |
| D3 | C2 placement | Own sidebar card, labelled, away from "Alur Lamaran" |
| D4 | C2 failure | `degraded` + stages stay settable in the popup |
| D5 | B1 | Change notification + toolbar badge; no history array |
| D6 | A1 | Colour signal only, with a text equivalent for AT |
| D7 | A2 | Short per-stage text chip; gated on C2 |
| D8 | W1 | Demoted, revisit later |

**Still open:** B2, C4, A3 detail, LICENSE/README, final work order.

---

## D9 — B2 becomes a stage-first sort, seats secondary

**Decision:** sort Favorites by stage first (active above, terminal below),
then — within the active-not-applied block — by whether seats remain:

1. Active, `remaining > 0`, ascending by remaining (closest-to-full among the
   still-open rises to the top).
2. Active, `remaining ≤ 0` (over-subscribed — futile).
3. Active, unrefreshed (no numbers), deterministically last (newest-saved).
4. Terminal (Diterima / Ditolak / Closed).

- **Active:** no stage, Dilamar, or Interview.
- **Terminal:** Diterima, Ditolak, or Closed.

**Why single-axis urgency no longer fits.** D2 gave Favorites a second
dimension: application stage. A Lowongan you have already been **Diterima** at
with 1 seat left is not urgent to apply to. A **Ditolak** one is not either.
Sorting by seats alone puts irrelevant records on top. The question a user
scanning the popup actually asks is "which are still alive and unfinished", not
"which is closest to full" — and that is stage first, seats second.

**Revised by the 2026-07-27 recon (§5b).** A naive "remaining ascending" would
put over-subscribed (negative) cards **first** — exactly the futile ones. The
sort's point is "what is still worth applying to", so cards with seats left come
above over-subscribed ones, and over-subscribed comes above unrefreshed. This
keeps the actionable band on top without burying the "don't bother" signal off-
screen.

**The refresh gap, accepted.** Most Favorites are never refreshed (refresh is
manual), so most have no `liveStatus.kuota`/`.pelamar`. Seat-ordering only
applies to the minority that have been. Unrefreshed records land at the bottom
of their active block in a deterministic order (newest-saved), so the sort
never appears to shuffle randomly.

---

## D10 — C4 is a collapsible per-Penyelenggara group with a stage summary

**Decision:** a collapsible header per Penyelenggara carrying a stage summary
— e.g. *"PT Maju · 3 aktif, 1 interview, 2 ditolak"*. The group only forms
when a Penyelenggara has **more than 3** Favorites; at or below that, cards
stand alone with no header.

**Why a threshold.** For a shortlist of three Favorites from three different
Penyelenggara (the majority of early users), a header above one or two cards is
pure noise. Collapsing earns its keep only when one Penyelenggara's cards would
otherwise consume the 360px panel — which is the scrolling problem C4 exists to
solve, and that starts mattering past ~3.

**Why a stage summary on the header.** D2 made the Penyelenggara relationship
meaningful: someone who applied to eight Lowongan from one org wants to know
how that org's applications stand as a whole, not card by card. That summary is
also the one thing W1 would have given in page context — C4 now absorbs it into
the owned surface, which is where D8 said it belongs.

**Dependency this surfaces.** C4 now needs C2 (the stage summary reads
`statusLamar` values that do not exist until D2 lands). C4 is no longer the
popup-independent item the backlog listed it as.

---

## D11 — A3 is a native `title`, desktop-only, confirmed not grilled further

**Decision (already in the backlog, confirmed):** hovering a filled star shows
that Favorite's Catatan via the native `title` attribute. Composed deliberately
in `setFilled`: `catatan ? \`${label} — ${catatan}\` : label`, because
`setFilled` currently manages `button.title` only when truthy — a guard that
exists because the list star has no title and the detail toggle does.

Not grilled deeper: the shape is clear and the cost is one line. One condition
recorded: `title` does not surface on touch devices, but the product target is
desktop (`PRODUCT.md`: "normal desktop browser tab"), so this is adequate. If
mobile ever becomes real, this swaps to a custom tooltip.

---

## D12 — LICENSE + README ship before any feature

**Decision:** add a LICENSE (MIT — the most compatible with the
open-source-auditable posture) and a README (what it is, how to sideload, the
credential-free posture verifiable from the permission prompt, the
no-affiliation-with-Kemnaker note) before any feature work.

**Why this is not a side errand.** `PRODUCT.md` rests the entire trust claim on
the repo being public and auditable: *"the auditability claim rests on this
being public."* A repo without a LICENSE is legally all-rights-reserved — not
open source, and not something a visitor may copy, modify, or redistribute. The
auditability claim is therefore unmet until a LICENSE exists, and a GitHub
visitor has no front door until a README does. Issue #1 lists LICENSE/README/CI
as follow-up tasks, not out-of-scope.

The README will name the permission set explicitly (`storage` + `offscreen` +
the one `maganghub.kemnaker.go.id` host permission, from `wxt.config.ts`) so
the posture is auditable from the document, not only from the manifest.

---

## D13 — Final work order

1. **LICENSE + README** (D12) — opens the auditability claim. No dependencies.
2. ~~**P1b**~~ — committed (`0ce264f`, branch `fix/list-card-selectors-p1b`).
3. **Health field-aware** (D1) — ~10 lines, closes the hole that hid P1b.
   No dependencies.
4. **P0** — widen the content-script updater protocol from one bit to the
   `Favorite` shape. Required by A2, A3.
5. **C2 complete** (D2, D3, D4) — v4 schema migration + popup stage UI + the
   detail-page card. **Popup first**: it is D4's safety net, so it ships
   before or alongside the detail card. Gates A2, B2, C4.
6. **A2 + A3** — one content-script pass. A2's content is now locked by C2.
7. **A1** — colour signal (D6) with the WCAG 1.4.1 text equivalent.
8. **B1** — change notification + toolbar badge (D5). Rides on v4 cheaply.
9. **B2 + C4** — popup sort/group. Both now depend on C2 (D9, D10).

**What changed from the earlier sketch:** C4 dropped from "popup-independent"
to "after C2" because its stage summary needs D2's stage values. B2 likewise,
because stage-first ordering needs them. LICENSE/README moved to the front
because D0 chose the public path and D12 makes the auditability claim
unmet without them.

---

## Final decision summary

| ID | Feature | Decision |
|----|---------|----------|
| D0 | Audience | Public, sideload first |
| D1 | Empty snapshots | Field-aware health; backfill deferred |
| D2 | C2 stages | `(none) → Dilamar → Interview → Diterima / Ditolak` |
| D3 | C2 placement | Own sidebar card, labelled, away from "Alur Lamaran" |
| D4 | C2 failure | `degraded` + stages stay settable in the popup |
| D5 | B1 | Change notification + toolbar badge; no history array |
| D6 | A1 | Colour signal only, with a text equivalent for AT |
| D7 | A2 | Short per-stage text chip; gated on C2 |
| D8 | W1 | Demoted, revisit later |
| D9 | B2 | Stage-first sort, seats secondary; unrefreshed fall to bottom |
| D10 | C4 | Collapsible per-Penyelenggara + stage summary, threshold >3; gated on C2 |
| D11 | A3 | Native `title`, desktop-only |
| D12 | LICENSE/README | Ship before any feature |
| D13 | Work order | LICENSE/README → health → P0 → C2 → A2/A3 → A1 → B1 → B2/C4 |

All features grilled. Nothing left open.
