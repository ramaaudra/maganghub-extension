import { UUID_REGEX, type LowonganSnapshot } from './types';
import { FIELD_SELECTORS } from './constants';

/**
 * Pure extraction helpers. These turn MagangHub DOM into plain data so they can
 * be unit-tested against fixture fragments without a browser.
 */

/** Pull the Lowongan UUID out of a detail href, or null if none. */
export function extractUuidFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const match = href.match(UUID_REGEX);
  return match ? match[0] : null;
}

/**
 * The detail URL to store on the Favorite. MagangHub cards link via a relative
 * path (`/magang-nasional/lowongan/<slug>-<uuid>`); we store that path as-is so
 * the "open official detail" action (later issue) navigates within MagangHub.
 */
export function extractDetailUrl(anchor: HTMLAnchorElement): string {
  return anchor.getAttribute('href') ?? anchor.href;
}

function queryFirst(root: HTMLElement, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function textBySelector(root: HTMLElement, selectors: readonly string[]): string {
  return queryFirst(root, selectors)?.textContent?.trim() ?? '';
}

/**
 * Capture an immutable snapshot of a card's visible fields. Missing fields come
 * back as empty strings (never throw) so a partially-parsed card still stars.
 */
export function extractSnapshot(card: HTMLElement): LowonganSnapshot {
  const logo = queryFirst(card, FIELD_SELECTORS.logo) as HTMLImageElement | null;
  const logoUrl = logo?.getAttribute('src') ?? undefined;
  return {
    title: textBySelector(card, FIELD_SELECTORS.title),
    organizer: textBySelector(card, FIELD_SELECTORS.organizer),
    location: textBySelector(card, FIELD_SELECTORS.location),
    kuota: textBySelector(card, FIELD_SELECTORS.kuota) || undefined,
    pelamar: textBySelector(card, FIELD_SELECTORS.pelamar) || undefined,
    logoUrl,
    capturedAt: new Date().toISOString(),
  };
}