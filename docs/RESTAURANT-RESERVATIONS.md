# Reservasi restoran dan DP manual

Branch `feat/restaurant-reservations` dibuat dari `1f4714a` agar perbaikan RBAC toko tetap terbawa. Branch tersebut belum di-commit, di-push, atau di-merge oleh agen. Main tidak diubah.

## Cakupan yang disetujui

Reservasi internal melalui dashboard: pelanggan menghubungi restoran, staf mencatat reservasi dan memilih meja. Bukan booking publik, payment gateway, atau pengiriman WhatsApp otomatis. Tidak menambah bahan baku/resep atau kategori salon.

Pengguna menyetujui durasi awal 90 menit, toleransi terlambat 15 menit, pelepasan oleh tindakan staf tanpa pembatalan otomatis, DP nominal rupiah opsional, refund DP penuh manual oleh owner/admin, serta kasir mengelola reservasinya sendiri. Owner/admin dapat mengelola seluruh reservasi usahanya.

## Alur

1. Buka **Reservasi** pada navigasi restoran. Pilih tanggal WIB untuk daftar dan pagination 25 baris, termasuk reservasi lintas tengah malam yang beririsan dengan tanggal itu.
2. Buat reservasi: kedatangan, durasi, jumlah tamu, nama, kontak, catatan opsional. Periksa meja; kotak hanya menampilkan nama/nomor meja, kapasitas pilihan tampil di bawahnya. Meja yang tidak tersedia tidak dapat dipilih. Mengubah jadwal/jumlah tamu mewajibkan pemeriksaan ulang.
3. Simpan. Database mengunci usaha dan memeriksa ulang kapasitas, status meja, serta bentrok. Reschedule masih diperbolehkan sebelum pelanggan datang, dengan revisi dan audit; DP tidak dicatat ulang.
4. Jika menerima DP, buka **Catat DP**, masukkan nominal dan metode tunai/QRIS/transfer, lalu konfirmasi penerimaan nyata. Satu DP per reservasi, tanpa cicilan/top-up. Nominal positif rupiah bulat, maksimal Rp999.999.999.999.
5. Pelanggan datang: **Buka pesanan** mengisi meja, jumlah tamu, nama dan catatan dari reservasi. Pilih menu lalu simpan. Reservasi dan pesanan ditautkan atomik, satu reservasi hanya untuk satu pesanan.
6. Pelunasan menunjukkan total, DP, sisa tagihan dan kembalian. Struk mempertahankan total tagihan asli serta memisahkan DP/metode DP, sisa tagihan dan uang yang diterima saat pelunasan. Pembayaran manual tetap harus diperiksa petugas.
7. Batal/tidak hadir dicatat dengan alasan. Bila ada DP, owner/admin wajib mengonfirmasi refund penuh yang sudah dilakukan di luar aplikasi. Pesanan terbuka ikut dibatalkan dan meja dilepas atomik; riwayat tetap ada.

## Aturan jadwal dan meja

- Waktu disimpan sebagai `timestamptz`; formulir dan daftar menggunakan WIB, terlepas dari zona waktu perangkat.
- Jadwal baru/perubahan dimulai di masa depan, maksimal 366 hari ke depan. Durasi dapat diubah staf menjadi 1–720 menit. Reservasi boleh melintasi tengah malam.
- Rentang memakai batas `[mulai, selesai)`. Reservasi berikutnya boleh tepat pada jam selesai sebelumnya, tanpa buffer tambahan.
- Meja yang sedang memiliki pesanan terbuka tidak bisa menerima reservasi yang dimulai dalam 90 menit ke depan. Reservasi lebih jauh tetap memerlukan pemeriksaan keadaan meja oleh staf saat kedatangan; sistem tidak mengetahui kapan tamu secara fisik meninggalkan meja.
- Pesanan walk-in baru memakai asumsi penggunaan meja 90 menit dan ditolak bila beririsan dengan reservasi aktif. Pesanan yang sudah terbuka tetap dapat diperbarui. Tidak ada pemindahan paksa pesanan/tamu.
- Check-in melalui pesanan diperbolehkan mulai 15 menit sebelum kedatangan sampai sebelum jam akhir reservasi. Meja tetap harus bebas dari pesanan terbuka lain.
- Tidak hadir hanya dapat ditandai sesudah jam kedatangan +15 menit. Tidak ada cron yang membatalkan status atau menghanguskan DP. Setelah rentang waktu selesai, reservasi yang belum ditutup tetap terlihat sebagai Dijadwalkan, tetapi tidak memblokir rentang waktu lain di luar slotnya.
- Kapasitas/status meja tidak bisa diubah sehingga merusak reservasi aktif. Ubah/batalkan reservasinya terlebih dahulu. Nama meja pada reservasi adalah snapshot.
- Pemeriksaan terhadap jam buka usaha belum diterapkan; staf bertanggung jawab memilih jadwal sesuai jam operasional yang disepakati restoran. Tidak ada penggabungan meja, waiting list, atau booking tanpa meja.

## Uang, laporan dan refund

- DP bukan penjualan terpisah. Tidak ada baris `pos_transactions` saat DP diterima; penerimaan/metode/waktu/petugas dan refund tersimpan pada reservasi serta audit.
- Saat dilunasi, satu penjualan menyimpan total penuh. `received` adalah DP + uang pelunasan, `change` adalah kembalian sebenarnya; `balance_received` menyimpan uang yang diterima pada pelunasan. Snapshot `deposit_amount`/`deposit_payment` mempertahankan rincian struk.
- DP tidak boleh melebihi tagihan setelah diskon. Pelunasan ditolak bila ini terjadi: sesuaikan pesanan/diskon atau batalkan dengan refund DP penuh. Tidak ada refund DP sebagian atau sisa DP yang hangus otomatis.
- Laporan penjualan mengakui total sekali pada tanggal pelunasan, bukan tanggal DP. Filter/ringkasan metode restoran mengikuti **metode pelunasan**, bukan pemecahan arus kas per metode DP. UI menyebutkan batas ini; CSV penjualan ber-DP menambahkan rincian DP/pelunasan. Ini bukan laporan arus kas atau saldo bank. DP yang belum dilunasi maupun refund DP reservasi terlihat di Reservasi, tidak masuk omzet atau refund penjualan.
- Pembatalan penjualan yang sudah dilunasi tetap memakai alur owner/admin dan konfirmasi refund penuh total transaksi. DP ditandai sudah ikut direfund agar tidak dikembalikan dua kali lewat pembatalan reservasi.
- Operasi memakai ID permintaan, revisi, business lock dan transaksi. Respons yang hilang mengunci draf serta menyediakan retry permintaan sama. Jangan membuat pembayaran baru hanya karena respons pertama tidak diterima.

## Akses dan migrasi

Migrasi tambahan: `supabase/migrations/202611030002_restaurant_reservations.sql`. Pengguna mengonfirmasi penerapan berhasil. Jangan menjalankan ulang migrasi lama. Tidak ada reset atau penghapusan data; transaksi lama mendapat nilai DP nol tanpa perubahan total. Fungsi order/payment lama disalin menjadi helper privat, tidak dapat dieksekusi akun aplikasi. Wrapper menambah validasi reservasi tanpa melewati pemeriksaan menu, meja, harga, role, atau retry yang sudah ada.

Tabel reservasi read-only bagi akun aplikasi; mutasi hanya melalui RPC terautentikasi. Kasir membaca/mengubah reservasi sendiri dan tetap hanya membaca transaksi miliknya. Staf lain hanya memperoleh metadata ketersediaan meja, tanpa nama/kontak/DP. Owner/admin tetap dibatasi tenant. Pengaturan toko, role dan poin tetap owner-only. Akun nonaktif, sandi sementara dan usaha draf mengikuti guard lama.

## Verifikasi

Tes lokal `tests/restaurant-reservations.test.ts` memeriksa WIB, kalender, kapasitas, bentrok, izin, DP/retry/pelunasan, refund dan preservasi transaksi. Suite lokal setelah penambahan fitur: 78 tes lulus. Typecheck dan build produksi webpack lulus sebelum uji browser; perubahan lanjutan harus diverifikasi ulang.

`tests/browser/restaurant-reservations.spec.ts` memakai akun/tenant baru dan membersihkan hanya fixture run tersebut. Mencakup pembuatan UI, respons DP terputus, pelunasan, struk/CSV, refund, tidak hadir, bentrok serentak, role/tenant, persistensi sesi baru serta viewport 320/390/768/1440. Bukti berada di `.cache/restaurant-reservations`, tidak perlu masuk commit. Hasil aktual terakhir dicatat setelah pengujian selesai. Seluruh server QA yang dinyalakan agen wajib dihentikan; server pengguna tidak disentuh.

Design Read: perluasan form/list/modal restoran pada desain Usahaku yang disetujui; Poppins, navy/panel gelap, turquoise, tombol biru, shared shell dan struk kertas dipertahankan. ENERGY 1 / RHYTHM 1 / MOTION 0. Tidak menambahkan gambar, aset atau animasi baru.

## Perbaikan regresi onboarding yang ditemukan

`StaffManagement` memakai nilai default `initialRoles = []` sekaligus effect yang menyalin prop tersebut ke state. Ketika setup restoran tidak meneruskan role, array default baru dibuat pada setiap render dan effect terus memicu pembaruan. Di browser, jam sudah tersimpan tetapi tombol terus menampilkan Menyimpan dan transisi berikutnya tertahan. Default sekarang memakai konstanta array stabil. Setup restoran juga meneruskan role, hitungan anggota dan identitas usaha dari server, sehingga tidak menampilkan nol role akibat prop yang tidak diberikan.

Tes restoran lama disesuaikan dengan navigasi hamburger pada viewport laptop, label alamat yang berlaku, serta menunggu penyimpanan jam di database dan selesainya action sebelum membuka summary. Perubahan ini mempertahankan guard bahwa dashboard baru tersedia setelah Buka dashboard.

## Hasil aktual, 3 November 2026

- Migrasi `202611030002_restaurant_reservations.sql` dikonfirmasi berhasil oleh pengguna; tabel dan kolomnya juga diperiksa baca-saja sebelum QA. Tidak perlu dijalankan ulang.
- Typecheck, build produksi webpack dan 78 tes unit/database lulus. Tes lokal tambahan menegaskan helper lama privat tidak bisa dipanggil authenticated untuk melewati guard reservasi.
- Tujuh kasus browser unik lulus setelah tes ulang: reservasi/DP baru, operasional restoran lengkap dari onboarding, grid meja, alasan error restoran, pagination 5.000+ pesanan, POS toko, dan laporan/CSV/PDF toko. Tes lama diperbarui sesuai UI, dan loop render setup benar-benar diperbaiki; bukan sekadar menghapus pemeriksaan penyimpanan.
- Reservasi aktual menguji DP dengan respons diputus setelah commit lalu retry, satu penjualan/pesanan, sisa tagihan Rp40.000 dari total Rp60.000 dan DP Rp20.000, tunai pelunasan Rp50.000 dengan kembalian Rp10.000, struk dan CSV, refund DP penuh, tidak hadir, satu pemenang dari dua booking serentak, serta akses owner usaha lain/kasir.
- Meja dengan reservasi dalam 90 menit menjadi pudar; pilihan walk-in kasir lain dinonaktifkan tanpa membuka rincian reservasi. Modal/list diperiksa pada 320/390/768/1440 px, tanpa horizontal overflow dokumen. Screenshot desktop dan HP diperiksa; Poppins serta palet tetap mengikuti komponen lama.
- Onboarding kini menyelesaikan penyimpanan jam dan navigasi Summary/Buka dashboard; profil juga persisten pada sesi baru. Regresi pesanan, pembayaran manual, retry, pembatalan penjualan/refund, struk dan laporan restoran lulus. Tidak ada page error pada run yang lulus.
- Akun/tenant uji dibersihkan; hash data usaha lama tetap sama. Server QA port 3221 dihentikan, file generated lokal dipulihkan. Tidak ada commit, push, merge atau deployment oleh agen.

Hard Gate PASS: aksi database/browser dan kondisi gagal/retry diuji, role/tenant dijaga, modal keyboard/Escape serta overflow diuji. Purpose Gate PASS: tambahan terbatas pada navigasi, jadwal, DP dan umpan balik operasional yang diperlukan; tanpa aset/dekorasi baru. Liveliness PASS: hierarki form/list/modal dan desain yang disetujui dipertahankan. Craftsmanship PASS: snapshot visual diperiksa, tes yang gagal ditelusuri hingga penyebabnya, fixture dibersihkan dan server dimatikan.

Yang belum termasuk: booking publik pelanggan, gateway/refund otomatis, cicilan/top-up atau refund DP sebagian, laporan arus kas DP, validasi slot terhadap jam buka, penggabungan meja, bahan baku/resep, dan salon. Hal-hal ini tidak diklaim sudah tersedia oleh halaman baru.
