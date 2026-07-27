<script lang="ts">
import { onDestroy } from "svelte";
import { formatChangeNotice } from "@/lib/change";
import { Card, CardContent } from "@/lib/components/ui/card";
import { resolveDetailUrl } from "@/lib/refresh";
import { STAGE_LABEL } from "@/lib/stage";
import { setCatatan, setStatusLamar } from "@/lib/storage";
import { terakhirDicek } from "@/lib/time";
import type { Favorite, StatusLamar, StatusLowongan } from "@/lib/types";
import { cn } from "@/lib/utils";

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
	const value = (event.currentTarget as HTMLSelectElement).value;
	// "" = "Belum dilamar" → clear the stage back to no stage.
	const stage = value === "" ? undefined : (value as StatusLamar);
	await setStatusLamar(favorite.uuid, stage);
}

/** The popup's Status Lamar select reads/writes "" for the "no stage" option,
 *  so the select's value stays a plain string while the persisted field is a
 *  StatusLamar | undefined. */
const statusLamarValue = $derived(favorite.statusLamar ?? "");
const stage = $derived(favorite.statusLamar);
const live = $derived(favorite.liveStatus);
const lastCheckedLabel = $derived(terakhirDicek(live.lastChecked));
// A failed refresh: status unknown AND we have a lastError recorded.
const refreshFailed = $derived(live.status === "unknown" && !!live.lastError);
// B1: one-line change notice when kuota/pelamar/status moved since last sample.
const changeNotice = $derived(formatChangeNotice(live));

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

/** Colour per stage (D2/D7). Words come from `STAGE_LABEL` in stage.ts so the
 *  on-card chip (A2) stays in lockstep. No stage → no chip. */

const STAGE_CLASS: Record<StatusLamar, string> = {
	dilamar: "bg-primary/10 text-primary",
	interview: "bg-blue-100 text-blue-700",
	diterima: "bg-emerald-100 text-emerald-700",
	ditolak: "bg-rose-100 text-rose-700",
};

/**
 * The "still in progress" stages (D9's active block). The card's subtle brand
 * tint singles these out — the ones a user is still acting on. Terminal stages
 * (Diterima/Ditolak) carry no card tint: their coloured chip is the signal, and
 * a brand-primary border under a "Ditolak" chip would read as encouragement.
 */
const ACTIVE_STAGES: ReadonlySet<StatusLamar> = new Set([
	"dilamar",
	"interview",
]);

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
  class={cn('py-4 gap-2', stage && ACTIVE_STAGES.has(stage) && 'border-primary/40 bg-primary/5')}
  data-favorite-uuid={favorite.uuid}
>
  <CardContent class="space-y-2">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="font-medium leading-snug" data-favorite-title>{favorite.savedSnapshot.title || favorite.uuid}</p>
        <p class="mt-0.5 text-sm text-muted-foreground">{favorite.savedSnapshot.organizer}</p>
        {#if favorite.savedSnapshot.location}
          <p class="mt-0.5 text-sm text-muted-foreground">{favorite.savedSnapshot.location}</p>
        {/if}
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        {#if stage}
          <span class={cn('rounded-full px-2 py-0.5 text-xs font-medium', STAGE_CLASS[stage])}>
            {STAGE_LABEL[stage]}
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

    {#if changeNotice}
      <p
        class="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800"
        data-change-notice
        role="status"
      >
        {changeNotice}
      </p>
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
        <span class="text-muted-foreground">Status Lamar</span>
        <select
          class="rounded-md border px-1.5 py-1 text-xs"
          value={statusLamarValue}
          onchange={onStatusLamarChange}
        >
          <option value="">Belum dilamar</option>
          <option value="dilamar">Dilamar</option>
          <option value="interview">Interview</option>
          <option value="diterima">Diterima</option>
          <option value="ditolak">Ditolak</option>
        </select>
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