import { HEALTH_KEY } from "./health";
import { FAVORITE_KEY_PREFIX } from "./storage";

/**
 * Storage changes that can change what the popup renders. Popup bookkeeping
 * deliberately stays outside this boundary so opening the popup cannot cause
 * its own refresh loop.
 */
export function shouldRefreshPopupForStorageKey(key: string): boolean {
	return key.startsWith(FAVORITE_KEY_PREFIX) || key === HEALTH_KEY;
}
