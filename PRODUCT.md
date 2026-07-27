# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone browsing MagangHub for a Lowongan — fresh graduates hunting a first placement, students doing a required internship, career-switchers, and repeat applicants across Batches. Confirmed with the user as the intended audience; the MVP issue's "fresh graduates" framing is the origin story, not the boundary.

The situation is competitive and time-pressured: a Lowongan has no calendar deadline, it closes when its Kuota fills within its Batch, so a listing worth applying to can disappear between two browsing sessions. The job is to shortlist candidate Lowongan while browsing, remember why each one mattered, track which ones were applied to, and notice when one is filling or gone.

The user is browsing the official site in a normal desktop browser tab, not a dedicated app. They may or may not be logged in to MagangHub — the extension works either way.

## Product Purpose

A browser extension that augments the official MagangHub site (maganghub.kemnaker.go.id) with the shortlisting and monitoring features it lacks: local Favorites, Catatan, a manual Status Lamar stage, refreshable Status Lowongan, search/sort, and export/import.

It exists because third-party MagangHub "helper" sites appeared that ask users for their real SiapKerja password. Those sites hand government credentials to unofficial, unauditable servers, and users may not recognize the risk. This extension is the safe alternative *by construction* — not by promise.

Success is a user who shortlists Lowongan confidently, never types a SiapKerja password into anything but the official site, and can verify that claim from the permission prompt and the public source.

## Positioning

Safe by construction, not by promise. The extension never reads, stores, or transmits the SiapKerja password or the MagangHub login session (ADR-0001), and the permission set is auditable proof: `storage` + `offscreen` + one host permission for `maganghub.kemnaker.go.id`. No `cookies`, no `identity`, no `<all_urls>`, no backend, no telemetry.

A credential-harvesting helper site cannot truthfully copy this. Neither can a well-meaning competitor that reads the login session to auto-detect applied state — that capability is the exact attack surface this product exists to avoid, which is why Status Lamar is deliberately manual.

The trade-off is stated openly in ADR-0001: features that would need the session (auto-detected "already applied") and a backend (cross-device sync) are given up. Local-first is reversible for sync later via end-to-end encryption; the never-touch-credentials line is permanent.

## Operating Context

Two injected surfaces plus one owned surface:

- **MagangHub list page** (`/magang-nasional/lowongan`) — a star toggle injected into every Lowongan card. MagangHub is a Next.js SPA: filters and pagination swap cards in place, and list ↔ detail is a client-side route change, so injection re-runs on DOM mutation.
- **MagangHub detail page** (`/magang-nasional/lowongan/<slug>-<uuid>`) — a favorite toggle injected into MagangHub's own share cluster beside "Bagikan", sized to match it. The detail page also renders a "Lowongan Serupa" grid of the same card markup, which stars like the list.
- **Extension popup** — the owned surface. 360px wide, fixed. Manages the whole Favorites list.

Both injected toggles live in a closed Shadow DOM (ADR-0004): styles are isolated from MagangHub's Tailwind and vice-versa, and no framework runtime is shipped to the page.

MagangHub's markup is not under our control. When a selector stops matching, the extension degrades silently on the page and reports `degraded` health, which the popup surfaces as "extension mungkin butuh update".

## Capabilities and Constraints

**Confirmed shipped:** star toggle on list cards; toggle on detail pages; cross-surface and cross-tab state sync via `chrome.storage.local`; popup Favorites list with empty state; Catatan editor; manual Status Lamar; per-Favorite and "refresh all" Status Lowongan refresh (throttled, offscreen document, public HTML only); search and sort; JSON export/import with schema migration and local-authoritative merge; injection health indicator; trust explainer.

**Technical constraints:**
- MV3 extension built with WXT; Svelte + Tailwind + shadcn-svelte in the popup only; plain DOM in the content script (ADR-0004).
- Popup viewport is a fixed 360px-wide panel, not a responsive page.
- Copy is Indonesian throughout the user-facing surface.
- Refresh fetches public detail HTML from an offscreen document (ADR-0005) with credentials omitted, and must stay throttled — it hits a government site we do not own.
- Favorites are schema-versioned (`SCHEMA_VERSION = 4`) with a lazy migration registry; an upgrade must never lose stored Favorites.
- Chrome is the primary target; a Firefox build target exists (`wxt -b firefox`) but is not a confirmed shipping commitment.

**Undecided — do not assume settled:**
- **Product name.** "MagangHub Extension" is a working title. Not final.
- **Identity assets.** No icon, logo, or store artwork exists in the repo. All still to be designed.
- **Firefox as a supported channel.** Build script exists; the commitment does not.

## Brand Commitments

The popup deliberately matches MagangHub's own shadcn/Tailwind aesthetic so it reads as native to the site rather than as a foreign overlay (ADR-0004). The injected detail toggle mirrors the measured geometry of MagangHub's "Bagikan" button — 40×40, 14px radius, 1px `#e1e7ef` border, white background — because a differently shaped button in a two-button cluster reads as bolted on.

Voice: plain Indonesian, direct, no alarm. The health warning and the trust explainer both state facts a user can act on without dramatizing them.

Vocabulary is fixed and non-negotiable across code, docs, and UI: **Lowongan**, **Penyelenggara**, **Batch**, **Kuota**, **Pelamar**, **Favorite**, **Catatan**, **Status Lamar**, **Status Lowongan**, **SiapKerja**, **MagangHub**. See `CONTEXT.md` for each term and its banned alternatives.

## Evidence on Hand

- `CONTEXT.md` — the domain glossary; the authority on terminology.
- `docs/adr/0001`–`0006` — the six architectural decisions, each with its rejected alternative recorded.
- GitHub issue #1 — the MVP PRD with 50 user stories; issues #2–#10 are its implementation slices.
- `e2e/pages/` — recorded HTML fixtures of real MagangHub pages, captured via the Camoufox automation server. These are the ground truth for MagangHub's actual markup and are what the Playwright suite runs against.
- Open-source repository: `https://github.com/ramaaudra/maganghub-extension` — the auditability claim rests on this being public.

**Absences future work must not fabricate:**
- **No Chrome Web Store listing.** Confirmed not published. No surface may claim it is installable from the Web Store, link to a store page, or imply a trusted-source install. Sideload/dev-load is the only current install path.
- **No users, install counts, ratings, reviews, or testimonials.** Zero. Do not invent social proof.
- **No press, endorsement, or affiliation with Kemnaker.** The extension is unofficial and third-party; implying otherwise would be false and would undermine the trust posture it is built on.
- **No icon, logo, wordmark, screenshots, or store artwork.**
- **No telemetry or analytics**, by design — so no usage data exists to cite.

## Product Principles

1. **Trust is a construction, not a claim.** Every feature is judged first on whether it needs the SiapKerja session or a server. If it does, it does not ship. Auditable permissions and public source are part of the product, not the README.
2. **Manual beats magic when magic costs credentials.** Status Lamar is user-set because detecting it would require reading the login session. Where automation would breach the posture, make the manual path fast and obvious instead of apologizing for it.
3. **The user's data outlives the listing.** A Favorite keeps an immutable snapshot alongside a live reference (ADR-0002). A removed Lowongan, a failed refresh, a schema upgrade, an unlucky import — none of them may lose what the user saved.
4. **Feel native to MagangHub, on MagangHub.** Injected UI adopts the host page's geometry and idiom. The popup adopts its aesthetic. The extension should read as a missing feature of the site, not as an add-on sitting on top of it.
5. **Break loudly to the user, silently to the page.** MagangHub's markup will change. When it does, never throw into their page or log errors in their console — degrade, and tell the user plainly in the popup that the extension needs an update.

## Accessibility & Inclusion

- Injected toggles are real `<button>` elements with `aria-pressed` and Indonesian `aria-label`s that change with state; the icon-only detail toggle carries `title` for pointer users alongside `aria-label` for assistive tech.
- Toggle state is mirrored to a light-DOM `data-filled` attribute so it is observable without piercing the closed Shadow DOM.
- Popup controls carry explicit `aria-label`s; transient status messages use `role="status"`.
- No product-specific conformance standard has been established with the user. Treat WCAG 2.2 AA as the working floor rather than a confirmed requirement.
