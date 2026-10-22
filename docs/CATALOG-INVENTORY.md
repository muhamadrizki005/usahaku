> Pembaruan tahap berikutnya: POS dan transaksi toko telah diimplementasikan. Lihat [POS-TRANSACTIONS.md](POS-TRANSACTIONS.md). Catatan batas cakupan di bawah mencerminkan hasil tahap 4 saat diselesaikan.

# Tahap 4 — katalog produk dan inventori toko

22 Oktober 2026, Asia/Jakarta. Pengguna menyetujui owner/admin mengelola produk dan stok; kasir tidak boleh mengubah keduanya. Kuantitas mendukung hingga 3 angka desimal. POS, penjualan, pembayaran operasional, pembelian/supplier, multi-gudang, varian, dan satuan konversi tidak dikembangkan pada tahap ini.

## Checklist implementasi

- [x] Migrasi tambahan tanpa reset atau penyalinan data demo.
- [x] CRUD katalog berupa tambah/edit/aktif/nonaktif; tidak ada hard delete. Nama, kategori bebas, satuan, harga, minimum, SKU/barcode opsional, dan gambar opsional.
- [x] SKU unik tanpa membedakan huruf besar/kecil per usaha; SKU kosong saat pembuatan diisi otomatis. Barcode disimpan sebagai teks (nol di depan dipertahankan), unik bila tidak kosong di usaha yang sama. SKU/barcode produk nonaktif tetap dicadangkan.
- [x] Stok awal tercatat bersama pembuatan produk dalam satu transaksi. Stok awal 0 dan harga Rp0 diperbolehkan. Harga rupiah bulat, maksimal 999.999.999.999.
- [x] Kuantitas numerik eksak di database, maksimal 999.999.999,999 dan 3 desimal. Input terlalu presisi ditolak sebelum penyimpanan; tidak memakai tipe kolom yang diam-diam membulatkan input.
- [x] Stok masuk, keluar, dan koreksi selisih dengan alasan wajib, pelaku, snapshot nama/satuan, waktu, saldo sebelum/sesudah.
- [x] Satuan tetap sejak pembuatan agar riwayat dan saldo tidak berubah makna tanpa konversi. Buat produk baru untuk satuan lain; konversi satuan belum tersedia.
- [x] Metadata memakai `revision`; stok memakai `stock_revision`. Konflik menolak penimpaan. Mutasi stok dan perubahan massal atomik serta memiliki request ID untuk mencegah pengulangan saat respons jaringan terputus.
- [x] Perubahan massal kategori/nonaktif mengikuti pilihan yang sudah ada pada UI. Jika satu produk berubah versi atau milik usaha lain, seluruh batch dibatalkan. Maksimal 500 pilihan per permintaan.
- [x] RLS dan RPC memeriksa business, role, aktif, dan wajib ganti sandi. Tidak ada izin browser untuk menulis tabel langsung. Kasir hanya boleh membaca katalog aktif milik usahanya sebagai fondasi kebutuhan POS mendatang; tidak dapat membaca ledger/audit inventori.
- [x] Audit metadata tersimpan di `catalog_audit`; ledger stok terlihat pada panel riwayat inventori yang sudah ada. Audit metadata belum memiliki halaman tersendiri.
- [x] Gambar privat: server memvalidasi PNG/JPEG maksimal 2 MiB, maksimal 4096×4096, menormalisasi PNG 512px dan menghapus metadata. Staging/promosi/cleanup mengikuti pola aman logo profil: tidak menimpa file lama, pointer diganti dahulu, cleanup memakai claim dan melindungi file aktif.
- [x] Gambar disajikan lewat proxy yang memeriksa sesi/membership setiap permintaan, `private, no-store`, download Storage memakai nonce baru. Tidak memakai URL publik/signed URL.
- [x] Pencarian, filter, ekspor CSV, dan pagination produk (50 baris) memakai data katalog terverifikasi. Pembacaan server mengambil batch agar tidak diam-diam terpotong batas default REST.
- [x] Produk/inventori/dashboard/checklist/ringkasan memakai katalog server yang sama. Modal produk onboarding dipertahankan, memakai satuan default `pcs` untuk produk baru; gunakan halaman produk untuk membuat satuan lain. Edit stok dari editor produk dinonaktifkan agar melewati pencatatan alasan di inventori.
- [x] Data prototype browser tidak diimpor otomatis ke database dan tidak menjadi sumber katalog operasional.
- [x] Dashboard tidak menghitung omzet atau produk terlaris dari harga/sisa stok. Data penjualan tetap kosong karena modul transaksi belum tersedia.
- [x] Layout, kelas visual, palet teal/biru per halaman, font Inter lokal, dan logo resmi dipertahankan. Perubahan copy hanya menjelaskan fungsi/status data aktual.
  Pemeriksaan source membandingkan 130 kelas literal halaman produk dan 106 kelas literal inventori dengan salinan sebelum integrasi; identik. Bukti `artifacts/catalog/source-ui-check.json`. Ini belum menggantikan pemeriksaan tampilan runtime melalui browser.

## Migrasi yang perlu dijalankan

Jalankan **berurutan dan masing-masing sekali** di SQL Editor proyek Supabase website:

1. `supabase/migrations/202610220001_catalog_inventory.sql` — tabel, indeks, RLS, RPC katalog/stok, idempotensi, audit, dan bucket privat `product-images`.
2. `supabase/migrations/202610220002_bulk_catalog.sql` — RPC atomik untuk tombol kategori/nonaktif massal yang sudah ada.
3. `supabase/migrations/202610220003_product_image_policy.sql` — memperjelas acuan `storage.objects.name` pada policy gambar. Tes aktual menemukan kolom `name` tanpa qualifier terikat ke nama produk dan menolak baca gambar yang sah. Patch sudah diuji PostgreSQL lokal termasuk baca owner/admin/kasir aktif dan penolakan antarusaha.

Jangan jalankan ulang migrasi fondasi atau profil. Tidak ada backfill, reset, penghapusan, atau impor produk demo. Terapkan migrasi sebelum mencoba halaman dashboard yang membaca katalog baru.

**Status aktual terakhir:** pengguna mengonfirmasi migrasi 001, 002, dan patch 003 berhasil. Seluruh tes backend Supabase aktual sudah lolos, termasuk pembacaan gambar privat sesudah patch, isolasi tenant, pembatasan role, idempotensi, konflik stok, perubahan massal atomik, serta penonaktifan sesi. Snapshot seluruh data usaha yang ada sebelum tes tetap identik setelah pembersihan akun/file/data uji. Riwayat migrasi CLI dan katalog SQL remote penuh tidak diinspeksi langsung; pemasangan melalui SQL Editor diverifikasi melalui perilaku API/RPC/Storage.

## Pengujian

- [x] TypeScript lulus.
- [x] Build produksi lulus.
- [x] 13 tes lokal lulus: regresi fondasi/profil, parser kuantitas, migrasi PostgreSQL PGlite, grant/RLS antarusaha, admin/kasir, idempotensi, penolakan stok negatif/precision berlebih, konflik versi, larangan ubah stok/satuan dari metadata, keunikan SKU/barcode, gambar, cleanup, bulk rollback, dan penonaktifan.
- [x] Supabase aktual lengkap lolos: `artifacts/catalog/backend-results.json` (`passed: true`, `blocked: false`).
- [x] Tiga rangkaian browser lolos: akun/role, katalog/inventori, serta profil/setup. Katalog mencakup create/reload produk dan gambar terdecode, barcode berawalan nol, koreksi/stok masuk/stok keluar pecahan, stok negatif, edit admin, modal onboarding/ringkasan, isolasi gambar antarusaha, larangan akses kelola untuk kasir, dan penonaktifan sesi admin. Hasil: `artifacts/catalog/browser-results.json`, `artifacts/accounts-e2e-result.json`, dan `artifacts/profile-setup/browser-results.json`.
- [x] Tampilan runtime diperiksa pada viewport 1440?1000, zoom 100%; Inter terdeteksi loaded, judul produk 30px/700/36px. Screenshot produk dan inventori ada di `artifacts/catalog/`; metrik pada `runtime-style.json`. Tidak ada perubahan global CSS/palet/layout.
- [x] Pengujian browser tambahan ganti/hapus gambar produk lolos: JPEG menjadi PNG terdecode dengan dimensi yang diharapkan, file lama berstatus deleted setelah cleanup, stok tidak berubah, hapus gambar menghasilkan pointer null/HTTP 404 dan ikon fallback. Hasil akhir katalog `passed: true`, `cleanup: true`. Seluruh data/file/akun uji telah dibersihkan.

Perintah sesudah migrasi:

```powershell
node --env-file=.env.local scripts/test-catalog.mjs
npm run build
npm run start -- -p 3100
node --env-file=.env.local node_modules/@playwright/test/cli.js test tests/browser/catalog.spec.ts
```

Tes menggunakan owner/admin/kasir/usaha baru dan menghapus hanya ID/file yang dibuat run tersebut. Snapshot data yang sudah ada dibandingkan sesudah tes. Tidak menggunakan akun demo untuk login atau mengubah datanya.

## Maintenance dan batasan

Penyimpanan produk mencoba cleanup gambar usaha/produk terkait. Untuk staging terlantar minimal 15 menit atau delete yang gagal:

```powershell
node --env-file=.env.local scripts/cleanup-product-images.mjs
```

Cleanup harus melalui `claim_product_image_cleanup`: mengunci business/produk/asset, menandai `deleting`, menolak file aktif, lalu menghapus Storage dan menyimpan tombstone. Kegagalan cleanup tidak membatalkan gambar baru yang telah commit. Jadwal rutin pada hosting produksi belum dipasang, sama seperti cleanup logo profil.

Belum tersedia: migrasi data draft browser, buka 24 jam/multi-shift dari tahap sebelumnya, konversi satuan, stok antar-gudang, pengadaan, atau transaksi POS. Hak kasir melihat transaksi sendiri tetap dipertahankan untuk modul transaksi nanti.
