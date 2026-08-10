/**
 * Renders the SakuMagang Route mark (ADR-0009) to PNG at every size the
 * manifest declares.
 *
 * The canonical vector lives in src/public/icon/route.svg. Chromium is used
 * only as the rasterizer so toolbar PNGs and the popup's SVG share one mark,
 * one palette, and one balanced viewBox.
 *
 * Run: node scripts/render-icon.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "src/public/icon");
const routeSvgPath = resolve(root, "src/public/icon/route.svg");
const routeSvg = await readFile(routeSvgPath, "utf8");

/** Paper surface and Field Blue are fixed in the canonical SVG source. */
const PAPER = "#f4f3ed";

/** Sizes Chrome asks for: toolbar, Windows, extensions page, store/install. */
const SIZES = [16, 32, 48, 128];

function page(size) {
	return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; }
  .tile {
    width: ${size}px;
    height: ${size}px;
    background: ${PAPER};
    overflow: hidden;
    box-sizing: border-box;
  }
  .tile > svg {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
<div class="tile">${routeSvg}</div>`;
}

const browser = await chromium.launch();
await mkdir(outDir, { recursive: true });

for (const size of SIZES) {
	const ctx = await browser.newContext({
		viewport: { width: size, height: size },
		deviceScaleFactor: 1,
	});
	const p = await ctx.newPage();
	await p.setContent(page(size));
	await p.evaluate(() => document.fonts.ready);
	const buf = await p.locator(".tile").screenshot({ omitBackground: false });
	await writeFile(resolve(outDir, `${size}.png`), buf);
	await ctx.close();
	console.log(`icon/${size}.png`);
}

await browser.close();
