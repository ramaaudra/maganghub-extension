# Refresh fetches happen in an offscreen document, not the service worker

Refreshing a Favorite's Status Lowongan fetches the Lowongan's public detail-page URL and parses the HTML. These fetches are done from an **MV3 offscreen document**, not the background service worker.

MagangHub sits behind Cloudflare. A service-worker `fetch` is a bare HTTP request without a full browser context, so Cloudflare may return a challenge page instead of the real HTML, causing the parse to fail; the SW's ~30s lifecycle can also kill a long "refresh all". An offscreen document runs with a real browser context (passes Cloudflare), persists for the duration of the refresh, can use `DOMParser` to parse, and does not require a MagangHub tab to be open. The popup triggers refresh → the background ensures the offscreen document exists → the offscreen fetches + parses → writes status to storage → the popup updates.

The rejected alternatives: service-worker fetch (simplest, but Cloudflare/lifecycle risk) and content-script fetch (first-party and passes Cloudflare, but requires a MagangHub tab to be open, which is fragile when the user opens the popup from elsewhere). Offscreen is the MV3-correct way to fetch with a full browser context from a user-initiated action without depending on an open tab.
