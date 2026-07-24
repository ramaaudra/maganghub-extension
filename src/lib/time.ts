/**
 * Indonesian relative-time helpers for the popup's Status Lowongan display
 * ("terakhir dicek X lalu"). Pure and unit-testable.
 */

/**
 * Format an elapsed milliseconds span as an Indonesian "X lalu" string.
 *   < 60s  → "baru saja"
 *   < 60m  → "X menit lalu"
 *   < 24h  → "X jam lalu"
 *   else   → "X hari lalu"
 */
export function relativeTimeAgo(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return "baru saja";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

/**
 * Format the gap between an ISO timestamp and `now` (default: current time) as
 * "terakhir dicek X lalu". Returns null if the timestamp is missing/invalid
 * (i.e. the Favorite has never been refreshed).
 */
export function terakhirDicek(
  iso: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return `terakhir dicek ${relativeTimeAgo(now - then)}`;
}