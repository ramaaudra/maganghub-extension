# Credential-free, local-first extension

The extension's reason for existing is that third-party MagangHub "helper" sites ask users for their real SiapKerja password, which is dangerous. To be the safe alternative *by construction*, the extension never reads, stores, or transmits the SiapKerja password or the MagangHub login session (cookies). Favorites are stored locally in the browser (`chrome.storage`); there is no backend in MVP, so favorites do not sync across devices.

The real trade-off is feature richness vs. trust: reading the logged-in session could enable badges like "already applied", and a backend could sync favorites across devices — but both recreate the exact attack surface we exist to avoid and would muddy the trust story on day one. Local-first is reversible for sync (an optional end-to-end-encrypted sync can be layered on later without touching credentials), but the never-touch-credentials line is meant to be permanent.
