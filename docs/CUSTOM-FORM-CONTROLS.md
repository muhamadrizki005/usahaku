# Kontrol formulir konsisten

Branch: `fix/custom-form-controls`.

## Perubahan

- Validasi HTML tetap memblokir submit invalid, tetapi tooltip browser dicegah dan diganti pesan Indonesia di bawah field. Pesan menggunakan `role="alert"`, `aria-invalid` dan `aria-describedby`; fokus menuju field invalid pertama. Validasi server tetap berlaku.
- Lima belas deklarasi select native pada delapan file memakai adapter `SelectInput` di atas `CustomSelect` yang sudah ada. Opsi disabled, label, nama field dan nilai FormData dipertahankan.
- Dropdown memakai portal dengan penanganan benturan viewport; dropdown di dalam modal native tetap dirender di dalam modal tersebut. Keyboard panah, Home/End, pencarian huruf, Enter dan Escape tersedia.
- Tanggal laporan memakai kalender bersama. Pilihan bulan/tahun juga custom; batas tanggal laporan tetap 2000–2100.
- Jam memakai field HH:mm yang dapat diketik dan popup pilihan jam/menit 24 jam. Pengaturan lintas tengah malam tidak diubah.
- Input angka tidak menampilkan spinner browser; draft kosong tetap bisa diedit, sedangkan batas min/max dan kelipatan tetap diperiksa, termasuk stok tiga desimal.
- Prompt kategori massal dan konfirmasi nonaktifkan produk setup memakai modal aplikasi. Pembatalan tidak menjalankan mutasi.

Tidak ada perubahan dependency, migrasi, API, role, isolasi usaha, palet atau tipografi. Dialog file, print dan izin perangkat tetap milik sistem operasi/browser. Checkbox yang sudah memiliki styling aplikasi dipertahankan.

## Menjalankan QA kontrol tanpa menambahkan route publik

Fixture berada di `tests/fixtures/custom-controls-page.tsx`; route QA hanya dipasang pada snapshot yang diabaikan Git. Jalankan dari root proyek:

```powershell
node scripts/prepare-controls-qa.mjs
node --env-file=.env.local node_modules/next/dist/bin/next build .cache/custom-form-controls/build --webpack
node --env-file=.env.local node_modules/next/dist/bin/next start .cache/custom-form-controls/build -p 3221
```

Pada terminal kedua:

```powershell
$env:TEST_BASE_URL = 'http://localhost:3221'
node --env-file=.env.local node_modules/@playwright/test/cli.js test tests/browser/custom-form-controls.spec.ts --workers=1
```

Matikan server dengan Ctrl+C setelah pengujian. Script tidak menyalin file environment; fixture kontrol tidak membaca atau menulis database. Tes alur bisnis menggunakan akun uji baru dan membersihkan hanya ID yang dibuat oleh run tersebut.

## Arah visual dan pemeriksaan

ENERGY 1 / RHYTHM 1 / MOTION 1: mempertahankan komposisi formulir, Poppins, panel navy dan aksen yang sudah disetujui. Tidak menambah animasi dekoratif.

- Visual: kontrol mengikuti panel dan warna aplikasi; pesan error memakai warna error yang sudah tersedia.
- Konsistensi: kalender, dropdown dan modal memakai komponen bersama, tanpa varian palet baru.
- Hierarki: pesan berada di dekat field; aksi utama dan susunan halaman dipertahankan.
- Ketahanan: kontrol bersama diuji pada 320/390/768/1440 px, keyboard, dropdown bersarang, opsi disabled, nilai FormData, koreksi error dan invalid submit. Pemindaian JSX tidak menemukan `<select>` maupun input native date/time/number yang tersisa di app/components.

## Hasil aktual, 5 November 2026

- Typecheck lulus; build produksi webpack pada snapshot final lulus.
- Seluruh 89 unit test lulus (termasuk database lokal/RBAC yang sudah ada). Tidak ada migrasi baru.
- Delapan tes browser berbeda lulus: kontrol bersama, diskon kasir, laporan, penyelesaian restoran, reservasi restoran, fondasi salon, setup, dan input angka produk.
- Kasus alasan pembatalan satu karakter menampilkan pesan Indonesia dan fokus yang benar; status database tetap `reserved`. Setelah alasan valid, refund/pembatalan tersimpan dan persisten.
- Setup menguji konfirmasi nonaktifkan produk bersarang: Batal tidak menulis data; konfirmasi menonaktifkan produk. Tes produk menguji prompt kategori massal sampai nilai tersimpan di database.
- Laporan memverifikasi filter tanggal, CSV/PDF dan akses; restoran/salon memverifikasi penyimpanan, login ulang, role dan isolasi usaha. Fixture mengonfirmasi data lama tetap utuh dan membersihkan akun/data run sendiri.
- Kontrol bersama lulus ulang pada build terakhir, termasuk hilangnya error ketika batas angka berubah, nilai kosong/pecahan, keyboard, opsi disabled, kalender sampai 2100, jam 24 jam dan popup bersarang pada empat viewport. Tidak ada page error atau dialog browser pada tes ini.

Pada putaran dev awal, beberapa tes gagal pada navigasi/modal; pengulangan produksi lulus. Assertion native option disesuaikan untuk membuka menu custom dahulu. Assertion tambahan status reservasi dikoreksi dari istilah UI `scheduled` ke nilai database `reserved`, lalu seluruh alur reservasi lulus. Tes browser lama lain yang hanya diperbarui selector-nya belum semuanya dijalankan ulang; hasil di atas hanya untuk delapan tes yang disebutkan.

Bukti lokal berada di `.cache/custom-form-controls/`, `.cache/order-discounts/`, `.cache/restaurant-operations-completion/browser/`, `.cache/restaurant-reservations/browser/`, `.cache/salon-foundation/browser/`, `.cache/ui-ux-priority/setup-controls/` dan direktori cache input produk. Cache, route QA snapshot, environment, dan artefak tidak perlu masuk commit. Semua server yang dinyalakan untuk QA telah dihentikan.
