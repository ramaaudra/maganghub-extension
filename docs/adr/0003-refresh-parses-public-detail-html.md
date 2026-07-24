# Refresh fetches the public detail-page HTML and parses it

Refreshing a Favorite's Status Lowongan is done by fetching the Lowongan's public detail-page URL (no auth, no credentials) and parsing the server-rendered HTML for Kuota, Batch, and open/closed signals — not by calling a JSON API.

A future engineer will reasonably ask "why not just call the API?" — because there is no public JSON API for vacancy list/detail. The vacancy list is served as Next.js App-Router RSC (server-rendered) markup, not a clean GET endpoint; the only `api.kemnaker.go.id/maganghub/vacancy/v2/vacancies` route is a POST that creates vacancies (organizer-side, requires `batch_id`, `position_name`, `quantity_needed`, etc.). The public filter endpoints (`onboarding/v2/cities`, `vacancy/v2/study-programs`) only populate filter dropdowns.

Trade-off: parsing HTML couples the extension to MagangHub's markup and breaks if they redesign the detail page. The alternative — parsing the `?_rsc=` RSC payload — is even more fragile and undocumented. HTML parsing is the least-fragile option available, the detail page is server-rendered (the data is in the initial response, no JS execution needed), and the fallback when a parse breaks is simply showing the last-known snapshot with a "refresh failed" state, not data loss.
