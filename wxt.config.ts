import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
	srcDir: "src",
	// WXT resolves publicDir against the project root, not srcDir, so this has
	// to be spelled out for the icons to be copied into the build.
	publicDir: "src/public",
	modules: ["@wxt-dev/module-svelte"],
	manifest: {
		// ADR-0009: a standalone name. "MagangHub" belongs in the description,
		// where it reads as the site we support — not in the name, where it
		// would read as a product Kemnaker made.
		name: "SakuMagang",
		description:
			"Tandai Lowongan MagangHub sebagai favorit — tersimpan lokal, tanpa menyentuh akun SiapKerja Anda.",
		version: "0.1.0",
		// Monogram mark, rendered by scripts/render-icon.mjs from DESIGN.md
		// tokens. Without these Chrome shows the grey puzzle default, which
		// reads as an unvetted sideload — the wrong first impression for a
		// tool whose whole argument is that it can be audited.
		icons: {
			16: "icon/16.png",
			32: "icon/32.png",
			48: "icon/48.png",
			128: "icon/128.png",
		},
		// ADR-0001: minimal permissions. No cookies, identity, or <all_urls>.
		// `offscreen` (ADR-0005) hosts the fetch + DOMParser that refresh uses.
		permissions: ["storage", "offscreen"],
		host_permissions: ["https://maganghub.kemnaker.go.id/*"],
	},
	vite: () => ({
		plugins: [tailwindcss()],
	}),
	webExt: {
		chromiumArgs: ["https://maganghub.kemnaker.go.id/"],
		firefoxArgs: ["https://maganghub.kemnaker.go.id/"],
	},
});
