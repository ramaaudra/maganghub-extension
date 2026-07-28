import type {
	FavoriteV1,
	FavoriteV2,
	FavoriteV3,
	FavoriteV4,
} from "./migrations";
import { migrateFavorite } from "./migrations";
import type { Favorite, LiveStatus, StatusLamar } from "./types";
import { initialLiveStatus, SCHEMA_VERSION } from "./types";

/**
 * Local-first storage for Favorites (ADR-0001). Each Favorite is persisted to
 * `chrome.storage.local` under a key derived from its UUID, so the storage is
 * literally "keyed by the Lowongan UUID". No network, no credentials.
 *
 * Uses WXT's `browser` global (webextension-polyfill), which the WXT vitest
 * plugin polyfills in-memory with @webext-core/fake-browser for unit tests.
 */

const KEY_PREFIX = "fav:";
/** Storage key prefix for a Favorite (`fav:<uuid>`). Exported so other modules
 * (e.g. the content script's storage-change listener) can identify Favorite
 * keys without duplicating the prefix. */
export const FAVORITE_KEY_PREFIX = KEY_PREFIX;
const keyFor = (uuid: string) => `${KEY_PREFIX}${uuid}`;

export async function getFavorite(uuid: string): Promise<Favorite | undefined> {
	const result = await browser.storage.local.get(keyFor(uuid));
	const stored = result[keyFor(uuid)] as
		| Favorite
		| FavoriteV1
		| FavoriteV2
		| FavoriteV3
		| FavoriteV4
		| undefined;
	return stored ? migrateFavorite(stored) : undefined;
}

export async function isFavorited(uuid: string): Promise<boolean> {
	return (await getFavorite(uuid)) !== undefined;
}

export async function setFavorite(favorite: Favorite): Promise<void> {
	await browser.storage.local.set({ [keyFor(favorite.uuid)]: favorite });
}

export async function removeFavorite(uuid: string): Promise<void> {
	await browser.storage.local.remove(keyFor(uuid));
}

/** All favorites, newest-first by savedAt. Lazily migrates any pre-current-schema records. */
export async function listFavorites(): Promise<Favorite[]> {
	const all = await browser.storage.local.get(null);
	const favorites: Favorite[] = [];
	for (const [key, value] of Object.entries(all)) {
		if (!key.startsWith(KEY_PREFIX)) continue;
		if (isFavoriteRecord(value)) favorites.push(migrateFavorite(value));
	}
	favorites.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
	return favorites;
}

/** Set the Catatan (free-text note) on a stored Favorite. */
export async function setCatatan(uuid: string, catatan: string): Promise<void> {
	const favorite = await getFavorite(uuid);
	if (!favorite) return;
	await setFavorite({ ...favorite, catatan });
}

/**
 * Set Status Lamar (the manual, self-reported application stage) on a stored
 * Favorite. Pass `undefined` to clear the stage back to "no stage" (the default).
 */
export async function setStatusLamar(
	uuid: string,
	statusLamar: StatusLamar | undefined,
): Promise<void> {
	const favorite = await getFavorite(uuid);
	if (!favorite) return;
	await setFavorite({ ...favorite, statusLamar });
}

/**
 * Write a refreshed `liveStatus` onto a stored Favorite. Only `liveStatus` is
 * touched — the saved snapshot stays immutable (ADR-0002). On failure the
 * caller passes `status: "unknown"` + `lastError`; previous liveStatus fields
 * are preserved by merging, so a failed refresh shows the last-known numbers
 * with a "refresh gagal" badge (no data loss).
 */
export async function setLiveStatus(
	uuid: string,
	liveStatus: LiveStatus,
): Promise<void> {
	const favorite = await getFavorite(uuid);
	if (!favorite) return;
	await setFavorite({ ...favorite, liveStatus });
}

/**
 * Archive a Favorite: soft-hide it from the active list by stamping
 * `archivedAt` with `now` (ADR-0010). The record stays in storage, the star on
 * MagangHub's page stays filled, and the data (snapshot, Catatan, liveStatus)
 * is untouched. Pass an explicit timestamp only for tests; production always
 * stamps "now".
 */
export async function archiveFavorite(
	uuid: string,
	now: string = new Date().toISOString(),
): Promise<void> {
	const favorite = await getFavorite(uuid);
	if (!favorite) return;
	await setFavorite({ ...favorite, archivedAt: now });
}

/**
 * Restore an archived Favorite to the active list: clear `archivedAt` to null
 * and reset `liveStatus.changedAt` so a change observed before archiving does
 * not pop a stale toolbar badge the moment the Favorite returns to the active
 * list (ADR-0010). `previousSample` is kept — the historical context
 * survives, only the unseen-change marker resets.
 */
export async function unarchiveFavorite(uuid: string): Promise<void> {
	const favorite = await getFavorite(uuid);
	if (!favorite) return;
	const liveStatus: LiveStatus =
		favorite.liveStatus.changedAt === undefined ||
		favorite.liveStatus.changedAt === null
			? favorite.liveStatus
			: { ...favorite.liveStatus, changedAt: null };
	await setFavorite({ ...favorite, archivedAt: null, liveStatus });
}

/** Build a Favorite from a bookmark action. */
export function createFavorite(args: {
	uuid: string;
	detailUrl: string;
	savedSnapshot: Favorite["savedSnapshot"];
}): Favorite {
	return {
		schemaVersion: SCHEMA_VERSION,
		uuid: args.uuid,
		detailUrl: args.detailUrl,
		savedSnapshot: args.savedSnapshot,
		catatan: "",
		statusLamar: undefined,
		liveStatus: initialLiveStatus(),
		savedAt: new Date().toISOString(),
		archivedAt: null,
	};
}

function isFavoriteRecord(value: unknown): value is Favorite | FavoriteV1 {
	return (
		typeof value === "object" &&
		value !== null &&
		"schemaVersion" in value &&
		typeof (value as { schemaVersion: unknown }).schemaVersion === "number" &&
		"uuid" in value &&
		"detailUrl" in value &&
		"savedSnapshot" in value &&
		"savedAt" in value
	);
}
