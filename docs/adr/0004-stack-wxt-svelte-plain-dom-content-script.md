# Stack: WXT + Svelte + shadcn-svelte, no framework runtime in the content script

The extension is built with **WXT** (Vite-based MV3 framework), **Svelte** + **shadcn-svelte** + **Tailwind** for the popup, and **plain DOM inside a Shadow DOM** for the star toggle injected into MagangHub pages. TypeScript throughout.

The non-obvious part is the split. The popup is a rich surface (favorites list, search/sort, refresh, export/import, notes editor, trust explainer) and benefits from a framework — Svelte is chosen over React for a smaller bundle. But the star toggle is a single button mounted into every Lowongan card on every MagangHub page load, so shipping a framework runtime to the page has a real, repeated cost. A plain-DOM element in a closed Shadow DOM keeps the content-script bundle near-zero and isolates styles from MagangHub's Tailwind (and vice-versa).

A future contributor may be tempted to "simplify" by using Svelte everywhere via WXT's `createShadowRootUi`. That is the rejected alternative: consistent, but it ships the Svelte runtime to MagangHub on every page load for the sake of one button. shadcn-svelte is used in the popup specifically to match MagangHub's own shadcn/Tailwind aesthetic so the popup feels native.
