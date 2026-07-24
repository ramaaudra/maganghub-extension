/**
 * Background service worker. Minimal for the tracer bullet — later issues add
 * refresh coordination, the offscreen document lifecycle, and export/import.
 */
export default defineBackground(() => {
  console.log('[maganghub] background loaded', { id: browser.runtime.id });
});