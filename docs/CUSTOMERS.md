# Tahap pelanggan toko

Pengguna menyetujui modul pelanggan setelah tahap POS pada 22 Oktober 2026. Cakupan: profil opsional pada checkout, nama, telepon/catatan opsional, pencarian, edit/nonaktif, riwayat belanja, pembatasan role dan isolasi usaha. Tidak termasuk akun/login pelanggan, poin, loyalitas, restoran/salon atau laporan lanjutan.

## Implementasi

- [x] Owner/admin menambah dan mengedit pelanggan, mengaktifkan/nonaktifkan, mencari nama/telepon, dan membuka riwayat. Tidak ada hapus fisik dari aplikasi.
- [x] Nama wajib 1–100 karakter; telepon opsional; catatan opsional maksimal 1.000 karakter. Telepon dinormalisasi ke format +kode-negara: `0812…` dan `62812…` menjadi `+62812…`. Ini validasi format, bukan verifikasi kepemilikan nomor. Nomor telepon tidak dibuat unik: anggota keluarga dapat berbagi nomor; tidak ada penggabungan otomatis.
- [x] Perubahan profil menggunakan revisi/CAS. Request UUID dengan payload tetap membuat retry aman terhadap respons hilang, tanpa profil/audit ganda. Saat hasil belum pasti, editor dikunci dan menyediakan retry permintaan yang sama. Tutup editor dan muat ulang untuk memeriksa sebelum membuat permintaan baru jika tab ditutup.
- [x] Kasir hanya mencari/memilih pelanggan aktif melalui RPC dengan proyeksi `id`, `name`, `phone`; minimal 2 karakter, maksimal 20 hasil. Tidak menerima catatan, audit atau riwayat seluruh pelanggan. RLS tabel profil/audit hanya owner/admin. Pencarian memakai parameter dan pencocokan teks literal, bukan SQL/wildcard pengguna.
- [x] Slot pelanggan POS ditambah pencarian dengan gaya input yang sudah ada. Pelanggan umum tetap tersedia dan tidak membuat profil tersendiri. Pilihan pelanggan dikosongkan sesudah checkout berhasil atau pembatalan keranjang agar tidak terbawa ke pembeli berikutnya.
- [x] Checkout memverifikasi ID pelanggan aktif di usaha yang sama dan mengambil namanya dari database; nama kiriman browser tidak dipercaya. Transaksi menyimpan ID serta snapshot nama. Edit/nonaktif profil tidak mengubah struk lama. Retry transaksi lama tetap bekerja meski pelanggan kemudian nonaktif.
- [x] Pelanggan yang dinonaktifkan setelah dipilih ditolak untuk checkout baru sebelum stok/transaksi berubah. Petugas dapat memilih pelanggan umum atau profil aktif lain. Pembatalan penjualan tetap memakai mekanisme POS dan mempertahankan tautan pelanggan.
- [x] Riwayat owner/admin disaring dengan `business_id` dan `customer_id`, mencakup transaksi selesai/dibatalkan. Total belanja/jumlah transaksi selesai mengecualikan pembatalan. Kasir tetap hanya membaca transaksi sendiri melalui RLS POS; tidak mendapat halaman riwayat pelanggan.
- [x] Penjualan lama tidak dipasangkan ke profil berdasarkan nama atau nomor. Tidak ada reset, impor atau perubahan data demo.
- [x] Halaman pelanggan sebelumnya hanya kerangka ZIP. Implementasi memakai `DashboardSection`, gaya tabel/field/editor produk, serta komponen `TransactionHistory` yang sudah ada. Palet per halaman, Inter lokal, susunan utama POS dan branding dipertahankan. Bukti source: `artifacts/customers/source-ui-check.json`.

## Migrasi

Migrasi `supabase/migrations/202610220005_customers.sql` telah dijalankan pengguna dan diverifikasi di Supabase aktual. **Tidak perlu dijalankan ulang.** Migrasi fondasi/profil/katalog/POS sebelumnya tidak diulang; database dan data demo tidak direset.

Migrasi menambah `customers`, `customer_audit`, `customer_requests`, RLS, indeks, RPC `save_customer` / `search_pos_customers`, kolom/FK `pos_transactions.customer_id`, dan mengganti fungsi `checkout_pos` dengan validasi pelanggan tambahan. Logika harga, stok, diskon, pembayaran, idempotensi dan pembatasan transaksi tetap dipertahankan. Payload checkout lama tanpa `customerId` tetap didukung sebagai pelanggan umum. Request lama yang sudah tersimpan dikembalikan sebelum validasi profil baru.

Semua mutasi memakai urutan lock usaha terlebih dahulu, sehingga edit/nonaktif pelanggan dan checkout terurut. FK gabungan bisnis/pelanggan mencegah tautan transaksi antarusaha. Riwayat tidak hilang ketika pelanggan dinonaktifkan.

## Status verifikasi

- [x] `npm.cmd test`: 16 tes lokal lulus. Tes PostgreSQL/PGlite menjalankan migrasi 001–005, menguji grants/RLS, dua usaha, owner/admin/kasir, proyeksi pencarian, telepon, CAS, idempotensi, snapshot, nonaktif, sesi wajib ganti sandi, pelanggan umum dan cleanup bisnis uji.
- [x] TypeScript dan build produksi lulus.
- [x] Regresi browser POS pelanggan umum lulus setelah penambahan pemilih pelanggan: tunai/QRIS/transfer, diskon, struk, retry respons putus setelah commit, pembatalan, dashboard dan pembatasan kasir. Ini menguji kompatibilitas dengan migrasi POS lama, **bukan** bukti pelanggan sudah bekerja di Supabase. Akun uji POS dibersihkan dan data demo identik. Bukti `artifacts/pos/browser-results.json`.
- [x] Migrasi tersedia di Supabase website. Setelah pengguna memasang migrasi, tabel, RPC, grants/RLS dan penggantian checkout diverifikasi lewat pengujian perilaku aktual.
- [x] `scripts/test-customers.mjs`: backend Supabase aktual lulus, termasuk dua pembuatan bersamaan/retry, dua edit dengan revisi sama hanya satu berhasil, pencarian terbatas, role/tenant, penautan checkout, snapshot, nonaktif, kompatibilitas payload lama, pembatalan dan penonaktifan sesi. Akun uji dibersihkan. Snapshot seluruh usaha yang ada sebelum tes, anggota, audit, produk, stok, aset, pelanggan dan transaksi/request tetap identik. Bukti `artifacts/customers/backend-results.json`.
- [x] `tests/browser/customers.spec.ts`: pengujian website lulus, termasuk formulir/retry setelah respons terputus, telepon opsional/invalid, edit admin dan penolakan versi lama owner, pemilihan di POS, pilihan dibersihkan setelah checkout, nonaktif di tengah checkout tanpa perubahan stok, riwayat/struk, dua kasir/dua usaha, pagination 25 baris, mobile 390px tanpa overflow halaman, dan penonaktifan akses. Snapshot seluruh data usaha sebelum tes tetap identik sesudah akun/data uji dibersihkan. Bukti `artifacts/customers/browser-results.json`.
- [x] Regresi browser POS setelah penggantian fungsi checkout lulus: tunai/QRIS/transfer, diskon, idempotensi saat respons terputus, struk, pembatalan, ringkasan dan role kasir. Screenshot editor, tabel pelanggan, riwayat dan mobile sudah diperiksa. Semua 105 kelas literal POS semula tetap dipakai (termasuk pemilih pelanggan yang dipisahkan ke komponen). Runtime pelanggan: Inter termuat, judul 24px/600, latar dashboard sesuai kerangka semula.
- [x] Regresi backend `scripts/test-pos.mjs` setelah migrasi 005 lulus, termasuk checkout bersamaan dengan request sama, dua kasir berebut stok terakhir, rollback keranjang multi-produk, diskon/pembayaran dan pembatalan bersamaan. Data uji dibersihkan dan snapshot usaha lama tetap identik.

Pengujian backend dan website pelanggan sudah lulus. Bukti: `artifacts/customers/backend-results.json`, `browser-results.json`, `runtime-style.json`, `source-ui-check.json`, `editor.png`, `customers.png`, `history.png`, dan `mobile.png`. Tidak ada migrasi tambahan atau tindakan pengguna yang tertunda untuk cakupan modul pelanggan ini.
