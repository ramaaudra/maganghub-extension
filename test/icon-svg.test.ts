import { ArrowDown01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { describe, expect, it } from "vitest";
import { renderHugeiconDataUri, renderHugeiconSvg } from "@/lib/icon-svg";

describe("renderHugeiconSvg", () => {
	it("serializes Hugeicons data with the requested SVG presentation", () => {
		const svg = renderHugeiconSvg(StarIcon, { size: 16, strokeWidth: 2 });

		expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
		expect(svg).toContain('width="16"');
		expect(svg).toContain('height="16"');
		expect(svg).toContain('stroke-width="2"');
		expect(svg).toContain("<path ");
		expect(svg).not.toContain('key="');
	});

	it("can pin a color for SVGs embedded in CSS data URLs", () => {
		const svg = renderHugeiconSvg(StarIcon, {
			color: "#64748b",
		});

		expect(svg).toContain('stroke="#64748b"');
	});

	it("encodes the SVG safely for a CSS background image", () => {
		const dataUri = renderHugeiconDataUri(ArrowDown01Icon, {
			color: "#64748b",
		});

		expect(dataUri).toMatch(/^data:image\/svg\+xml,/);
		expect(decodeURIComponent(dataUri)).toContain('stroke="#64748b"');
	});
});
