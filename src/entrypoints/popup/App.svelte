<script lang="ts">
import { listFavorites } from "@/lib/storage";
import type { Favorite } from "@/lib/types";
import type { RefreshRequest, RefreshResponse } from "@/lib/refresh";
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
  {:else}
    {#each favorites as fav (fav.uuid)}
      <FavoriteCard
        favorite={fav}
        refreshing={refreshing.has(fav.uuid) || refreshingAll}
        onrefresh={() => refreshOne(fav)}
      />
    {/each}
  {/if}
</main>