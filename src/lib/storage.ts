import type { Favorite, StatusLamar, LiveStatus } from "./types";
import { SCHEMA_VERSION, initialLiveStatus } from "./types";
import { migrateFavorite } from "./migrations";
import type { FavoriteV1, FavoriteV2 } from "./migrations";

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

/** Set Status Lamar (manual, self-reported "sudah dilamar" flag) on a stored Favorite. */
export async function setStatusLamar(
	uuid: string,
	statusLamar: StatusLamar,
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
		statusLamar: "not_applied",
		liveStatus: initialLiveStatus(),
		savedAt: new Date().toISOString(),
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
