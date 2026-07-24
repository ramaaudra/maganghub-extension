import {
	resolveDetailUrl,
	runWithConcurrency,
	toLiveStatus,
	type OffscreenRequest,
	type OffscreenResponse,
	type RefreshRequest,
	type RefreshResponse,
} from "@/lib/refresh";
import { getFavorite, listFavorites, setLiveStatus } from "@/lib/storage";

/** Max concurrent refreshes for "refresh all". */
const REFRESH_CONCURRENCY = 3;
/** Small polite delay between refresh starts (ms) — be respectful to MagangHub. */
const REFRESH_STAGGER_MS = 250;

/** Offscreen document reasons ('DOM_PARSER' covers parsing the fetched HTML). */
const OFFSCREEN_URL = "offscreen.html";

/**
 * Minimal view of the MV3 `chrome.offscreen` API. WXT types `browser`
 * (webextension-polyfill) but not the Chrome-specific `chrome.offscreen`, and
 * we don't want to pull in @types/chrome just for this one call. At runtime in
 * the service worker `globalThis.chrome.offscreen` exists; in unit tests
 * (fake-browser) it is absent and this returns undefined, which is fine — the
 * refresh code path only runs in the real SW.
 */
interface ChromeOffscreen {
	hasDocument(): Promise<boolean>;
	createDocument(opts: {
		url: string;
		reasons: string[];
		justification: string;
	}): Promise<void>;
}

function getChromeOffscreen(): ChromeOffscreen | undefined {
	const g = globalThis as unknown as {
		chrome?: { offscreen?: ChromeOffscreen };
	};
	return g.chrome?.offscreen;
}

let ensuringOffscreen: Promise<void> | null = null;

/** Ensure the offscreen document exists, idempotently across concurrent calls. */
async function ensureOffscreen(): Promise<void> {
	const offscreen = getChromeOffscreen();
	if (offscreen?.hasDocument) {
		try {
			if (await offscreen.hasDocument()) return;
		} catch {
			// fall through to createDocument
		}
	}
	if (ensuringOffscreen) return ensuringOffscreen;
	ensuringOffscreen = (async () => {
		await offscreen?.createDocument({
			url: OFFSCREEN_URL,
			reasons: ["DOM_PARSER"],
			justification:
				"Fetch and parse MagangHub Lowongan detail pages to refresh a Favorite's live Status Lowongan (ADR-0005).",
		});
	})();
	try {
		await ensuringOffscreen;
	} finally {
		ensuringOffscreen = null;
	}
}

/** Ask the offscreen document to fetch + parse one detail URL.
 *  Retries briefly because `chrome.offscreen.createDocument` can resolve
 *  before the offscreen's module script has registered its `onMessage`
 *  listener — the first sendMessage then fails with "Receiving end does not
 *  exist", which clears once the script finishes loading. */
async function fetchAndParse(
	uuid: string,
	url: string,
): Promise<OffscreenResponse> {
	const request: OffscreenRequest = {
		type: "fetchAndParse",
		uuid,
		url,
		...(await maybeTestFixture(uuid)),
	};
	const maxAttempts = 10;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = (await browser.runtime.sendMessage(request)) as
				| OffscreenResponse
				| undefined;
			if (response && typeof response.ok === "boolean") return response;
			// No responder yet — the offscreen script hasn't registered. Retry.
		} catch (err) {
			if (attempt === maxAttempts) {
				return {
					ok: false,
					uuid,
					error: `offscreen unreachable: ${String(err)}`,
				};
			}
		}
		await delay(50 * attempt);
	}
	return { ok: false, uuid, error: "offscreen returned no response" };
}

/** E2E test seam: if a fixture is staged under `__testDetailFixtures` for this
 *  UUID, return it so the offscreen parses the staged body instead of
 *  fetching. Production never stages these keys, so this is a no-op in real
 *  use (one cheap storage read per refresh). The offscreen document itself
 *  can't read chrome.storage, so the background (which can) fronts it. */
const TEST_FIXTURES_KEY = "__testDetailFixtures";
interface TestFixture {
	status: number;
	body: string;
}
async function maybeTestFixture(
	uuid: string,
): Promise<{ testBody?: string; testStatus?: number }> {
	const result = (await browser.storage.local.get(TEST_FIXTURES_KEY)) as Record<
		string,
		Record<string, TestFixture> | undefined
	>;
	const fixture = result[TEST_FIXTURES_KEY]?.[uuid];
	if (!fixture) return {};
	return { testBody: fixture.body, testStatus: fixture.status };
}

/** Refresh a single Favorite and persist its liveStatus. */
async function refreshOne(uuid: string, detailUrl: string): Promise<void> {
	await ensureOffscreen();
	const previous = (await getFavorite(uuid))?.liveStatus;
	const response = await fetchAndParse(uuid, resolveDetailUrl(detailUrl));
	const liveStatus = toLiveStatus(response, previous);
	await setLiveStatus(uuid, liveStatus);
}

/** Refresh every Favorite with throttled concurrency; persist each as it lands. */
async function refreshAll(): Promise<void> {
	const favorites = await listFavorites();
	await ensureOffscreen();
	await runWithConcurrency(
		favorites,
		REFRESH_CONCURRENCY,
		async (fav, index) => {
			if (index > 0)
				await delay(REFRESH_STAGGER_MS * (index % REFRESH_CONCURRENCY));
			const previous = (await getFavorite(fav.uuid))?.liveStatus;
			const response = await fetchAndParse(
				fav.uuid,
				resolveDetailUrl(fav.detailUrl),
			);
			await setLiveStatus(fav.uuid, toLiveStatus(response, previous));
		},
	);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export default defineBackground(() => {
	console.log("[maganghub] background loaded", { id: browser.runtime.id });

	browser.runtime.onMessage.addListener(
		(
			message: RefreshRequest,
			_sender,
			sendResponse: (r: RefreshResponse) => void,
		) => {
			if (message?.type === "refresh") {
				refreshOne(message.uuid, message.detailUrl)
					.then(() => sendResponse({ ok: true }))
					.catch((err) => sendResponse({ ok: false, error: String(err) }));
				return true; // async
			}
			if (message?.type === "refreshAll") {
				refreshAll()
					.then(() => sendResponse({ ok: true }))
					.catch((err) => sendResponse({ ok: false, error: String(err) }));
				return true; // async
			}
			return false; // not a refresh message — let another listener handle it
		},
	);
});
