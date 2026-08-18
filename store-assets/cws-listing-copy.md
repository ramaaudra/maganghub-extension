# SakuMagang — Copy Listing Chrome Web Store

Semua copy di bawah dalam bahasa Indonesia, siap paste ke Chrome Web Store Developer Dashboard.

---

## 1. Nama

```
SakuMagang
```

> Maks. 30 karakter. Sudah termasuk.

---

## 2. Deskripsi Singkat

```
Favorite, Catatan, dan Status Lamar untuk MagangHub — tersimpan lokal, tanpa kredensial.
```

> Maks. 132 karakter.

---

## 3. Deskripsi

```
SakuMagang adalah ekstensi browser yang menambahkan fitur shortlist dan pantauan pada situs resmi MagangHub (maganghub.kemnaker.go.id) — fitur yang tidak tersedia di platform aslinya.

Bintangi Lowongan favoritmu sambil browsing, tulis Catatan kenapa Lowongan itu penting, lacak tahap lamaran lewat Status Lamar, dan refresh kuota serta jumlah pelamar secara live. Semuanya tersimpan lokal di browser kamu — tidak ada server, tidak ada akun, tidak ada data yang dikirim ke mana pun.

Kenapa SakuMagang aman:
• Tidak pernah membaca, menyimpan, atau mengirim password SiapKerja maupun sesi login MagangHub.
• Tidak ada permission cookies, identity, atau <all_urls>.
• Sumber kode terbuka dan bisa diverifikasi: github.com/ramaaudra/maganghub-extension

Fitur utama:
★ Bintangi Lowongan — simpan dari halaman daftar atau detail sebagai Favorite
📝 Catatan — tulis alasan menyimpan tiap Favorite, tampil di tooltip bintang
📋 Status Lamar — lacak tahap: Belum dilamar → Dilamar → Interview → Diterima / Ditolak
🔄 Status Lowongan — refresh kuota dan jumlah pelamar live dari halaman detail publik
🔍 Cari & urutkan — termasuk berdasarkan Status Lamar dan sisa kuota
📦 Ekspor / impor — backup Favorite sebagai JSON, bisa dipindah antar perangkat
📁 Arsip — sembunyikan Favorite dari daftar aktif tanpa menghapus datanya

SakuMagang bukan produk resmi Kemnaker atau MagangHub. Ekstensi pihak ketiga independen yang dibuat karena banyak situs "bantuan" pihak ketiga meminta password SiapKerja asli — kredensial pemerintah yang seharusnya tidak pernah diberikan ke pihak manapun selain situs resmi.

Status Lamar sengaja dibuat manual. Mendeteksi status lamaran secara otomatis berarti harus membaca sesi login — permukaan serangan yang justru dihindari produk ini.

Semua data tersimpan hanya di browser kamu melalui chrome.storage.local. Tidak ada backend, tidak ada telemetry, tidak ada analytics. Kamu bisa memverifikasi ini dari prompt permission saat instalasi.
```

---

## 4. Kategori

```
Productivity
```

---

## 5. Bahasa

```
Indonesian
```

---

## 6. URL untuk CWS Dashboard

| Field | URL |
|---|---|
| URL Halaman Beranda | `https://ramaaudra.github.io/sakumagang-site/` |
| URL Kebijakan Privasi | `https://ramaaudra.github.io/sakumagang-site/privacy/` |
| URL Dukungan | `https://github.com/ramaaudra/sakumagang-site/issues` |

---

## 7. Data yang Dikumpulkan (Centang di Dashboard)

- ✅ **Histori web** — ekstensi menyimpan URL detail Lowongan yang dipilih pengguna dan mengakses halaman MagangHub terkait.
- ✅ **Konten situs** — ekstensi membaca judul, Penyelenggara, lokasi Lowongan, Kuota, Pelamar, Batch, dan status dari halaman MagangHub.

Jangan centang yang lain.

---

## 8. Permission yang Diminta (sudah di manifest)

| Permission | Kegunaan |
|---|---|
| `storage` | Menyimpan Favorite di `chrome.storage.local` |
| `offscreen` | Mem-parse HTML detail publik untuk refresh Status Lowongan |
| `https://maganghub.kemnaker.go.id/*` | Membaca halaman daftar/detail publik |

**Tidak diminta:** `cookies`, `identity`, `<all_urls>`.

---

Catatan: Copy di atas sudah memuat semua elemen yang diminta CWS — deskripsi jujur tentang data yang diproses, penafian tidak berafiliasi, dan penjelasan mengapa fitur tertentu manual. Tinggal paste langsung ke dashboard.
