import type { Favorite } from './types';
import { SCHEMA_VERSION } from './types';

/**
 * Local-first storage for Favorites (ADR-0001). Each Favorite is persisted to
 * `chrome.storage.local` under a key derived from its UUID, so the storage is
 * literally "keyed by the Lowongan UUID". No network, no credentials.
 *
 * Uses WXT's `browser` global (webextension-polyfill), which the WXT vitest
 * plugin polyfills in-memory with @webext-core/fake-browser for unit tests.
 */

const KEY_PREFIX = 'fav:';
const keyFor = (uuid: string) => `${KEY_PREFIX}${uuid}`;

export async function getFavorite(uuid: string): Promise<Favorite | undefined> {
  const result = await browser.storage.local.get(keyFor(uuid));
  return result[keyFor(uuid)] as Favorite | undefined;
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

/** All favorites, newest-first by savedAt. */
export async function listFavorites(): Promise<Favorite[]> {
  const all = await browser.storage.local.get(null);
  const favorites: Favorite[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(KEY_PREFIX)) continue;
    if (isFavoriteRecord(value)) favorites.push(value);
  }
  favorites.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  return favorites;
}

/** Build a Favorite from a bookmark action. */
export function createFavorite(args: {
  uuid: string;
  detailUrl: string;
  savedSnapshot: Favorite['savedSnapshot'];
}): Favorite {
  return {
    schemaVersion: SCHEMA_VERSION,
    uuid: args.uuid,
    detailUrl: args.detailUrl,
    savedSnapshot: args.savedSnapshot,
    savedAt: new Date().toISOString(),
  };
}

function isFavoriteRecord(value: unknown): value is Favorite {
  return (
    typeof value === 'object' &&
    value !== null &&
    'uuid' in value &&
    'detailUrl' in value &&
    'savedSnapshot' in value &&
    'savedAt' in value
  );
}