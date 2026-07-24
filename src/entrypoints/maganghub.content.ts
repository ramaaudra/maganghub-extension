import {
  CARD_SELECTOR,
  CARD_ANCHOR_SELECTOR,
  STAR_INJECTED_ATTR,
  STAR_HOST_CLASS,
} from '@/lib/constants';
import { extractUuidFromHref, extractDetailUrl, extractSnapshot } from '@/lib/extract';
import { createFavorite, getFavorite, isFavorited, removeFavorite, setFavorite } from '@/lib/storage';

/**
 * Content script for MagangHub Lowongan pages.
 *
 * Injects a star toggle into each `.mh-lowongan-card` as plain DOM inside a
 * CLOSED Shadow DOM (ADR-0004: no framework runtime shipped to the page; styles
 * isolated from MagangHub's Tailwind). Clicking the star toggles a Favorite
 * persisted to chrome.storage.local keyed by the Lowongan UUID, without
 * navigating to the detail page (the card is wrapped in an `<a>`).
 */
export default defineContentScript({
  matches: ['https://maganghub.kemnaker.go.id/magang-nasional/lowongan*'],
  main() {
    injectStars();
  },
});

interface StarState {
  /** True once the user has clicked this star; gates the initial reflect. */
  interacted: boolean;
}

/** Inject a star into every card on the page. Idempotent per card. */
function injectStars(): void {
  const cards = document.querySelectorAll<HTMLElement>(CARD_SELECTOR);
  cards.forEach((card) => injectStarIntoCard(card));
}

function injectStarIntoCard(card: HTMLElement): void {
  if (card.hasAttribute(STAR_INJECTED_ATTR)) return;

  const anchor =
    card.closest<HTMLAnchorElement>('a[href]') ??
    card.querySelector<HTMLAnchorElement>(CARD_ANCHOR_SELECTOR);
  const href = anchor?.getAttribute('href') ?? null;
  const uuid = extractUuidFromHref(href);
  if (!uuid || !anchor) return; // no stable id → no star (AC #15 lands in a later issue)

  card.setAttribute(STAR_INJECTED_ATTR, uuid);

  const host = document.createElement('div');
  host.className = STAR_HOST_CLASS;
  host.setAttribute('data-filled', 'false');
  host.style.setProperty('position', 'absolute');
  host.style.setProperty('top', '8px');
  host.style.setProperty('right', '8px');
  host.style.setProperty('z-index', '5');
  card.style.setProperty('position', card.style.position || 'relative');
  const shadow = host.attachShadow({ mode: 'closed' });
  const button = buildStarButton(shadow);
  card.append(host);

  // Reflect persisted state into the star (state read from storage on inject).
  // `starState` gates the initial reflect so a fast click isn't clobbered when
  // the async read resolves (see reflectState / attachToggle).
  const starState: StarState = { interacted: false };
  void reflectState(uuid, host, button, starState);
  attachToggle(card, uuid, anchor, host, button, starState);
}

function buildStarButton(shadow: ShadowRoot): HTMLButtonElement {
  const style = document.createElement('style');
  style.textContent = STAR_CSS;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mh-star';
  button.setAttribute('aria-label', 'Tandai sebagai favorit');
  button.setAttribute('aria-pressed', 'false');
  button.textContent = '★';
  shadow.append(style, button);
  return button;
}

async function reflectState(
  uuid: string,
  host: HTMLElement,
  button: HTMLButtonElement,
  state: StarState,
): Promise<void> {
  const fav = await getFavorite(uuid);
  // Don't clobber a click that landed before the initial read resolved.
  if (state.interacted) return;
  setFilled(host, button, Boolean(fav));
}

/**
 * Mirror the star state onto the light-DOM host (data-filled) so it is
 * observable without piercing the closed Shadow DOM, and update the shadow
 * button's visual + aria-pressed. aria-pressed lives only on the interactive
 * button — the host is a non-interactive div where AT would ignore it.
 */
function setFilled(host: HTMLElement, button: HTMLButtonElement, filled: boolean): void {
  host.setAttribute('data-filled', String(filled));
  button.classList.toggle('is-filled', filled);
  button.setAttribute('aria-pressed', String(filled));
  button.setAttribute('aria-label', filled ? 'Hapus dari favorit' : 'Tandai sebagai favorit');
}

function attachToggle(
  card: HTMLElement,
  uuid: string,
  anchor: HTMLAnchorElement,
  host: HTMLElement,
  button: HTMLButtonElement,
  state: StarState,
): void {
  button.addEventListener('click', async (event) => {
    // The card sits inside an <a>; don't navigate to the detail page on star click.
    event.stopPropagation();
    event.preventDefault();
    state.interacted = true;
    const currentlyFavorited = await isFavorited(uuid);
    if (currentlyFavorited) {
      await removeFavorite(uuid);
      setFilled(host, button, false);
    } else {
      const favorite = createFavorite({
        uuid,
        detailUrl: extractDetailUrl(anchor),
        savedSnapshot: extractSnapshot(card),
      });
      // re-read in case of a race, then persist only if still not favorited
      if (!(await isFavorited(uuid))) {
        await setFavorite(favorite);
        setFilled(host, button, true);
      }
    }
  });
}

const STAR_CSS = `
  :host { all: initial; }
  .mh-star {
    all: initial;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 9999px;
    border: 1px solid rgba(0,0,0,0.12);
    background: rgba(255,255,255,0.9);
    color: #cbd5e1;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(4px);
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    transition: transform 80ms ease, color 80ms ease, background 80ms ease;
  }
  .mh-star:hover { transform: scale(1.08); color: #f59e0b; }
  .mh-star.is-filled { color: #f59e0b; background: rgba(255,255,255,1); }
  .mh-star.is-filled:hover { color: #d97706; }
`;