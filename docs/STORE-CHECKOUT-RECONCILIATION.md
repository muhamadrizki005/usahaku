# Perbaikan audit Toko, 2 November 2026

Branch: `fix/store-checkout-loyalty-reports`. Cakupan mengikuti temuan audit: konsistensi jumlah keranjang, integrasi poin/e-wallet, pembatasan poin, laporan e-wallet, dan batas angka. Layout, Poppins, palet, navigasi, diskon produk/keseluruhan, pajak, serta nomor struk dipertahankan.

## Perubahan

- Draft jumlah disimpan bersama baris keranjang. Input kosong/tidak valid memiliki error per baris dan memblokir checkout; tidak lagi diam-diam memakai jumlah valid sebelumnya.
- Input melebihi stok tidak bisa dicatat saat masih tidak sesuai. Saat keluar field, jumlah dan field disamakan dengan stok tersedia dan ada pemberitahuan. Tombol tambah/kurang menyinkronkan draft, jumlah, serta validasinya.
- Pecahan dihitung sebagai rasio BigInt lalu dibulatkan half-up ke tiga desimal. Panjang dibatasi 64 karakter; pembagian nol, hasil terlalu kecil/besar, dan angka tidak valid ditolak sebelum masuk keranjang.
- Program poin hanya dapat dikonfigurasi owner toko, termasuk melalui RPC. Fallback penulisan memakai service role dihapus; kegagalan tidak dilaporkan sebagai sukses. Profil yang sudah tersimpan sebelum kegagalan penyimpanan poin diberitahukan secara eksplisit.
- Pilihan program poin pada pembuatan usaha disimpan, bukan diabaikan. Pengaturan poin tidak ditawarkan pada kategori selain toko karena checkout poin baru berlaku untuk toko.
- Riwayat poin lengkap hanya owner/admin. Kasir tetap hanya melihat transaksi POS miliknya, tanpa riwayat poin seluruh petugas.
- E-wallet masuk filter, ringkasan metode, fungsi baca laporan, dan ekspor berfilter. Omzet mengecualikan pajak/pembatalan; refund dihitung menurut tanggal pembatalan, tanpa pengurangan ganda.

## Migrasi tambahan

Jalankan hanya `supabase/migrations/202611020001_store_checkout_reconciliation.sql` sekali. Patch dapat diterapkan pada schema lengkap maupun schema parsial yang ditemukan saat audit. Migrasi fondasi dan file 006–008 tidak perlu dijalankan ulang.

Patch melengkapi kolom/tabel poin yang belum ada dan fungsi pembayaran, checkout, pembatalan, serta laporan. Poin memakai bigint, dibatasi sampai 9.007.199.254.740.991 agar serialisasi JSON/aplikasi tetap tepat. Nominal pengali poin wajib rupiah bulat Rp1–Rp1.000.000.000. Poin dihitung dari total pembayaran, termasuk pajak, dengan pembulatan ke bawah sesuai perilaku fitur sebelumnya. Saldo yang melampaui batas eksplisit ditolak dan transaksi di-rollback; poin tidak dipotong diam-diam.

Nilai uang, rincian, UUID, dan nomor struk transaksi lama tidak dihitung ulang. Kolom poin yang baru ditambahkan memiliki nilai awal 0; saldo poin yang sudah ada dipertahankan. Retry tidak menambah poin/transaksi dua kali; pembatalan mengurangi poin dan mengembalikan stok sekali saja. Pembayaran dan refund tetap dikonfirmasi manual, tanpa gateway otomatis.

Peringatan destructive operations pada SQL Editor disebabkan penggantian policy riwayat poin dan constraint metode pembayaran. Tidak ada DELETE baris, TRUNCATE, atau DROP TABLE. Perubahan berada di dalam BEGIN/COMMIT; jika ada error sebelum selesai, transaksi migrasi gagal dan perlu diperiksa sebelum mencoba lagi.

## Pengujian

- Typecheck dan 70 tes unit/database lulus.
- `tests/store-reconciliation.test.ts` menguji penerapan patch pada schema lengkap dan parsial, preservasi transaksi/saldo, earning/retry/refund, owner/admin/kasir/antarusaha, e-wallet/report/CSV, nominal tidak valid, poin di atas batas integer lama, dan batas saldo aman.
- Build produksi webpack lulus pada salinan terpisah `.cache/store-fixes-build`.
- Tes browser jumlah pada 1440/390/320 px lulus: invalid memblokir checkout, pecahan valid, stok dijepit dan field disamakan, tombol tambah/kurang, keranjang kosong, tanpa overflow/page error. Akun uji dibersihkan dan hash data usaha lama identik.
- `tests/browser/store-reconciliation.spec.ts` lulus pengujian aktual e-wallet, dua diskon, pajak, pelanggan/poin, respons checkout terputus/retry, sesi baru, struk/cetak, laporan/CSV/PDF, akses role/antarusaha, pembatalan, dan poin bernilai besar. Pembuatan usaha juga menyimpan konfigurasi poin tanpa melewati guard onboarding.
- Regresi browser: 9 tes lulus, mencakup rekonsiliasi, POS, diskon keseluruhan, diskon produk/pajak, struk termal, dan perbaikan UI prioritas. Tes lama disesuaikan dengan dropdown satuan dan switch e-wallet yang sudah tersedia.

Pengguna mengonfirmasi migrasi berhasil dijalankan; pengujian integrasi Supabase setelah migrasi lulus. Akun uji dibersihkan, hash data usaha lama tetap identik, dan tidak ditemukan page error. Server QA sementara sudah dimatikan setelah pengujian.

Artefak di `.cache/store-fixes/` tidak untuk commit. Perubahan lokal generated `next-env.d.ts` yang sudah ada sebelum tugas dipertahankan terpisah dari implementasi.

## Integrasi main setelah perbaikan

Konflik dengan `origin/main` pada commit `0d13f49` diselesaikan di `components/pos-management.tsx`. Header bersama, reset margin/padding/border fieldset, dan checkbox melingkar dari main dipertahankan bersama draft jumlah, pesan validasi, normalisasi pecahan, serta guard checkout dari perbaikan ini. Penambahan custom role/RBAC dari main tetap disertakan; integrasi ini tidak memperluas izin operasional role tersebut.

Verifikasi hasil gabungan: typecheck lulus, 75 tes unit/database lulus (termasuk RBAC dan rekonsiliasi schema), serta build produksi webpack lulus pada salinan terpisah. Lima tes browser lulus: diskon keseluruhan, alur POS, jumlah desktop/HP, e-wallet/poin/laporan/akses, dan onboarding. Pengujian menggunakan akun terpisah, membersihkan data uji, serta memastikan data usaha lama tidak berubah. Percobaan browser pertama terhalang jaringan sandbox sebelum pembuatan data uji; pengulangan dengan akses Supabase lulus.

Tidak ada migrasi tambahan untuk resolusi konflik ini. Commit dan push hasil merge dilakukan pengguna.
