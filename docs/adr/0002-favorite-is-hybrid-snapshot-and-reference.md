# Favorite is a hybrid: snapshot + reference

A Favorite stores both a snapshot of the Lowongan's key fields (title, company, location, deadline, etc.) captured at bookmark time *and* a reference (stable ID + original URL) back to the live listing.

Lowongan on MagangHub disappear fast — positions fill, deadlines pass, listings are taken down. A pure reference (just a URL/ID) becomes a dead link the moment a listing is removed, losing the very info the user saved it for; a pure snapshot can't detect changes or re-open a still-live listing. The hybrid keeps the info when the listing is gone (snapshot) and can refresh/compare when it still exists (reference). Favorites are low-volume (tens to low hundreds), so the extra storage is trivial, and staleness is handled with a "last seen" timestamp plus optional refresh.

A future engineer looking at a Favorite record with both a snapshot and a URL may read it as redundant and try to drop one — that is deliberate, not redundant.
