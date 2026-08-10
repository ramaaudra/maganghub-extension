import type { IconSvgElement } from "@hugeicons/svelte";

export interface HugeiconSvgOptions {
	readonly size?: number | string;
	readonly strokeWidth?: number;
	readonly color?: string;
}

const XML_ESCAPE_MAP: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&apos;",
};

function escapeXml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => XML_ESCAPE_MAP[character]);
}

function toAttributeName(name: string): string {
	return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function renderElement(
	tag: string,
	attributes: Record<string, string | number>,
	options: HugeiconSvgOptions,
): string {
	const renderedAttributes = Object.entries(attributes)
		.filter(([name]) => name !== "key")
		.map(([name, rawValue]) => {
			const value =
				name === "strokeWidth" && options.strokeWidth !== undefined
					? options.strokeWidth
					: name === "stroke" && options.strokeWidth !== undefined
						? "currentColor"
						: rawValue === "currentColor" && options.color !== undefined
							? options.color
							: rawValue;
			return `${toAttributeName(name)}="${escapeXml(String(value))}"`;
		})
		.join(" ");

	return `<${tag}${renderedAttributes ? ` ${renderedAttributes}` : ""}></${tag}>`;
}

/** Render a Hugeicons core icon for plain DOM surfaces without Svelte. */
export function renderHugeiconSvg(
	icon: IconSvgElement,
	options: HugeiconSvgOptions = {},
): string {
	const size = options.size ?? 24;
	const colorAttribute = options.color ? ` color="${escapeXml(options.color)}"` : "";
	const children = icon
		.map(([tag, attributes]) => renderElement(tag, attributes, options))
		.join("");

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${escapeXml(String(size))}" height="${escapeXml(String(size))}" viewBox="0 0 24 24" fill="none"${colorAttribute} aria-hidden="true">${children}</svg>`;
}

/** Encode a Hugeicons SVG for CSS properties such as `background-image`. */
export function renderHugeiconDataUri(
	icon: IconSvgElement,
	options: HugeiconSvgOptions = {},
): string {
	return `data:image/svg+xml,${encodeURIComponent(renderHugeiconSvg(icon, options))}`;
}
