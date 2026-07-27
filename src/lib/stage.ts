import type { StatusLamar } from "./types";

/**
 * Display words for each Status Lamar stage (issue #15 / #19, D2/D7).
 *
 * Shared by the popup chip and the on-card chip so the two surfaces never
 * disagree on vocabulary. No stage → no word (callers render nothing).
 */
export const STAGE_LABEL: Record<StatusLamar, string> = {
	dilamar: "Dilamar",
	interview: "Interview",
	diterima: "Diterima",
	ditolak: "Ditolak",
};

/** Stage word, or `undefined` when no stage is set. */
export function stageLabel(
	stage: StatusLamar | undefined,
): string | undefined {
	if (!stage) return undefined;
	return STAGE_LABEL[stage];
}

/**
 * Accessible name for the on-card stage chip (WCAG 1.4.1 / issue #19).
 * Prefix makes the role clear when a screen reader lands on the chip alone.
 */
export function stageChipAriaLabel(stage: StatusLamar): string {
	return `Status Lamar: ${STAGE_LABEL[stage]}`;
}
