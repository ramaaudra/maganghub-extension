# MagangHub Extension

A Chrome extension that augments the official [MagangHub](https://maganghub.kemnaker.go.id) internship listings with local favorites, Catatan, a manual Status Lamar stage tracker, and refreshable Status Lowongan — without ever touching the user's SiapKerja credentials.

> **Status: unofficial, not published.** This is an independent, third-party
> project. It is **not** affiliated with, endorsed by, or produced by
> **Kemnaker** or the MagangHub program. "MagangHub Extension" is a
> working title, not a final name. There is **no Chrome Web Store listing** —
> sideload/dev-load is the only install path. Nothing here may link to a store
> page or imply a trusted-source install.

## What it does

- **Star Lowongan** from the list or detail page — saved locally as a Favorite.
- **Catatan** — a free-text note per Favorite (why you saved it).
- **Status Lamar** — a manual application-stage tracker (Belum dilamar → Dilamar → Interview → Diterima / Ditolak). Always user-set; the extension never auto-detects applied state.
- **Status Lowongan** — refresh a Favorite's live Kuota/Pelamar from the public
  detail page, individually or all at once (throttled, via an offscreen
  document).
- **Search and sort** the Favorites list in the popup.
- **Export/import** Favorites as JSON, with schema migration.
- **Injection health indicator** — when MagangHub's markup changes and the
  extension can no longer inject, the popup says so instead of failing silently.

## Why it is safe

This extension exists because third-party "helper" sites appeared that ask for
your real SiapKerja password and hand government credentials to unofficial,
unauditable servers. This extension is the safe alternative **by construction**:
it never reads, stores, or transmits the SiapKerja password or the MagangHub
login session. There is no account, no server, no telemetry.

You can verify this from the permission prompt at install time. The entire
permission set is:

| Permission | What it's for |
|---|---|
| `storage` | Save Favorites locally in `chrome.storage.local`. |
| `offscreen` | Parse public detail HTML in an offscreen document for refresh (no credentials sent). |
| `https://maganghub.kemnaker.go.id/*` (host) | Read the public listing/detail pages you're already viewing. |

**Notably absent:** no `cookies`, no `identity`, no `<all_urls>`, no backend,
no analytics. A credential-harvesting helper site cannot truthfully copy this
posture — and a competitor that reads the login session to auto-detect applied
state would be adopting the exact attack surface this product avoids, which is
why Status Lamar is deliberately manual. See `docs/adr/0001` for the full
rationale.

## Install (sideload)

There is no Web Store build. To run it:

1. Install [Node.js](https://nodejs.org) and run, from the repo root:
   ```sh
   npm install
   npm run build
   ```
2. Open `chrome://extensions`, enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `.output/chrome-mv3` directory the
   build just produced.
4. Visit `https://maganghub.kemnaker.go.id/magang-nasional/lowongan` and star a
   Lowongan, or open the extension popup to see your Favorites.

To apply an update, pull the latest source, re-run `npm run build`, and click
**Reload** on the extension card in `chrome://extensions`.

## Develop

```sh
npm install
npm run dev        # WXT dev mode — launches Chrome with the extension loaded and hot-reloads
npm run typecheck  # tsc + svelte-check
npm run test:unit  # vitest
npm run test:e2e   # wxt build && playwright test (runs against recorded HTML fixtures)
```

The popup uses Svelte + Tailwind + shadcn-svelte; the content script uses plain
DOM inside closed Shadow DOM so no framework runtime or styles leak onto
MagangHub. Firefox build target: `npm run build:firefox` (exists; not a
confirmed shipping commitment).

## Repository

- Source: `https://github.com/ramaaudra/maganghub-extension`
- Domain glossary: `CONTEXT.md`
- Product posture and principles: `PRODUCT.md`
- Architecture decisions: `docs/adr/`

## License

MIT — see [LICENSE](LICENSE). The extension is unofficial and unaffiliated with
Kemnaker; the license covers this code only, not the MagangHub site or its data.