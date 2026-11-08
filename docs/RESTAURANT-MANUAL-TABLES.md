# Pelepasan meja manual

Pembayaran dan pemakaian meja adalah dua keadaan terpisah. Pesanan makan di tempat dengan meja tetap mengunci meja selama belum lunas. Saat pembayaran berhasil, database menyimpan `occupied_until_released=true`; meja tetap tidak dapat dipakai pesanan baru sampai pegawai memilih **Tersedia** setelah pelanggan pergi. Pembayaran tanpa meja dan bawa pulang tidak menahan meja.

Owner, admin, dan kasir dapat memilih Tersedia/Tidak tersedia melalui halaman Meja. Kasir tidak dapat menambah, mengedit identitas/kapasitas, mengaktifkan meja yang dinonaktifkan pengelola, atau menghapus meja. Perubahan ketersediaan dicatat dalam audit dan memakai pemeriksaan revisi serta ID permintaan. Retry permintaan lama mengembalikan hasil lama tanpa menimpa status yang diubah pegawai lain. Akses antarusaha dan staf nonaktif ditolak di database; bukan hanya disembunyikan pada UI.

Pilihan manual Tidak tersedia juga dapat dipakai sebelum ada pesanan, misalnya saat meja belum siap. Pesanan yang sudah menggunakan meja tetap bisa diedit dan dibayar. Setelah dibayar, perubahan/refund transaksi tidak membebaskan meja. Pembatalan pesanan yang belum dibayar tetap mengikuti perilaku sebelumnya; jika pegawai telah menandainya tidak tersedia secara manual, tanda itu tetap berlaku.

Pesanan belum lunas mencegah pelepasan meja. Reservasi yang pelanggannya sudah datang juga mencegah pelepasan sampai pelayanan diselesaikan/dipindahkan. Untuk reservasi yang belum datang dan telah memasuki waktu penguncian, pegawai boleh melepas pemakaian pelanggan sebelumnya; **kunci reservasinya tetap berlaku**, sehingga meja tetap berstatus reservasi dan pesanan pelanggan lain tetap ditolak. Kedatangan reservasi berikutnya memeriksa bahwa pemakaian sebelumnya sudah dilepas. Pemeriksaan jam buka, kapasitas, buffer reservasi, dan pembatasan transaksi kasir tetap berlaku.

Meja yang dinonaktifkan pengelola memakai flag `active` yang terpisah. Owner/admin dapat mengaktifkannya melalui Edit meja. Dropdown pada kotak dashboard mengatur pemakaian fisik, bukan izin pengelolaan. Saat onboarding belum selesai, kontrol yang sama tetap memakai layanan konfigurasi meja owner yang sudah ada (`active`), bukan membuka akses operasional sebelum onboarding selesai. Teks status dan indikator hijau/merah tetap digunakan bersama; pembayaran dan penyimpanan gagal tidak ditampilkan sebagai berhasil.

## Migrasi

Jalankan seluruh file, berurutan, masing-masing sekali:

1. `supabase/migrations/202611080002_restaurant_manual_table_release.sql`
2. `supabase/migrations/202611080003_restaurant_reserved_table_release.sql`

002 menambahkan flag, RPC ketersediaan, trigger penahanan meja setelah pembayaran, dan pemeriksaan pada pesanan/reservasi. 003 memperbolehkan pelepasan pemakaian sebelumnya saat reservasi mendatang terkunci, tanpa membuka kunci reservasi. 002 telah diberikan untuk dijalankan sebelum kasus ini ditemukan; 003 disediakan terpisah agar instalasi yang sudah menjalankan 002 tidak perlu mengulangnya.

Tidak melakukan backfill pemakaian berdasarkan transaksi lama: tidak dapat disimpulkan apakah pelanggan lama masih duduk. Kolom baru default false, nilai transaksi dan revisi meja lama dipertahankan. Setelah instalasi, pegawai dapat menandai meja yang masih terpakai secara manual. Tidak mereset atau menghapus data. Setiap file atomik dan patch fungsi memeriksa anchor yang diharapkan sebelum mengganti implementasi.

## Verifikasi

Tes PostgreSQL lokal `tests/restaurant-manual-tables.test.ts` mencakup pembayaran dan retry tanpa pelepasan otomatis, penolakan pesanan baru, penyuntingan pesanan aktif, pelepasan owner/admin/kasir, konflik revisi, replay, staf nonaktif, isolasi usaha, larangan mutasi tabel langsung, serta pelepasan pemakaian lama tanpa membuka kunci reservasi. Nilai transaksi setelah pelepasan tetap sama.

Typecheck dan build produksi lulus. Suite unit penuh dijalankan dengan concurrency 2: 99/100 lulus; satu kegagalan `salon-operations.test.ts` berasal dari fixture slot/jeda yang melewati jam 23:59 dan regex `/slot/` yang tidak cocok dengan pesan berawalan `Slot`. Tes tersebut hanya memasang migrasi hingga 202611070003, sehingga tidak memuat migrasi meja ini. Kode/tes salon tidak diubah. Sepuluh tes restoran/izin terkait dijalankan ulang dan semuanya lulus, termasuk preservasi data sebelum migrasi serta rollback pembayaran gagal. Empat pengujian browser pada Supabase aktual lulus: `restaurant-table-availability.spec.ts`, `restaurant-pos-members.spec.ts`, `reservation-booking.spec.ts`, dan `restaurant-completion.spec.ts`. Uji meja final mencakup konfigurasi draft sebelum onboarding selesai, perubahan status, pembayaran/retry yang tetap menahan meja, pelepasan oleh kasir, reload/login baru, penolakan mutasi kapasitas oleh kasir dan akses transaksi orang lain, kunci reservasi setelah pemakaian lama dilepas, serta alignment/overflow pada 320/390/768/1440/1920px. Regresi POS/member memverifikasi isolasi antarusaha dan snapshot data lama tidak berubah. Tidak ada page error; fixture dibersihkan. Permintaan AI pada regresi mengembalikan 502 dan ditampilkan sebagai error, tanpa mengklaim layanan Gemini selalu berhasil. Migrasi 002?003 telah dikonfirmasi pengguna; perilakunya diverifikasi lewat tes aktual tersebut. Server QA port 3221 dimatikan setelah selesai; server pengguna tidak dihentikan. Fixture memakai akun/usaha baru, dibersihkan hanya berdasarkan ID run tersebut. Bukti QA berada di `.cache/restaurant-table-availability/`, bukan untuk commit.

## Pemeriksaan desain

Arah tetap memakai panel, Poppins dan layout yang telah disetujui (ENERGY 1 / RHYTHM 1 / MOTION 1). Hard-Gate PASS: tanpa aset/dekorasi baru atau perubahan palet/layout yang tidak diminta. Purpose-Gate PASS: status manual memisahkan pembayaran dari pemakaian meja; ikon tetap berlabel aksesibel, status memakai teks dan warna. Quality Locks PASS: kontrol 44px, inset 12px dan celah 8px dipertahankan; dropdown menunggu sinkronisasi revisi agar tidak memakai data lama. Pemisahan layanan draft menjaga guard onboarding.
