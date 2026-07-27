import { CARD_BADGE_LABELS } from "./constants";
import { readCardBadges } from "./extract";
import { FILLING_THRESHOLD, parseCount } from "./parse";

/**
 * Pre-attentive urgency band for a Lowongan card (issue #16).
 *
 * Computed from the card's own Kuota/Pelamar pills — the numbers MagangHub
 * already shows. Three bands on `remaining = kuota − pelamar`:
 *
 *  - `calm`         — seats left and not near full
 *  - `hampir_penuh` — ≤ 1 seat left, OR Pelamar ≥ {@link FILLING_THRESHOLD} of Kuota
 *  - `lewat_kuota`  — over-subscribed (`remaining ≤ 0`); futile to apply
 *
 * Returns `undefined` when either number is missing so the signal simply does
 * not render (a card without numbers is not a "calm" card).
 */
export type UrgencyBand = "calm" | "hampir_penuh" | "lewat_kuota";

export function urgencyBand(
	kuota: number | undefined,
	pelamar: number | undefined,
): UrgencyBand | undefined {
	if (kuota === undefined || pelamar === undefined) return undefined;
	// Kuota of 0 is not a real listing shape; treat it as unparseable rather
	// than divide-by-zero into the filling ratio.
	if (kuota <= 0) return undefined;

	const remaining = kuota - pelamar;
	if (remaining <= 0) return "lewat_kuota";
	if (remaining <= 1 || pelamar >= kuota * FILLING_THRESHOLD) {
		return "hampir_penuh";
	}
	return "calm";
}

/** Human-readable Indonesian label for assistive tech (WCAG 1.4.1). */
export function urgencyLabel(band: UrgencyBand): string {
	switch (band) {
		case "calm":
			return "Masih ada kursi";
		case "hampir_penuh":
			return "Hampir penuh";
		case "lewat_kuota":
			return "Lewat kuota";
	}
}

/**
 * Read a card's Kuota/Pelamar badge pills and return the urgency band, or
 * `undefined` when either pill is missing/unparseable. The content script calls
 * this once per injection — pure, so unit tests cover the band math and e2e
 * covers the DOM wiring.
 */
export function urgencyBandFromCard(card: ParentNode): UrgencyBand | undefined {
	const badges = readCardBadges(card);
	const kuota = parseCount(badges.get(CARD_BADGE_LABELS.kuota) ?? "");
	const pelamar = parseCount(badges.get(CARD_BADGE_LABELS.pelamar) ?? "");
	return urgencyBand(kuota, pelamar);
}
