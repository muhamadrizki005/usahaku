# Perbaikan akses toko dan regresi browser

Branch: `fix/store-rbac-accessibility`, berdasarkan `main` pada `36cd5d6`.

## Perubahan

- Role bawaan memakai kode tetap `admin` dan `cashier`; custom role memakai UUID role sebagai `role_key`. Nama tampilan dapat berubah tanpa memutus akses anggota. Pembuatan staf, perubahan role, hitungan anggota, navigasi, dan resolusi sesi memakai identitas yang sama.
- Izin tersimpan dibaca kembali di server. Tidak ada fallback yang mengembalikan seluruh izin admin saat konfigurasi role tidak ditemukan. Staf tanpa izin diarahkan ke akun pribadi.
- Route, server action, RPC, dan policy baca memakai izin modul. Mencabut izin berlaku pada permintaan server berikutnya, termasuk sesi yang masih terbuka. Tombol pada halaman yang sudah terbuka dapat memerlukan reload, tetapi tidak dapat melewati pemeriksaan database.
- Owner tetap satu-satunya pengelola profil, jam, pembayaran, poin, staf, dan role. Kasir dibatasi pada POS dan transaksi miliknya sendiri; izin tambahan tidak dapat diberikan melalui formulir maupun penulisan langsung role.
- Modal staf/role memakai dialog native dengan fokus awal, focus trap, Escape, dan pengembalian fokus. Label terhubung ke input. Dropdown bersama mendukung panah, Home/End, pencarian lewat ketikan, Escape, dan Tab. Escape pada dropdown menutup dropdown lebih dahulu.
- Enam tes browser lama mengikuti kontrol dan kebijakan UI sekarang: kategori restoran tersedia, keranjang kosong menyembunyikan checkout, dropdown custom, navigasi pengaturan, toast, dan font Poppins.

Desain, ukuran tipografi, palet, posisi navigasi, dan nilai keuangan lama dipertahankan. Tidak ada dependency baru.

## Aturan izin

- Operasi tulis memerlukan izin melihat modulnya. Pembatalan transaksi selesai memerlukan kedua izin pembatalan dan refund; formulir menjaga dependensi tersebut.
- `products:delete` dan `customers:delete` mengatur penonaktifan, bukan penghapusan riwayat. Formulir menonaktifkan pilihan status Nonaktif ketika izin tersebut tidak dimiliki.
- `inventory:create` mencatat stok masuk/keluar; `inventory:edit` mencatat koreksi fisik. Perubahan stok tetap memerlukan alasan dan kontrol revisi.
- `pos:discount` mengatur diskon keseluruhan saat checkout. Diskon produk yang sudah tersimpan tetap mengikuti harga katalog.
- `reports:export` memerlukan `reports:view`. Asisten bisnis memerlukan akses laporan dan produk.
- Akses Ringkasan, Laporan, atau Pelanggan memberi akses ke sumber transaksi usaha yang diperlukan modul tersebut. Izin Pelanggan mencakup profil dan riwayat pembelian pelanggan. Jangan memberikannya kepada staf yang hanya boleh melihat transaksi sendiri.
- Role custom dengan hanya `transactions:view` melihat transaksi sendiri. Admin tetap melihat transaksi usaha bila memiliki izin transaksi. Custom role dengan izin pembatalan dan refund dapat melihat transaksi usaha untuk menjalankan tugas tersebut.
- Riwayat poin lengkap tetap khusus owner/admin yang memiliki akses pelanggan. Custom role tidak memperoleh pengaturan poin atau riwayat poin lengkap.
- Cakupan custom role operasional ini untuk kategori toko. Tidak memperluas role custom ke operasional restoran.

## Migrasi

Jalankan sekali, setelah migrasi yang sudah terpasang:

`supabase/migrations/202611030001_store_rbac_enforcement.sql`

Migrasi menambahkan identitas role, merekonsiliasi label role lama, serta memperbarui guard/policy. Fungsi keuangan yang sudah terpasang dipertahankan; patch menolak signature atau titik pemeriksaan yang tidak sesuai, sehingga tidak mengganti implementasi checkout yang tidak dikenal secara diam-diam. Tidak ada reset, penghapusan transaksi, atau penghitungan ulang transaksi lama. Migrasi dibungkus transaksi.

Perubahan kode dan migrasi harus dipasang bersama. Jangan menganggap kontrol UI sebagai pengganti migrasi database. Jangan menjalankan ulang migrasi fondasi.

## Pengujian

- `npm.cmd run typecheck`
- `npm.cmd test`
- Build produksi webpack pada salinan sumber QA yang memakai dependency proyek.
- `tests/store-rbac-enforcement.test.ts`: semua migrasi pada PostgreSQL lokal, preservasi produk/transaksi lama, normalisasi role, izin baca/tulis, pencabutan izin, kasir, isolasi usaha, dan retry checkout.
- `tests/browser/rbac-enforcement.spec.ts`: akun/tenant baru untuk role custom, rename, hitungan anggota, login staf, keyboard/modal, pencabutan izin admin, RPC langsung, ekspor, dan pembatasan tenant. Tes membutuhkan migrasi baru pada Supabase aktual; gagal di preflight bila kolom `role_key` belum tersedia.
- Regresi browser mencakup akun, profil/jam/logo, katalog/SKU, inventori, POS, pelanggan, diskon/pajak, e-wallet/poin, struk, laporan, dan reduced motion.

Hasil aktual dan bagian yang belum terverifikasi dicatat dalam laporan penyelesaian. Pengujian tidak membuktikan pengiriman OTP ke inbox, OAuth Google interaktif, atau jawaban Gemini live. Akun/data demo tidak digunakan sebagai fixture. Artefak QA berada di cache dan tidak perlu masuk commit. Server yang dinyalakan untuk QA harus dihentikan setelah pengujian.

### Hasil 3 November 2026 sebelum penerapan migrasi aktual

- Typecheck, 76 tes unit/database, dan build produksi webpack lulus.
- Delapan belas kasus regresi browser lulus setelah memperbarui asumsi UI yang kedaluwarsa dan menjalankan ulang kasus yang gagal. Satu kasus tambahan untuk hitungan staf, label, fokus awal/trap, Escape, dan keyboard dropdown pada 1440/390/320 px juga lulus. Total 19 kasus unik lulus; bukan satu run tanpa pengulangan.
- Persistensi profil/logo/jam lintas tengah malam teruji setelah reload, logout-login, dan sesi baru. Guard onboarding serta pembatasan pengaturan owner tetap bekerja.
- Fixture browser dibersihkan; pemeriksaan preservasi data lama lulus. Server QA port 3220 dihentikan.
- Supabase aktual masih mengembalikan `42703` saat membaca `business_roles.role_key`. Dua kasus browser khusus custom role dan pencabutan izin baru belum dijalankan pada database aktual. Hasil PostgreSQL lokal tidak menggantikan verifikasi ini. Jalankan kedua kasus tersebut setelah migrasi baru diterapkan, sebelum menyatakan perbaikan RBAC selesai end-to-end.

### Verifikasi setelah migrasi aktual diterapkan

Pengguna mengonfirmasi migrasi berhasil. Kedua tes khusus RBAC kemudian lulus pada Supabase aktual: custom role dapat login dan membaca modul yang diizinkan, rename mempertahankan akses, pemilihan Petugas Kasir menyimpan `cashier`, dan hitungan staf sesuai. Pencabutan izin admin menolak RPC pembuatan produk serta bulk update pada sesi yang masih aktif; reload menyembunyikan tombol terlarang dan ekspor ditolak. Staf tanpa izin diarahkan ke akun pribadi. Akses owner usaha lain, pengaturan owner-only, dan pembatasan kasir tetap teruji. Fixture dibersihkan, hash data usaha lama sama, dan tidak ada page error pada kedua tes.

Regresi setelah migrasi: 19 tes browser lainnya lulus dalam satu run, tanpa kegagalan (9,5 menit). Mencakup akun, pelanggan, gambar produk, inventori pecahan, diskon bertingkat, POS/retry/pembatalan, profil/logo/jam, reduced motion, katalog/SKU, keyboard modal, laporan/CSV/PDF, e-wallet/poin, struk, serta UI laptop/HP. Bersama dua tes RBAC, total 21 kasus browser unik lulus setelah migrasi. Server QA port 3220 kembali dihentikan; tidak ada commit, push, atau merge oleh agen.
