# Status Kuota follows the Kemnaker registration window

Date: 2026-09-04

Status: accepted

## Context

MagangHub registrations happen inside a Kemnaker-controlled registration
window. The selection window starts afterward, so a Lowongan is not
semantically "open" or "closed" based on its apply button, its HTTP response,
or whether its Kuota is full. A full Kuota is still registrable during the
registration window; it is a competition signal, not a submission gate.

The previous live-status model mixed these concepts. It treated the presence
of "Lamar Sekarang" as Open, used Filling for quota pressure, and treated a
missing button or a full quota as Closed. That wording made a user who had not
applied look at a status that sounded like an application state.

## Decision

- The live status field is Status Kuota with three values: `belum_penuh`
  when Pelamar < Kuota, `penuh` when Pelamar >= Kuota, and `unknown` when
  either count is unavailable.
- The parser derives this status from Kuota and Pelamar only. The apply CTA,
  "Batch Ditutup", and HTTP 404/410 cannot infer the Kemnaker registration
  window. A failed fetch is `unknown` with `lastError`.
- The UI labels are **Kuota belum penuh**, **Kuota penuh**, and **Kuota belum
  diketahui**. A Favorite that has never been refreshed remains **Belum
  dicek**; a failed refresh is **Refresh gagal**. **Buka di MagangHub** is a
  navigation action, not a status.
- Status Lamar remains a separate, manual field. A missing Status Lamar means
  the user has not reported applying; it is not inferred from Status Kuota.
- Kuota penuh remains actionable in the popup and is not a terminal sort
  bucket. Only terminal Status Lamar values are terminal.
- Schema v6 migrates legacy live statuses to the new taxonomy from their
  counts, while preserving legacy `unknown` when the old refresh had no
  reliable result.
- The resting card keeps the status Badge in a non-wrapping, shrink-proof
  group. The seat text owns the flexible space with `min-width: 0` and
  truncation. No fixed text width or fixed text height is introduced.

## Consequences

- Copy no longer implies that a Lowongan stopped accepting registrations
  simply because its quota is full or its detail page omits the apply CTA.
- Full and near-full Lowongan remain visible and comparable while the global
  registration window is active.
- Legacy Favorites are upgraded lazily without discarding their snapshot,
  applicant counts, or quota counts.
- The UI and e2e suite now test the longest quota labels at the resting-card
  width, alongside the existing refresh CLS check.
