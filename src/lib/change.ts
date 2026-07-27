/**
 * Change detection for a Favorite's Status Lowongan between refreshes (B1 / D5).
 *
 * Keep one previous successful sample on `LiveStatus.previousSample` and, when
 * the next successful refresh differs in kuota / pelamar / status, surface a
 * one-line Indonesian notice on the popup card. Failed refreshes (`unknown`)
 * and never-refreshed Favorites never count as changes — the event is the
 * signal, not a trend (no history array, no velocity).
 */

import type { LiveStatus, LiveStatusSample, StatusLowongan } from "./types";

/** A liveStatus that can become a previousSample: successful refresh only. */
export function isSuccessfulSample(
	live: LiveStatus | undefined,
): live is LiveStatus & { lastChecked: string } {
	if (!live || !live.lastChecked) return false;
	return live.status !== "unknown";
}

/** Project a successful liveStatus onto the compact sample shape. */
export function toLiveStatusSample(live: LiveStatus): LiveStatusSample {
	const sample: LiveStatusSample = {
		at: live.lastChecked ?? new Date().toISOString(),
		status: live.status,
	};
	if (live.kuota !== undefined) sample.kuota = live.kuota;
	if (live.pelamar !== undefined) sample.pelamar = live.pelamar;
	return sample;
}

/**
 * True when a successful current sample differs from the previous one in the
 * fields B1 cares about (kuota / pelamar / status). Failed refreshes and a
 * missing previous sample never count.
 */
export function hasMeaningfulChange(
	current: Pick<LiveStatus, "status" | "kuota" | "pelamar"> | LiveStatus,
	previous: LiveStatusSample | undefined,
): boolean {
	if (!previous) return false;
	if (current.status === "unknown") return false;
	return (
		current.status !== previous.status ||
		current.kuota !== previous.kuota ||
		current.pelamar !== previous.pelamar
	);
}

/**
 * Remaining seats (`kuota − pelamar`), or `undefined` when either number is
 * missing. Negative remaining means over-subscribed.
 */
function remaining(
	kuota: number | undefined,
	pelamar: number | undefined,
): number | undefined {
	if (kuota === undefined || pelamar === undefined) return undefined;
	return kuota - pelamar;
}

function isFull(
	status: StatusLowongan,
	kuota: number | undefined,
	pelamar: number | undefined,
): boolean {
	if (status === "closed") return true;
	const left = remaining(kuota, pelamar);
	return left !== undefined && left <= 0;
}

/**
 * One-line Indonesian notice for the popup card, or `null` when there is
 * nothing to show (no previous sample, no meaningful change, failed refresh,
 * never refreshed).
 *
 * Phrasing (D5 / issue #17):
 *   - seat drop still open:  "sisa N kursi, tadinya M"
 *   - newly full / closed:   "penuh sejak terakhir dicek"
 *   - other status/number shifts fall back to a status/number "tadinya X, sekarang Y"
 */
export function formatChangeNotice(live: LiveStatus): string | null {
	const prev = live.previousSample;
	if (!prev) return null;
	if (!isSuccessfulSample(live)) return null;
	if (!hasMeaningfulChange(live, prev)) return null;

	const nowFull = isFull(live.status, live.kuota, live.pelamar);
	const wasFull = isFull(prev.status, prev.kuota, prev.pelamar);
	if (nowFull && !wasFull) {
		return "penuh sejak terakhir dicek";
	}

	const nowLeft = remaining(live.kuota, live.pelamar);
	const prevLeft = remaining(prev.kuota, prev.pelamar);
	if (
		nowLeft !== undefined &&
		prevLeft !== undefined &&
		nowLeft !== prevLeft &&
		nowLeft > 0
	) {
		return `sisa ${nowLeft} kursi, tadinya ${prevLeft}`;
	}

	// Fallback for less common shifts (e.g. status open→filling with same seats,
	// or a kuota change with missing pelamar). Keep the "tadinya X, sekarang Y"
	// shape the ticket asks for.
	const before = describeSample(prev.status, prev.kuota, prev.pelamar);
	const after = describeSample(live.status, live.kuota, live.pelamar);
	if (before === after) return null;
	return `tadinya ${before}, sekarang ${after}`;
}

const STATUS_WORD: Record<Exclude<StatusLowongan, "unknown">, string> = {
	open: "buka",
	filling: "mengisi",
	closed: "tutup",
};

function describeSample(
	status: StatusLowongan,
	kuota: number | undefined,
	pelamar: number | undefined,
): string {
	const left = remaining(kuota, pelamar);
	if (left !== undefined) {
		if (left <= 0) return "penuh";
		return `sisa ${left} kursi`;
	}
	if (status === "unknown") return "tidak diketahui";
	return STATUS_WORD[status];
}
