/**
 * Renders the SakuMagang toolbar icon (ADR-0009) to PNG at every size the
 * manifest declares.
 *
 * The mark is a monogram: white Geist "S" on a full-bleed Field Blue square
 * with sharp corners — the DESIGN.md tokens applied literally, not a redraw.
 * Rendering through Chromium (rather than a hand-written SVG) is deliberate:
 * it resolves `oklch()` and the real Geist Variable outline the same way the
 * popup does, so the icon cannot drift from the design system by way of a
 * hand-converted hex or a substituted typeface.
 *
 * Run: node scripts/render-icon.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "src/public/icon");
const fontUrl = `file://${resolve(root, "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2")}`;

/** Field Blue — DESIGN.md `colors.primary`. */
const FIELD_BLUE = "oklch(0.5 0.134 242.749)";

/**
 * Optical sizing. Geist's cap height is ~0.7em, so a 0.80em glyph gives a cap
 * of ~0.56 × tile — enough to read at 16px without the "S" kissing the edges.
 */
const GLYPH_RATIO = 0.8;

/** Sizes Chrome asks for: toolbar, Windows, extensions page, store/install. */
const SIZES = [16, 32, 48, 128];

function page(size) {
	return `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Geist Variable';
    src: url('${fontUrl}') format('woff2');
    font-weight: 100 900;
  }
  html, body { margin: 0; padding: 0; }
  .tile {
    width: ${size}px;
    height: ${size}px;
    background: ${FIELD_BLUE};
    /* DESIGN.md rounded.sharp — the square corner is the identity. */
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Geist Variable', sans-serif;
    font-weight: 600;
    font-size: ${size * GLYPH_RATIO}px;
    line-height: 1;
    color: #fff;
    /* Nudge off the baseline so the glyph sits optically centred, not
       metrically centred — flex centres the line box, which sits low. */
    padding-bottom: ${size * 0.04}px;
    box-sizing: border-box;
    -webkit-font-smoothing: antialiased;
  }
</style>
<div class="tile">S</div>`;
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
