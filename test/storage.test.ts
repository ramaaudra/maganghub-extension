import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  createFavorite,
  getFavorite,
  isFavorited,
  listFavorites,
  removeFavorite,
  setFavorite,
} from '@/lib/storage';
import { SCHEMA_VERSION } from '@/lib/types';
import type { Favorite } from '@/lib/types';

function makeFavorite(uuid: string, savedAt: string, title: string): Favorite {
  return {
    schemaVersion: SCHEMA_VERSION,
    uuid,
    detailUrl: `/magang-nasional/lowongan/${title.toLowerCase().replace(/\s+/g, '-')}-${uuid}`,
    savedSnapshot: {
      title,
      organizer: 'PT Contoh',
      location: 'Jakarta',
      capturedAt: savedAt,
    },
    savedAt,
  };
}

describe('favorites storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('round-trips a favorite keyed by UUID', async () => {
    const fav = makeFavorite('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '2026-01-01T00:00:00Z', 'Magang A');
    await setFavorite(fav);
    expect(await getFavorite(fav.uuid)).toEqual(fav);
    expect(await isFavorited(fav.uuid)).toBe(true);
  });

  it('reports not-favorited for an unknown UUID', async () => {
    expect(await isFavorited('11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(await getFavorite('11111111-1111-4111-8111-111111111111')).toBeUndefined();
  });

  it('removes a favorite', async () => {
    const fav = makeFavorite('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '2026-01-02T00:00:00Z', 'Magang B');
    await setFavorite(fav);
    await removeFavorite(fav.uuid);
    expect(await isFavorited(fav.uuid)).toBe(false);
  });

  it('lists favorites newest-first by savedAt', async () => {
    await setFavorite(makeFavorite('11111111-1111-4111-8111-111111111111', '2026-01-01T00:00:00Z', 'Old'));
    await setFavorite(makeFavorite('22222222-2222-4222-8222-222222222222', '2026-01-03T00:00:00Z', 'New'));
    await setFavorite(makeFavorite('33333333-3333-4333-8333-333333333333', '2026-01-02T00:00:00Z', 'Mid'));
    const list = await listFavorites();
    expect(list.map((f) => f.uuid)).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('createFavorite stamps the current schema version and a savedAt timestamp', () => {
    const fav = createFavorite({
      uuid: '44444444-4444-4444-8444-444444444444',
      detailUrl: '/magang-nasional/lowongan/x-44444444-4444-4444-8444-444444444444',
      savedSnapshot: { title: 'T', organizer: 'O', location: 'L', capturedAt: '2026-01-01T00:00:00Z' },
    });
    expect(fav.schemaVersion).toBe(SCHEMA_VERSION);
    expect(fav.uuid).toBe('44444444-4444-4444-8444-444444444444');
    expect(typeof fav.savedAt).toBe('string');
  });
});