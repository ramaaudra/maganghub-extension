# Chrome Web Store Listing — SakuMagang

> Last Updated: 2026-09-24

Dokumen ini adalah sumber kebenaran untuk listing, disclosure, dan alur rilis
SakuMagang ke Chrome Web Store. Isi yang masih bertanda `TODO` wajib diselesaikan
sebelum submission pertama.

## Store Listing

**Extension Name**

`SakuMagang`

**Short Description**

`Simpan Favorite, Catatan, dan Status Lamar di MagangHub. Semuanya tersimpan lokal tanpa mengakses kredensial SiapKerja.`

**Detailed Description**

```text
SakuMagang membantu kamu menyimpan dan memantau Lowongan di MagangHub. Bintangi Lowongan saat browsing, tambahkan Catatan, atur Status Lamar, dan periksa ulang Status Lowongan dari halaman detail publik.

Fitur utama
• Bintangi Lowongan dari halaman daftar atau detail sebagai Favorite.
• Tulis Catatan tentang alasan menyimpan sebuah Lowongan.
• Atur Status Lamar secara manual: Belum dilamar, Dilamar, Interview, Diterima, atau Ditolak.
• Periksa ulang Kuota, Pelamar, dan Status Kuota dari halaman detail publik. Kuota penuh tetap bisa didaftarkan selama jendela pendaftaran Kemnaker terbuka.
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

Kenapa SakuMagang tidak meminta password?
Situs pihak ketiga yang meminta kamu login ke SiapKerja dapat mencatat password yang kamu masukkan. Gunakan hanya alur resmi MagangHub dan SiapKerja untuk login atau melamar.

Status Lamar kamu isi sendiri. Mendeteksi Status Lamar secara otomatis memerlukan akses ke sesi login, sedangkan SakuMagang tidak mengambil akses tersebut.

Permission yang diminta adalah storage, offscreen, dan akses ke halaman MagangHub yang didukung. SakuMagang tidak meminta izin cookies, identity, atau akses ke semua situs.

Sumber kode tersedia dan dapat diverifikasi:
https://github.com/ramaaudra/maganghub-extension

SUPPORT
Laporkan masalah atau kirim saran melalui GitHub Issues: https://github.com/ramaaudra/maganghub-extension/issues
```

> Catatan otomasi: `scripts/publish-chrome-web-store.mjs` hanya mengunggah ZIP dan mengirim item untuk review. Chrome Web Store API v2 belum menyediakan endpoint untuk memperbarui metadata listing seperti deskripsi. `CHROMEWEBSTORE.md` menjadi sumber kebenaran, sedangkan `store-assets/cws-listing-copy.md` adalah salinan siap tempel ke tab Store listing di Developer Dashboard.

**Category**

`Productivity`

**Single Purpose**

`Menyimpan dan memantau Lowongan MagangHub sebagai Favorite lokal.`

**Primary Language**

`Indonesian`

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|---|---:|---|---|
| Store Icon | 128×128 PNG | ✅ Ready | `src/public/icon/128.png` |
| Screenshot 1 | 1280×800 atau 640×400 | 🟡 Needs update | Capture popup Aktif dengan Favorite nyata |
| Screenshot 2 | 1280×800 atau 640×400 | 🟡 Needs update | Capture popup Arsip dan alur pemulihan |
| Screenshot 3 | 1280×800 atau 640×400 | ⬜ Not created | Capture bintang pada halaman Lowongan |
| Small Promo Tile | 440×280 | ⬜ Not created | `store-assets/sakumagang-promo.html` masih berupa sumber HTML |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | — |

Screenshot harus menggambarkan UI versi yang akan disubmit. Jangan membuat
angka, review, install count, atau status Lowongan yang tidak berasal dari
produk nyata.

## Permissions Justification

| Permission | Type | Justification |
|---|---|---|
| `storage` | permissions | Menyimpan Favorite, Catatan, Status Lamar, status Arsip, dan sinyal kesehatan injeksi secara lokal agar data tetap tersedia saat popup dibuka kembali. |
| `offscreen` | permissions | Memproses HTML halaman detail publik ketika pengguna meminta refresh Kuota, Pelamar, atau Status Lowongan. |
| `https://maganghub.kemnaker.go.id/*` | host_permissions | Menampilkan kontrol bintang pada halaman daftar/detail MagangHub dan membaca data publik yang dibutuhkan untuk menyimpan atau menyegarkan Favorite. |

## Privacy & Data Use

### Data Collection

**Apakah ekstensi menangani data pengguna?** Ya, tetapi hanya secara lokal di
perangkat pengguna. Tidak ada data yang dikirim ke server SakuMagang atau pihak
ketiga.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|---|---|---|---|---|
| Web history | Yes | No | Menyimpan URL Lowongan yang sengaja dipilih pengguna sebagai Favorite dan membuka kembali halaman tersebut. | No |
| Website content | Yes | No | Membaca judul, Penyelenggara, lokasi, Batch, Kuota, Pelamar, dan status dari halaman publik MagangHub untuk ditampilkan pada Favorite. | No |
| Authentication info | No | No | Ekstensi tidak membaca password, cookie, atau sesi login SiapKerja. | No |
| User activity | No | No | Status Lamar dan Catatan adalah data yang pengguna tulis sendiri dan tetap tersimpan lokal; tidak dikirim atau dianalisis. | No |

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

### Privacy Policy

**Privacy Policy URL**

`https://ramaaudra.github.io/sakumagang-site/privacy/`

URL ini merespons HTTP 200 saat diaudit pada 2026-08-21. Jika kebijakan
berubah, URL dan disclosure CWS harus diperbarui bersama.

## Distribution

**Visibility**: Public

**Regions**: All regions

## Developer Info

**Publisher Name**: `Rama Audra`

**Contact Email**: **TODO — isi dengan alamat yang benar-benar dipantau sebelum submission**

**Support URL**: `https://github.com/ramaaudra/maganghub-extension/issues`

**Homepage URL**: `https://github.com/ramaaudra/maganghub-extension`

## Version History

| Version | Date | Changes | Status |
|---|---|---|---|
| 0.3.3 | 2026-09-24 | UI popup dirapikan dan kontrol tidak terpotong saat refresh; atribusi pembuat serta disclosure kepercayaan ditambahkan; Status Kuota mengikuti jendela pendaftaran. | Draft |
| 0.3.2 | 2026-08-27 | Copy trust popup, ringkasan manifest, dan listing diselaraskan dengan batasan kredensial serta penyimpanan lokal. | Draft |
| 0.3.1 | 2026-08-21 | Empty state Aktif dan Arsip memakai region layout yang sama; refresh popup lebih terarah; CI release tag disiapkan. | Draft |
| 0.3.0 | 2026-08-10 | Route mark, konsistensi icon, filter/sort popup, dan Favorite archive. | Draft |

## Review Notes

### Release via GitHub Actions

Workflow [`publish.yml`](.github/workflows/publish.yml) hanya berjalan ketika tag
semver `vX.Y.Z` didorong. Workflow akan:

1. Memastikan tag sama dengan versi di `package.json`.
2. Menjalankan unit test, `svelte-check`, dan E2E.
3. Build Manifest V3 dan membuat ZIP bersih dengan `manifest.json` di root.
4. Mengupload package dan mengirimkannya untuk review melalui Chrome Web Store API v2.

Set repository secrets berikut di GitHub. Jangan commit nilainya ke repository:

| Secret | Sumber |
|---|---|
| `CHROME_PUBLISHER_ID` | Publisher > Settings pada Developer Dashboard |
| `CHROME_EXTENSION_ID` | ID item extension pada Developer Dashboard |
| `CHROME_CLIENT_ID` | OAuth client pada Google Cloud |
| `CHROME_CLIENT_SECRET` | OAuth client pada Google Cloud |
| `CHROME_REFRESH_TOKEN` | OAuth Playground dengan scope Chrome Web Store |

Setup pertama tetap membutuhkan Developer Dashboard: buat item, lengkapi tab
Store listing dan Privacy, lalu siapkan OAuth dengan scope
`https://www.googleapis.com/auth/chromewebstore`. Setelah secrets tersedia,
rilis berikutnya:

```sh
npm run version:bump patch
# perbarui CHANGELOG.md dan bagian Version History di dokumen ini
git add package.json package-lock.json wxt.config.ts CHANGELOG.md CHROMEWEBSTORE.md
git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

Tag hanya dipush setelah semua perubahan yang ingin dikirim sudah masuk ke
commit. API memakai `DEFAULT_PUBLISH`: package dikirim untuk review dan akan
dipublikasikan setelah lolos review sesuai pengaturan item.

### Known Issues / Limitations

- Listing belum dikonfirmasi live di Chrome Web Store.
- Screenshot dan promo tile production belum tersedia.
- Contact email publisher masih harus diisi sebelum submission pertama.
- Update tetap tunduk pada review Chrome Web Store; CI tidak dapat melewati proses review.

### Rejection History

Belum ada submission atau rejection.
