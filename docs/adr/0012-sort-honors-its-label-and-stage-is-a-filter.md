# The sort honors its label; stage is a filter, not a sort

An audit of the popup's filter/sort feature (search → sort → group → render) surfaced six issues where the UI promised one thing and delivered another. The fixes below make the sort select truthful, give the user a real way to isolate a Status Lamar, keep the card and the sort reading the same seat numbers, and stop discarding the user's sort choice.

## The decision

- **Grouping is conditional on the sort (W1).** Per-Penyelenggara grouping (C4, `GROUP_THRESHOLD > 3`) collects *every* Favorite of one organizer into one block at the organizer's first appearance. Under `savedAt`/`archivedAt` the head of the list stays truthful and a group reads as one org's recent activity; under `organizer` the block sits exactly in the organizer's alphabetical slot. Under `location` A→Z or `stageSeats` a group spanning several cities or urgency buckets silently breaks the order the label promises. `shouldGroup(sortKey)` gates it: grouping runs under `savedAt`, `organizer`, `archivedAt`; cards stand alone under `location` and `stageSeats`.
- **`stageSeats` is displayed as "Urgensi" (W2), and a `Tahap` filter is the stage access (W3).** The sort's real semantics are urgency: active-with-seats first (closest-to-full on top), then over-subscribed, then no-data, then done (terminal stage or Closed). "Status Lamar, sisa kursi" over-promised a stage ordering that the sort does not perform — the label now says what it does. The new `Tahap` select (Semua/Dilamar/Interview/Diterima/Ditolak) is the actual way to answer "which favorites are Interview?".
- **Search matches Catatan (W3).** The haystack is now title + Penyelenggara + Lokasi + the user's own Catatan — the one user-authored field, and the most natural thing to search for. Deliberately *not* extended to stage labels or batch: those parse as noise, and the `Tahap` filter covers stage.
- **The sort is remembered per tab, session-scoped (W4).** `ui:sortKey:<tab>` in `chrome.storage.session` survives popup close/reopen within the browser session and resets on browser restart (a fresh browser opens on the defaults again). Switching tabs restores that tab's own remembered sort instead of clobbering it; `archivedAt` stays Arsip-only with a fallback. The search query and `Tahap` filter are deliberately *not* persisted — a fresh popup opens on the full list.
- **The sort reads the same seats the card renders (W5).** `stageSeats` now computes remaining seats via `favoriteSeats` (live numbers once refreshed, else the snapshot badges captured at star time) instead of `liveStatus` alone. Previously a never-refreshed Favorite could display "sisa 10 kursi · 40 dari 50" on its card while the sort filed it under "unrefreshed" — card and sort now never disagree.
- **A non-default sort is visible (W6).** The *Urutkan* select switches from muted to foreground ink once the user moves off the tab's baseline default, and the shortened labels ("Urgensi") end the closed-state truncation of "Status Lamar, sisa kursi".

## Rejected alternatives

- **An explicit "Kelompokkan" toggle.** User agency, but adds a control (and its state) to a 360px header already holding tabs, two selects, search, and actions; the sort-conditional rule delivers the same truthfulness with zero new UI.
- **Splitting the sort into "Tahap lamaran" + "Sisa kursi".** Two more options in a cramped select, and pipeline order is only weakly meaningful when the popup already shows a stage chip per card; a filter is the better answer to the underlying need.
- **Persisting the search query or the Tahap filter.** A reopened popup should show the full list; remembering a filter would hide favorites the user may have forgotten about.
- **Showing snapshot provenance on the card.** Not part of this ADR; the card already renders snapshot numbers without a freshness qualifier (ADR-0011), and consistency between card and sort won.

## Consequences

- `src/lib/group.ts` exports `GROUPING_SORT_KEYS` + `shouldGroup`; `App.svelte` renders `groupFavorites` only when `shouldGroup(sortKey)` and otherwise maps to solo items.
- `App.svelte` gains the `Tahap` filter (`stageFilter`, options derived from `STAGE_LABEL` so the filter, chip, and Status Lamar select share vocabulary), sort persistence (`onSortChange` → `storage.session`), per-tab restore in `selectTab`, and the foreground-ink active-sort indicator.
- `src/lib/filter.ts` searches Catatan and computes `stageSeats` remaining via `favoriteSeats` (no new dependencies: both modules are pure and browser-free).
- New unit coverage: search-by-Catatan, snapshot-fallback ranking (and live-over-snapshot precedence), `shouldGroup` for all five sort keys. New e2e coverage: the Tahap filter (isolate / no-match / clear), sort persistence across popup close/reopen, and per-tab restore on tab switch.
- No schema change, no migration, no storage-shape change for Favorites; `ui:sortKey:*` lives only in `chrome.storage.session` and is disposable.
