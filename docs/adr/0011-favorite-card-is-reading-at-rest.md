# A Favorite card is reading at rest, controls on demand

The popup's Favorite card grew a band per feature. By the time Archive (ADR-0010) landed it stacked six always-visible rows — title, seat strip, change notice, Status Lamar select, action row, Catatan textarea — at roughly 180px each. In a 360×600 popup that means **two cards fill the viewport**. A user with eight shortlisted Lowongan could not see them together, and comparing seats across Penyelenggara meant scrolling a form. Comparing candidates is the one thing a shortlist exists for, and the card had optimized against it.

The reported symptom was "sulit dibaca, crowded, sangat text heavy". The cause was not type or spacing; it was that every card rendered its full editing surface whether or not the user was editing.

## The decision

**A Favorite card renders reading at rest and controls on demand.**

- **The resting card is three lines**, ~76px, so roughly six fit the viewport: (1) title + Status Lamar chip, (2) Penyelenggara · Lokasi, (3) the decision line — seat count, a Catatan mark when a note exists, Status Lowongan chip, chevron.
- **Every control lives in a disclosure tray**: Status Lamar select, Catatan textarea, Segarkan, Arsipkan, Pulihkan, Hapus permanen, Buka di MagangHub, and the "terakhir dicek" provenance line. The whole resting row is the toggle — a 360px row with a separate 24px chevron target wastes the width and invites mis-clicks.
- **Two things stay outside the tray** because they are news, not chrome: the **change notice** (a seat that moved since the last check — the user must not have to open a card to learn a Lowongan is filling) and the **two chips** (they *are* the resting-state summary).
- **Cold Favorites show numbers, not instructions.** A never-refreshed Favorite falls back to the Kuota and Pelamar captured in its snapshot at star time. Previously every unchecked card said "tekan Segarkan" — instructional prose repeated N times, in place of numbers the user had already seen on the card they starred. `src/lib/seats.ts` normalizes both sources behind one shape and owns the wording.
- **All-caps source text is title-cased at display time.** MagangHub publishes many titles and Penyelenggara names shouted ("PERAWAT KESEHATAN", "RUMAH TAHANAN NEGARA KELAS IIA"). `src/lib/titlecase.ts` repairs strings that are *entirely* uppercase, preserving acronyms (PT, RSUD, UPT, PLN), Indonesian particles, and roman numerals. `savedSnapshot` is untouched — this is a view function, so ADR-0002's immutability holds and `searchFavorites` still matches the raw string.
- **The group header gave up its box.** It was a filled, bordered bar as tall as a card band, so a screen of grouped Favorites alternated two competing container styles. It is now a label — chevron, organizer, stage summary — on a bottom rule. Only cards carry borders.

The header and footer were compressed on the same principle: tabs and sort share one baseline row, and every advisory (health, unchecked count, trust promise) is one line rather than a paragraph.

## Rejected alternatives

- **Keep every card fully expanded, and fix crowding with type and spacing alone.** The measured problem is vertical: six bands at 180px cannot be tuned into a comparable list at 360×600. Tightening leading would have made a dense card denser and still shown two of them.
- **Expand the card on hover.** A hover-expanded row reflows the list under the pointer and is unreachable by touch and keyboard. Click is explicit and works for every input mode.
- **Auto-expand cards with an active Status Lamar.** Considered and offered to the user. It makes card height depend on data, so the list's rhythm changes as stages are set, and the user loses a stable scan target. Rejected in favor of uniform resting height; the active-stage tint already singles those cards out.
- **Move controls to a detail view or a modal.** A second screen in a 360px popup costs a navigation model and a back affordance for what is one row of buttons. Inline disclosure keeps the card in context.
- **Normalize the shouted titles at capture time.** That would mutate `savedSnapshot`, which ADR-0002 forbids, and would bake an irreversible guess into storage. Display-time repair is reversible and keeps search matching what the page actually said.
- **Show live and snapshot seats together on one line.** Two provenances on one line invites reading a stale number as a fresh one. One source at a time, with the qualifier stated once in the tray.

## Consequences

- `FavoriteCard.svelte` owns a local `expanded` flag. It is component state, not persisted and not lifted: a collapse preference that survived popup close would fight the "default to scannable" intent, and cards are keyed by UUID so a storage sync does not reset it.
- **Catatan is now focus-guarded.** Saving writes to `chrome.storage`, which fires `storage.onChanged`, which re-renders the card. The `$effect.pre` that reseeds `catatanDraft` now skips while the textarea has focus; without the guard a save mid-edit discards everything typed since. This surfaced as a real e2e failure, not a theoretical one.
- **e2e drives the disclosure.** `e2e/pages/popup.ts` gains `favoriteCard`, `expandCard`, `openCard`, and `openFirstCard`; specs that touch a control open the card the way a user would. Assertions about *reading* (seats, chips, change notice) deliberately run against the unexpanded card, so the resting state stays covered.
- Two new pure modules, `src/lib/seats.ts` and `src/lib/titlecase.ts`, unit-tested without a browser (prior art: `filter.ts`, `group.ts`). `seats.ts` shares `FILLING_THRESHOLD` with the refresh parser so a card cannot read calm while its chip says Mengisi.
- Fixes a live display bug: `savedSnapshot.kuota` holds a *display string* that already carries its label ("Kuota: 5"), and the popup rendered a hand-written "Kuota" in front of it, showing **"Kuota Kuota: 1"**. All seat wording now goes through `seats.ts`.
- No schema change, no migration, no storage-shape change. The content script, refresh pipeline, and offscreen document are untouched.
