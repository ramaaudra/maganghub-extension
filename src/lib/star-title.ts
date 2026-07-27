/**
 * Compose the native `title` tooltip for a favorite star (issue #18 / A3).
 *
 * When the Favorite carries a Catatan, surface it next to the action label so
 * hovering a filled star answers "why did I save this?" without opening the
 * popup. Empty/missing Catatan → bare label (or none, if the caller skips
 * writing `title` entirely).
 *
 * Formula is deliberate (D11): `catatan ? \`${label} — ${catatan}\` : label`.
 * Truthiness, not trim — a whitespace-only note is still a note the user typed.
 */
export function composeStarTitle(
	label: string,
	catatan: string | undefined,
): string {
	return catatan ? `${label} — ${catatan}` : label;
}
