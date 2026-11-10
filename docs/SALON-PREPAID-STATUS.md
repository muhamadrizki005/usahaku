# Pembayaran lunas dan status pelayanan salon

Branch: `fix/salon-prepaid-service-status`.

Pembayaran tidak menyelesaikan pelayanan. Walk-in yang dibayar lunas masuk **Menunggu**, kemudian pegawai menekan **Mulai pelayanan** untuk menjadi **Sedang dilayani**, dan **Selesaikan pelayanan** untuk menjadi **Selesai**. Janji temu yang dibayar di muka tetap **Dijadwalkan** sampai ditandai datang. Label **Lunas** ditampilkan terpisah dari status pelayanan.

Kunjungan lunas tetap memakai pemeriksaan jadwal, penata, revisi, idempotensi tindakan, role dan usaha pada `salon_visit_operation`. Kasir hanya mengubah kunjungannya sendiri. Tombol Bayar, DP, ubah tagihan, dan pembatalan kunjungan biasa tidak ditawarkan lagi untuk kunjungan lunas. Pembatalan pembayaran tetap melalui konfirmasi refund penuh manual owner/admin pada transaksi. Refund atas pelayanan yang belum selesai membatalkan kunjungan aktifnya; riwayat pelayanan yang sudah selesai dipertahankan.

## Migrasi

Jalankan hanya `supabase/migrations/202611100005_salon_prepaid_service_status.sql` sekali, seluruh file sekaligus. Pengguna mengonfirmasi migrasi berhasil pada 10 November 2026. Tidak mengubah nilai atau status transaksi/kunjungan lama.

Migrasi memperbarui constraint kunjungan lunas dan guard transisi, serta menambah `commit_salon_cart_checkout`. Fungsi terakhir hanya dapat dieksekusi service role melalui server action yang sudah memeriksa sesi salon. Pembayaran dan kunjungan baru disimpan dalam satu transaksi SQL: jika kunjungan gagal, pembayaran ikut rollback. Jadwal dan tenant diperiksa sebelum insert. Jalur fallback pembatalan pada server action tidak boleh membatalkan kunjungan yang sudah memiliki transaksi.

Ini tidak mengganti mesin perhitungan harga/poin/produk salon yang sudah ada. Mutasi poin dan stok di jalur kasir lama masih dilakukan terpisah dari transaksi pembayaran; rekonsiliasi menyeluruh bagian tersebut tidak termasuk patch status ini.

## Pengujian aktual

- TypeScript `tsc --noEmit`: lulus.
- Build produksi Next.js dengan `next build --webpack` pada snapshot terisolasi: lulus. Tidak menyentuh server dev pengguna.
- `tests/salon-prepaid-status.test.ts`: lulus pada PostgreSQL lokal (PGlite), mencakup rollback pembayaran jika insert kunjungan gagal, urutan status manual, larangan loncat langsung selesai, retry tindakan, revisi kedaluwarsa, slot bentrok, akses kasir sendiri, akses antarusaha, larangan pembayaran/DP ganda, refund owner/admin, serta preservasi riwayat sebelum migrasi.
- Seluruh unit test: 125/126 lulus. Satu kegagalan `tests/loyalty-points.test.ts` juga direproduksi pada snapshot `origin/main` commit `5261dc4` tanpa patch ini: pemanggilan tiga argumen `save_business_loyalty_settings` ambigu terhadap overload empat argumen dengan default. Tidak diperbaiki diam-diam dalam patch pelayanan.
- `node --env-file=.env.local scripts/test-salon-prepaid.mjs`: lulus pada Supabase aktual setelah migrasi, dengan akun/usaha QA baru. Menguji rollback, penolakan akses RPC private dari authenticated, pembayaran tetap Menunggu, status manual, retry, akses akun lain, serta nilai dan jumlah transaksi tetap. Cleanup fixture lulus dan hash snapshot usaha yang sudah ada tetap sama.
- Route visual sementara pada snapshot QA mengompilasi dan merespons HTTP 200. Verifikasi interaksi/tampilan browser belum selesai karena kontrol browser dihentikan saat terdeteksi input pengguna. Tidak diklaim sebagai tes browser yang lulus. Route sementara tidak masuk aplikasi utama.

Server QA agent port 3233 sudah dihentikan. File environment, cache, hasil build dan data fixture tidak diperlukan dalam commit. Belum commit, push atau merge.
