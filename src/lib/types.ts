/**
 * Shared domain types. Vocabulary mirrors CONTEXT.md (Favorite, Lowongan,
 * Penyelenggara, snapshot). See ADR-0002 for the hybrid snapshot+reference model.
 */

/** A Lowongan's stable identity is the UUID embedded in its detail URL. */
export const UUID_REGEX =
	/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Favorite record schema version. Bumped on breaking shape changes. */
export const SCHEMA_VERSION = 4;

/**
 * Status Lamar — the user's self-reported application stage for a Lowongan.
 *
 * Manual, self-reported only: the extension never auto-detects a stage,
 * because detecting it would require reading the login session, which the
 * credential-free posture forbids (ADR-0001). That property survived the v4
 * change from a boolean flag to a stage enum — see ADR-0007.
 *
 * `undefined` = no stage set, i.e. the Favorite exists but the user has not
 * reported applying (the majority of Favorites). The stages borrow MagangHub's
 * own "Alur Lamaran" vocabulary where it fits; "Seleksi Lamaran" is dropped
 * (indistinguishable from "dilamar, no news yet") and "Ditolak" is added (the
 * site never shows it). Decided in D2 (`docs/grilling-decisions-2026-07-27.md`).
 */
export type StatusLamar = "dilamar" | "interview" | "diterima" | "ditolak";

/**
 * Status Lowongan — the live state of a Lowongan, computed by refreshing from
 * the public detail page (ADR-0003). See `parseDetailHtml` for the rules.
 *
 * - `open`: detail page exists and the "Lamar Sekarang" button is present.
 * - `filling`: Pelamar is at least ~80% of Kuota (Pelamar IS obtainable on the
 *   detail page — confirmed via camofox; see ADR-0006 — so this is reliable,
 *   not merely best-effort, whenever both numbers parse).
 * - `closed`: listing removed (HTTP 404/410), Kuota full, or Batch closed — all
 *   manifest on the detail page as the "Lamar Sekarang" button being absent.
 * - `unknown`: refresh failed (network error, Cloudflare challenge, parse
 *   breakage). The last-known snapshot + previous liveStatus are kept.
 */
export type StatusLowongan = "open" | "filling" | "closed" | "unknown";

/**
 * Mutable live status of a Favorite, updated by refresh only (ADR-0002: the
 * saved snapshot stays immutable). Added in schema v3 (issue #5). Numbers are
 * parsed from the detail page's info rows (e.g. "5 orang" → 5); `pelamar` is
 * optional only when the page fails to expose it (it does on the live page).
 */
export interface LiveStatus {
	status: StatusLowongan;
	kuota?: number;
	pelamar?: number;
	batch?: string;
	tunjangan?: string;
	/** ISO timestamp of the last refresh attempt (success or failure), or null before any refresh. */
	lastChecked: string | null;
	/** Populated when `status === "unknown"` (the last refresh failed). */
	lastError?: string;
	/**
	 * The previous successful sample, kept so B1 can surface a meaningful change
	 * ("kursi tinggal 1, tadinya 3"). One sample only — no history array (D5).
	 * Added in schema v4 (issue #15); `undefined` on old records and until a
	 * refresh observes a change.
	 */
	previousSample?: LiveStatusSample;
}

/**
 * A single past snapshot of a Favorite's live numbers, kept on `LiveStatus` for
 * B1's change notification (D5: one previous sample, not a history array).
 */
export interface LiveStatusSample {
	/** ISO timestamp of when this sample was taken. */
	at: string;
	pelamar?: number;
	kuota?: number;
	status: StatusLowongan;
}

/** A fresh liveStatus, before any refresh has run. */
export function initialLiveStatus(): LiveStatus {
	return { status: "unknown", lastChecked: null };
}

/**
 * Immutable snapshot of a Lowongan's card fields, captured at bookmark time.
 * Never mutated after save (ADR-0002); refresh updates a separate liveStatus
 * (added in a later issue, not part of the tracer bullet).
 *
 * Only the card-visible fields the popup needs for the tracer bullet are
 * captured here. The full field set (educationLevels, studyPrograms, …) is
 * added once the live card markup is confirmed via camofox.
 */
export interface LowonganSnapshot {
	title: string;
	/** Penyelenggara — the org offering the Lowongan. */
	organizer: string;
	organizerUuid?: string;
	logoUrl?: string;
	location: string;
	kuota?: string;
	pelamar?: string;
	/** ISO timestamp of when the snapshot was captured. */
	capturedAt: string;
}

/**
 * A Favorite. v1 (issue #2): uuid + detailUrl + snapshot + savedAt. v2 (issue
 * #4) adds catatan + statusLamar. v3 (issue #5) adds a mutable `liveStatus`
 * (refresh updates it; the snapshot stays immutable — ADR-0002). v4 (issue
 * #15) widens `statusLamar` from a boolean flag to a stage enum (or no stage),
 * and adds an optional `previousSample` to `LiveStatus`.
 */
export interface Favorite {
	schemaVersion: number;
	uuid: string;
	/** Detail-page path: /magang-nasional/lowongan/<slug>-<uuid> */
	detailUrl: string;
	savedSnapshot: LowonganSnapshot;
	/** Free-text note the user attaches to the Favorite. User-authored only. */
	catatan: string;
	/** Manual, self-reported application stage, or `undefined` for "no stage". Never auto-detected. */
	statusLamar: StatusLamar | undefined;
	/** Mutable live status, updated by refresh only. Added in v3. */
	liveStatus: LiveStatus;
	/** ISO timestamp of when the user starred the Lowongan. */
	savedAt: string;
}
