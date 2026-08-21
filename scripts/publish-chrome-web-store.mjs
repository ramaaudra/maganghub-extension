import { access, readFile } from "node:fs/promises";

const API_BASE_URL = "https://chromewebstore.googleapis.com";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_STATES_IN_PROGRESS = new Set([
	"IN_PROGRESS",
	"UPLOAD_IN_PROGRESS",
]);
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 24;

function requireEnv(name) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}

function requireIdentifier(name) {
	const value = requireEnv(name);
	if (!/^[A-Za-z0-9_-]+$/.test(value)) {
		throw new Error(`${name} contains unsupported characters`);
	}
	return value;
}

async function parseResponse(response) {
	const rawBody = await response.text();
	if (!rawBody) return {};

	try {
		return JSON.parse(rawBody);
	} catch {
		return { rawBody };
	}
}

function responseError(response, payload) {
	const message =
		payload?.error?.message ??
		payload?.error_description ??
		payload?.rawBody ??
		response.statusText;
	return new Error(`Chrome Web Store API ${response.status}: ${message}`);
}

async function requestJson(url, options) {
	const response = await fetch(url, options);
	const payload = await parseResponse(response);
	if (!response.ok) throw responseError(response, payload);
	return payload;
}

async function getAccessToken() {
	const payload = await requestJson(OAUTH_TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: requireEnv("CHROME_CLIENT_ID"),
			client_secret: requireEnv("CHROME_CLIENT_SECRET"),
			grant_type: "refresh_token",
			refresh_token: requireEnv("CHROME_REFRESH_TOKEN"),
		}),
	});

	if (
		typeof payload.access_token !== "string" ||
		payload.access_token.length === 0
	) {
		throw new Error("OAuth response did not contain an access token");
	}
	return payload.access_token;
}

function apiHeaders(accessToken, contentType) {
	return {
		Authorization: `Bearer ${accessToken}`,
		...(contentType ? { "content-type": contentType } : {}),
	};
}

function itemName(publisherId, extensionId) {
	return `publishers/${publisherId}/items/${extensionId}`;
}

async function uploadPackage(accessToken, itemPath, zipPath) {
	const zip = await readFile(zipPath);
	const response = await requestJson(
		`${API_BASE_URL}/upload/v2/${itemPath}:upload`,
		{
			method: "POST",
			headers: {
				...apiHeaders(accessToken, "application/zip"),
				"content-length": String(zip.byteLength),
			},
			body: zip,
		},
	);

	console.log(
		`Uploaded ${zipPath} (state: ${response.uploadState ?? "unknown"})`,
	);
	return response;
}

async function waitForUpload(accessToken, itemPath, uploadResponse) {
	let state = uploadResponse.uploadState;
	if (state === "SUCCEEDED") return;
	if (!UPLOAD_STATES_IN_PROGRESS.has(state)) {
		throw new Error(`Unexpected upload state: ${state ?? "missing"}`);
	}

	for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		const status = await requestJson(
			`${API_BASE_URL}/v2/${itemPath}:fetchStatus`,
			{ headers: apiHeaders(accessToken) },
		);
		state = status.lastAsyncUploadState;
		console.log(
			`Upload status ${attempt}/${MAX_POLL_ATTEMPTS}: ${state ?? "unknown"}`,
		);

		if (state === "SUCCEEDED") return;
		if (state === "FAILED" || state === "NOT_FOUND") {
			throw new Error(`Chrome Web Store upload failed with state: ${state}`);
		}
		if (!UPLOAD_STATES_IN_PROGRESS.has(state)) {
			throw new Error(`Unexpected upload status: ${state ?? "missing"}`);
		}
	}

	throw new Error(
		"Timed out while waiting for Chrome Web Store to process the upload",
	);
}

async function submitForReview(accessToken, itemPath) {
	const response = await requestJson(`${API_BASE_URL}/v2/${itemPath}:publish`, {
		method: "POST",
		headers: apiHeaders(accessToken, "application/json"),
		body: JSON.stringify({
			publishType: "DEFAULT_PUBLISH",
			blockOnWarnings: true,
		}),
	});

	const warnings = response.warningInfo?.warnings ?? [];
	for (const warning of warnings) {
		console.warn(
			`Chrome Web Store warning: ${warning.description ?? warning.reason}`,
		);
	}
	console.log(
		`Submitted Chrome Web Store item for review (state: ${response.state ?? "unknown"})`,
	);
}

async function main() {
	const zipPath = process.argv[2];
	if (!zipPath) {
		throw new Error(
			"Usage: node scripts/publish-chrome-web-store.mjs <chrome-zip>",
		);
	}
	await access(zipPath);

	const publisherId = requireIdentifier("CHROME_PUBLISHER_ID");
	const extensionId = requireIdentifier("CHROME_EXTENSION_ID");
	const itemPath = itemName(publisherId, extensionId);
	const accessToken = await getAccessToken();
	const uploadResponse = await uploadPackage(accessToken, itemPath, zipPath);
	await waitForUpload(accessToken, itemPath, uploadResponse);
	await submitForReview(accessToken, itemPath);
}

main().catch((error) => {
	console.error(`Chrome Web Store publish failed: ${error.message}`);
	process.exitCode = 1;
});
