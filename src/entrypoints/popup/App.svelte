<script lang="ts">
import { listFavorites } from "@/lib/storage";
import { onDestroy } from "svelte";
import type { Favorite } from "@/lib/types";
import type { RefreshRequest, RefreshResponse } from "@/lib/refresh";
import { exportFavorites, importFavorites, type ExportFile } from "@/lib/io";
import { searchFavorites, sortFavorites, type SortKey } from "@/lib/filter";
import { cn } from "@/lib/utils";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/lib/components/ui/card";
import FavoriteCard from "./FavoriteCard.svelte";

let favorites = $state<Favorite[]>([]);
let loading = $state(true);
/** UUIDs with a single-favorite refresh in flight. */
let refreshing = $state<Set<string>>(new Set());
let refreshingAll = $state(false);
/** Import result banner: null = hidden, otherwise shown until cleared. */
let importMsg = $state<{ kind: "ok" | "warn"; text: string } | null>(null);
let importTimer: ReturnType<typeof setTimeout> | undefined;

async function refresh(): Promise<void> {
	favorites = await listFavorites();
	loading = false;
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
/** The user has favorites, but the current query matches none of them. */
const noMatches = $derived(favorites.length > 0 && visible.length === 0);

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
</script>

<header class="border-b px-4 py-3">
  <div class="flex items-center justify-between gap-2">
    <div>
      <h1 class="text-base font-semibold">Favorit Lowongan</h1>
      <p class="text-xs text-muted-foreground">Tersimpan lokal di browser ini</p>
    </div>
    <button
      type="button"
      class="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      onclick={refreshAll}
      disabled={refreshDisabled}
    >
      {refreshingAll ? 'Memperbarui…' : 'Segarkan semua'}
    </button>
  </div>

  <!-- Issue #9: backup/restore (no-sync story). Export downloads a JSON
       envelope; import reads a file and merges via the migration registry. -->
  <div class="mt-2 flex flex-wrap items-center gap-2">
    <button
      type="button"
      class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      onclick={onExport}
      disabled={favorites.length === 0}
    >
      Ekspor
    </button>
    <label
      class="cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
    >
      Impor
      <input
        type="file"
        accept="application/json,.json"
        class="sr-only"
        onchange={onImportFile}
      />
    </label>
  </div>

  <!-- Issue #6: find and organize Favorites as the list grows. Both controls
       are view-only — they never touch storage. -->
  <div class="mt-2 flex items-center gap-2">
    <input
      type="search"
      class="min-w-0 flex-1 rounded-md border px-2.5 py-1 text-xs"
      placeholder="Cari favorit..."
      aria-label="Cari favorit"
      bind:value={query}
    />
    <label class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <span>Urutkan</span>
      <select
        class="rounded-md border px-1.5 py-1 text-xs"
        aria-label="Urutkan"
        bind:value={sortKey}
      >
        <option value="savedAt">Terbaru disimpan</option>
        <option value="organizer">Penyelenggara</option>
        <option value="location">Lokasi</option>
      </select>
    </label>
  </div>

  {#if importMsg}
    <p
      class={cn(
        'mt-2 rounded-md px-2.5 py-1.5 text-xs',
        importMsg.kind === 'warn'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-emerald-100 text-emerald-800',
      )}
    >
      {importMsg.text}
    </p>
  {/if}

  <!-- Issue #7 trust layer (ADR-0001): make the credential-free promise
       visible, not just asserted in the manifest. -->
  <p class="mt-2 text-xs text-muted-foreground">
    Favorit tersimpan hanya di browser kamu; extension ini tidak pernah minta password SiapKerja.
  </p>
  <details class="mt-1">
    <summary
      class="cursor-pointer select-none text-xs font-medium text-primary underline-offset-2 hover:underline"
    >Mengapa aman?</summary>
    <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
      Situs bantuan pihak ketiga yang minta login SiapKerja bisa mencatat
      password kamu. Extension ini hanya menyimpan Lowongan yang kamu bintangi
      di browser ini — tanpa akun, tanpa server, tanpa telemetri. Kalau mau
      melamar, klik "Buka di MagangHub" di setiap favorit dan lamar sendiri di
      situs resmi.
    </p>
  </details>
</header>

<main class="space-y-2 p-3">
  {#if loading}
    <div class="space-y-2">
      <div class="h-16 rounded-md bg-muted"></div>
      <div class="h-16 rounded-md bg-muted"></div>
    </div>
  {:else if favorites.length === 0}
    <Card>
      <CardHeader>
        <div class="mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg">★</div>
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
    {#each visible as fav (fav.uuid)}
      <FavoriteCard
        favorite={fav}
        refreshing={refreshing.has(fav.uuid) || refreshingAll}
        onrefresh={() => refreshOne(fav)}
      />
    {/each}
  {/if}
</main>