# SakuMagang

A Chrome extension that augments the official MagangHub internship listings with features the official site lacks — starting with local favorites — without ever touching the user's SiapKerja credentials.

## Language

**SakuMagang**:
The name of this extension (ADR-0009). Standalone — it names the tool, not the platform. Write it as one word, both capitals. MagangHub is named only in the description and prose, where it reads as the site we support rather than the party who made this.
_Avoid_: "MagangHub Extension" (implies a Kemnaker product), "Saku Magang" / "sakuMagang" (spaced form reads as the *uang saku* stipend; camelCase is an identifier style, not a name)

**SiapKerja**:
The Indonesian government's official identity/authentication system used by MagangHub for login. The source of credentials this extension deliberately never touches.
_Avoid_: "akun maganghub", "akun kemnaker" (when referring to the identity itself)

**MagangHub**:
The Kemnaker-run official internship program website (maganghub.kemnaker.go.id) that lists internships and authenticates users via SiapKerja.
_Avoid_: "siapkerja" (when referring to the internship site)

**Lowongan**:
A single internship job vacancy listing shown on MagangHub. The primary entity the extension annotates and the user bookmarks. A Lowongan has no calendar deadline — it closes by filling its **Kuota** (quota) within its **Batch**, so the urgency signal is Pelamar (current applicants) vs Kuota, not a date. Each Lowongan is identified by a UUID embedded in its detail-page URL.
_Avoid_: "loker" (informal; use Lowongan in docs), "job", "vacancy"

**Penyelenggara**:
The company or organization that offers a Lowongan and selects/interviews applicants. MagangHub has a dedicated "Penyelenggara" section listing them.
_Avoid_: "perusahaan" (only when it is the offering org, not any employer), "company", "organizer"

**Batch**:
A cohort grouping of Lowongan (e.g. "Batch 1 · 2026"). A Lowongan belongs to one Batch; intake and closure happen per Batch.
_Avoid_: "gelombang", "periode", "cohort"

**Favorite**:
A local bookmark of a Lowongan that stores both a snapshot of the Lowongan's key fields at the moment of bookmarking and a reference (stable ID + URL) back to the live listing. Lives only in the user's browser; survives the listing being removed. The saved snapshot is immutable; refresh updates a separate mutable **liveStatus** (Kuota/Pelamar/Batch/Status Lowongan/lastChecked), never the snapshot. A Favorite may carry a **Catatan** and a **Status Lamar**.
_Avoid_: "bookmark" (overloaded with browser bookmarks), "saved job"

**Catatan**:
A free-text note the user attaches to a Favorite (e.g. the reason they saved it). User-authored; the extension never auto-generates it.
_Avoid_: "memo", "comment"

**Status Lamar**:
A manual, self-reported application stage on a Favorite, tracking where the user is in applying to that Lowongan. The stages are `(none) → Dilamar → Interview → Diterima / Ditolak`: `none` means saved but not yet applied (the majority of Favorites); **Dilamar** is the user's word for "I submitted the application"; **Interview** is real news the user receives; **Diterima** is the terminal positive; **Ditolak** is the terminal negative (the site itself never shows it). The vocabulary borrows from MagangHub's own "Alur Lamaran" where it fits; "Seleksi Lamaran" is dropped (indistinguishable from "dilamar, no news yet"). Always user-set, never auto-detected — detecting a stage would require reading the login session, which the credential-free posture forbids, and that manual-not-detected property survived the v4 change from a boolean flag to this stage enum (ADR-0007).
_Avoid_: "applied status" (when implying auto-detection), "stage" without "Status Lamar" when the domain term is meant

**Status Lowongan**:
The live state of a Lowongan, computed by refreshing from the public detail page: **Open**, **Filling** (Pelamar ≥ ~80% of Kuota), or **Closed** (listing removed, Kuota full, or Batch closed), plus **unknown** when a refresh fails. Pelamar is exposed on the detail page, so Filling is reliable whenever both numbers parse (ADR-0006) — not merely best-effort. Exists in place of a deadline status, since a Lowongan has no calendar deadline.

**Arsip**:
A soft-hide state on a Favorite that removes it from the popup's Aktif list without deleting any stored data (ADR-0010). Persisted as `archivedAt: string | null` — `null` = active, an ISO timestamp = archived. The star on MagangHub's page stays filled while a Favorite is archived, because the record still exists in storage and archiving is a popup-only view concern (the content script is unchanged). Distinct from **unstar** (which hard-deletes the record from the page) and from terminal **Status Lamar** stages (which are labels that stay visible in the active list). Archived Favorites are skipped by refresh and excluded from the toolbar badge. **Arsipkan** is the action that archives; **Pulihkan** restores an archived Favorite to the Aktif list; **Hapus permanen** is the irreversible delete offered only in the Arsip tab, guarded by an inline confirm.
_Avoid_: "sembunyikan" (vague — archive is the specific restorable hide), "delete" when Arsip is meant (delete is permanent; archive is not)
