# Camofox browser — live DOM context & fixture recording

A Camoufox-based (anti-detect Firefox) automation server, used to **explore the live MagangHub DOM** and to **record/refresh the HTML fixtures** that the extension's e2e tests run against. It is a sibling project, not part of this repo.

## Where it lives & how to start

- Project: `/Users/mbam1/LocalDocument/Project/camofox-browser`
- Start: `cd /Users/mbam1/LocalDocument/Project/camofox-browser && node server.js` (background it: `nohup node server.js > /tmp/camofox-server.log 2>&1 &`)
- Listens on `http://localhost:9377`. Health check: `GET /health`.
- Stop when done: `pkill -f server.js` (and close tabs first — see cleanup).

The server launches the Camoufox Firefox lazily on first tab creation. Deps and the Camoufox binary are already fetched (`node_modules/camoufox-js`, `~/Library/Caches/camoufox/Camoufox.app`).

## HTTP API cheat-sheet (all require `userId` — use e.g. `"impl"`)

```bash
# create a tab at a URL -> { tabId, url }
curl -s -X POST http://localhost:9377/tabs -H 'Content-Type: application/json' \
  -d '{"userId":"impl","sessionKey":"mh","url":"https://maganghub.kemnaker.go.id/magang-nasional/lowongan?keyword="}'

# navigate an existing tab
curl -s -X POST http://localhost:9377/tabs/<tabId>/navigate -H 'Content-Type: application/json' \
  -d '{"userId":"impl","url":"..."}'

# accessibility snapshot with refs (text or json)
curl -s "http://localhost:9377/tabs/<tabId>/snapshot?userId=impl&format=text"

# run JS in the page (expression; supports async/promise) — PRIMARY tool for DOM context & fixture dumps
curl -s -X POST http://localhost:9377/tabs/<tabId>/evaluate -H 'Content-Type: application/json' \
  -d '{"userId":"impl","expression":"JSON.stringify({title:document.title, ...})"}'

# screenshot
curl -s "http://localhost:9377/tabs/<tabId>/screenshot?userId=impl" -o /tmp/mh.png

# interact (ref from snapshot) / type / scroll
curl -s -X POST http://localhost:9377/tabs/<tabId>/click -H 'Content-Type: application/json' -d '{"userId":"impl","ref":"e1"}'

# close tab
curl -s -X DELETE "http://localhost:9377/tabs/<tabId>?userId=impl"
```

For complex JS, write the expression to a file and POST it via `--data-binary` with a JSON body built by `python3 -c "import json;print(json.dumps({'userId':'impl','expression':open('/tmp/probe.js').read()}))"`. The `evaluate` endpoint awaits promises, so async `fetch(...)` probes work.

## When to use it

**1. Get context on the live MagangHub DOM.** Before/during implementation of any ticket that touches the page (selectors, UUID extraction, injection points, SPA behavior, refresh-parser anchors), navigate to the real page and inspect it. Confirmed anchors to build on:

- List cards: `.mh-lowongan-card`, each wrapped in `<a class="group block h-full" href="/magang-nasional/lowongan/<slug>-<uuid>">`.
- Stable id = the UUID in the detail href: `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`.
- Detail page fields: title (`h1`), Penyelenggara, Kuota, Batch ("Batch 1 · 2026"), Tunjangan, "Lamar Sekarang" button. **No calendar deadline** (closes by Kuota + Batch).
- Stack: Next.js App Router (RSC), Tailwind, shadcn-style.

**2. Record / refresh HTML fixtures for e2e.** The automated e2e tests run against served fixture HTML, not the live site (deterministic, no Cloudflare, no data drift). To produce a fixture: navigate to the page, wait for render, then `evaluate` `document.documentElement.outerHTML` and save it into the test fixtures directory (redact any personal data). Record one list fixture and detail fixtures in the states the tests need (open / closed / kuota-full). Re-record when MagangHub markup changes or to capture new states.

## Boundary — what camofox is NOT for

- **NOT the automated e2e test runner.** Automated e2e = Playwright + Chromium with the extension loaded (`--load-extension` / WXT e2e), running against the recorded fixtures. Camofox is Firefox-based; the extension targets Chrome MV3, so camofox is not the test runner.
- **NOT for live-site assertions in CI.** Live MagangHub is flaky (Cloudflare, changing data). Use it ad-hoc for exploration + fixture recording only.
- **Credential-free, always.** Never log into MagangHub from camofox; never import cookies. Only read public pages (the list and detail pages are public without login). This honours ADR-0001.

## Cleanup

Close tabs (`DELETE /tabs/<tabId>?userId=impl`) and stop the server (`pkill -f server.js`) when finished to avoid leaked processes.

## Pointers

- Spec & decisions: issue #1, `CONTEXT.md`, `docs/adr/0001`–`0005`.
- Target URL: `https://maganghub.kemnaker.go.id/magang-nasional/lowongan?keyword=`
