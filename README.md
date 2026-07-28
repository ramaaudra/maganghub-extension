<div align="center">

<img src="./src/public/icon/128.png" alt="SakuMagang" height="96" />

# SakuMagang

**Favorite lokal, Catatan, dan Status Lamar untuk [MagangHub](https://maganghub.kemnaker.go.id) — tanpa pernah menyentuh kredensial SiapKerja.**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Svelte](https://img.shields.io/badge/Svelte_5-FF3E00?style=flat-square&logo=svelte&logoColor=white)](https://svelte.dev)
[![WXT](https://img.shields.io/badge/WXT-MV3-0ea5e9?style=flat-square)](https://wxt.dev)
[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[Fitur](#fitur) · [Instalasi](#instalasi) · [Pengembangan](#pengembangan) · [Keamanan](#mengapa-ini-aman) · [Arsitektur](#arsitektur) · [Dokumentasi](#dokumentasi)

</div>

> [!IMPORTANT]
> **Tidak resmi, tidak dipublikasikan di Web Store.** SakuMagang adalah proyek
> pihak ketiga independen. **Tidak** berafiliasi, didukung, atau dibuat oleh
> **Kemnaker** maupun program MagangHub. **Tidak ada listing Chrome Web Store** —
> satu-satunya cara pasang adalah sideload. Nama sengaja tidak diawali
> "MagangHub …" (bisa terbaca seperti produk Kemnaker; lihat ADR-0009).

Ekstensi browser yang menambahkan fitur shortlist dan pantauan yang tidak
ada di MagangHub. Bintang Lowongan sambil browsing, tulis Catatan kenapa
Lowongan itu disimpan, lacak Status Lamar secara manual, dan refresh Kuota/Pelamar
secara live — semuanya local-first, tanpa kredensial.

Proyek ini ada karena muncul situs "bantuan" pihak ketiga yang meminta password
SiapKerja asli. Situs itu menyerahkan kredensial pemerintah ke server tidak resmi.
Ekstensi ini adalah alternatif aman **by construction**, bukan sekadar janji.

## Fitur

- **Bintang Lowongan** dari halaman daftar atau detail — disimpan lokal sebagai Favorite
- **Catatan** — catatan teks bebas per Favorite (alasan menyimpan); juga tampil di tooltip bintang
- **Status Lamar** — pelacak tahap manual: Belum dilamar → Dilamar → Interview → Diterima / Ditolak  
  Selalu diisi pengguna; ekstensi tidak pernah mendeteksi otomatis status lamaran. Bisa diedit lewat kartu tahap di halaman detail dan chip di kartu daftar
- **Status Lowongan** — refresh Kuota/Pelamar live dari halaman detail publik, satu Favorite atau semua (dibatasi throttle, lewat offscreen document). Perubahan ditandai badge di popup
- **Warna urgensi** pada kartu daftar berdasarkan sisa kursi / tekanan Kuota
- **Daftar Favorite di popup** — cari, urutkan (termasuk Status Lamar lalu sisa kursi), kelompokkan per Penyelenggara (bisa dilipat)
- **Ekspor / impor** Favorite sebagai JSON, dengan migrasi skema
- **Indikator kesehatan injeksi** — saat markup MagangHub berubah dan injeksi gagal, popup memberi tahu, bukan gagal diam-diam

## Instalasi

Tidak ada build Web Store. Sideload lewat **rilis siap pakai** atau **build dari sumber**.

### Opsi A — Rilis siap pakai (disarankan)

1. Buka [GitHub Release](https://github.com/ramaaudra/maganghub-extension/releases/latest) terbaru
2. Unduh `sakumagang-<version>-chrome.zip` (atau aset zip Chrome yang terlampir)
3. Ekstrak ke folder permanen (Chrome memuat dari folder itu; jangan dihapus setelah pasang)
4. Buka `chrome://extensions`
5. Aktifkan **Developer mode** (pojok kanan atas)
6. Klik **Load unpacked** dan pilih **folder hasil ekstrak** (yang berisi `manifest.json`)
7. Kunjungi [`https://maganghub.kemnaker.go.id/magang-nasional/lowongan`](https://maganghub.kemnaker.go.id/magang-nasional/lowongan) lalu bintang Lowongan, atau buka popup untuk mengelola Favorite

Untuk update: unduh zip yang lebih baru, ganti isi folder ekstrak, lalu klik **Reload** pada kartu ekstensi.

### Opsi B — Build dari sumber

#### Prasyarat

- [Node.js](https://nodejs.org) LTS (20+)
- Browser berbasis Chromium (Chrome sebagai target utama)

#### Langkah

```sh
npm install
npm run build          # output unpacked → .output/chrome-mv3
# zip opsional:
npm run zip            # → .output/maganghub-extension-<version>-chrome.zip
```

1. Buka `chrome://extensions`
2. Aktifkan **Developer mode** (pojok kanan atas)
3. Klik **Load unpacked** dan pilih `.output/chrome-mv3`
4. Buka halaman Lowongan MagangHub lalu bintang satu Lowongan, atau buka popup

Untuk update: tarik sumber terbaru, jalankan ulang `npm run build`, lalu **Reload** kartu ekstensi.

> [!NOTE]
> Target build Firefox tersedia (`npm run build:firefox` / `npm run zip:firefox`) tetapi **bukan** kanal rilis yang dikonfirmasi.

## Pengembangan

```sh
npm install
npm run dev          # WXT dev — membuka Chrome dengan ekstensi termuat, hot-reload
npm run typecheck    # tsc + svelte-check
npm run test:unit    # vitest
npm run test:e2e     # wxt build && playwright (fixture HTML, bukan MagangHub live)
npm run lint         # biome lint
npm run format       # biome format
```

| Permukaan | Stack |
|---|---|
| Popup | Svelte 5 + Tailwind + shadcn-svelte |
| Content script | DOM biasa di dalam closed Shadow DOM (tanpa runtime framework di MagangHub) |
| Background / refresh | Service worker MV3 + offscreen document |

E2E dijalankan terhadap fixture HTML MagangHub yang direkam di `e2e/`, bukan situs live.

## Mengapa ini aman

SakuMagang tidak pernah membaca, menyimpan, atau mengirim password SiapKerja
maupun sesi login MagangHub. Tidak ada akun, tidak ada server, tidak ada telemetry.

Ini bisa diverifikasi dari prompt permission saat instalasi:

| Permission | Kegunaan |
|---|---|
| `storage` | Menyimpan Favorite di `chrome.storage.local` |
| `offscreen` | Mem-parse HTML detail publik untuk refresh Status Lowongan |
| `https://maganghub.kemnaker.go.id/*` | Membaca halaman daftar/detail publik yang memang kamu buka |

**Yang sengaja tidak diminta:** `cookies`, `identity`, `<all_urls>`, backend, analytics.

Helper pencuri kredensial tidak bisa jujur meniru postur ini. Mendeteksi otomatis
"sudah dilamar" berarti harus membaca sesi login — permukaan serangan yang justru
dihindari produk ini — itulah kenapa **Status Lamar sengaja manual**.
Dasar keputusan lengkap: [`docs/adr/0001`](docs/adr/).

## Arsitektur

Tiga permukaan:

| Permukaan | Peran |
|---|---|
| **Halaman daftar** (`/magang-nasional/lowongan`) | Toggle bintang di setiap kartu Lowongan; injeksi ulang saat DOM SPA berubah |
| **Halaman detail** (`/magang-nasional/lowongan/<slug>-<uuid>`) | Toggle Favorite di samping kontrol "Bagikan" MagangHub |
| **Popup** (lebar tetap 360px) | UI Favorite milik sendiri: daftar, Catatan, Status Lamar, refresh, cari/urut, ekspor/impor |

```
src/
├── entrypoints/
│   ├── background.ts           # service worker, messaging, lifecycle offscreen
│   ├── maganghub.content.ts    # injeksi list + detail (closed Shadow DOM)
│   └── popup/                  # aplikasi popup Svelte
├── lib/                        # storage favorite, refresh, parse, migrasi skema
├── offscreen/                  # fetch tanpa kredensial + DOMParser untuk refresh
└── public/icon/                # monogram toolbar (Field Blue "S")
```

Keputusan utama ada di `docs/adr/`:

- **0001** — tidak pernah menyentuh kredensial SiapKerja
- **0002** — snapshot Favorite imutabel + liveStatus yang bisa berubah
- **0004** — closed Shadow DOM untuk UI yang diinjeksi
- **0005** — offscreen document untuk refresh HTML publik
- **0009** — nama produk adalah SakuMagang

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [`CONTEXT.md`](CONTEXT.md) | Glosarium domain (Lowongan, Favorite, Status Lamar, …) |
| [`PRODUCT.md`](PRODUCT.md) | Postur produk, prinsip, batasan |
| [`DESIGN.md`](DESIGN.md) | Sistem visual popup |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records |
| [`AGENTS.md`](AGENTS.md) | Kesepakatan kerja agent/kontributor |

Sumber: [github.com/ramaaudra/maganghub-extension](https://github.com/ramaaudra/maganghub-extension)

## FAQ

**Apakah ini men-login-kan saya ke MagangHub?**  
Tidak. Sesi SiapKerja tidak pernah disentuh. Bintang dan refresh tetap jalan meski kamu belum login.

**Apakah Favorite tersinkron antar perangkat?**  
Belum. Semua local-first di `chrome.storage.local`. Jalur cadangan: ekspor/impor. Sinkron antar perangkat butuh backend; garis "tidak menyentuh kredensial" tetap permanen.

**Apa yang terjadi jika MagangHub mengubah markup-nya?**  
Injeksi di halaman menurun diam-diam. Popup menampilkan peringatan kesehatan ("extension mungkin butuh update") alih-alih gagal tanpa kabar selamanya.

**Bisakah Status Lamar update otomatis saat saya melamar?**  
Tidak — by design. Mendeteksi status lamaran membutuhkan pembacaan sesi login. Atur tahap sendiri; kontrolnya dibuat cepat dan jelas.
