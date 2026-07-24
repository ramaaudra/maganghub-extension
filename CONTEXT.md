# MagangHub Extension

A Chrome extension that augments the official MagangHub internship listings with features the official site lacks — starting with local favorites — without ever touching the user's SiapKerja credentials.

## Language

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
A manual, self-reported flag on a Favorite indicating whether the user has applied to that Lowongan. Always user-set — the extension never detects applied state, because detecting it would require reading the login session, which the credential-free posture forbids.
_Avoid_: "applied status" (when implying auto-detection)

**Status Lowongan**:
The live state of a Lowongan, computed by refreshing from the public detail page: **Open**, **Filling** (Pelamar approaching Kuota), or **Closed** (listing removed, Kuota full, or Batch closed). Exists in place of a deadline status, since a Lowongan has no calendar deadline.
