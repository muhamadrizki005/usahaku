# Pesanan di muka dan penguncian meja

Pembaruan 4 November 2026: validasi reservasi terhadap jam buka, pembayaran terkonfigurasi, pajak/layanan dan laporan DP dijelaskan di [RESTAURANT-COMPLETION.md](RESTAURANT-COMPLETION.md). Catatan batas dan hasil tes di bawah menggambarkan tahap sebelumnya.

Branch: `feat/restaurant-preorders-table-locks`.

## Alur operasional

Reservasi baru kini dapat langsung menyertakan makanan serta DP opsional dalam satu formulir dan satu transaksi. Lihat [RESERVATION-BOOKING-FORM.md](RESERVATION-BOOKING-FORM.md). Jalur tambah/ubah pesanan setelah reservasi dibuat tetap tersedia.

1. Buat reservasi, pilih jadwal dan meja. Sistem memeriksa kapasitas serta jarak antarreservasi.
2. Gunakan **Tambah / ubah pesanan** untuk mencatat makanan sejak reservasi dibuat. Pesanan ini berstatus di muka, belum menempati meja, dan belum boleh dilunasi. DP tetap dapat dicatat sebelum kedatangan.
3. Meja otomatis dikunci untuk pesanan baru sejak waktu penguncian hingga akhir jadwal. Default 120 menit sebelum kedatangan. Owner mengubahnya melalui **Pengaturan > Pengaturan reservasi**, antara 0 dan 720 menit.
4. Staf menekan **Tandai pelanggan datang** setelah pelanggan tiba dan meja kosong. Tindakan ini membuat meja terpakai, sekalipun makanan belum dipesan. Kedatangan dapat dicatat sejak waktu penguncian hingga sebelum reservasi berakhir.
5. Setelah datang, makanan dapat diproses, ditambah, dan dilunasi. DP mengurangi sisa pembayaran; total penjualan dicatat sekali.
6. Setelah pembayaran atau pembatalan, meja dilepas. Terlambat 15 menit tidak membatalkan reservasi otomatis. Staf menandai tidak hadir; DP harus direfund penuh secara manual oleh owner/admin bila dibatalkan.

## Aturan waktu

- Semua tampilan jadwal memakai WIB; penyimpanan memakai `timestamptz`.
- Rentang alokasi meja adalah `[kedatangan - buffer, akhir)`. Batas awal termasuk, batas akhir tidak termasuk. Dengan buffer 120 menit, reservasi 19.00–20.30 mengalokasikan meja 17.00–20.30.
- Rentang alokasi dua reservasi baru/yang dipindah tidak boleh bertumpuk. Reservasi sebelumnya boleh berakhir tepat pada awal alokasi berikutnya.
- Pesanan tanpa reservasi baru boleh memakai meja sebelum penguncian dimulai. Saat batas tercapai, database menolak pesanan baru walaupun halaman belum diperbarui.
- Pesanan pelanggan sebelumnya tetap dapat diubah dan dibayar setelah penguncian dimulai. Tidak ada pembatalan paksa. Kedatangan berikutnya ditolak selama meja masih terpakai.
- Untuk membuat reservasi baru ketika meja sedang terpakai, awal alokasinya harus setidaknya 90 menit dari sekarang. Ini perkiraan waktu penyelesaian pelanggan aktif, bukan penambahan 90 menit pada penguncian pesanan walk-in.
- Perubahan buffer berlaku pada penguncian dan pemeriksaan jadwal berikutnya, tanpa menghapus atau membatalkan reservasi lama. Sistem melaporkan jumlah pasangan jadwal aktif yang menjadi tumpang tindih. Owner/staf perlu mengatur ulang bersama pelanggan. Perubahan catatan/kontak pada slot lama yang sama tetap diizinkan; pindah jadwal/meja diperiksa ulang.
- Tidak ada cron yang mengubah status karena waktu. Penguncian dihitung saat membaca dan menyimpan. Halaman meja/POS memperbarui status pada batas terdekat, maksimal interval 30 detik, serta saat tab aktif kembali. Jika tab tidur/offline, database tetap menjadi pemeriksa terakhir.

## Akses dan data

- Owner: pengaturan buffer dan seluruh reservasi/pesanan usahanya.
- Admin: seluruh reservasi/pesanan usahanya; tidak boleh mengubah buffer.
- Kasir: reservasi/pesanan miliknya sendiri. Status meja usaha boleh dibaca tanpa nama/kontak/nilai pesanan petugas lain.
- Pelunasan tidak boleh mengakali status kedatangan dari formulir. Database memeriksa status reservasi dan `occupies_table`.
- Revisi, kunci transaksi per usaha, dan request ID menjaga simpan/kedatangan/pembayaran dari tab paralel serta retry. Memindahkan meja/nama/tamu reservasi menyelaraskan header pesanan di muka dan menaikkan revisinya tanpa mengubah makanan atau harganya.
- Tidak ada perubahan otomatis pada nilai transaksi lama. Pesanan lama diberi `occupies_table=true`; status reservasi dan penjualan lama dipertahankan.

## Migrasi

Jalankan hanya `supabase/migrations/202611030003_restaurant_preorders_table_locks.sql` setelah migrasi sebelumnya. Pengguna mengonfirmasi berhasil pada 3 November 2026. File tersebut dibekukan setelah disampaikan untuk dijalankan.

Migrasi menambah kolom buffer/revisi pada usaha dan `occupies_table` pada pesanan, mengganti indeks unik agar hanya satu pesanan fisik terbuka per meja, dan memperbarui fungsi pemeriksaan/simpan/baca. Seluruh file dibungkus transaksi. Tidak ada reset, penghapusan data, atau pembatalan reservasi lama.

## Arah UI

Memakai panel, formulir, modal, kalender, Poppins, dan palet yang sudah disetujui. Tidak menambah dekorasi, animasi, atau memindahkan navigasi. ENERGY 1 / RHYTHM 1 / MOTION 0 mengikuti formulir operasional yang ada. Aksen turquoise dipakai untuk status dan fokus; biru untuk tindakan utama. Tabel tetap dapat digulir di dalam kontainernya pada ponsel.

## Verifikasi

- Typecheck dan build produksi Next.js webpack pada snapshot kode akhir lulus.
- Seluruh 82 tes unit/PostgreSQL lokal lulus. Termasuk migrasi dari data lama: seluruh nilai penjualan, pesanan (selain kolom baru), dan status reservasi dibandingkan sebelum–sesudah, tanpa perubahan. Pengujian buffer, slot lama yang bertumpuk, metadata pesanan/revisi, retry, helper privat, role, serta antarusaha lulus.
- Dua skenario browser aktual pada build akhir lulus: pesanan di muka/penguncian/pengaturan, dan regresi reservasi/DP/pelunasan/refund/tidak hadir. Edge memakai akun/usaha baru di Supabase aktual. Buffer tetap tersimpan setelah reload dan login baru, admin/kasir/owner usaha lain ditolak saat mengubah buffer, dan kasir lain ditolak saat mencatat kedatangan.
- Pesanan pelanggan lama berhasil diubah dan dibayar setelah penguncian; kedatangan ditolak selama meja masih terpakai. Pesanan di muka tidak dapat dibayar, kemudian menjadi pesanan fisik setelah kedatangan. Dua kedatangan serentak menghasilkan satu pemenang. Meja tanpa makanan juga menjadi terpakai setelah kedatangan.
- Perubahan otomatis dari meja tersedia menjadi terkunci diuji melewati batas waktunya tanpa reload manual. Tampilan dan modal diuji pada 320/390/768/1440 px, termasuk Escape dan batas viewport; screenshot HP/desktop diperiksa. Tidak ada page error pada run yang lulus.
- Regresi DP menguji respons terputus setelah commit lalu retry, total Rp60.000, DP Rp20.000, sisa Rp40.000, pelunasan tunai Rp50.000, kembalian Rp10.000, struk/CSV, refund penuh, tidak hadir dan bentrok reservasi paralel.
- Fixture kedua run dibersihkan dan hash seluruh data usaha lama tetap sama. Server QA yang dimulai agen pada port 3221 dihentikan; server pengguna tidak disentuh. Tidak ada commit, push, merge atau deployment oleh agen.

Screenshot dan hasil mesin disimpan di `.cache/restaurant-preorders/` serta `.cache/restaurant-reservations/browser/`, tidak perlu masuk commit.

Hard Gate PASS: penyimpanan dan penolakan aktual diuji, tidak ada overflow dokumen pada viewport uji, modal keyboard berfungsi, data bersumber dari database, dan tidak ada aset/klaim pemasaran baru. Purpose Gate PASS: komponen serta palet diwarisi dari desain yang disetujui; tidak ada dekorasi baru. Liveliness PASS: hierarki form/list/modal dan fokus tindakan operasional dipertahankan. Craftsmanship PASS: hasil simpan/reload/sesi baru, batas waktu, race, akses, screenshot dan preservasi data diperiksa.

## Batas tahap ini

Booking publik, gateway/refund otomatis, cicilan/top-up DP, refund sebagian, penggabungan meja, validasi jadwal terhadap jam buka, bahan baku/resep, serta salon belum termasuk. Tidak ada pembatalan otomatis ketika terlambat atau ketika owner memperbesar buffer. Konflik jadwal lama tetap perlu ditangani staf bersama pelanggan.
