import { parseDetailHtml, NotALowonganError } from "@/lib/parse";
import type { OffscreenRequest, OffscreenResponse } from "@/lib/refresh";

/**
 * MV3 offscreen document (ADR-0005). The background asks us to fetch a
 * Lowongan's public detail-page URL and parse it. We run with a full browser
 * context (passes Cloudflare), use `DOMParser` to parse, and send credentials:
 * 'omit' so no SiapKerja session/cookies are attached (ADR-0001).
 *
 * This is the only network the extension performs; it hits the public
 * MagangHub detail page only.
 *
 * E2E test seam: Playwright cannot intercept fetches issued from an MV3
 * offscreen document (it isn't tracked as a context page), so live-network
 * refreshes would hit Cloudflare and be flaky. The background therefore passes
 * a staged fixture body via `request.testBody` when one exists (production
 * never sets it); we parse that instead of fetching.
 */

browser.runtime.onMessage.addListener(
  (message: OffscreenRequest, _sender, sendResponse: (r: OffscreenResponse) => void) => {
    if (message?.type !== "fetchAndParse") return false; // not for us
    void handleFetchAndParse(message).then(
      sendResponse,
      (err) =>
        sendResponse({ ok: false, uuid: message.uuid, error: `offscreen crash: ${String(err)}` }),
    );
    return true; // keep the message channel open for the async response
  },
);

async function handleFetchAndParse(
  request: OffscreenRequest,
): Promise<OffscreenResponse> {
  const { uuid, url } = request;

  // E2E test seam — parse a staged body instead of hitting the network.
  if (request.testBody !== undefined) {
    return respondFromText(uuid, request.testStatus ?? 200, request.testBody);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      headers: { accept: "text/html,application/xhtml+xml" },
    });
  } catch (err) {
    return { ok: false, uuid, error: `network: ${String(err)}` };
  }

  if (!res.ok) {
    return { ok: false, uuid, error: `HTTP ${res.status}`, httpStatus: res.status };
  }

  let html: string;
  try {
    html = await res.text();
  } catch (err) {
    return { ok: false, uuid, error: `read body: ${String(err)}` };
  }

  return respondFromText(uuid, 200, html);
}

/** Parse a detail-page body and build the offscreen response. A non-2xx
 *  `status` short-circuits to a failed response (matching the live fetch
 *  path, where !res.ok → error). */
function respondFromText(
  uuid: string,
  status: number,
  html: string,
): OffscreenResponse {
  if (!(status >= 200 && status < 300)) {
    return { ok: false, uuid, error: `HTTP ${status}`, httpStatus: status };
  }
  try {
    const parsed = parseDetailHtml(html);
    return { ok: true, uuid, parsed };
  } catch (err) {
    if (err instanceof NotALowonganError) {
      return { ok: false, uuid, error: "not a Lowongan detail page" };
    }
    return { ok: false, uuid, error: `parse: ${String(err)}` };
  }
}