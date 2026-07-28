/**
 * Seat display for a Favorite — the one line the popup card leads with.
 *
 * Two sources, one shape. `liveStatus.kuota`/`.pelamar` are parsed numbers
 * (refresh, ADR-0003); `savedSnapshot.kuota`/`.pelamar` are *display strings*
 * captured off the list card's badge pills, and they still carry their own
 * label ("Kuota: 5", "Pelamar: 0" — see `readCardBadges`). Rendering the
 * snapshot string under a hand-written "Kuota" label is what produced the
 * doubled "Kuota Kuota: 1" in the popup; this module strips the embedded label
 * so the caller can own the wording exactly once.
 *
 * Pure and browser-free: no storage, no `Date`, no DOM. The popup renders what
 * `seatLine` returns and adds no numbers of its own.
 */

import { FILLING_THRESHOLD, parseCount } from "./parse";
import type { Favorite, LiveStatus, LowonganSnapshot } from "./types";

/** Where a seat reading came from — the popup labels cold data differently. */
export type SeatSource = "live" | "snapshot";

/**
 * A normalized seat reading, ready to render.
 *
 * `kuota`/`pelamar` are numbers when they parsed and `undefined` when the
 * source did not expose them. `remaining` is only present when both did:
 * "sisa kursi" is a subtraction, and half a subtraction is not a signal.
 */
export interface Seats {
	source: SeatSource;
	kuota?: number;
	pelamar?: number;
	/** `kuota − pelamar`; negative means over-subscribed. */
	remaining?: number;
	/** True when neither number is known — the caller renders nothing. */
	empty: boolean;
}

const EMPTY: Seats = { source: "snapshot", empty: true };

function build(
	source: SeatSource,
	kuota: number | undefined,
	pelamar: number | undefined,
): Seats {
	if (kuota === undefined && pelamar === undefined) {
		return { source, empty: true };
	}
	const remaining =
		kuota !== undefined && pelamar !== undefined ? kuota - pelamar : undefined;
	return { source, kuota, pelamar, remaining, empty: false };
}

/**
 * Read seats from the immutable snapshot, stripping the label the extractor
 * kept ("Kuota: 5" → 5). Values that hold no digits become `undefined` rather
 * than 0 — an unparseable badge is missing data, not an empty quota.
 */
export function snapshotSeats(snap: LowonganSnapshot): Seats {
	return build(
		"snapshot",
		parseCount(snap.kuota ?? ""),
		parseCount(snap.pelamar ?? ""),
	);
}

/** Read seats from the live sample. Only meaningful once a refresh has run. */
export function liveSeats(live: LiveStatus): Seats {
	return build("live", live.kuota, live.pelamar);
}

/**
 * The seats to show for a Favorite: live numbers once it has been refreshed,
 * otherwise the snapshot captured at star time.
 *
 * The fallback is the point. A never-refreshed Favorite used to show only
 * "tekan Segarkan" — instructional prose where the user wanted a number they
 * had, in fact, already seen on the card they starred. Preferring live over
 * snapshot (rather than merging) keeps one provenance per line, so the
 * accompanying "saat disimpan" qualifier is never attached to fresh data.
 */
export function favoriteSeats(fav: Favorite): Seats {
	if (fav.liveStatus.lastChecked) {
		const live = liveSeats(fav.liveStatus);
		if (!live.empty) return live;
	}
	const snap = snapshotSeats(fav.savedSnapshot);
	if (!snap.empty) return snap;
	return EMPTY;
}

/**
 * One compact Indonesian seat line, or `null` when there is nothing to say.
 *
 * Phrasing, in priority order:
 *   - both known, seats left → "sisa 4 kursi · 1 dari 5"
 *   - both known, none left  → "penuh · 5 dari 5"
 *   - kuota only             → "5 kuota"
 *   - pelamar only           → "1 pelamar"
 *
 * "sisa N kursi" leads because remaining seats are the decision, and it is the
 * same wording `formatChangeNotice` uses — the card must not call the same
 * quantity two different things one line apart.
 */
export function seatLine(seats: Seats): string | null {
	if (seats.empty) return null;
	const { kuota, pelamar, remaining } = seats;
	if (remaining !== undefined && kuota !== undefined && pelamar !== undefined) {
		const head = remaining > 0 ? `sisa ${remaining} kursi` : "penuh";
		return `${head} · ${pelamar} dari ${kuota}`;
	}
	if (kuota !== undefined) return `${kuota} kuota`;
	if (pelamar !== undefined) return `${pelamar} pelamar`;
	return null;
}

/**
 * Pressure band for the seat line's emphasis — how close this Lowongan is to
 * closing by filling its Kuota.
 *
 * Distinct from `urgency.ts` (which reads a *card's* badge pills on the
 * MagangHub page and is currently unreferenced): this one reads an already
 * normalized {@link Seats} and drives popup type weight, not an injected ring.
 * Shares `FILLING_THRESHOLD` with the refresh parser rather than re-declaring
 * the number, so a card cannot read "sisa 1 kursi" in calm grey while its
 * Status Lowongan chip says Mengisi.
 */
export type SeatPressure = "none" | "calm" | "tight" | "full";

export function seatPressure(seats: Seats): SeatPressure {
	if (seats.empty) return "none";
	const { kuota, pelamar, remaining } = seats;
	if (remaining === undefined || kuota === undefined || pelamar === undefined) {
		return "none";
	}
	if (kuota <= 0) return "none";
	if (remaining <= 0) return "full";
	if (remaining <= 1 || pelamar >= kuota * FILLING_THRESHOLD) return "tight";
	return "calm";
}
