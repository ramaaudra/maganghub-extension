<script lang="ts">
import {
	Archive02Icon,
	ArrowDown01Icon,
	Loading03Icon,
	Search01Icon,
	StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/svelte";
import { onDestroy } from "svelte";
import { markPopupOpened, syncToolbarBadge } from "@/lib/badge";
import { Alert, AlertDescription, AlertTitle } from "@/lib/components/ui/alert";
import { Button } from "@/lib/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/lib/components/ui/collapsible";
import { Input } from "@/lib/components/ui/input";
import { type SortKey, searchFavorites, sortFavorites } from "@/lib/filter";
import {
	type GroupedItem,
	groupFavorites,
	shouldGroup,
	summaryText,
} from "@/lib/group";
import { type HealthStatus, readHealth } from "@/lib/health";
import { type ExportFile, exportFavorites, importFavorites } from "@/lib/io";
import { shouldRefreshPopupForStorageKey } from "@/lib/popup-state";
import type { RefreshRequest, RefreshResponse } from "@/lib/refresh";
import { STAGE_LABEL } from "@/lib/stage";
import { listFavorites } from "@/lib/storage";
import type { Favorite, StatusLamar } from "@/lib/types";
import { cn } from "@/lib/utils";
import EmptyState from "./EmptyState.svelte";
import FavoriteCard from "./FavoriteCard.svelte";

let favorites = $state<Favorite[]>([]);
let loading = $state(true);
/** UUIDs with a single-favorite refresh in flight. */
let refreshing = $state<Set<string>>(new Set());
let refreshingAll = $state(false);
/** Import result banner: null = hidden, otherwise shown until cleared. */
let importMsg = $state<{ kind: "ok" | "warn"; text: string } | null>(null);
let importTimer: ReturnType<typeof setTimeout> | undefined;
/** Hidden file input ref so the "Impor" button can open the file dialog. */
let fileInput: HTMLInputElement | null = null;

/** Injection health, reported by the content script (issue #8). */
let health = $state<HealthStatus>("ok");

async function refresh(markOpened = false): Promise<void> {
	favorites = await listFavorites();
	health = await readHealth();
	loading = false;
	// B1: mark the browser-level open once. Storage changes while the popup is
	// visible still clear the badge, but must not write the same bookkeeping key
	// that the listener observes.
	if (markOpened) await markPopupOpened();
	await syncToolbarBadge([], undefined);
}

// Live-update when a favorite is starred/refreshed from anywhere — the
// background writes each liveStatus to storage as it lands, so a "refresh
// all" re-renders the list progressively here.
function onChanged(changes: Record<string, unknown>, areaName: string): void {
	if (areaName !== "local") return;
	if (Object.keys(changes).some(shouldRefreshPopupForStorageKey)) {
		void refresh();
	}
}

$effect(() => {
	void (async () => {
		// W4: restore the remembered sort before the list paints. The popup
		// always opens on the Aktif tab (ADR-0010), so read that tab's key;
		// loading stays true until refresh() lands, so the select swaps to the
		// stored key while the skeleton still shows.
		const stored = await browser.storage.session.get(sortStorageKey("aktif"));
		const key = stored[sortStorageKey("aktif")] as SortKey | undefined;
		if (key) sortKey = key;
		void refresh(true);
	})();
	browser.storage.onChanged.addListener(onChanged);
	return () => browser.storage.onChanged.removeListener(onChanged);
});

async function refreshOne(fav: Favorite): Promise<void> {
	if (refreshing.has(fav.uuid) || refreshingAll) return;
	const next = new Set(refreshing);
	next.add(fav.uuid);
	refreshing = next;
	try {
		const request: RefreshRequest = {
			type: "refresh",
			uuid: fav.uuid,
			detailUrl: fav.detailUrl,
		};
		(await browser.runtime.sendMessage(request)) as RefreshResponse;
		await refresh();
	} finally {
		const done = new Set(refreshing);
		done.delete(fav.uuid);
		refreshing = done;
	}
}

async function refreshAll(): Promise<void> {
	if (refreshingAll || favorites.length === 0) return;
	refreshingAll = true;
	try {
		const request: RefreshRequest = { type: "refreshAll" };
		(await browser.runtime.sendMessage(request)) as RefreshResponse;
		await refresh();
	} finally {
		refreshingAll = false;
	}
}

// ─── Search / sort (issue #6) ──────────────────────────────────────────────
// Both are view-only: `favorites` stays the canonical storage-backed list and
// the rendered list is derived from it, so a re-read (storage.onChanged) never
// clobbers the query. Search runs before sort — the user filters, then orders
// what's left.

let query = $state("");
let sortKey = $state<SortKey>("savedAt");
/** Tahap filter (audit W2/W3): "" = all stages, else isolate one Status Lamar. */
let stageFilter = $state<"" | StatusLamar>("");

/**
 * The Tahap filter's options: all stages plus the no-filter entry. Labels
 * come from STAGE_LABEL so the filter, the on-card chip, and the Status Lamar
 * select can never disagree on vocabulary (D2/D7).
 */
const STAGE_FILTER_OPTIONS: ReadonlyArray<
	readonly [value: string, label: string]
> = [
	["", "Semua tahap"],
	...(Object.keys(STAGE_LABEL) as StatusLamar[]).map(
		(stage) => [stage, STAGE_LABEL[stage]] as const,
	),
];

// ─── Sort persistence (audit W4) ────────────────────────────────────────────
// The user's sort is remembered PER TAB for the rest of the browser session
// (chrome.storage.session — a fresh browser opens on the defaults again), and
// switching tabs restores that tab's own choice instead of clobbering it. The
// query and Tahap filter are deliberately NOT persisted: a fresh popup should
// open on the full, unfiltered list.
function sortStorageKey(tab: "aktif" | "arsip"): string {
	return `ui:sortKey:${tab}`;
}

function persistSortKey(tab: "aktif" | "arsip", key: SortKey): void {
	void browser.storage.session.set({ [sortStorageKey(tab)]: key });
}

function onSortChange(event: Event): void {
	sortKey = (event.currentTarget as HTMLSelectElement).value as SortKey;
	persistSortKey(tab, sortKey);
}

function onStageFilterChange(event: Event): void {
	const value = (event.currentTarget as HTMLSelectElement).value;
	stageFilter = value === "" ? "" : (value as StatusLamar);
}

// ─── Aktif / Arsip tabs (ADR-0010) ──────────────────────────────────────────
// Archive is a popup-only view concern: archivedAt !== null hides a Favorite
// from the Aktif list without touching the star on MagangHub's page or the
// stored data. The tab only decides which subset is searched/sorted/rendered;
// `favorites` (the whole storage-backed set) stays canonical so a cross-tab
// sync never clobbers the active tab.
let tab = $state<"aktif" | "arsip">("aktif");
const activeFavorites = $derived(
	favorites.filter((f) => f.archivedAt === null),
);
const archivedFavorites = $derived(
	favorites.filter((f) => f.archivedAt !== null),
);
const archivedCount = $derived(archivedFavorites.length);
const tabFavorites = $derived(
	tab === "aktif" ? activeFavorites : archivedFavorites,
);

/** "Segarkan semua" has nothing to do when the Aktif list is empty. Declared
 *  after `activeFavorites` — a $derived reading a later-declared rune is a
 *  temporal-dead-zone error, not just a lint nit. */
const refreshDisabled = $derived(refreshingAll || activeFavorites.length === 0);

/** Switch tab, restoring that tab's own remembered sort instead of clobbering
 *  the user's choice (audit W4). A peek at the Arsip tab no longer discards
 *  an Aktif sort; each tab keeps its default (Aktif = savedAt, Arsip =
 *  archivedAt) until the user picks something, and the choice is remembered
 *  for the rest of the browser session. */
async function selectTab(next: "aktif" | "arsip"): Promise<void> {
	tab = next;
	const stored = await browser.storage.session.get(sortStorageKey(next));
	const key = stored[sortStorageKey(next)] as SortKey | undefined;
	if (key) {
		// Guard: archivedAt is only a valid sort inside the Arsip tab (we only
		// ever write it there, so this is belt-and-suspenders).
		sortKey = key === "archivedAt" && next === "aktif" ? "savedAt" : key;
	} else {
		sortKey = next === "arsip" ? "archivedAt" : "savedAt";
	}
}

/** ARIA APG tab keyboard model: Left/Right cycle, Home/End jump to the ends.
 *  Selection follows focus (both tabs render instantly from already-loaded
 *  state, so there is no cost to activating on arrow), and focus is moved to
 *  the newly selected tab so the roving tabindex and the DOM agree. */
function onTabKeydown(event: KeyboardEvent): void {
	const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
	if (!keys.includes(event.key)) return;
	event.preventDefault();
	const next =
		event.key === "Home"
			? "aktif"
			: event.key === "End"
				? "arsip"
				: tab === "aktif"
					? "arsip"
					: "aktif";
	selectTab(next);
	// Wait for the roving tabindex to re-render before moving focus, or the
	// target still has tabindex="-1" and the browser refuses it.
	queueMicrotask(() => {
		const el = document.querySelector<HTMLButtonElement>(
			`[data-tab="${next}"]`,
		);
		el?.focus();
	});
}

/** Filter by Tahap first, then search, then sort — the popup's full pipeline:
 *  which subset (tab → stage filter → query), then what order. */
const tabStageFiltered = $derived(
	stageFilter === ""
		? tabFavorites
		: tabFavorites.filter((f) => f.statusLamar === stageFilter),
);

const visible = $derived(
	sortFavorites(searchFavorites(tabStageFiltered, query), sortKey),
);

// Issue #22 (C4): collapse Favorites by Penyelenggara when one org has
// more than 3, with a stage-summary header. Composes AFTER search + sort so
// the summary reflects the active list, never the whole storage set.
// Audit W1: only under grouping-compatible sorts (savedAt/organizer/
// archivedAt). Under location/Urgensi the sort is strict — a group that
// collects every card of one org would silently break the order the label
// promises — so cards stand alone there.
const groups = $derived<GroupedItem[]>(
	shouldGroup(sortKey)
		? groupFavorites(visible)
		: visible.map((favorite) => ({ kind: "solo", favorite })),
);

// Per-group collapse state, keyed by organizer name. Default expanded so the
// user's favorites are visible; collapsing is the power-user move for taming a
// noisy 360px popup. Kept across re-renders (the list re-derives from storage
// on every change) so a storage sync never re-opens a group the user closed.
let collapsed = $state<Set<string>>(new Set());

function toggleGroup(organizer: string): void {
	// Assign a fresh Set so Svelte's rune reactivity re-reads the flag for the
	// toggled group (mutating the Set in place would not trigger the {#each}).
	const next = new Set(collapsed);
	if (next.has(organizer)) next.delete(organizer);
	else next.add(organizer);
	collapsed = next;
}

function isCollapsed(organizer: string): boolean {
	return collapsed.has(organizer);
}
/** The current tab has favorites, but the current query/filter matches none. */
const noMatches = $derived(tabFavorites.length > 0 && visible.length === 0);

/** W6: the Urutkan select reads as "active" (foreground ink) once the user
 *  moves off the tab's baseline default, so a non-default order is visible at
 *  a glance. Baseline: Aktif = savedAt, Arsip = archivedAt. */
const sortIsCustom = $derived(
	sortKey !== (tab === "arsip" ? "archivedAt" : "savedAt"),
);

/** The current tab is empty (regardless of query). Distinct from `noMatches`
 *  so an empty Arsip tab shows an onboarding empty state, not a "no matches"
 *  message. */
const tabEmpty = $derived(tabFavorites.length === 0);

/** Visible Favorites that have never been refreshed — one header coach, not N card lines.
 *  Hidden in the Arsip tab: archived records are skipped by refresh, so the
 *  coach's "tekan Segarkan semua" call to action has no target there. */
const uncheckedVisible = $derived(
	tab === "aktif" ? visible.filter((f) => !f.liveStatus.lastChecked).length : 0,
);

// ─── Export / Import (issue #9) ────────────────────────────────────────────
// Export serializes all favorites to a JSON Blob and downloads it. Import
// reads a chosen file, validates+migrates via the registry, and merges with
// local-authoritative semantics (see src/lib/io.ts).

async function onExport(): Promise<void> {
	const file = await exportFavorites();
	const blob = new Blob([JSON.stringify(file, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	a.download = `maganghub-favorit-${stamp}.json`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

async function onImportFile(event: Event): Promise<void> {
	const input = event.currentTarget as HTMLInputElement;
	const file = input.files?.[0];
	// Reset so selecting the same file twice re-fires `change`.
	input.value = "";
	if (!file) return;
	try {
		const text = await file.text();
		const parsed = JSON.parse(text) as ExportFile;
		const result = await importFavorites(parsed);
		void refresh();
		const warn = result.warnings.length > 0;
		importMsg = {
			kind: warn ? "warn" : "ok",
			text: warn
				? result.warnings.join(" ")
				: `Berhasil mengimpor ${result.imported} favorit.`,
		};
	} catch (err) {
		importMsg = {
			kind: "warn",
			text: `Impor gagal: ${String(err instanceof Error ? err.message : err)}`,
		};
	} finally {
		clearTimeout(importTimer);
		importTimer = setTimeout(() => (importMsg = null), 6000);
	}
}

// Flush the import-status banner timer on popup close (mirrors FavoriteCard's
// onDestroy flush) so no dangling timer survives the page unload.
onDestroy(() => {
	clearTimeout(importTimer);
});

/** The one boxed input in the popup (Cards line language). The Catatan
 *  textarea and the two selects keep the underline idiom; Cari is the header's
 *  closing element, so it reads as a filled field resting on the header's
 *  single bottom rule instead of a third hairline under the tabs row. The
 *  explicit `md:text-xs` keeps the fixed-width popup from inheriting Input's
 *  desktop-sized `md:text-sm` default in wider browser contexts. */
const controlClass =
	"h-8 rounded-none border border-border bg-muted px-2.5 text-xs md:text-xs text-foreground outline-none transition-[border-color] hover:border-foreground/30 focus-visible:border-ring";

/** The Urutkan select, sitting on the same baseline as the tabs. Its 2px
 *  bottom border matches the tab indicator's weight so the row reads as one
 *  strip rather than two controls at different depths. */
const sortSelectClass =
	"-mb-px max-w-[9.5rem] shrink-0 rounded-none border-0 border-b-2 border-transparent bg-transparent py-1 pl-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:border-b-ring focus-visible:text-foreground"; // impeccable-disable-line border-accent-on-rounded: --radius is 0rem system-wide (DESIGN.md "Sharp-Everywhere"), so there is no corner for this underline to clash with.

/** Tab button classes — the underline IS the selected state, so the two tabs
 *  share everything but that line and their text weight. */
function tabClass(selected: boolean): string {
	return cn(
		// impeccable-disable-next-line border-accent-on-rounded: --radius is 0rem system-wide (DESIGN.md "Sharp-Everywhere"), so this 2px underline has no corner to clash with — it is a tab indicator, not a card edge.
		// py-1.5 → 30px tall (was 26px at py-1, the smallest primary navigation
		// target in the popup). The underline indicator is unmoved: -mb-px still
		// pins it to the row's shared baseline with the sort select.
		"rounded-none border-b-2 px-2 py-1.5 -mb-px text-xs transition-colors",
		selected
			? "border-primary font-medium text-foreground"
			: "border-transparent text-muted-foreground hover:text-foreground",
	);
}
</script>

<!--
  Header, rebuilt for readability. It used to stack five bands — name+refresh,
  tabs, health, search+sort, and a two-line coach paragraph — which pushed the
  first Favorite past 200px and made the panel read as a form. Now: two control
  rows (identity+action, then tabs+sort), one boxed search field, and any
  advisory compressed to a single line. One rule closes the header: the
  tabs+sort row is borderless (the selected tab's 2px underline is its only
  indicator), and the boxed Cari field sits above the header's single border-b
  (Cards line language — see DESIGN.md). Nothing was removed; the prose was.
-->
<header class="border-b px-4 pt-3 pb-2">
  <!-- `min-h-7` reserves the identity row's height so the *Segarkan semua*
       button (h-7) coming and going between Aktif and Arsip does not grow or
       shrink this band — the header is pinned chrome, so a 4px wobble here
       shifts the whole list below it (reported as CLS on tab switch). -->
  <div class="flex min-h-7 items-center justify-between gap-2">
    <!-- ADR-0009: the name, not a label for the list. "Favorit Lowongan"
         described what the list below already shows; opened over MagangHub,
         the one thing the header has to establish is who is speaking. -->
    <div class="flex min-w-0 items-center gap-2">
      <img
        src="/icon/route.svg"
        width="24"
        height="24"
        class="size-6 shrink-0"
        alt=""
        aria-hidden="true"
        data-brand-icon
      />
      <h1 class="font-heading text-base font-semibold tracking-normal">SakuMagang</h1>
    </div>
    {#if tab === 'aktif'}
      <Button
        variant="outline"
        size="xs"
        onclick={refreshAll}
        disabled={refreshDisabled}
        aria-busy={refreshingAll}
      >
        {#if refreshingAll}
          <HugeiconsIcon
            icon={Loading03Icon}
            strokeWidth={2}
            class="mh-spin size-3.5 shrink-0"
            aria-hidden="true"
            data-refresh-icon
          />
        {/if}
        {refreshingAll ? 'Memperbarui…' : 'Segarkan semua'}
      </Button>
    {/if}
  </div>

  <!-- Tabs and sort share one row: both answer "which Favorites, in what
       order", and pairing them frees a whole band. The row is borderless —
       the selected tab's 2px underline is the only rule in it, and the
       header's single border-b closes the band below Cari (Cards line
       language: one rule, not three stacked hairlines).
       ADR-0010: Arsip shows a count so the user knows archived Favorites exist
       without switching. Default Aktif on every popup open; the tab only
       changes the rendered subset, never the stored data. -->
  <div class="mt-2 flex items-end justify-between gap-2">
    <div class="flex items-center gap-1" role="tablist" aria-label="Daftar favorit">
      <!-- Full APG tab semantics: each tab points at the one panel via
           aria-controls, carries a roving tabindex so Tab enters the strip once
           and lands on the selected tab, and Left/Right/Home/End move between
           them. Without these, role="tab" promised a widget the keyboard did
           not deliver — plain buttons announcing themselves as tabs. -->
      <button
        type="button"
        role="tab"
        id="tab-aktif"
        aria-selected={tab === 'aktif'}
        aria-controls="panel-favorit"
        tabindex={tab === 'aktif' ? 0 : -1}
        class={tabClass(tab === 'aktif')}
        onclick={() => selectTab('aktif')}
        onkeydown={onTabKeydown}
        data-tab="aktif"
      >
        Aktif
      </button>
      <button
        type="button"
        role="tab"
        id="tab-arsip"
        aria-selected={tab === 'arsip'}
        aria-controls="panel-favorit"
        tabindex={tab === 'arsip' ? 0 : -1}
        class={tabClass(tab === 'arsip')}
        onclick={() => selectTab('arsip')}
        onkeydown={onTabKeydown}
        data-tab="arsip"
      >
        Arsip{#if archivedCount > 0} <span class="tabular-nums">({archivedCount})</span>{/if}
      </button>
    </div>

    <!-- Issue #6: view-only, never touches storage. Stays a native <select> so
         e2e can drive it with selectOption; styled to match sera. The 2px
         bottom border matches the tabs' indicator weight so both sit on one
         baseline; --radius is 0rem system-wide, so there is no corner for it
         to clash with. Audit W2/W6: the stageSeats key keeps its code value
         but is shown as "Urgensi" — the sort is urgency (active-with-seats,
         closest-to-full first) with done items sunk, not a stage ordering;
         the Tahap select beside it is the real way to isolate a stage. The
         foreground ink on non-default marks an active sort (W6). W4: the
         choice persists per tab for the browser session via storage.session. -->
    <div class="flex items-center gap-1">
      <select
        class={cn(sortSelectClass, sortIsCustom && 'text-foreground')}
        aria-label="Urutkan"
        value={sortKey}
        onchange={onSortChange}
      >
        {#if tab === 'arsip'}
        <option value="archivedAt" >Terbaru diarsip</option>
        {/if}
        <option value="savedAt">Terbaru disimpan</option>
        <option value="stageSeats">Urgensi</option>
        <option value="organizer">Penyelenggara</option>
        <option value="location">Lokasi</option>
      </select>

      <!-- Audit W2/W3: the Tahap filter is how a user isolates a stage — the
           sort select only orders. Same native underline language, same
           foreground-on-active rule. Not persisted: a fresh popup opens on
           "Semua tahap". -->
      <select
        class={cn(sortSelectClass, stageFilter !== '' && 'text-foreground')}
        aria-label="Tahap"
        value={stageFilter}
        onchange={onStageFilterChange}
      >
        {#each STAGE_FILTER_OPTIONS as [value, label]}
          <option value={value}>{label}</option>
        {/each}
      </select>
    </div>
  </div>

  <Input
    type="search"
    class={controlClass + ' mt-2 min-w-0 w-full'}
    placeholder="Cari favorit..."
    aria-label="Cari favorit"
    bind:value={query}
  />

  <!-- Issue #8: MagangHub changed its markup and we could not inject. Say so
       plainly — a known breakage the user can act on (update the extension),
       not a silent failure they'd read as lost favorites. Their data is
       untouched, so this stays subtle rather than alarming. -->
  {#if health === 'degraded'}
    <div class="mh-rise-in mt-2">
      <Alert>
        <AlertTitle>Extension mungkin butuh update</AlertTitle>
        <AlertDescription>Tampilan MagangHub berubah — data favorit kamu tetap aman.</AlertDescription>
      </Alert>
    </div>
  {/if}

  {#if importMsg}
    <div class="mh-rise-in mt-2">
      <Alert variant={importMsg.kind === 'warn' ? 'destructive' : 'default'}>
        <AlertDescription>{importMsg.text}</AlertDescription>
      </Alert>
    </div>
  {/if}
</header>

<!-- The panel the two tabs control. `aria-labelledby` swaps with the tab so a
     screen reader reads the panel as belonging to whichever is selected.
     Stays a <main>: app.css scrolls `#app > main`, and this list IS the popup's
     main content. The lint rule is a heuristic against decorating inert
     containers; a tabpanel referenced by aria-controls is the APG-sanctioned
     use, and the role is what makes the tablist above a real widget. -->
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<main
  class="space-y-2.5 p-3"
  id="panel-favorit"
  role="tabpanel"
  aria-labelledby={tab === 'aktif' ? 'tab-aktif' : 'tab-arsip'}
>
  <!-- The "belum dicek" coach lives in the scrollable panel, not the pinned
       header. It is an Aktif-only advisory (Arsip records are skipped by
       refresh, so the count is always 0 there), and keeping it in the header
       made the header shrink ~22px on an Aktif→Arsip switch — a layout shift
       of pinned chrome that read as CLS. Here it is part of the content that
       already swaps on tab change, so it never moves a stable element. The
       *Segarkan semua* button that acts on it stays pinned in the header.
       DESIGN.md still holds: it is one line, `role="status"`, and only shows
       when there is something stale to name. -->
  {#if uncheckedVisible > 0 && !loading && !noMatches}
    <p class="text-xs text-muted-foreground" role="status" data-unchecked-coach>
      <span class="tabular-nums">{uncheckedVisible}</span> favorit belum dicek Status Lowongan.
    </p>
  {/if}

  {#if loading}
    <div class="space-y-2.5" aria-hidden="true">
      <div class="h-[76px] rounded-none bg-muted"></div>
      <div class="h-[76px] rounded-none bg-muted"></div>
      <div class="h-[76px] rounded-none bg-muted/60"></div>
    </div>
  {:else if tabEmpty}
    <!-- Empty states are borderless and share one fixed-height component so a
         tab switch changes the message, not the popup shell. -->
    {#if tab === 'aktif'}
      {#if archivedCount > 0}
        <!-- The user has archived Favorites but none active. Point them to the
             Arsip tab rather than implying the store is empty. -->
        <EmptyState
          icon={Archive02Icon}
          title="Tidak ada favorit aktif"
          description="Semua favorit kamu sudah diarsip. Lihat tab Arsip untuk memulihkannya."
        />
      {:else}
        <EmptyState
          icon={StarIcon}
          title="Belum ada favorit"
          description="Bintangi Lowongan di MagangHub untuk menyimpannya di sini."
        />
      {/if}
    {:else}
      <EmptyState
        icon={Archive02Icon}
        title="Belum ada arsip"
        description="Favorit yang kamu arsipkan tampil di sini, tanpa terhapus."
      />
    {/if}
  {:else if noMatches}
    <!-- Distinct from the empty state above: the user HAS favorites, this
         query/filter just matches none of them. -->
    <EmptyState
      icon={Search01Icon}
      title="Tidak ada favorit yang cocok"
      description="Coba kata kunci lain atau ubah filter."
    />
  {:else}
    {#each groups as item (item.kind === "group" ? `group:${item.organizer}` : `solo:${item.favorite.uuid}`)}
      {#if item.kind === "solo"}
        <FavoriteCard
          favorite={item.favorite}
          view={tab}
          refreshing={refreshing.has(item.favorite.uuid) || refreshingAll}
          onrefresh={() => refreshOne(item.favorite)}
        />
      {:else}
        <!-- Group header, pure label. It used to be a filled bordered bar as
             tall as a card band; then a label with a rule beneath. Now (Cards
             line language) it is neither box nor rule — organizer over
             summary, on the panel, held together by weight and spacing alone.
             Same information, one less frame every time. -->
        <section class="mh-group" data-group-organizer={item.organizer}>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-none px-1 py-2 text-left"
            aria-expanded={!isCollapsed(item.organizer)}
            data-group-toggle
            onclick={() => toggleGroup(item.organizer)}
          >
            <!-- Same icon, same rotation, same duration as the card's own
                 disclosure chevron (FavoriteCard.svelte): the arrow points down
                 while the group is collapsed and rotates -180° (up) once it is
                 expanded — down-to-open, up-to-close, matching the card. It was
                 a `▾` text glyph turning -90° while the card's Hugeicons chevron
                 turned -180°, so one affordance spoke in two icon systems and
                 two directions on the same screen; the previous logic inverted
                 this one (up when collapsed) and re-introduced the same split. -->
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              class={cn(
                'size-3.5 shrink-0 self-center text-muted-foreground transition-transform duration-150 ease-out',
                !isCollapsed(item.organizer) && '-rotate-180',
              )}
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-semibold">{item.organizer}</span>
            </span>
            <span class="shrink-0 truncate text-xs text-muted-foreground" data-group-summary>{summaryText(item.summary) || `${item.favorites.length} favorit`}</span>
          </button>
          {#if !isCollapsed(item.organizer)}
            <div class="mt-2 space-y-2.5">
              {#each item.favorites as fav (fav.uuid)}
                <FavoriteCard
                  favorite={fav}
                  view={tab}
                  refreshing={refreshing.has(fav.uuid) || refreshingAll}
                  onrefresh={() => refreshOne(fav)}
                />
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    {/each}
  {/if}
</main>

<!--
  Backup + trust live below the list so first paint is shortlist + controls.
  Issue #7 / #9: the credential-free promise stays visible; export/import remain
  real buttons for e2e and power users without owning the header.

  Restructured to two compact rows plus one line. It previously put the two
  backup buttons and the explainer trigger in one no-wrap row, so the trigger
  could extend past the fixed 360px panel. The trigger now owns its own row;
  the two backup controls stay together above it, and the promise remains below.
-->
<footer class="min-w-0 border-t px-4 py-2.5">
  <!-- The controls share a compact row; the trigger gets a full-width row below
       it so its Indonesian label can never be pushed past the panel wall. -->
  <Collapsible class="min-w-0 w-full">
    <div class="flex min-w-0 items-center gap-2">
      <Button
        variant="outline"
        size="xs"
        onclick={onExport}
        disabled={favorites.length === 0}
        title="Unduh cadangan JSON favorit di browser ini"
      >
        Ekspor cadangan
      </Button>
      <Button
        variant="outline"
        size="xs"
        onclick={() => fileInput?.click()}
        title="Pulihkan favorit dari file JSON cadangan"
      >
        Impor
      </Button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        class="sr-only"
        aria-label="Impor file favorit"
        onchange={onImportFile}
      />
    </div>
    <!-- DESIGN.md trust explainer: an underlined `text-primary` summary —
         underlined at rest, not just on hover, so the disclosure reads as a
         link the moment the row paints (the *Buka di MagangHub* exit link is
         the hover-underline one; this one signals "open for more"). -->
    <CollapsibleTrigger class="mt-1 flex min-h-7 w-full min-w-0 items-center justify-start text-start text-xs font-medium text-primary underline underline-offset-2 hover:decoration-primary/40">
      Kenapa tidak minta password?
    </CollapsibleTrigger>
    <CollapsibleContent>
      <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
        Situs pihak ketiga yang meminta kamu login ke SiapKerja dapat mencatat
        password yang kamu masukkan. Masukkan password hanya melalui alur resmi
        MagangHub dan SiapKerja. MagangHub hanya menyimpan Lowongan yang kamu
        bintangi di browser ini. Extension ini tidak memerlukan akun, tidak
        menyimpan daftar favorit di server, tidak mengumpulkan telemetri, dan tidak
        meminta password SiapKerja. Untuk melamar, klik "Buka di MagangHub"
        pada lowongan favorit. Setelah itu, lanjutkan lamaran sendiri di situs
        resmi MagangHub.
      </p>
    </CollapsibleContent>
  </Collapsible>

  <p class="mt-1.5 text-xs leading-snug text-muted-foreground">
    Favorit hanya tersimpan di browser ini. Extension ini tidak pernah meminta password SiapKerja.
  </p>
</footer>
