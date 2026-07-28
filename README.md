<div align="center">

<img src="./src/public/icon/128.png" alt="SakuMagang" height="96" />

# SakuMagang

**Local Favorites, Catatan, and Status Lamar for [MagangHub](https://maganghub.kemnaker.go.id) — without ever touching SiapKerja credentials.**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Svelte](https://img.shields.io/badge/Svelte_5-FF3E00?style=flat-square&logo=svelte&logoColor=white)](https://svelte.dev)
[![WXT](https://img.shields.io/badge/WXT-MV3-0ea5e9?style=flat-square)](https://wxt.dev)
[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[Features](#features) · [Install](#install) · [Develop](#develop) · [Safety](#why-it-is-safe) · [Architecture](#architecture) · [Docs](#docs)

</div>

> [!IMPORTANT]
> **Unofficial, not published.** SakuMagang is an independent third-party project.
> It is **not** affiliated with, endorsed by, or produced by **Kemnaker** or the
> MagangHub program. There is **no Chrome Web Store listing** — sideload is the
> only install path. The name deliberately does not lead with "MagangHub …"
> (that would read as a Kemnaker product; see ADR-0009).

A browser extension that adds the shortlisting and monitoring features MagangHub
lacks. Star Lowongan while browsing, keep a Catatan on why you saved each one,
track Status Lamar by hand, and refresh live Kuota/Pelamar — all local-first,
all credential-free.

It exists because third-party "helper" sites appeared that ask for real SiapKerja
passwords. Those sites hand government credentials to unofficial servers. This
extension is the safe alternative **by construction**, not by promise.

## Features

- **Star Lowongan** from the list or detail page — saved locally as a Favorite
- **Catatan** — free-text note per Favorite (why you saved it)
- **Status Lamar** — manual stage tracker: Belum dilamar → Dilamar → Interview → Diterima / Ditolak  
  Always user-set; the extension never auto-detects applied state
- **Status Lowongan** — refresh live Kuota/Pelamar from the public detail page, one Favorite or all (throttled, offscreen document)
- **Search and sort** the Favorites list in the popup
- **Export / import** Favorites as JSON, with schema migration
- **Injection health indicator** — when MagangHub's markup changes and injection fails, the popup says so instead of failing silently

## Install

There is no Web Store build. Sideload a local build:

### Prerequisites

- [Node.js](https://nodejs.org) LTS (20+)
- Chromium-based browser (Chrome primary)

### Steps

```sh
npm install
npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** and select `.output/chrome-mv3`
4. Visit [`https://maganghub.kemnaker.go.id/magang-nasional/lowongan`](https://maganghub.kemnaker.go.id/magang-nasional/lowongan) and star a Lowongan, or open the popup to manage Favorites

To update: pull latest source, re-run `npm run build`, then **Reload** the extension card.

> [!NOTE]
> A Firefox build target exists (`npm run build:firefox`) but is **not** a confirmed shipping channel.

## Develop

```sh
npm install
npm run dev          # WXT dev — launches Chrome with the extension loaded, hot-reload
npm run typecheck    # tsc + svelte-check
npm run test:unit    # vitest
npm run test:e2e     # wxt build && playwright (HTML fixtures, not live MagangHub)
npm run lint         # biome lint
npm run format       # biome format
```

| Surface | Stack |
|---|---|
| Popup | Svelte 5 + Tailwind + shadcn-svelte |
| Content script | Plain DOM inside closed Shadow DOM (no framework runtime on MagangHub) |
| Background / refresh | MV3 service worker + offscreen document |

E2E runs against recorded MagangHub HTML fixtures under `e2e/`, not the live site.

## Why it is safe

SakuMagang never reads, stores, or transmits the SiapKerja password or the
MagangHub login session. There is no account, no server, and no telemetry.

You can verify this from the permission prompt at install time:

| Permission | Purpose |
|---|---|
| `storage` | Save Favorites in `chrome.storage.local` |
| `offscreen` | Parse public detail HTML for Status Lowongan refresh |
| `https://maganghub.kemnaker.go.id/*` | Read the public listing/detail pages you already view |

**Notably absent:** no `cookies`, no `identity`, no `<all_urls>`, no backend, no analytics.

A credential-harvesting helper cannot truthfully copy this posture. Auto-detecting
"already applied" would require reading the login session — the exact attack
surface this product avoids — which is why **Status Lamar is deliberately manual**.
Full rationale: [`docs/adr/0001`](docs/adr/).

## Architecture

Three surfaces:

| Surface | Role |
|---|---|
| **List page** (`/magang-nasional/lowongan`) | Star toggle on every Lowongan card; re-injects on SPA DOM mutations |
| **Detail page** (`/magang-nasional/lowongan/<slug>-<uuid>`) | Favorite toggle beside MagangHub's "Bagikan" share control |
| **Popup** (360px fixed) | Owned Favorites UI: list, Catatan, Status Lamar, refresh, search/sort, export/import |

```
src/
├── entrypoints/
│   ├── background.ts           # service worker, messaging, offscreen lifecycle
│   ├── maganghub.content.ts    # list + detail injection (closed Shadow DOM)
│   └── popup/                  # Svelte popup app
├── lib/                        # favorites storage, refresh, parse, schema migration
├── offscreen/                  # credential-free fetch + DOMParser for refresh
└── public/icon/                # toolbar monogram (Field Blue "S")
```

Key decisions live in `docs/adr/`:

- **0001** — never touch SiapKerja credentials
- **0002** — immutable Favorite snapshot + mutable liveStatus
- **0004** — closed Shadow DOM for injected UI
- **0005** — offscreen document for public HTML refresh
- **0009** — product name is SakuMagang

## Docs

| Doc | What it is |
|---|---|
| [`CONTEXT.md`](CONTEXT.md) | Domain glossary (Lowongan, Favorite, Status Lamar, …) |
| [`PRODUCT.md`](PRODUCT.md) | Product posture, principles, constraints |
| [`DESIGN.md`](DESIGN.md) | Visual system for the popup |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records |
| [`AGENTS.md`](AGENTS.md) | Agent/contributor working agreements |

Source: [github.com/ramaaudra/maganghub-extension](https://github.com/ramaaudra/maganghub-extension)

## FAQ

**Does this log me into MagangHub?**  
No. It never touches your SiapKerja session. Star and refresh work whether or not you are logged in.

**Will my Favorites sync across devices?**  
Not today. Everything is local-first in `chrome.storage.local`. Export/import is the backup path. Cross-device sync would need a backend; the never-touch-credentials line stays permanent either way.

**What happens when MagangHub changes its markup?**  
Injection degrades silently on the page. The popup surfaces a health warning ("extension mungkin butuh update") instead of failing quietly forever.

**Can Status Lamar auto-update when I apply?**  
No — by design. Detecting application state would require reading the login session. Set the stage yourself; the control is meant to be fast and obvious.
