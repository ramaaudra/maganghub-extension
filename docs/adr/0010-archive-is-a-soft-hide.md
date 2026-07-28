# Archive is a soft-hide, independent from Status Lamar and from unstar (v5)

A Favorite could only ever be kept or hard-deleted: unstarring on MagangHub's page removes the `fav:<uuid>` storage key, and with it the snapshot, Catatan, and liveStatus. As the list grows, Favorites the user is done with (Ditolak, Diterima, or simply lost interest in) clutter the active list, but hard-deleting them loses data the product principle says must outlive the listing. **Archive** is the missing third state: a soft-hide that removes a Favorite from the active list while keeping every stored field intact and restorable.

## The decision

Archive is a popup-only view concern, persisted as a single new field:

- **`archivedAt: string | null`** on `Favorite` (schema v5). `null` = active; an ISO timestamp = archived. One field carries both the state and the archive moment, which doubles as the Arsip tab's default sort key ("terbaru diarsip"). The v4→v5 migration sets `archivedAt: null` on every existing record — purely additive, no data loss, idempotent like every prior step.
- **The star on MagangHub's page stays filled.** Archiving does not unstar, because the record still exists in storage and `isFavorited(uuid)` still returns `true`. The invariant *bintang terisi ⇔ record ada* is preserved, so the content script is unchanged — it does not know about archive at all. To truly remove a Favorite the user unstars on the page or uses "Hapus permanen" in the Arsip tab.
- **Independent from Status Lamar.** Terminal stages (`Diterima`/`Ditolak`) are labels that stay visible in the active list; archive is a separate, orthogonal action. A Favorite can be archived at any stage, and a terminal stage does not auto-archive.
- **Excluded from refresh.** Archived Favorites are skipped by "Segarkan semua" and the Arsip tab shows no per-card "Segarkan" button. Refresh hits a government site we do not own and must stay throttled (ADR-0005); spending budget on Favorites the user is no longer pursuing is wasteful. Restoring a Favorite returns it to the active list, where it can be refreshed normally.
- **Excluded from the toolbar badge.** `countsAsUnseenChange` returns `false` for any `archivedAt !== null` record. The badge means "a Lowongan you are pursuing changed"; an archived Favorite is not pursued. On **unarchive**, `liveStatus.changedAt` is reset to `null` so a change observed before archiving does not pop a stale badge the moment the Favorite returns to the active list. `previousSample` is kept — the historical context survives, only the unseen-change marker resets.
- **Popup tabs.** The popup gains an "Aktif" | "Arsip (N)" tab switcher in the header. Search and per-Penyelenggara grouping are shared; the "Arsip" tab adds a `Terbaru diarsip` sort option (`archivedAt`) and defaults to it. "Segarkan semua" is shown only in the Aktif tab. Default tab on every popup open is Aktif.
- **Card actions.** The Aktif card gains an icon-only "Arsipkan" button. The Arsip card shows "Pulihkan" + "Hapus permanen" (and "Buka di MagangHub"), with no Segarkan. "Hapus permanen" is the one irreversible action and is guarded by an inline confirm ("Yakin? [Ya, hapus] [Batal]") in the card's own context — no modal, no `window.confirm`, staying in the Field-Notebook aesthetic.
- **Export/Import.** Export serializes all Favorites (active + archived), `archivedAt` preserved. Import follows the existing local-authoritative-on-conflict merge, with `archivedAt` mirroring the Catatan fill rule: an imported archive fills a local active record (`null` → timestamp), but an import never un-archives a locally-archived record. Archiving is user intent; an import does not silently undo it.

## Rejected alternatives

- **Auto-archive on terminal Status Lamar.** Tumpang tindih with the stage label: the user loses control over when a Favorite leaves the active list, and "Diterima" is not the same intent as "I'm done looking at this". Archive is a deliberate, separate action.
- **Hollow the star on MagangHub's page when archived.** Breaks the *star ⇔ storage* invariant, forces the content script to learn about archive, and makes the star's click behavior ambiguous (click to unstar? to unarchive?). The filled star is the honest signal: the Favorite still exists.
- **A separate `archived: boolean` alongside `archivedAt`.** Redundant — the presence of a timestamp encodes the state and is useful for sorting. One field.
- **`window.confirm()` or a modal for "Hapus permanen".** `window.confirm()` breaks the popup's visual identity; a bits-ui modal is heavy for a 360px popup. The inline confirm keeps the action in the card's context and is one extra click.
- **Export only active Favorites, or a separate "export archive" variant.** A backup that omits archived Favorites violates "data outlives the listing", and a second export button clutters the 360px footer. One full backup.
- **Keep "Segarkan semua" active in the Arsip tab (refreshing the active set from there).** The action would affect items not on screen, which is surprising. Refresh belongs to the Aktif tab where the pursued Favorites are visible.

## Consequences

- Schema bumps to v5; the lazy migration registry gains a `v4 → v5` step. An older build reading a v5 file rejects it wholesale as a future-schema file (the existing guard, unchanged in spirit).
- The popup (`App.svelte`, `FavoriteCard.svelte`) gains tab state and a `view` prop; the content script, the refresh pipeline, and the offscreen document are untouched.
- The toolbar badge computation filters archived records, so an archived Favorite with a pre-existing `changedAt` never raises the badge.
- Vocabulary (CONTEXT.md): **Arsip** (the tab/state), **Arsipkan** (the action), **Pulihkan** (restore), **Hapus permanen** (irreversible delete). Distinct from **unstar** (hard-delete from the page) and from terminal **Status Lamar** stages.