<script lang="ts">
import { onDestroy } from "svelte";
import { markPopupOpened, syncToolbarBadge } from "@/lib/badge";
import { Button } from "@/lib/components/ui/button";
import { Input } from "@/lib/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/lib/components/ui/alert";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/lib/components/ui/collapsible";
import { type SortKey, searchFavorites, sortFavorites } from "@/lib/filter";
import { groupFavorites, summaryText } from "@/lib/group";
import { type HealthStatus, readHealth } from "@/lib/health";
import { type ExportFile, exportFavorites, importFavorites } from "@/lib/io";
import type { RefreshRequest, RefreshResponse } from "@/lib/refresh";
import { listFavorites } from "@/lib/storage";
import type { Favorite } from "@/lib/types";
import { cn } from "@/lib/utils";
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

async function refresh(): Promise<void> {
	favorites = await listFavorites();
	health = await readHealth();
	loading = false;
	// B1: while the popup is open the badge stays cleared. Each re-read also
	// advances `popupLastOpenedAt`, so a refresh that lands mid-view does not
	// re-raise the badge; only changes after the popup closes count as unseen.
	const openedAt = new Date().toISOString();
	await markPopupOpened(openedAt);
	await syncToolbarBadge([], openedAt);
}

// Live-update when a favorite is starred/refreshed from anywhere — the
// background writes each liveStatus to storage as it lands, so a "refresh
// all" re-renders the list progressively here.
function onChanged(_changes: Record<string, unknown>, areaName: string): void {
	if (areaName === "local") void refresh();
}

$effect(() => {
	void refresh();
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

/** Switch tab and reset the sort to that tab's default (Aktif = savedAt, Arsip
 *  = archivedAt / "terbaru diarsip"). The user can re-pick a sort afterward; */
function selectTab(next: "aktif" | "arsip"): void {
	tab = next;
	sortKey = next === "arsip" ? "archivedAt" : "savedAt";
}

const visible = $derived(
	sortFavorites(searchFavorites(tabFavorites, query), sortKey),
);

// Issue #22 (C4): collapse Favorites by Penyelenggara when one org has
// more than 3, with a stage-summary header. Composes AFTER search + sort so
// the summary reflects the active list, never the whole storage set.
const groups = $derived(groupFavorites(visible));

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
/** The current tab has favorites, but the current query matches none of them. */
const noMatches = $derived(tabFavorites.length > 0 && visible.length === 0);

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

/** Shared underline control height — search and sort speak one language. */
const controlClass =
	"h-8 rounded-none border-0 border-b border-border bg-transparent px-0 text-xs text-foreground outline-none transition-[border-color] hover:border-b-foreground/40 focus-visible:border-b-ring";

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
		"rounded-none border-b-2 px-2 py-1 -mb-px text-xs transition-colors",
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
  rows (identity+action, then tabs+sort), one search field, and any advisory
  compressed to a single line. Nothing was removed; the prose was.
-->
<header class="border-b px-4 pt-3 pb-2">
  <div class="flex items-center justify-between gap-2">
    <!-- ADR-0009: the name, not a label for the list. "Favorit Lowongan"
         described what the list below already shows; opened over MagangHub,
         the one thing the header has to establish is who is speaking. -->
    <h1 class="font-heading text-base font-semibold tracking-normal">SakuMagang</h1>
    {#if tab === 'aktif'}
      <Button
        variant="outline"
        size="xs"
        onclick={refreshAll}
        disabled={refreshDisabled}
        aria-busy={refreshingAll}
      >
        {#if refreshingAll}
          <span
            class="mh-spin size-3 shrink-0 rounded-none border border-current border-r-transparent"
            aria-hidden="true"
          ></span>
        {/if}
        {refreshingAll ? 'Memperbarui…' : 'Segarkan semua'}
      </Button>
    {/if}
  </div>

  <!-- Tabs and sort share one row: both answer "which Favorites, in what
       order", and pairing them frees a whole band. The row sits on the tabs'
       own baseline border, so the two controls read as one strip.
       ADR-0010: Arsip shows a count so the user knows archived Favorites exist
       without switching. Default Aktif on every popup open; the tab only
       changes the rendered subset, never the stored data. -->
  <div class="mt-2 flex items-end justify-between gap-2 border-b border-border">
    <div class="flex items-center gap-1" role="tablist" aria-label="Daftar favorit">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'aktif'}
        class={tabClass(tab === 'aktif')}
        onclick={() => selectTab('aktif')}
        data-tab="aktif"
      >
        Aktif
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'arsip'}
        class={tabClass(tab === 'arsip')}
        onclick={() => selectTab('arsip')}
        data-tab="arsip"
      >
        Arsip{#if archivedCount > 0} <span class="tabular-nums">({archivedCount})</span>{/if}
      </button>
    </div>

    <!-- Issue #6: view-only, never touches storage. Stays a native <select> so
         e2e can drive it with selectOption; styled to match sera. The 2px
         bottom border matches the tabs' indicator weight so both sit on one
         baseline; --radius is 0rem system-wide, so there is no corner for it
         to clash with. -->
    <select
      class={sortSelectClass}
      aria-label="Urutkan"
      bind:value={sortKey}
    >
      {#if tab === 'arsip'}
      <option value="archivedAt" >Terbaru diarsip</option>
      {/if}
      <option value="savedAt">Terbaru disimpan</option>
      <option value="stageSeats">Status Lamar, sisa kursi</option>
      <option value="organizer">Penyelenggara</option>
      <option value="location">Lokasi</option>
    </select>
  </div>

  <Input
    type="search"
    class={controlClass + ' mt-1 min-w-0 w-full text-sm'}
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

  <!-- One line, not a paragraph. Cold cards now show their saved Kuota and
       Pelamar, so this no longer has to explain an information void — it just
       states how many readings are stale. The button that fixes it is directly
       above, already named. -->
  {#if uncheckedVisible > 0 && !loading && !noMatches}
    <p class="mt-1.5 text-xs text-muted-foreground" role="status" data-unchecked-coach>
      <span class="tabular-nums">{uncheckedVisible}</span> favorit belum dicek Status Lowongan.
    </p>
  {/if}

  {#if importMsg}
    <div class="mh-rise-in mt-2">
      <Alert variant={importMsg.kind === 'warn' ? 'destructive' : 'default'}>
        <AlertDescription>{importMsg.text}</AlertDescription>
      </Alert>
    </div>
  {/if}
</header>

<main class="space-y-1.5 p-3">
  {#if loading}
    <div class="space-y-1.5" aria-hidden="true">
      <div class="h-[76px] rounded-none bg-muted"></div>
      <div class="h-[76px] rounded-none bg-muted"></div>
      <div class="h-[76px] rounded-none bg-muted/60"></div>
    </div>
  {:else if tabEmpty}
    <!-- Empty states are borderless: a card frame around a "nothing here"
         message draws a box that reads as a broken row. Centered text on the
         panel itself says the same thing with less furniture. -->
    {#if tab === 'aktif'}
      {#if archivedCount > 0}
        <!-- The user has archived Favorites but none active. Point them to the
             Arsip tab rather than implying the store is empty. -->
        <div class="px-4 py-10 text-center">
          <p class="text-sm font-medium">Tidak ada favorit aktif</p>
          <p class="mx-auto mt-1 max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
            Semua favorit kamu sudah diarsip. Lihat tab Arsip untuk memulihkannya.
          </p>
        </div>
      {:else}
        <div class="px-4 py-10 text-center">
          <div class="mx-auto mb-3 flex size-9 items-center justify-center rounded-none border border-border text-base text-muted-foreground" aria-hidden="true">★</div>
          <p class="text-sm font-medium">Belum ada favorit</p>
          <p class="mx-auto mt-1 max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
            Bintangi Lowongan di MagangHub untuk menyimpannya di sini.
          </p>
        </div>
      {/if}
    {:else}
      <div class="px-4 py-10 text-center">
        <p class="text-sm font-medium">Belum ada arsip</p>
        <p class="mx-auto mt-1 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
          Favorit yang kamu arsipkan tampil di sini, tanpa terhapus.
        </p>
      </div>
    {/if}
  {:else if noMatches}
    <!-- Distinct from the empty state above: the user HAS favorites, this
         query just matches none of them. -->
    <div class="px-4 py-10 text-center">
      <p class="text-sm font-medium">Tidak ada favorit yang cocok</p>
      <p class="mx-auto mt-1 max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
        Coba kata kunci lain atau kosongkan pencarian.
      </p>
    </div>
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
        <!-- Group header, de-boxed. It used to be a filled bordered bar as tall
             as a card band, so a screen of grouped Favorites alternated two
             competing container styles. Now it is a label — organizer over
             summary, on the panel, with a rule beneath — and only the cards
             carry borders. Same information, one less frame. -->
        <section class="mh-group" data-group-organizer={item.organizer}>
          <button
            type="button"
            class="flex w-full items-baseline gap-2 rounded-none border-b border-border px-1 pt-1 pb-1.5 text-left transition-colors hover:border-b-foreground/30"
            aria-expanded={!isCollapsed(item.organizer)}
            data-group-toggle
            onclick={() => toggleGroup(item.organizer)}
          >
            <span
              class="shrink-0 text-xs text-muted-foreground transition-transform duration-150 ease-out"
              class:rotate-0={!isCollapsed(item.organizer)}
              class:-rotate-90={isCollapsed(item.organizer)}
              aria-hidden="true"
            >▾</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-semibold">{item.organizer}</span>
            </span>
            <span class="shrink-0 truncate text-xs text-muted-foreground" data-group-summary>{summaryText(item.summary) || `${item.favorites.length} favorit`}</span>
          </button>
          {#if !isCollapsed(item.organizer)}
            <div class="mt-1.5 space-y-1.5">
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

  Restructured to one row plus one line. It previously ran two buttons, a
  two-line promise, and a link on four separate bands — ~100px of chrome under
  a list that needed the room. The promise is now a single sentence sharing its
  row with the explainer link, and the two backup controls sit opposite it.
-->
<footer class="border-t px-4 py-2.5">
  <!-- The Collapsible root wraps the row so its trigger can sit inline at the
       row's end while its body still spans the full 360px below. -->
  <Collapsible>
    <div class="flex items-center gap-2">
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
      <CollapsibleTrigger class="ml-auto shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline">
        Mengapa aman?
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent>
      <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
        Situs bantuan pihak ketiga yang minta login SiapKerja bisa mencatat
        password kamu. Extension ini hanya menyimpan Lowongan yang kamu bintangi
        di browser ini — tanpa akun, tanpa server, tanpa telemetri. Kalau mau
        melamar, klik "Buka di MagangHub" di setiap favorit dan lamar sendiri di
        situs resmi.
      </p>
    </CollapsibleContent>
  </Collapsible>

  <p class="mt-1.5 text-xs leading-snug text-muted-foreground">
    Favorit tersimpan hanya di browser kamu; extension ini tidak pernah minta password SiapKerja.
  </p>
</footer>
