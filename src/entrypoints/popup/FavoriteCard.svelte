<script lang="ts">
import { onDestroy } from "svelte";
import { HugeiconsIcon } from "@hugeicons/svelte";
import {
	Archive02Icon,
	ArrowDown01Icon,
	Delete02Icon,
	Note01Icon,
} from "@hugeicons/core-free-icons";
import { formatChangeNotice } from "@/lib/change";
import { Card, CardContent } from "@/lib/components/ui/card";
import { Badge } from "@/lib/components/ui/badge";
import {
	archiveFavorite,
	removeFavorite,
	unarchiveFavorite,
} from "@/lib/storage";
import { resolveDetailUrl } from "@/lib/refresh";
import { favoriteSeats, seatLine, seatPressure } from "@/lib/seats";
import { STAGE_LABEL, STAGE_SELECT_OPTIONS } from "@/lib/stage";
import { setCatatan, setStatusLamar } from "@/lib/storage";
import { terakhirDicek } from "@/lib/time";
import { titleCase } from "@/lib/titlecase";
import type { Favorite, StatusLamar, StatusLowongan } from "@/lib/types";
import { cn } from "@/lib/utils";

let {
	favorite,
	view = "aktif",
	refreshing = false,
	onrefresh = () => {},
}: {
	favorite: Favorite;
	/** Which list the card is rendered in: "aktif" shows Segarkan + Arsipkan;
	 *  "arsip" shows Pulihkan + Hapus permanen (no refresh — ADR-0010). */
	view?: "aktif" | "arsip";
	refreshing?: boolean;
	onrefresh?: () => void;
} = $props();

// ─── Collapse (readability rebuild) ─────────────────────────────────────────
// The card used to stack six always-visible bands — title, seat strip, change
// notice, Status Lamar select, action row, Catatan — at ~180px each. Two cards
// filled the 360×600 popup, so a shortlist of eight could not be compared
// without scrolling, which is the one thing a shortlist is for.
//
// Now the resting card is three lines of *reading* (title, Penyelenggara,
// seats) and every *control* lives behind one disclosure. Collapsed height is
// ~76px, so ~6 fit in the same viewport. The controls are one click away, not
// gone; the click is cheap because the decision the user is making at rest is
// "which of these do I care about", not "let me edit this one".
let expanded = $state(false);

/** Local editable Catatan draft, seeded from the persisted value and reset
 *  whenever the underlying record changes (e.g. from a cross-tab sync).
 *  $effect.pre (not $state's initializer) so it re-syncs on every change to
 *  `favorite`, not just the first render. */
let catatanDraft = $state("");
let savedFlash = $state(false);
let saveFlashTimer: ReturnType<typeof setTimeout> | undefined;
/** True while the textarea holds focus — the draft is then the user's, and no
 *  incoming record may overwrite it. See the reseed effect below. */
let catatanFocused = $state(false);
/** One-shot flash when live seats/status land after a refresh the user ran. */
let signalFlash = $state(false);
let signalFlashTimer: ReturnType<typeof setTimeout> | undefined;
// Bookkeeping stays non-reactive so the effect does not re-enter on its own writes.
let lastLiveKey: string | undefined;
let wasRefreshing = false;

$effect.pre(() => {
	// Never reseed while the user is typing. `setCatatan` writes to
	// chrome.storage, which fires storage.onChanged, which re-reads the list and
	// hands this component a new `favorite` — so a save mid-edit would otherwise
	// bounce the textarea back to the value that was just persisted and discard
	// anything typed since. Reading `favorite.catatan` unconditionally keeps this
	// effect subscribed to it, so the reseed still lands on the next change once
	// focus is released.
	const incoming = favorite.catatan;
	if (catatanFocused) return;
	catatanDraft = incoming;
});

const catatanDirty = $derived(catatanDraft !== favorite.catatan);

function liveFingerprint(fav: Favorite): string {
	const l = fav.liveStatus;
	return [
		l.status,
		l.kuota ?? "",
		l.pelamar ?? "",
		l.batch ?? "",
		l.lastChecked ?? "",
		l.lastError ?? "",
	].join("|");
}

// Flash seats/status only after a refresh this card was waiting on, and only
// when the live sample actually changed — storage re-reads must not flicker.
$effect(() => {
	const key = liveFingerprint(favorite);
	if (refreshing) {
		wasRefreshing = true;
		return;
	}
	if (wasRefreshing && lastLiveKey !== undefined && lastLiveKey !== key) {
		signalFlash = true;
		clearTimeout(signalFlashTimer);
		// Match .mh-signal-flash hold — brief static wash, not a long paint tween.
		signalFlashTimer = setTimeout(() => {
			signalFlash = false;
		}, 240);
	}
	wasRefreshing = false;
	lastLiveKey = key;
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

// ─── Archive / restore / delete (ADR-0010) ──────────────────────────────────
// Archive is a soft-hide: the record stays, the star on MagangHub stays filled,
// and storage.onChanged re-renders the popup so the card leaves the Aktif list.
// Restore returns it to Aktif and resets changedAt (see unarchiveFavorite).
// Delete is the one irreversible action here, so it is guarded by an inline
// confirm that the user must click again — no modal, no window.confirm, stays
// in the card's visual context.

/** Inline confirm state for "Hapus permanen". `true` swaps the action row for a
 *  "Yakin? [Ya, hapus] [Batal]" prompt. Reset on any storage sync that changes
 *  the underlying record, so a cross-tab write never leaves a stale confirm. */
let confirmDelete = $state(false);

$effect.pre(() => {
	// Track the underlying record so a cross-tab sync (storage.onChanged → new
	// `favorite` prop) resets a dangling confirm. Reading `favorite.uuid` and
	// `favorite.archivedAt` ties the reset to identity + archive state.
	favorite.uuid;
	favorite.archivedAt;
	confirmDelete = false;
});

async function onArchive(): Promise<void> {
	await archiveFavorite(favorite.uuid);
}

async function onRestore(): Promise<void> {
	await unarchiveFavorite(favorite.uuid);
}

async function onDeletePermanent(): Promise<void> {
	await removeFavorite(favorite.uuid);
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
const hasBeenChecked = $derived(!!live.lastChecked);

/** Display title/Penyelenggara: all-caps source strings are title-cased for
 *  readability. `savedSnapshot` itself is untouched (ADR-0002) and search still
 *  matches the raw text — this is a view repair only. */
const displayTitle = $derived(
	titleCase(favorite.savedSnapshot.title || favorite.uuid),
);
const displayOrganizer = $derived(titleCase(favorite.savedSnapshot.organizer));

/** Seats — live once refreshed, snapshot while cold. One line, one provenance. */
const seats = $derived(favoriteSeats(favorite));
const seatsText = $derived(seatLine(seats));
const pressure = $derived(seatPressure(seats));

/** Weight follows pressure: a Lowongan about to close reads darker than one
 *  with room. Colour is not the carrier — the Status Lowongan chip owns that —
 *  so this stays inside the ink palette. */
const SEAT_CLASS: Record<string, string> = {
	none: "text-muted-foreground",
	calm: "text-muted-foreground",
	tight: "font-medium text-foreground",
	full: "font-medium text-foreground",
};

/** Catatan presence is a resting-state signal: the note itself is behind the
 *  disclosure, but *that there is one* belongs on the collapsed row. */
const hasCatatan = $derived(favorite.catatan.trim().length > 0);

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

const isActiveStage = $derived(!!stage && ACTIVE_STAGES.has(stage));

/** Accessible name for the disclosure — the title alone is ambiguous when a
 *  screen reader lands on N of these in a row. */
const toggleLabel = $derived(
	expanded ? `Tutup detail ${displayTitle}` : `Buka detail ${displayTitle}`,
);

// Safety net: if the popup closes while the textarea still has unsaved
// edits (blur didn't fire — e.g. user clicked the extension icon away),
// flush the draft on unmount. chrome.storage.local.set is browser-process
// backed, so the write completes even after the popup page unloads.
onDestroy(() => {
	clearTimeout(saveFlashTimer);
	clearTimeout(signalFlashTimer);
	if (catatanDraft !== favorite.catatan) {
		void setCatatan(favorite.uuid, catatanDraft);
	}
});

/** Shared action-button classes — one vocabulary for every control in the
 *  expanded tray (DESIGN.md: outline only, sharp, 12px label). */
const actionClass =
	"inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-none border border-border bg-transparent px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
</script>

<Card
  class={cn(
	  'gap-0 py-0 transition-[background-color,border-color] duration-200 ease-out',
	  isActiveStage && 'border border-primary/40 bg-primary/5 ring-primary/40',
  )}
  data-favorite-uuid={favorite.uuid}
  data-expanded={expanded}
>
  <!--
    The whole resting card is the disclosure control. A 360px row with a
    separate 24px chevron target wastes the width and invites mis-clicks; the
    row itself is the affordance, and the chevron is its state readout.
  -->
  <button
    type="button"
    class="w-full cursor-default rounded-none px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset"
    aria-expanded={expanded}
    aria-label={toggleLabel}
    data-favorite-toggle
    onclick={() => (expanded = !expanded)}
  >
    <!-- Line 1: title + stage. Stage rides the title line because it is the
         user's own annotation and belongs with the thing it annotates. -->
    <div class="flex items-start justify-between gap-2">
      <p
        class="min-w-0 flex-1 text-sm font-medium leading-snug text-balance"
        data-favorite-title
      >{displayTitle}</p>
      {#if stage}
        <!-- title (not aria-label "Status Lamar:…") so e2e getByLabel('Status Lamar')
             still uniquely targets the select control. No enter animation on mount —
             a full list of chip-ins would choreograph every popup open. -->
        <Badge
          class={cn('mt-px shrink-0', STAGE_CLASS[stage])}
          title="Status Lamar: {STAGE_LABEL[stage]}"
        >
          <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
          {STAGE_LABEL[stage]}
        </Badge>
      {/if}
    </div>

    <!-- Line 2: Penyelenggara · Lokasi — context, one line, truncated.
         The separator is an expression, not literal markup: Svelte trims the
         whitespace around a text node between tags, which rendered it as
         "Koesnadi·Bondowoso" with the words jammed against the dot. -->
    <p class="mt-0.5 truncate text-xs text-muted-foreground">
      {displayOrganizer}{#if favorite.savedSnapshot.location}<span aria-hidden="true">{' · '}</span>{favorite.savedSnapshot.location}{/if}
    </p>

    <!-- Line 3: the decision line — seats, status, disclosure. Provenance is
         NOT here: the Status Lowongan chip already distinguishes a checked
         reading from an unchecked one, and the expanded tray states it in
         words. Repeating "saat disimpan" beside a chip reading "Belum dicek"
         said the same thing twice and wrapped the seat count onto a second
         line, which made cards uneven in height. -->
    <div
      class={cn(
        'mt-1.5 flex items-center gap-2 text-xs',
        signalFlash && 'mh-signal-flash',
      )}
      data-signal-strip
    >
      {#if seatsText}
        <span class={cn('truncate whitespace-nowrap tabular-nums', SEAT_CLASS[pressure])}>{seatsText}</span>
      {:else}
        <span class="truncate text-muted-foreground">Kuota belum diketahui</span>
      {/if}

      <span class="ml-auto flex shrink-0 items-center gap-1.5">
        {#if hasCatatan}
          <HugeiconsIcon
            icon={Note01Icon}
            strokeWidth={2}
            class="size-3.5 text-muted-foreground"
            data-catatan-mark
            aria-label="Punya Catatan"
          />
        {/if}
        {#if hasBeenChecked}
          <Badge
            class={cn(
              refreshFailed ? 'text-rose-600' : STATUS_CLASS[live.status],
              signalFlash && 'mh-signal-flash',
            )}
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
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          class={cn(
            'size-3.5 text-muted-foreground transition-transform duration-150 ease-out',
            expanded && '-rotate-180',
          )}
          aria-hidden="true"
        />
      </span>
    </div>
  </button>

  {#if changeNotice}
    <!-- Outside the disclosure: a seat that moved since last check is news the
         user must not have to open the card to see. -->
    {#key changeNotice}
      <p
        class="mh-rise-in px-4 pb-2 text-xs text-amber-700"
        data-change-notice
        role="status"
      >
        {changeNotice}
      </p>
    {/key}
  {/if}

  {#if expanded}
    <CardContent class="mh-rise-in space-y-2 border-t border-border/70 px-4 pt-2.5 pb-3">
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

      <div>
        <label class="sr-only" for="catatan-{favorite.uuid}">Catatan</label>
        <!-- 12px, matching the Status Lamar row above it. At 14px the note set
             heavier than the card's own title, so an aside outshouted the
             thing it annotates. -->
        <textarea
          id="catatan-{favorite.uuid}"
          class="min-h-12 w-full resize-none rounded-none border-b border-border bg-transparent px-0 py-1 text-xs leading-relaxed text-foreground outline-none transition-[border-color] placeholder:text-muted-foreground focus-visible:border-b-ring"
          placeholder="Kenapa lowongan ini?"
          rows={2}
          bind:value={catatanDraft}
          onfocus={() => (catatanFocused = true)}
          onblur={() => {
            catatanFocused = false;
            void saveCatatan();
          }}
        ></textarea>
        {#if savedFlash}
          <p class="text-xs text-muted-foreground" role="status" data-catatan-status="saved">Tersimpan</p>
        {:else if catatanDirty}
          <!-- Wording avoids substring "Tersimpan" so e2e getByText('Tersimpan') stays unique. -->
          <p class="text-xs text-muted-foreground" role="status" data-catatan-status="dirty">Lepas fokus untuk menyimpan</p>
        {/if}
      </div>

      <!-- Actions — composition depends on the list the card is in (ADR-0010):
           • aktif: [Segarkan] [Arsipkan] ……… [Buka di MagangHub]
           • arsip: [Pulihkan] [Hapus permanen] ……… [Buka di MagangHub]
           Arsip cards have no Segarkan (archived records are skipped by refresh).
           "Hapus permanen" is irreversible, so it is guarded by an inline
           confirm that replaces the row with "Yakin? [Ya, hapus] [Batal]". -->
      <div class="flex items-center gap-2">
        {#if view === 'aktif'}
          <button
            type="button"
            class={actionClass}
            onclick={onrefresh}
            disabled={refreshing}
            aria-label="Segarkan Status Lowongan"
            aria-busy={refreshing}
          >
            {#if refreshing}
              <span
                class="mh-spin size-3 shrink-0 rounded-none border border-current border-r-transparent"
                aria-hidden="true"
              ></span>
            {/if}
            {refreshing ? 'Memperbarui…' : 'Segarkan'}
          </button>
          <button
            type="button"
            class={actionClass}
            onclick={onArchive}
            aria-label="Arsipkan"
            title="Arsipkan — sembunyikan tanpa menghapus"
            data-archive-button
          >
            <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} class="size-3.5" />
            Arsipkan
          </button>
        {:else if confirmDelete}
          <!-- Inline confirm: the destructive action swaps the row for a
               two-button prompt in the card's own context. -->
          <span class="text-xs text-muted-foreground" data-delete-confirm>Yakin?</span>
          <button
            type="button"
            class="inline-flex h-7 shrink-0 items-center justify-center rounded-none border border-rose-300 bg-rose-50 px-2.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            onclick={onDeletePermanent}
            aria-label="Ya, hapus permanen"
            data-confirm-delete
          >
            Ya, hapus
          </button>
          <button
            type="button"
            class={actionClass}
            onclick={() => (confirmDelete = false)}
            aria-label="Batal hapus"
            data-cancel-delete
          >
            Batal
          </button>
        {:else}
          <button
            type="button"
            class={actionClass}
            onclick={onRestore}
            aria-label="Pulihkan ke daftar aktif"
            data-restore-button
          >
            Pulihkan
          </button>
          <button
            type="button"
            class="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-none border border-transparent bg-transparent px-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            onclick={() => (confirmDelete = true)}
            aria-label="Hapus permanen"
            title="Hapus permanen — tidak bisa dikembalikan"
            data-delete-button
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} class="size-3.5" />
            Hapus permanen
          </button>
        {/if}
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

      <!-- Provenance last: it explains the numbers above, so it reads after
           them, in the quietest voice on the card. On a cold Favorite this is
           where "saat disimpan" is stated in full — the resting row leaves it
           to the "Belum dicek" chip rather than repeating it in two places. -->
      <p class="text-xs text-muted-foreground" data-provenance>
        {#if hasBeenChecked && lastCheckedLabel}
          {lastCheckedLabel}{#if live.batch}<span aria-hidden="true">{' · '}</span>{live.batch}{/if}
        {:else if !seats.empty}
          Kuota &amp; Pelamar saat disimpan — tekan Segarkan untuk angka terkini.
        {:else}
          Belum pernah dicek — tekan Segarkan untuk Kuota &amp; Pelamar.
        {/if}
      </p>
    </CardContent>
  {/if}
</Card>
