## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles map 1:1 to default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Camofox browser

Use the Camoufox-based automation server (sibling project at `~/LocalDocument/Project/camofox-browser`, port 9377) to explore the live MagangHub DOM and to record/refresh the HTML fixtures the e2e tests run against. It is **not** the automated test runner — e2e runs on fixtures via Playwright + Chromium with the extension loaded. See `docs/agents/camofox-browser.md`.
