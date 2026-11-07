# Operasional inti salon

Branch: `feat/salon-operations`, berdasarkan `main` `51aff62`. Tidak ada commit, push, merge, atau deployment oleh agent.

## Cakupan

- Janji temu dan walk-in: beberapa layanan (maksimal 20), satu penata per kunjungan, durasi total maksimal 720 menit.
- Kalender harian per penata dan daftar kunjungan dengan pagination 50 baris. Waktu WIB (`Asia/Jakarta`). Filter tanggal langsung memuat data; kalender menampilkan slot sibuk termasuk jeda persiapan.
- Pelanggan dapat dipilih dari profil aktif atau dicatat sebagai tamu. Profil pelanggan dibuat/dikelola lewat Pelanggan; pencatatan tamu tidak membuat profil otomatis atau menggabungkan riwayat berdasarkan nama/telepon.
- Alur: dijadwalkan → menunggu → sedang dilayani → selesai. Walk-in langsung menunggu. Status pelayanan terpisah dari pembayaran.
- Perubahan jadwal/layanan hanya sebelum pelayanan dimulai. Nama, harga, durasi, penata dan pelanggan disimpan sebagai snapshot; perubahan katalog tidak menghitung ulang kunjungan yang sudah selesai/dibayar.
- DP opsional, satu pencatatan DP per kunjungan, nominal rupiah bulat >0 hingga subtotal layanan. Dapat disimpan atomik bersama booking atau dicatat melalui tindakan DP. Belum mendukung cicilan/top-up DP berulang.
- Pelunasan setelah pelayanan selesai. Mendukung tunai dan konfirmasi manual QRIS/transfer/e-wallet sesuai metode aktif usaha. Tidak ada payment gateway atau refund otomatis.
- Diskon kunjungan persen/rupiah oleh owner/admin, kemudian pajak. Pajak default 0%, diatur owner. DP mengurangi sisa tagihan, tidak mengurangi omzet dua kali.
- Struk memakai layout dan nomor transaksi bersama. Riwayat transaksi, laporan penjualan/CSV/PDF dan riwayat kunjungan pelanggan memakai layanan backend yang sudah ada.
- Ringkasan salon menampilkan jumlah layanan/penata serta kunjungan dan pendapatan harian. Laporan tambahan menampilkan status kunjungan, DP masuk/refund sebelum pelunasan dan jumlah/pendapatan kunjungan per penata.

Belum termasuk komisi, pengingat otomatis, membership/paket, stok bahan, penjualan retail salon, multi-penata dalam satu kunjungan, resource kursi/ruangan dan booking publik.

## Jadwal, kedatangan, keterlambatan

Slot harus tercakup oleh irisan jam usaha dan jadwal kerja penata; penata harus aktif dan memiliki semua keahlian layanan terpilih. Jadwal kosong berarti penata belum dapat menerima booking. Jam lintas tengah malam memakai aturan fondasi: jam tutup yang lebih kecil dari buka berarti hari berikutnya; jam sama tidak berarti 24 jam.

Waktu mulai booking baru dari sekarang (toleransi pengisian 5 menit) hingga 366 hari ke depan. Walk-in mencatat kedatangan saat input, tetapi estimasi mulai dapat dipilih pada slot kosong dalam 24 jam sehingga pelanggan dapat menunggu penata yang sedang melayani. Penata tidak boleh memulai dua pelayanan sekaligus. Jenis kunjungan ditetapkan saat pembuatan; edit mempertahankan jenis tersebut.

Owner dapat mengatur jeda persiapan 0–120 menit, default 0. Booking menyimpan jedanya sendiri; perubahan pengaturan tidak membatalkan atau menggeser booking lama. Saat selesai, persiapan dihitung dari waktu selesai aktual. Dengan jeda 10 menit, menandai selesai lebih awal tetap memblokir penata selama 10 menit berikutnya. Tanpa jeda, penata dapat menerima kunjungan berikutnya setelah selesai. Perubahan jadwal/layanan memeriksa ulang ketersediaan; saat semua slot/snapshot tetap sama, jeda yang tersimpan dipertahankan.

Check-in dapat dicatat sebelum jam janji temu, tetapi mulai pelayanan harus dalam slot jadwal. Jika pelanggan ingin dilayani lebih awal atau datang setelah slot berakhir, jadwalkan ulang dahulu. Penata yang masih berstatus sedang melayani tidak dapat memulai pelanggan lain, termasuk bila layanan sebelumnya melewati estimasi akhir. Tidak ada pembatalan atau penyelesaian otomatis.

Tidak hadir hanya dapat ditandai setelah terlambat 15 menit dan belum check-in. Pembatalan tanpa DP dapat dilakukan pengelola kunjungan. Dengan DP, owner/admin wajib mengonfirmasi refund penuh secara manual. Pembatalan transaksi yang sudah dibayar dilakukan melalui Detail transaksi, dengan alasan dan konfirmasi refund penuh; riwayat pelayanan tetap ada.

## Akses dan integritas

- Owner/admin mengelola semua kunjungan. Kasir membuat dan mengelola kunjungannya sendiri serta melihat transaksi miliknya sendiri.
- Kalender kasir memperoleh hanya ID penata, awal/akhir slot dan penanda sedang melayani untuk slot orang lain; tidak ada nama pelanggan, catatan, telepon, ID kunjungan atau nominal petugas lain.
- Owner saja mengubah profil, jam usaha, metode pembayaran, pajak dan jeda persiapan. Owner/admin mengelola layanan, penata, jadwal kerja penata dan profil/riwayat lengkap pelanggan.
- Semua mutasi memeriksa kategori, keanggotaan aktif, kewajiban ganti sandi, role, usaha dan penyelesaian onboarding di database. Tabel kunjungan memakai RLS tanpa hak tulis langsung authenticated. Foreign key gabungan mempertahankan isolasi penata, pelanggan dan transaksi antarusaha.
- Kunci per usaha menyerialkan perubahan jadwal dan pembayaran. Revisi menolak tab lama. Request ID mengikat actor, isi, tindakan dan revisi; respons terputus dapat diulang tanpa booking, DP, pembayaran atau audit ganda.
- Snapshot layanan dipakai sebagai dasar tagihan. Persentase dibulatkan setengah naik ke rupiah menggunakan aritmetika integer pada preview dan numeric pada database. Pelunasan memeriksa revisi pajak/metode pembayaran, nominal, DP serta diskon lagi di server.
- Respons penyimpanan yang belum pasti mengunci field dan menyediakan retry paket yang sama. Tidak ada klaim berhasil jika penyimpanan gagal.

Loyalty toko tidak diaktifkan untuk salon pada tahap ini; transaksi salon tidak menghasilkan atau menukar poin. Profil pelanggan/struk yang sudah memiliki dukungan kolom poin tidak menggantikan aturan tersebut.

## Laporan

Penjualan mengikuti tanggal pelunasan. DP yang belum dilunasi tidak dihitung sebagai penjualan. Transaksi batal dikeluarkan dari periode asal; refund transaksi dilaporkan pada tanggal refund tanpa pengurangan ganda. Refund DP sebelum pelunasan terpisah dari refund transaksi berbayar. Tidak ada klaim laba karena biaya/HPP belum tersedia.

Filter metode pada laporan keuangan mengikuti metode pelunasan. Ringkasan kunjungan/DP/per-penata tambahan memakai tanggal saja, semua metode, dan ditampilkan dengan penjelasan sendiri; tidak ikut filter metode keuangan. Ekspor CSV/PDF yang sudah ada berisi laporan keuangan, belum mengekspor tabel tambahan kunjungan/per-penata. Riwayat pelanggan memuat kunjungan per tahun, 50 baris per halaman, termasuk yang belum dibayar.

## Migrasi

Jalankan berurutan, masing-masing sekali, di SQL Editor Supabase:

1. `supabase/migrations/202611070001_salon_operations.sql`: tabel pengaturan/kunjungan, RLS, operasi atomik, pembacaan berhalaman, laporan dan refund; memperluas guard kategori fungsi pelanggan/laporan/QR yang tersedia untuk salon.
2. `supabase/migrations/202611070002_salon_preparation_slots.sql`: mempertahankan blok persiapan sesudah selesai dan menjaga jenis kunjungan saat edit.

3. `supabase/migrations/202611070003_salon_walkin_queue.sql`: walk-in dapat menunggu slot kosong berikutnya dalam 24 jam, tanpa melonggarkan bentrok atau aturan mulai pelayanan.

Ketiga file dibungkus transaksi. Tidak mereset database, menghapus data demo, mengubah nilai transaksi lama atau menjalankan ulang migrasi fondasi. Patch kategori menolak body fungsi yang tidak dikenal, alih-alih mengganti logika keuangan secara diam-diam. Preflight REST aktual memeriksa keberadaan kolom bisnis, layanan/penata, metode pembayaran dan rincian transaksi; katalog SQL remote/riwayat migrasi CLI tidak diinspeksi langsung.

## Pengujian dan keterbatasan verifikasi

Hasil pengujian 7 November 2026:

- Tes PostgreSQL lokal lulus untuk layanan gabungan, bentrok/jeda, edit/revisi, retry, rollback booking+DP invalid, pelunasan, pajak/diskon, struk, refund, role/kasir/antarusaha, sesi nonaktif dan lintas tengah malam. Usaha toko yang sudah ada tetap sama setelah migrasi.
- Seluruh 91 unit test lulus pada run akhir, termasuk pricing/validasi dan PostgreSQL lokal; typecheck dan build produksi webpack lulus. Tes salon mencakup pembacaan lebih dari 1.000 kunjungan dan preservasi nilai transaksi serta pergerakan stok toko yang sudah ada.
- Tes visual fixture lokal lulus pada 320/390/768/1440 px: kalender/dialog, dropdown layanan/penata, keyboard Escape, overflow dan preview pembayaran. Fixture bukan bukti penyimpanan di Supabase. Screenshot diperiksa di `.cache/salon-operations/visual/`.
- Pengguna mengonfirmasi ketiga migrasi berhasil. Preflight REST aktual kemudian berhasil membaca tabel `salon_visits`.
- Tes E2E aktual `tests/browser/salon-operations.spec.ts` lulus: login owner/admin/dua kasir, pengaturan dan persistensi setelah login baru, pemilihan pelanggan tersimpan, layanan gabungan + DP atomik, penolakan bentrok, antrean walk-in, mulai/selesai, jeda persiapan aktual, pelunasan cash/e-wallet, diskon/pajak/DP, retry setelah respons pembayaran sengaja diputus, struk, riwayat pelanggan, laporan/CSV, perebutan slot serentak, refund transaksi dan pencabutan akses. Tidak ditemukan page error.
- Run E2E tambahan juga lulus untuk edit nama/catatan kunjungan dan persistensi setelah reload, jenis kunjungan yang tetap terkunci saat edit, pencatatan DP transfer terpisah, serta pembatalan dan refund DP penuh oleh admin. Perubahan jadwal, tidak hadir, dan batas jam diuji lebih rinci di PostgreSQL lokal.
- Tes menggunakan akun serta usaha baru; cleanup hanya menghapus fixture run tersebut. Hash data usaha yang sudah ada sebelum run tetap sama sesudah cleanup. Bukti lokal di `.cache/salon-operations/browser/results.json` dan screenshot booking pada 320/390/768/1440 px.
- Regresi laporan toko lulus pada Supabase aktual. Regresi restoran lulus setelah endpoint gambar QRIS diperbaiki: admin fallback kini hanya dijalankan setelah pemeriksaan keanggotaan usaha, status akses dan hak baca. Sebelumnya update upstream memungkinkan owner usaha lain memperoleh gambar melalui fallback tersebut. Tidak ada perubahan data/gambar lama.
- Selector status sukses pada tes diskon toko disesuaikan karena update upstream menambahkan toast dengan `role="status"` selain pesan inline. Regresi diskon/keranjang toko lulus setelah kedua assertion sukses diperjelas; tidak mengubah perilaku checkout.

Tes visual tambahan memakai `tests/fixtures/salon-preview-page.tsx` yang hanya disalin ke `app/preview/salon-qa/page.tsx` pada snapshot `.cache/salon-operations/build`; route fixture tidak ditambahkan ke aplikasi utama dan tidak mengirim mutasi database. Jalankan dengan `TEST_BASE_URL` yang mengarah ke server snapshot. Jangan commit cache, environment, screenshot, PDF, data wilayah mentah atau file generated Next.

## Pemeriksaan desain

Design read: operasional harian salon dalam dashboard yang sudah disetujui; ENERGY 1 / RHYTHM 1 / MOTION 1. Memakai shell, panel, tabel, font Poppins, warna navy/turquoise/biru, date picker, dropdown, pesan validasi dan modal yang sudah ada. Tidak ada redesign atau animasi baru.

Visual/identitas dipertahankan; kalender mengelompokkan slot per penata, formulir mengelompokkan pelanggan, layanan, jadwal dan DP. Kontrol tersedia melalui keyboard; dialog panjang dapat discroll pada ponsel. Akses dan persistensi telah diuji pada Supabase aktual; tidak ada commit, push, atau merge oleh agent.

Kontras dihitung memakai rumus WCAG: teks `#C5CBD5` pada panel `#273242` 7,94:1; turquoise pada panel 6,43:1; putih pada tombol biru 8,24:1. Pengujian HP memakai emulasi viewport Chromium, belum perangkat fisik/Safari. Belum ada pengujian beban produksi atau pembayaran gateway; seluruh konfirmasi/refund tetap manual.

Delivery Gate untuk perubahan salon:

- **Hard Gate PASS:** build/typecheck dan 91 unit test lulus; E2E aktual menguji penyimpanan, retry dan akses; visual 320/390/768/1440 tanpa overflow halaman, popup kalender tetap dalam viewport, Escape menutup popup sebelum modal; status kosong/loading/error tersedia; kontras terukur di atas AA. Tidak menambah aset, testimonial atau klaim angka pemasaran.
- **Purpose-Gate PASS:** shell/ambient/font/warna memakai desain pengguna; kalender mengelompokkan kapasitas penata, panel pembayaran memisahkan subtotal/diskon/pajak/DP. Tidak menambah dekorasi atau animasi.
- **Liveliness PASS:** ENERGY 1 / RHYTHM 1 / MOTION 1; fokus tiap layar pada kalender dan tindakan kunjungan; aksen turquoise dan primary biru mengikuti identitas serta hierarki dashboard yang disetujui.
- **Craftsmanship & Quality Locks PASS:** komponen modal/field/picker/shared shell dipakai ulang; keyboard, error bentrok, responsive, nominal aktual, persistensi dan pembatasan kasir diuji. Data demo/lama diverifikasi tetap utuh. Fitur di luar cakupan dicatat di atas.

Server QA agent sudah dihentikan setelah pengujian; server pengguna tidak disentuh. Cache, screenshot dan data fixture tidak diperlukan dalam commit.
