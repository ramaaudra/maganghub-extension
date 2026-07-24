<script lang="ts">
  import { onDestroy } from 'svelte';
  import { setCatatan, setStatusLamar } from '@/lib/storage';
  import type { Favorite } from '@/lib/types';
  import { Card, CardContent } from '@/lib/components/ui/card';
  import { cn } from '@/lib/utils';

  let { favorite }: { favorite: Favorite } = $props();

  // Local editable Catatan draft, seeded from the persisted value and reset
  // whenever the underlying record changes (e.g. from a cross-tab sync).
  // $effect.pre (not $state's initializer) so it re-syncs on every change to
  // `favorite`, not just the first render.
  let catatanDraft = $state('');
  let savedFlash = $state(false);
  let saveFlashTimer: ReturnType<typeof setTimeout> | undefined;

  $effect.pre(() => {
    catatanDraft = favorite.catatan;
  });

  async function saveCatatan(): Promise<void> {
    if (catatanDraft === favorite.catatan) return;
    await setCatatan(favorite.uuid, catatanDraft);
    savedFlash = true;
    clearTimeout(saveFlashTimer);
    saveFlashTimer = setTimeout(() => {
      savedFlash = false;
    }, 1500);
  }

  async function onStatusLamarChange(event: Event): Promise<void> {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    await setStatusLamar(favorite.uuid, checked ? 'applied' : 'not_applied');
  }

  const applied = $derived(favorite.statusLamar === 'applied');

  // Safety net: if the popup closes while the textarea still has unsaved
  // edits (blur didn't fire — e.g. user clicked the extension icon away),
  // flush the draft on unmount. chrome.storage.local.set is browser-process
  // backed, so the write completes even after the popup page unloads.
  onDestroy(() => {
    if (catatanDraft !== favorite.catatan) {
      void setCatatan(favorite.uuid, catatanDraft);
    }
  });
</script>

<Card
  class={cn('py-4 gap-2', applied && 'border-primary/40 bg-primary/5')}
  data-favorite-uuid={favorite.uuid}
>
  <CardContent class="space-y-2">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="font-medium leading-snug">{favorite.savedSnapshot.title || favorite.uuid}</p>
        <p class="mt-0.5 text-sm text-muted-foreground">{favorite.savedSnapshot.organizer}</p>
        {#if favorite.savedSnapshot.location}
          <p class="mt-0.5 text-sm text-muted-foreground">{favorite.savedSnapshot.location}</p>
        {/if}
      </div>
      {#if applied}
        <span class="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          Sudah dilamar
        </span>
      {/if}
    </div>

    <label class="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={applied}
        onchange={onStatusLamarChange}
        aria-label="Sudah dilamar"
      />
      Sudah dilamar
    </label>

    <div>
      <textarea
        class="w-full resize-none rounded-md border px-2 py-1.5 text-sm"
        rows="2"
        placeholder="Tambahkan catatan..."
        bind:value={catatanDraft}
        onblur={saveCatatan}
      ></textarea>
      {#if savedFlash}
        <p class="mt-0.5 text-xs text-muted-foreground">Tersimpan</p>
      {/if}
    </div>
  </CardContent>
</Card>
