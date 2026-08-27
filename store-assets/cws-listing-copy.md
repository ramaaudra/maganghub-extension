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
Simpan Favorite, Catatan, dan Status Lamar di MagangHub. Semuanya tersimpan lokal tanpa mengakses kredensial SiapKerja.
```

> Maks. 132 karakter.

---

## 3. Deskripsi

```
SakuMagang membantu kamu menyimpan dan memantau Lowongan di MagangHub. Bintangi Lowongan saat browsing, tambahkan Catatan, atur Status Lamar, dan periksa ulang Status Lowongan dari halaman detail publik.

Fitur utama
• Bintangi Lowongan dari halaman daftar atau detail sebagai Favorite.
• Tulis Catatan tentang alasan menyimpan sebuah Lowongan.
• Atur Status Lamar secara manual: Belum dilamar, Dilamar, Interview, Diterima, atau Ditolak.
• Periksa ulang Kuota, Pelamar, dan Status Lowongan dari halaman detail publik.
• Cari, urutkan, dan kelompokkan Favorite.
• Arsipkan Favorite tanpa menghapus data, lalu pulihkan kapan saja.
• Ekspor dan impor Favorite sebagai cadangan JSON.

Cara menggunakan
1. Buka halaman Lowongan di MagangHub.
2. Klik ikon bintang pada Lowongan yang ingin kamu simpan.
3. Buka popup SakuMagang untuk menulis Catatan, mengatur Status Lamar, atau mengarsipkan Favorite.
4. Untuk melamar, klik "Buka di MagangHub" pada Favorite. Lanjutkan lamaran di situs resmi MagangHub.

Privasi
SakuMagang adalah ekstensi pihak ketiga yang tidak berafiliasi dengan Kemnaker atau MagangHub. SakuMagang tidak membaca, menyimpan, atau mengirim password SiapKerja maupun sesi login MagangHub. Favorite, Catatan, dan Status Lamar hanya tersimpan di perangkatmu dan tidak dikirim ke server SakuMagang.

SakuMagang menyimpan URL Lowongan yang kamu pilih sebagai Favorite dan membaca konten publik halaman MagangHub yang didukung untuk menampilkan Kuota, Pelamar, dan Status Lowongan. Ekstensi ini tidak memerlukan akun dan tidak mengumpulkan data penggunaan untuk analitik atau telemetri.

Kenapa tidak meminta password?
Situs pihak ketiga yang meminta kamu login ke SiapKerja dapat mencatat password yang kamu masukkan. Gunakan hanya alur resmi MagangHub dan SiapKerja untuk login atau melamar.

Status Lamar kamu isi sendiri. Mendeteksi Status Lamar secara otomatis memerlukan akses ke sesi login, sedangkan SakuMagang tidak mengambil akses tersebut.

Permission yang diminta adalah storage, offscreen, dan akses ke halaman MagangHub yang didukung. SakuMagang tidak meminta izin cookies, identity, atau akses ke semua situs.

Sumber kode tersedia dan dapat diverifikasi:
https://github.com/ramaaudra/maganghub-extension
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
| URL Dukungan | `https://github.com/ramaaudra/maganghub-extension/issues` |

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

Catatan: Deskripsi di atas mencantumkan data yang diproses, penafian tidak berafiliasi, dan alasan Status Lamar dibuat manual. Chrome Web Store API v2 belum menyediakan endpoint untuk memperbarui deskripsi, jadi salin copy ini secara manual ke tab Store listing sebelum submission.
