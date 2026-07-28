import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
	srcDir: "src",
	modules: ["@wxt-dev/module-svelte"],
	manifest: {
		name: "MagangHub Extension",
		description:
			"Tandai Lowongan MagangHub sebagai favorit — tersimpan lokal, tanpa menyentuh akun SiapKerja Anda.",
		version: "0.0.0",
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
