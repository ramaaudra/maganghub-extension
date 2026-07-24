/**
 * Shared domain types. Vocabulary mirrors CONTEXT.md (Favorite, Lowongan,
 * Penyelenggara, snapshot). See ADR-0002 for the hybrid snapshot+reference model.
 */

/** A Lowongan's stable identity is the UUID embedded in its detail URL. */
export const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Favorite record schema version. Bumped on breaking shape changes. */
export const SCHEMA_VERSION = 2;

/** Status Lamar — manual, self-reported only (never auto-detected; ADR-0001). */
export type StatusLamar = "not_applied" | "applied";

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
 * #4) adds catatan + statusLamar. later issues add liveStatus.
 */
export interface Favorite {
  schemaVersion: number;
  uuid: string;
  /** Detail-page path: /magang-nasional/lowongan/<slug>-<uuid> */
  detailUrl: string;
  savedSnapshot: LowonganSnapshot;
  /** Free-text note the user attaches to the Favorite. User-authored only. */
  catatan: string;
  /** Manual, self-reported "sudah dilamar" flag. Never auto-detected. */
  statusLamar: StatusLamar;
  /** ISO timestamp of when the user starred the Lowongan. */
  savedAt: string;
}