---
name: SakuMagang — Popup
description: Field-notebook UI for a credential-free MagangHub favorites tool; sharp corners, Geist sans, one calm blue.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.145 0 0)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.145 0 0)"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.922 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  accent: "oklch(0.97 0 0)"
  accent-foreground: "oklch(0.205 0 0)"
  secondary: "oklch(0.967 0.001 286.375)"
  secondary-foreground: "oklch(0.21 0.006 285.885)"
  primary: "oklch(0.5 0.134 242.749)"
  primary-foreground: "oklch(0.977 0.013 236.62)"
  ring: "oklch(0.708 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  chart-1: "oklch(0.897 0.196 126.665)"
  chart-2: "oklch(0.768 0.233 130.85)"
  chart-3: "oklch(0.648 0.2 131.684)"
  chart-4: "oklch(0.532 0.157 131.589)"
  chart-5: "oklch(0.453 0.124 130.933)"
  sidebar: "oklch(0.985 0 0)"
  sidebar-foreground: "oklch(0.145 0 0)"
  sidebar-primary: "oklch(0.588 0.158 241.966)"
  sidebar-border: "oklch(0.922 0 0)"
  sidebar-ring: "oklch(0.708 0 0)"
  primary-dark: "oklch(0.443 0.11 240.79)"
typography:
  title:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "1.3"
  body:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "1.5"
  label:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "1.3"
  caption:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "1.4"
rounded:
  sharp: "0rem"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.sharp}"
    padding: "16px"
  card-active-stage:
    backgroundColor: "oklch(0.5 0.134 242.749 / 0.05)"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.sharp}"
    padding: "16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sharp}"
    padding: "4px 10px"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sharp}"
    padding: "4px 10px"
  status-chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  link-primary:
    textColor: "{colors.primary}"
    rounded: "{rounded.sharp}"
    padding: "4px 8px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sharp}"
    padding: "4px 8px"
  group-toggle:
    backgroundColor: "oklch(0.97 0 0 / 0.4)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sharp}"
    padding: "6px 10px"
---

# Design System: SakuMagang — Popup

## Overview

**Creative North Star: "The Field Notebook"**

The popup reads like a field notebook: sharp-cornered, plain-faced, dependable. Geist's geometric sans sets a Swiss, instrument-like tone; the single calm blue (oklch 0.5 0.134 242.749) is the only chromatic voice and it is used sparingly — to mark the Lowongan a user is still acting on, the link back to MagangHub, and focus. Everything else is ink on paper: near-black foreground (oklch 0.145 0 0) on pure white, with a light-gray border (oklch 0.922 0 0) and a muted field (oklch 0.97 0 0) carrying secondary surfaces. Depth is conveyed by 1px borders and the muted fill, not by shadow; the Card's faint `shadow-sm` is the only elevation and it never grows.

The form language is intentionally binary. Containers, controls, inputs, and selects are square-cornered (radius `0rem`, from the preset's `--radius: 0rem`). The pill (`rounded-full`, 9999px) is reserved exclusively for state signals — status chips that say *Buka / Mengisi / Tutup* and *Status Lamar* stage chips. A pill on an action surface would read as decoration; a rectangle on a status chip would read as a button. The system keeps the two shapes strictly separated so shape itself carries meaning.

Voice is plain Indonesian, direct, never alarmist — matching PRODUCT.md. The system diverges from ADR-0004's original "match MagangHub's own shadcn/Tailwind aesthetic" commitment: the preset establishes a distinct Field-Notebook identity (blue accent, sharp corners, Geist) rather than a neutral mirror of MagangHub. ADR-0004 should be revisited if this identity is kept; the injected content-script toggles still mirror MagangHub's "Bagikan" geometry per ADR-0004 and are out of scope for this system.

**Key Characteristics:**
- Sharp rectangles for every surface and control; status chips are sharp uppercase micro-labels with a tiny colored dot.
- One accent (calm blue) used on ≤10% of any screen — active state, link, focus ring.
- Flat by default; the single `shadow-sm` lives on the Card and never escalates.
- Geist Variable for every role; hierarchy is size + weight, never a second typeface.
- 360px fixed popup; tight 8px rhythm; information-dense but calm.
- Plain Indonesian copy; fixed vocabulary (Lowongan, Penyelenggara, Batch, Kuota, Pelamar, Favorite, Catatan, Status Lamar, Status Lowongan).

## Colors

A neutral ink-on-paper palette with one calm blue accent and a reserved destructive red. Status semantics (open/filling/closed) borrow Tailwind's emerald/amber/rose 100/700 pairs as ad-hoc surface fills — they are not design tokens and should not be introduced elsewhere.

### Primary
- **Field Blue** (`oklch(0.5 0.134 242.749)`): the single accent. Used on the active-stage card tint (`bg-primary/5` + `border-primary/40`), the *dilamar* stage chip (`bg-primary/10 text-primary`), the *Buka di MagangHub* link, and the focus ring. Never a large-surface fill. In dark mode it deepens to `oklch(0.443 0.11 240.79)`.

### Secondary / Tertiary
- Omitted. The system has one accent; secondary/tertiary roles collapse into Neutral. Chart colors (`chart-1`…`chart-5`, a green ramp) exist as tokens but are unused in the popup today.

### Neutral
- **Paper** (`oklch(1 0 0)`, `--background` / `--card` / `--popover`): every primary surface.
- **Ink** (`oklch(0.145 0 0)`, `--foreground`): all body and heading text.
- **Hairline** (`oklch(0.922 0 0)`, `--border` / `--input`): every 1px boundary — cards, inputs, selects, buttons, group toggles.
- **Field** (`oklch(0.97 0 0)`, `--muted` / `--accent`): secondary surface fill — button hover, group toggle base (`bg-muted/40`), the *Tidak diketahui* status chip.
- **Slate** (`oklch(0.556 0 0)`, `--muted-foreground`): secondary text — subtitles, meta lines, placeholder.
- **Warm Paper** (`oklch(0.967 0.001 286.375)`, `--secondary`): available but currently unused in the popup.

### Named Rules
**The One Blue Rule.** Field Blue is used on ≤10% of any screen. Its rarity is the point — it marks the one Lowongan a user is acting on, the exit link, and focus. A blue button or blue header is a failure of restraint.
**The Status-Color Quarantine.** `bg-emerald-100`/`text-emerald-700`, `bg-amber-100`/`text-amber-700`, `bg-rose-100`/`text-rose-700` are permitted only inside status chips and change-notice banners. They are state signals, never decoration, never a card background, never a button.
**The Destructive Reservation.** `--destructive` (`oklch(0.577 0.245 27.325)`) is for genuine failure only — *Refresh gagal*, import errors. Never use it for a "delete" affordance that is reversible, and never as an accent.

## Typography

**Display Font:** Geist Variable (system sans fallback)
**Body Font:** Geist Variable (system sans fallback)
**Label Font:** Geist Variable — no distinct family; hierarchy is size and weight only.

**Character:** A single geometric grotesque throughout. Geist's even color and open apertures keep a 360px popup legible at 12–16px without a second typeface. There is no display size; the popup's largest text is the 16px section title.

### Hierarchy
- **Title** (Geist, 600, 16px, 1.3): the popup header *Favorit Lowongan* and `CardTitle`. The ceiling — nothing in the popup is larger.
- **Body** (Geist, 400, 14px, 1.5): a Favorite's title (`font-medium` at this size), organizer, location, and the Catatan textarea.
- **Label** (Geist, 500, 12px, 1.3): buttons (*Segarkan*, *Ekspor*, *Impor*, *Segarkan semua*), status chips, sort/select labels.
- **Caption** (Geist, 400, 12px, 1.4): the *Tersimpan lokal di browser ini* subtitle, *Terakhir dicek* meta, *Tersimpan* flash, placeholder text — all `text-muted-foreground`.

### Named Rules
**The No-Display Rule.** The popup has no display/headline scale. 16px is the ceiling; if a screen needs a bigger headline, the screen is wrong for a 360px panel, not the type scale.
**The Single-Family Rule.** Geist Variable is the only family. Introducing a second typeface (serif, mono) breaks the instrument voice; use weight and size for hierarchy instead.

## Layout

The popup is a fixed **360px**-wide panel (ADR-0004), not a responsive page. The header sits on a bottom border (`border-b px-4 py-3`); the body is a single column with an **8px** vertical rhythm (`space-y-2`, `gap-2`, `p-3`). Density is high but calm: each Favorite is one Card, Cards stack with `space-y-2`, and the search/sort row and the export/import row are 8px-gap flex rows that wrap.

Favorites collapse into per-**Penyelenggara** groups when one organizer holds more than three; the group toggle is a full-width bordered `bg-muted/40` bar with the organizer name (`text-sm font-semibold`) over a one-line summary (`text-xs text-muted-foreground`). There are no grids, no sidebars, no multi-column layouts in the popup — the 360px width forbids them. Spacing scale in use: 2px (chip vertical), 4px (control vertical), 8px (rhythm), 10px (control horizontal), 12px (body padding), 16px (header padding / card padding).

Dark mode is tokenized (`.dark` class) but the popup does not currently toggle it; the tokens exist so a future setting can switch without rework.

## Elevation & Depth

Flat by default. Depth is conveyed by 1px hairline borders (`--border`) and the muted fill (`--muted`), not by shadow. The single elevation token in use is the Card's `shadow-sm`, a faint lift that separates a Favorite from the panel background; it never grows on hover, never appears on buttons, inputs, or chips. Focus is an outline, not a lift: `outline-ring/50` using `--ring` (oklch 0.708 0 0).

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. The only shadow is the Card's `shadow-sm`, and it is constant — never a hover shadow, never a popover shadow. If a new surface needs to feel raised, use a border or `bg-muted`, not a larger shadow.

## Shapes

One form: the sharp rectangle (radius `0rem`, the preset's `--radius: 0rem`). Cards, buttons, inputs, selects, textareas, group toggles, and status chips are all square-cornered. The only curved form in the system is the **tiny dot** (`size-1.5`, `rounded-full`) that leads each status/stage chip — it exists solely to carry the chip's semantic color at 10px, since the sera Badge itself is a borderless, fill-less uppercase text label. Borders are always 1px and always `--border`; no double borders, no dashed dividers. The injected content-script star toggle is out of scope here — it mirrors MagangHub's "Bagikan" geometry (40×40, 14px radius) per ADR-0004, deliberately not this system's sharp rectangle.

### Named Rules
**The Sharp-Everywhere Rule.** Every surface and control is square-cornered (radius 0). The only `rounded-full` in the system is the chip's leading dot, and only because a colored dot is the cleanest way to carry semantic color inside a fill-less label. Never put `rounded-full` on a button, input, card, or the chip itself.

## Components

### Buttons
- **Shape:** sharp rectangle (`rounded-md`, 0rem).
- **Outline (default):** transparent background, 1px `--border`, `text-foreground`, `px-2.5 py-1` (10px×4px), `text-xs font-medium`. Hover: `bg-muted`. Disabled: `opacity-50 cursor-not-allowed`. This is the *only* button style in the popup (*Segarkan*, *Segarkan semua*, *Ekspor*, *Impor*).
- **Hover / Focus:** `transition-colors` to `bg-muted`; focus via `outline-ring/50`. No fill change, no lift.
- **Primary (filled):** does not exist by design. See The Manual-Action Rule.

### Status chips
- **Style:** sharp uppercase micro-label (sera Badge — `rounded-none`, `border-0`, `bg-transparent`, `px-0 py-0`, `text-[0.625rem] font-semibold tracking-widest uppercase`), with a `size-1.5 rounded-full bg-current` dot leading the text. Colour carries the semantic:
  - Status Lowongan: *Buka* `text-emerald-600`, *Mengisi* `text-amber-600`, *Tutup* `text-rose-600`, *Tidak diketahui* `text-muted-foreground`, *Refresh gagal* `text-rose-600`.
  - Status Lamar: *Dilamar* `text-primary`, *Interview* `text-blue-600`, *Diterima* `text-emerald-600`, *Ditolak* `text-rose-600`.
- **State:** chips are read-only labels, never interactive. No stage → no chip. The dot's color is the signal at a glance; the uppercase word confirms it.

### Cards
- **Corner:** sharp (`rounded-xl` resolves to 0rem).
- **Background:** `--card` (Paper); active-stage Favorites tint to `bg-primary/5` with `border border-primary/40` (and matching `ring-primary/40` so the card’s default hairline ring does not fight the brand edge).
- **Shadow:** `shadow-sm` (the only elevation); constant, never on hover.
- **Border:** 1px `--border`.
- **Padding:** `py-4` (FavoriteCard) / `py-6` (default Card), `gap-2` internal.

### Inputs / Fields
- **Style:** underline — `border-b` only, transparent background, sharp corners (sera convention: `border-b-input focus-visible:border-b-ring`). Used for the search field (sera `Input`), the Catatan textarea (native `<textarea>` styled with the same underline classes), and the two selects.
- **Focus:** `focus-visible:border-b-ring`; no glow, no full border.
- **Search:** `min-w-0 flex-1`, `type="search"`, explicit `aria-label`.

### Selects (native, sera-styled)
- The *Urutkan* and *Status Lamar* selects stay **native `<select>`** styled with the sera underline (`border-b border-border bg-transparent rounded-none`), not the bits-ui `Select` component. Reason: e2e drives them with Playwright's `selectOption`, which only works on real `<select>` elements; the bits-ui Select renders a button + portal listbox that `selectOption` cannot target. This is a deliberate testability constraint, not an aesthetic one — the underline styling matches sera.

### Why FavoriteCard uses native buttons
- `FavoriteCard`'s *Segarkan* button and *Buka di MagangHub* link are **native `<button>`/`<a>` with inline sera classes**, not the `Button` component. Reason: importing the `Button`/`buttonVariants` module into a component that also runs `$effect.pre` to reset `catatanDraft` + `bind:value` on the Catatan textarea triggers a Svelte 5 reactivity bug that breaks the save-on-blur flow. `App.svelte` (no such effect) uses the `Button` component freely. See the Don'ts.

### Links
- **Link Primary:** `text-primary underline-offset-2 hover:underline`, sharp rectangle, `text-xs font-medium`. Used for *Buka di MagangHub* — the exit back to the official site, never an in-popup navigation.

### Group toggle (signature)
- A full-width bordered bar (`bg-muted/40`, 1px `--border`, sharp), `px-2.5 py-1.5`, with `aria-expanded` and a `▾/▸` glyph. Carries organizer name (`text-sm font-semibold`) over a one-line stage summary (`text-xs text-muted-foreground`). The only "section header" in the popup.

### Trust explainer (signature)
- A `<details>` with an underlined `text-primary` summary (*Mengapa aman?*) and muted body copy. The disclosure pattern keeps the credential-free promise available without forcing it into the first viewport — matches PRODUCT.md principle 1 (trust is a construction, surfaced on demand).

## Do's and Don'ts

### Do:
- **Do** keep every surface and control square-cornered (`--radius: 0rem`); the only `rounded-full` is the status chip's leading dot.
- **Do** use Field Blue (`oklch(0.5 0.134 242.749)`) only for the active-stage tint, the *dilamar* chip, the *Buka di MagangHub* link, and focus — ≤10% of any screen.
- **Do** convey depth with 1px `--border` and `bg-muted`; use `shadow-sm` only on Cards and never larger.
- **Do** write UI copy in plain Indonesian using the fixed vocabulary from `CONTEXT.md` (Lowongan, Penyelenggara, Batch, Kuota, Pelamar, Favorite, Catatan, Status Lamar, Status Lowongan, SiapKerja, MagangHub).
- **Do** keep the popup at 360px; reach for an 8px rhythm (`gap-2`, `space-y-2`, `p-3`) before adding new spacing values.
- **Do** degrade loudly to the user, silently to the page (PRODUCT.md principle 5): `role="status"` banners for health/import states, never `console.error` in MagangHub's page.

### Don't:
- **Don't** introduce a filled primary button — Status Lamar is manual by design (PRODUCT.md principle 2); a primary fill would imply authority the extension deliberately lacks. Outline buttons only.
- **Don't** ship Svelte, shadcn-svelte, or this design system into the content script (ADR-0004). Injected UI is plain DOM in a closed Shadow DOM and mirrors MagangHub's "Bagikan" geometry, not these tokens.
- **Don't** import the `Button`/`buttonVariants` module into `FavoriteCard` — combined with its `$effect.pre` + `bind:value` Catatan pattern it triggers a Svelte 5 reactivity bug that breaks save-on-blur. Use native `<button>` with inline sera classes there; the `Button` component is fine everywhere else.
- **Don't** replace the native *Urutkan* / *Status Lamar* `<select>` with the bits-ui `Select` — e2e relies on `selectOption`, which needs a real `<select>`. Style them sera-underline instead.
- **Don't** use emerald/amber/rose outside status chips and the change-notice / health banners — they are state signals, not a palette.
- **Don't** add a second typeface or a display size; Geist Variable at 12–16px is the whole hierarchy.
- **Don't** use `--destructive` for anything but genuine failure (*Refresh gagal*, import error).
- **Don't** claim a Chrome Web Store listing, users, ratings, press, or Kemnaker affiliation, or fabricate an icon/logo — none exist (PRODUCT.md absences).
- **Don't** treat this system as a mirror of MagangHub's aesthetic; the preset establishes a distinct Field-Notebook identity. If the project re-commits to ADR-0004's "feel native to MagangHub" goal, this DESIGN.md and the preset must be revisited together.