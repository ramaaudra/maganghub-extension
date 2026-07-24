import type { ParsedDetail } from "./parse";
import type { LiveStatus, StatusLowongan } from "./types";

/**
 * Refresh message protocol (ADR-0005). The popup asks the background to refresh
 * one or all Favorites; the background ensures the offscreen document exists,
 * asks it to fetch + parse each detail page, then writes `liveStatus` to
 * storage. Messages are discriminated by `type` so each context's listener
 * only handles its own messages.
 *
 *   popup ──{refresh|refreshAll}──▶ background ──{fetchAndParse}──▶ offscreen
 *   popup ◀──{ok|error}──────────── background ◀──{parsed|error}────────── offscreen
 *
 * The popup never blocks on the per-favorite result: the background writes each
 * `liveStatus` to `chrome.storage.local` as it lands, and the popup's existing
 * `storage.onChanged` listener re-renders progressively.
 */

export const MAGANGHUB_ORIGIN = "https://maganghub.kemnaker.go.id";

/** Resolve a stored detailUrl (relative path or absolute) to a fetchable URL. */
export function resolveDetailUrl(detailUrl: string): string {
	if (/^https?:\/\//i.test(detailUrl)) return detailUrl;
	return MAGANGHUB_ORIGIN + (detailUrl.startsWith("/") ? "" : "/") + detailUrl;
}

// ───────────────────────── popup ↔ background ─────────────────────────

export type RefreshRequest =
	| { type: "refresh"; uuid: string; detailUrl: string }
	| { type: "refreshAll" };

export type RefreshResponse = { ok: true } | { ok: false; error: string };

// ──────────────────────── background ↔ offscreen ────────────────────────

export type OffscreenRequest = {
	type: "fetchAndParse";
	uuid: string;
	url: string;
	/** E2E test seam: if present, the offscreen parses this body instead of
	 *  fetching `url`. Production never sets it. */
	testBody?: string;
	testStatus?: number;
};

export type OffscreenResponse =
	| { ok: true; uuid: string; parsed: ParsedDetail }
	| { ok: false; uuid: string; error: string; httpStatus?: number };

/** A non-OK HTTP status that means "the listing is gone" → closed. */
function isGoneStatus(status: number): boolean {
	return status === 404 || status === 410;
}

/**
 * Fold an offscreen response + the previous liveStatus into the liveStatus to
 * persist. On success, replace the live fields. On a "gone" HTTP status, mark
 * `closed`. On any other failure, mark `unknown` and keep the previous
 * kuota/pelamar/batch/tunjangan so the popup still shows the last-known numbers
 * ("no data loss", issue #5 AC).
 */
export function toLiveStatus(
	response: OffscreenResponse,
	previous: LiveStatus | undefined,
	now: string = new Date().toISOString(),
): LiveStatus {
	if (response.ok) {
		const parsed = response.parsed;
		const live: LiveStatus = {
			status: parsed.status,
			lastChecked: now,
		};
		if (parsed.kuota !== undefined) live.kuota = parsed.kuota;
		if (parsed.pelamar !== undefined) live.pelamar = parsed.pelamar;
		if (parsed.batch !== undefined) live.batch = parsed.batch;
		if (parsed.tunjangan !== undefined) live.tunjangan = parsed.tunjangan;
		return live;
	}

	const status: StatusLowongan = isGoneStatus(response.httpStatus ?? 0)
		? "closed"
		: "unknown";

	return {
		status,
		lastChecked: now,
		lastError: status === "unknown" ? response.error : undefined,
		// Preserve last-known numbers on failure (no data loss).
		kuota: previous?.kuota,
		pelamar: previous?.pelamar,
		batch: previous?.batch,
		tunjangan: previous?.tunjangan,
	};
}

/**
 * Run an async mapper over `items` with at most `limit` in flight at once.
 * "Refresh all" uses this so refreshes don't hammer MagangHub (issue #5 AC:
 * throttled concurrency). Results are returned in input order; rejections are
 * captured as failed results so one bad fetch doesn't abort the batch.
 */
export async function runWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = Array.from({
		length: items.length,
	});
	let cursor = 0;
	async function worker(): Promise<void> {
		while (true) {
			const index = cursor++;
			if (index >= items.length) return;
			try {
				results[index] = {
					status: "fulfilled",
					value: await fn(items[index], index),
				};
			} catch (reason) {
				results[index] = { status: "rejected", reason };
			}
		}
	}
	const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
		worker(),
	);
	await Promise.all(workers);
	return results;
}
