# Status Lamar is a stage, not a boolean (v4)

Status Lamar started as a boolean flag (`not_applied` / `applied`) — "did the user mark this as sudah dilamar?" Issue #15 widens it to a self-reported application stage: `(none) → Dilamar → Interview → Diterima / Ditolak`, with schema v4 migrating `applied → dilamar` and `not_applied → no stage`. This ADR records the one property that had to survive the change.

## The property that survives: manual, never detected

ADR-0001 forbids reading the SiapKerja login session. A boolean "applied" flag could only ever be user-set under that constraint, and a four-state pipeline is no different — detecting "the user is at the Interview stage" would require reading the same login session, against the same posture. **A wider enum does not widen what the extension may observe.** Status Lamar stays a manual, self-reported field; the v4 migration changes the *values* and the *shape*, not who sets them.

This is recorded because a boolean → enum change looks like it might also be a "now we can detect it" change. It is not. The stage is whatever the user reports, whenever they report it.

## Why these four stages, not MagangHub's five

Recon (`docs/grilling-decisions-2026-07-27.md` D2) found MagangHub's detail sidebar publishes its own "Alur Lamaran": `Submit Lamaran → Seleksi Lamaran → Interview → Onboarding → Mulai Magang`. We do not mirror it. Those five describe what MagangHub and the Penyelenggara do; "Seleksi Lamaran" and "Onboarding" are other parties' activities the user cannot self-report honestly unless news arrives. Mirroring all five yields a tracker whose states are mostly unfillable.

What survives is what the user can self-report **and** what changes their decisions: Dilamar (they know when they applied), Interview (real news), Diterima (the decision), and Ditolak — the one the site never shows, and the state that stops them waiting. `(none)` is "the Favorite exists, no stage set" rather than a named stage, keeping the pipeline honest.

## Why "no stage" is `undefined`, not a sentinel value

D2 left open whether the pre-application state is a stage or "no stage set". We chose the latter: `statusLamar: StatusLamar | undefined`, where `undefined` means saved-but-not-applied. A sentinel like `"tersimpan"` would be a real value the user could sort and filter on as if it were a reported stage; `undefined` keeps "I have not reported anything" distinct from "I reported a stage". The v3→v4 migration maps `not_applied → undefined` for the same reason.

## Migration and interop

- v3 → v4: `applied → "dilamar"`, `not_applied → undefined`. Idempotent and additive like every prior step.
- v4 also adds an optional `previousSample` to `LiveStatus` (for the B1 change-notification ticket, D5). It is additive — old records carry `undefined` — so the migration does not populate it.
- Export/import: a v3 file read by a v4 build migrates up; a v4 file read by a v3 build is rejected wholesale as a future-schema file (the existing guard, unchanged in spirit). The io merge rule keeps local-authoritative-on-conflict: an imported stage fills only when the local record has no stage.

## Consequences

- The popup stage selector (issue #15) is the safety net for the later detail-page stage card (issue #20, D4): stages stay settable from the popup even if the detail-page mount point breaks.
- A2 (list-card stage chip), B2 (stage-first sort), and C4 (per-Penyelenggara stage summary) all read `statusLamar` values that do not exist until this lands — C2 is upstream of all three (D7, D9, D10).