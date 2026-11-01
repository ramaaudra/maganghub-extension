import type { StatusLamar } from "./types";

/**
 * Display words for each Status Lamar stage (issue #15 / #19, D2/D7).
 *
 * Shared by the popup and the detail stage card so the two surfaces never
 * disagree on vocabulary. No stage → no word (callers render nothing).
 */
export const STAGE_LABEL: Record<StatusLamar, string> = {
	dilamar: "Dilamar",
	interview: "Interview",
	diterima: "Diterima",
	ditolak: "Ditolak",
};

/** Stage word, or `undefined` when no stage is set. */
export function stageLabel(stage: StatusLamar | undefined): string | undefined {
	if (!stage) return undefined;
	return STAGE_LABEL[stage];
}

/**
 * The (value, label) pairs for a Status Lamar select, shared by the popup's
 * popup select and the detail-page stage card's select so the two surfaces
 * never disagree on vocabulary or order. The leading `""` entry is
 * "Belum dilamar" = no stage (issue #15).
 */
export const STAGE_SELECT_OPTIONS: ReadonlyArray<
	readonly [value: string, label: string]
> = [
	["", "Belum dilamar"],
	...(Object.keys(STAGE_LABEL) as StatusLamar[]).map(
		(stage) => [stage, STAGE_LABEL[stage]] as const,
	),
];
