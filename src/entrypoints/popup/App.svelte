<script lang="ts">
  import { listFavorites } from '@/lib/storage';
  import type { Favorite } from '@/lib/types';
  import { Card, CardHeader, CardTitle, CardDescription } from '@/lib/components/ui/card';
  import FavoriteCard from './FavoriteCard.svelte';

  let favorites = $state<Favorite[]>([]);
  let loading = $state(true);

  async function refresh(): Promise<void> {
    favorites = await listFavorites();
    loading = false;
  }

  // Live-update when a favorite is starred from the content script.
  function onChanged(_changes: Record<string, unknown>, areaName: string): void {
    if (areaName === 'local') void refresh();
  }

  $effect(() => {
    void refresh();
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  });
</script>

<header class="border-b px-4 py-3">
  <h1 class="text-base font-semibold">Favorit Lowongan</h1>
  <p class="text-xs text-muted-foreground">Tersimpan lokal di browser ini</p>
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
      <FavoriteCard favorite={fav} />
    {/each}
  {/if}
</main>