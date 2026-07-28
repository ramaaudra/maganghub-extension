<script lang="ts">
import { onDestroy } from "svelte";
import { formatChangeNotice } from "@/lib/change";
import { Card, CardContent } from "@/lib/components/ui/card";
import { Badge } from "@/lib/components/ui/badge";
import { resolveDetailUrl } from "@/lib/refresh";
import { STAGE_LABEL, STAGE_SELECT_OPTIONS } from "@/lib/stage";
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
let catatanFocused = $state(false);
let saveFlashTimer: ReturnType<typeof setTimeout> | undefined;

$effect.pre(() => {
	catatanDraft = favorite.catatan;
});

const catatanDirty = $derived(catatanDraft !== favorite.catatan);

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
const snap = $derived(favorite.savedSnapshot);
const lastCheckedLabel = $derived(terakhirDicek(live.lastChecked));
// A failed refresh: status unknown AND we have a lastError recorded.
const refreshFailed = $derived(live.status === "unknown" && !!live.lastError);
// B1: one-line change notice when kuota/pelamar/status moved since last sample.
const changeNotice = $derived(formatChangeNotice(live));
const hasBeenChecked = $derived(!!live.lastChecked);
/** Snapshot seat strings captured at star time (display strings, ADR-0002). */
const snapKuota = $derived(snap.kuota?.trim() || undefined);
const snapPelamar = $derived(snap.pelamar?.trim() || undefined);
const hasSnapSeats = $derived(snapKuota !== undefined || snapPelamar !== undefined);
const showSignalStrip = $derived(hasBeenChecked || hasSnapSeats);

const STATUS_LABEL: Record<StatusLowongan, string> = {
	open: "Buka",
	filling: "Mengisi",
	closed: "Tutup",
	unknown: "Tidak diketahui",
};

/** Sera Badge is an uppercase text label with no fill; colour carries the
 *  semantic. A tiny leading dot makes the colour legible at 10px without
 *  reintroducing the pill shape the preset deliberately removes. */
const STATUS_CLASS: Record<StatusLowongan, string> = {
	open: "text-emerald-600",
	filling: "text-amber-600",
	closed: "text-rose-600",
	unknown: "text-muted-foreground",
};

/** Colour per stage (D2/D7). Words come from `STAGE_LABEL` in stage.ts so the
 *  on-card chip (A2) stays in lockstep. No stage → no chip. */

const STAGE_CLASS: Record<StatusLamar, string> = {
	dilamar: "text-primary",
	interview: "text-blue-600",
	diterima: "text-emerald-600",
	ditolak: "text-rose-600",
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
  class={cn(
	  'gap-1.5 py-3',
	  stage && ACTIVE_STAGES.has(stage) && 'border border-primary/40 bg-primary/5 ring-primary/40',
  )}
  data-favorite-uuid={favorite.uuid}
>
  <CardContent class="space-y-1.5 px-4">
    <!-- Title + chips: Status Lamar (pipeline) above Status Lowongan (listing) -->
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="text-sm font-medium leading-snug text-balance" data-favorite-title>
          {favorite.savedSnapshot.title || favorite.uuid}
        </p>
        <p class="mt-0.5 truncate text-xs text-muted-foreground">
          {favorite.savedSnapshot.organizer}{#if favorite.savedSnapshot.location}<span aria-hidden="true"> · </span>{favorite.savedSnapshot.location}{/if}
        </p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-0.5">
        {#if stage}
          <!-- title (not aria-label "Status Lamar:…") so e2e getByLabel('Status Lamar')
               still uniquely targets the select control. -->
          <Badge class={STAGE_CLASS[stage]} title="Status Lamar: {STAGE_LABEL[stage]}">
            <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
            {STAGE_LABEL[stage]}
          </Badge>
        {/if}
        {#if hasBeenChecked}
          <Badge
            class={cn(refreshFailed ? 'text-rose-600' : STATUS_CLASS[live.status])}
            title="Status Lowongan: {refreshFailed ? 'Refresh gagal' : STATUS_LABEL[live.status]}"
          >
            <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
            {refreshFailed ? 'Refresh gagal' : STATUS_LABEL[live.status]}
          </Badge>
        {:else}
          <Badge class="text-muted-foreground" title="Status Lowongan: Belum dicek">
            <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
            Belum dicek
          </Badge>
        {/if}
      </div>
    </div>

    <!-- Signal strip: live seats after check; snapshot seats while cold (hybrid) -->
    {#if showSignalStrip}
      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
        data-signal-strip
      >
        {#if hasBeenChecked}
          <span>{lastCheckedLabel}</span>
          {#if live.batch}
            <span>{live.batch}</span>
          {/if}
          {#if live.kuota !== undefined}
            <span class="font-medium tabular-nums text-foreground">Kuota {live.kuota}</span>
          {/if}
          {#if live.pelamar !== undefined}
            <span class="font-medium tabular-nums text-foreground">Pelamar {live.pelamar}</span>
          {/if}
        {:else}
          <span class="text-muted-foreground">Saat disimpan</span>
          {#if snapKuota}
            <span class="tabular-nums">Kuota {snapKuota}</span>
          {/if}
          {#if snapPelamar}
            <span class="tabular-nums">Pelamar {snapPelamar}</span>
          {/if}
        {/if}
      </div>
    {/if}

    {#if changeNotice}
      <p
        class="text-xs text-amber-700"
        data-change-notice
        role="status"
      >
        {changeNotice}
      </p>
    {/if}

    <!-- Status Lamar full-width — never squeezed between actions -->
    <label class="flex min-w-0 items-baseline gap-2 text-xs">
      <span class="shrink-0 text-muted-foreground">Status Lamar</span>
      <select
        class="min-w-0 flex-1 rounded-none border-b border-border bg-transparent px-0 py-0.5 text-xs text-foreground outline-none transition-[border-color] hover:border-b-foreground/40 focus-visible:border-b-ring"
        value={statusLamarValue}
        onchange={onStatusLamarChange}
        aria-label="Status Lamar"
      >
        {#each STAGE_SELECT_OPTIONS as [value, label]}
          <option {value}>{label}</option>
        {/each}
      </select>
    </label>

    <!-- Actions: refresh left, open MagangHub right -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-none border border-border bg-transparent px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        onclick={onrefresh}
        disabled={refreshing}
        aria-label="Segarkan Status Lowongan"
      >
        {refreshing ? 'Memperbarui…' : 'Segarkan'}
      </button>
      {#if favorite.detailUrl}
        <a
          class="ml-auto shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
          href={resolveDetailUrl(favorite.detailUrl)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Buka di MagangHub"
        >
          Buka di MagangHub
        </a>
      {/if}
    </div>

    <div>
      <label class="sr-only" for="catatan-{favorite.uuid}">Catatan</label>
      <textarea
        id="catatan-{favorite.uuid}"
        class={cn(
          'w-full resize-none rounded-none border-b border-border bg-transparent px-0 text-sm text-foreground outline-none transition-[border-color,min-height] placeholder:text-muted-foreground focus-visible:border-b-ring',
          catatanFocused || catatanDraft ? 'min-h-16 py-1.5' : 'min-h-7 py-1',
        )}
        placeholder="Kenapa lowongan ini?"
        rows={catatanFocused || catatanDraft ? 3 : 1}
        bind:value={catatanDraft}
        onfocus={() => (catatanFocused = true)}
        onblur={() => {
          catatanFocused = false;
          void saveCatatan();
        }}
      ></textarea>
      {#if savedFlash}
        <p class="mt-0.5 text-xs text-muted-foreground" role="status" data-catatan-status="saved">Tersimpan</p>
      {:else if catatanDirty}
        <!-- Wording avoids substring "Tersimpan" so e2e getByText('Tersimpan') stays unique. -->
        <p class="mt-0.5 text-xs text-muted-foreground" role="status" data-catatan-status="dirty">Lepas fokusus untuk menyimpan</p>
      {/if}
    </div>
  </CardContent>
</Card>
