# Changelog

## [0.3.0] — 2026-08-10

Release ini merapikan identitas visual SakuMagang sekaligus mematangkan
pengalaman popup sejak `v0.2.0`.

### Identitas brand dan asset production

- Menambahkan Route mark sebagai identitas production SakuMagang: jalur biru
  kontinu dengan marker persegi di atas surface Paper.
- Menetapkan `src/public/icon/route.svg` sebagai satu-satunya source canonical
  untuk brand mark.
- Menjaga inset visual konsisten di semua sisi agar icon tidak terlihat turun
  atau bergeser ketika dipakai di toolbar, popup, dan ukuran PNG.
- Meregenerasi icon manifest Chrome pada ukuran 16, 32, 48, dan 128px dari
  source SVG yang sama.
- Memasang Route mark di header popup di samping nama SakuMagang.
- Menghapus prototype icon lama dan referensi monogram Geist.

### Popup dan icon system

- Menyatukan icon popup dan content script pada Hugeicons agar stroke,
  rendering, dan affordance lebih konsisten.
- Menambahkan filter Tahap dan label Urgensi pada daftar Favorite.
- Menambahkan pengurutan berbasis Status Lamar dan sisa kursi, dengan memori
  pilihan sort selama sesi popup.
- Memperjelas empty state, pencarian, focus ring Field Blue, dan token aksi
  destructive pada popup.

### Keamanan dan perilaku produk

- Tidak ada perubahan pada postur local-first, permission, atau alur
  kredensial; extension tetap tidak menyentuh password maupun sesi SiapKerja.
- Dokumentasi design system, product contract, README, dan ADR-0009
  diperbarui agar identitas SakuMagang dan source asset tidak dapat drift.

### Packaging dan verifikasi

- Versi extension dinaikkan ke `0.3.0`.
- Rilis menyediakan `sakumagang-0.3.0-chrome.zip` untuk sideload Chrome.
- `pnpm build` berhasil.
- `pnpm check` berhasil tanpa error atau warning.
- Unit test: 239 test berhasil.
- E2E: 80 test berhasil.
