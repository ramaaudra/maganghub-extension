<script lang="ts">
import { onDestroy } from "svelte";
import { markPopupOpened, syncToolbarBadge } from "@/lib/badge";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/lib/components/ui/card";
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

const refreshDisabled = $derived(refreshingAll || favorites.length === 0);

// ─── Search / sort (issue #6) ──────────────────────────────────────────────
// Both are view-only: `favorites` stays the canonical storage-backed list and
// the rendered list is derived from it, so a re-read (storage.onChanged) never
// clobbers the query. Search runs before sort — the user filters, then orders
// what's left.

let query = $state("");
let sortKey = $state<SortKey>("savedAt");

const visible = $derived(
	sortFavorites(searchFavorites(favorites, query), sortKey),
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
/** The user has favorites, but the current query matches none of them. */
const noMatches = $derived(favorites.length > 0 && visible.length === 0);

/** Visible Favorites that have never been refreshed — one header coach, not N card lines. */
const uncheckedVisible = $derived(
	visible.filter((f) => !f.liveStatus.lastChecked).length,
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
</script>

<header class="space-y-2 border-b px-4 py-3">
  <div class="flex items-center justify-between gap-2">
    <!-- ADR-0009: the name, not a label for the list. "Favorit Lowongan"
         described what the list below already shows; opened over MagangHub,
         the one thing the header has to establish is who is speaking. -->
    <h1 class="font-heading text-base font-semibold tracking-normal">SakuMagang</h1>
    <Button variant="outline" size="xs" onclick={refreshAll} disabled={refreshDisabled}>
      {refreshingAll ? 'Memperbarui…' : 'Segarkan semua'}
    </Button>
  </div>

  <!-- Issue #8: MagangHub changed its markup and we could not inject. Say so
       plainly — a known breakage the user can act on (update the extension),
       not a silent failure they'd read as lost favorites. Their data is
       untouched, so this stays subtle rather than alarming. -->
  {#if health === 'degraded'}
    <Alert>
      <AlertTitle>Extension mungkin butuh update</AlertTitle>
      <AlertDescription>Tampilan MagangHub berubah — data favorit kamu tetap aman.</AlertDescription>
    </Alert>
  {/if}

  <!-- Issue #6: find and organize Favorites as the list grows. Both controls
       are view-only — they never touch storage. The select stays a native
       <select> so e2e can drive it with selectOption; styled to match sera. -->
  <div class="flex items-center gap-2">
    <Input
      type="search"
      class={controlClass + ' min-w-0 flex-1 text-sm'}
      placeholder="Cari favorit..."
      aria-label="Cari favorit"
      bind:value={query}
    />
    <select
      class={controlClass + ' max-w-[9.5rem] shrink-0'}
      aria-label="Urutkan"
      bind:value={sortKey}
    >
      <option value="savedAt">Terbaru disimpan</option>
      <option value="stageSeats">Status Lamar, sisa kursi</option>
      <option value="organizer">Penyelenggara</option>
      <option value="location">Lokasi</option>
    </select>
  </div>

  {#if uncheckedVisible > 0 && !loading && !noMatches}
    <p class="text-xs text-muted-foreground" role="status" data-unchecked-coach>
      {uncheckedVisible === 1
        ? '1 favorit belum dicek Status Lowongan.'
        : `${uncheckedVisible} favorit belum dicek Status Lowongan.`} Tekan Segarkan semua untuk Kuota &amp; Pelamar terkini.
    </p>
  {/if}

  {#if importMsg}
    <Alert variant={importMsg.kind === 'warn' ? 'destructive' : 'default'}>
      <AlertDescription>{importMsg.text}</AlertDescription>
    </Alert>
  {/if}
</header>

<main class="space-y-2 p-3">
  {#if loading}
    <div class="space-y-2">
      <div class="h-16 rounded-none bg-muted"></div>
      <div class="h-16 rounded-none bg-muted"></div>
    </div>
  {:else if favorites.length === 0}
    <Card>
      <CardHeader>
        <div class="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-none bg-muted text-lg" aria-hidden="true">★</div>
        <CardTitle class="text-center">Belum ada favorit</CardTitle>
        <CardDescription class="text-center">
          Bintangi Lowongan di MagangHub untuk menyimpannya di sini.
        </CardDescription>
      </CardHeader>
    </Card>
  {:else if noMatches}
    <!-- Distinct from the empty state above: the user HAS favorites, this
         query just matches none of them. -->
    <Card>
      <CardHeader>
        <CardTitle class="text-center">Tidak ada favorit yang cocok</CardTitle>
        <CardDescription class="text-center">
          Coba kata kunci lain atau kosongkan pencarian.
        </CardDescription>
      </CardHeader>
    </Card>
  {:else}
    {#each groups as item (item.kind === "group" ? `group:${item.organizer}` : `solo:${item.favorite.uuid}`)}
      {#if item.kind === "solo"}
        <FavoriteCard
          favorite={item.favorite}
          refreshing={refreshing.has(item.favorite.uuid) || refreshingAll}
          onrefresh={() => refreshOne(item.favorite)}
        />
      {:else}
        <section class="mh-group" data-group-organizer={item.organizer}>
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-none border border-border bg-muted/40 px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
            aria-expanded={!isCollapsed(item.organizer)}
            data-group-toggle
            onclick={() => toggleGroup(item.organizer)}
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold">{item.organizer}</span>
              <span class="block truncate text-xs text-muted-foreground" data-group-summary>{summaryText(item.summary) || `${item.favorites.length} favorit`}</span>
            </span>
            <span class="ml-2 shrink-0 text-xs text-muted-foreground" aria-hidden="true">{isCollapsed(item.organizer) ? '▸' : '▾'}</span>
          </button>
          {#if !isCollapsed(item.organizer)}
            <div class="mt-1 space-y-2">
              {#each item.favorites as fav (fav.uuid)}
                <FavoriteCard
                  favorite={fav}
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

<!-- Backup + trust live below the list so first paint is shortlist + controls.
     Issue #7 / #9: credential-free promise stays visible; export/import remain
     real buttons for e2e and power users without owning the header. -->
<footer class="space-y-2 border-t px-4 py-3">
  <div class="flex flex-wrap items-center gap-2">
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

  <p class="text-xs text-muted-foreground">
    Favorit tersimpan hanya di browser kamu; extension ini tidak pernah minta password SiapKerja.
  </p>
  <Collapsible>
    <CollapsibleTrigger class="text-xs font-medium text-primary underline-offset-2 hover:underline">
      Mengapa aman?
    </CollapsibleTrigger>
    <CollapsibleContent>
      <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
        Situs bantuan pihak ketiga yang minta login SiapKerja bisa mencatat
        password kamu. Extension ini hanya menyimpan Lowongan yang kamu bintangi
        di browser ini — tanpa akun, tanpa server, tanpa telemetri. Kalau mau
        melamar, klik "Buka di MagangHub" di setiap favorit dan lamar sendiri di
        situs resmi.
      </p>
    </CollapsibleContent>
  </Collapsible>
</footer>
