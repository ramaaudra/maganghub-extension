import { describe, expect, it } from "vitest";
import { STAGE_LABEL, stageLabel } from "../src/lib/stage";
import type { StatusLamar } from "../src/lib/types";

describe("stageLabel", () => {
	it("returns the MagangHub-shaped word for each stage", () => {
		const stages: StatusLamar[] = [
			"dilamar",
			"interview",
			"diterima",
			"ditolak",
		];
		for (const stage of stages) {
			expect(stageLabel(stage)).toBe(STAGE_LABEL[stage]);
		}
	});

	it("returns undefined when no stage is set", () => {
		expect(stageLabel(undefined)).toBeUndefined();
	});
});
