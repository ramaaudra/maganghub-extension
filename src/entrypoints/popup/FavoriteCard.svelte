<script lang="ts">
import { onDestroy } from "svelte";
import { setCatatan, setStatusLamar } from "@/lib/storage";
import type { Favorite, StatusLowongan } from "@/lib/types";
import { Card, CardContent } from "@/lib/components/ui/card";
import { cn } from "@/lib/utils";
import { terakhirDicek } from "@/lib/time";
import { resolveDetailUrl } from "@/lib/refresh";

let {
	favorite,
	refreshing = false,
	onrefresh = () => {},
}: {
	favorite: Favorite;
	refreshing?: boolean;
	onrefresh?: () => void;
} = $props();

// Local editable Catatan draft, seeded from the persisted value and reset
// whenever the underlying record changes (e.g. from a cross-tab sync).
// $effect.pre (not $state's initializer) so it re-syncs on every change to
// `favorite`, not just the first render.
let catatanDraft = $state("");
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
	await setStatusLamar(favorite.uuid, checked ? "applied" : "not_applied");
}

const applied = $derived(favorite.statusLamar === "applied");
const live = $derived(favorite.liveStatus);
const lastCheckedLabel = $derived(terakhirDicek(live.lastChecked));
// A failed refresh: status unknown AND we have a lastError recorded.
const refreshFailed = $derived(live.status === "unknown" && !!live.lastError);

const STATUS_LABEL: Record<StatusLowongan, string> = {
	open: "Buka",
	filling: "Mengisi",
	closed: "Tutup",
	unknown: "Tidak diketahui",
};

const STATUS_CLASS: Record<StatusLowongan, string> = {
	open: "bg-emerald-100 text-emerald-700",
	filling: "bg-amber-100 text-amber-700",
	closed: "bg-rose-100 text-rose-700",
	unknown: "bg-muted text-muted-foreground",
};

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
      <div class="min-w-0">
        <p class="font-medium leading-snug">{favorite.savedSnapshot.title || favorite.uuid}</p>
        <p class="mt-0.5 text-sm text-muted-foreground">{favorite.savedSnapshot.organizer}</p>
        {#if favorite.savedSnapshot.location}
          <p class="mt-0.5 text-sm text-muted-foreground">{favorite.savedSnapshot.location}</p>
        {/if}
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        {#if applied}
          <span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Sudah dilamar
          </span>
        {/if}
        {#if live.lastChecked}
          <span
            class={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              refreshFailed ? 'bg-rose-100 text-rose-700' : STATUS_CLASS[live.status],
            )}
          >
            {refreshFailed ? 'Refresh gagal' : STATUS_LABEL[live.status]}
          </span>
        {/if}
      </div>
    </div>

    {#if live.lastChecked}
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{lastCheckedLabel}</span>
        {#if live.batch}
          <span>{live.batch}</span>
        {/if}
        {#if live.kuota !== undefined}
          <span>Kuota {live.kuota}</span>
        {/if}
        {#if live.pelamar !== undefined}
          <span>Pelamar {live.pelamar}</span>
        {/if}
      </div>
    {/if}

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        onclick={onrefresh}
        disabled={refreshing}
        aria-label="Segarkan Status Lowongan"
      >
        {refreshing ? 'Memperbarui…' : 'Segarkan'}
      </button>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={applied}
          onchange={onStatusLamarChange}
          aria-label="Sudah dilamar"
        />
        Sudah dilamar
      </label>
      {#if favorite.detailUrl}
        <a
          href={resolveDetailUrl(favorite.detailUrl)}
          target="_blank"
          rel="noopener noreferrer"
          class="ml-auto rounded-md px-2 py-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
          aria-label="Buka di MagangHub"
        >
          Buka di MagangHub
        </a>
      {/if}
    </div>

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