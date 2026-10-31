# Restoran / Cafe

## Perbaikan audit pembacaan riwayat dan pembayaran

Audit 31 Oktober menemukan: lebih dari 5.000 pesanan membuat Ringkasan/Pesanan & kasir error, halaman kedua kosong setelah hasil menyusut menjadi satu halaman, dan nominal berisi huruf menghasilkan RpNaN. Ketiganya ditangani tanpa perubahan palet atau tata letak.

Migrasi tambahan `202610310004_restaurant_paged_reads.sql` menambah dua fungsi baca dan indeks histori per status. Pengguna sudah mengonfirmasi pemasangannya. Tidak mengubah data/migrasi lama atau fungsi mutasi pesanan/pembayaran.

- `read_restaurant_orders_page`: filter status, pencarian literal nama/kode/pelanggan/petugas dan pagination 25 baris dijalankan di database. Urutan created_at dan UUID menurun stabil; halaman dikoreksi ke halaman terakhir ketika jumlah hasil menyusut, termasuk akibat pembayaran/pembatalan. Total dan isi halaman memakai snapshot fungsi STABLE yang sama.
- `read_restaurant_overview`: database menghitung omzet/transaksi hari ini dalam WIB, jumlah pesanan terbuka, meja terpakai, menu tersedia dan meja aktif. Browser menerima hanya 10 pesanan terbuka terbaru, bukan seluruh riwayat atau seluruh penjualan.
- Keduanya SECURITY INVOKER, memakai RLS tabel yang sudah ada, memeriksa akses restoran/draf/role, dan hanya dapat dieksekusi authenticated. Ringkasan tetap owner/admin; kasir tetap hanya menerima pesanan yang diizinkan policy histori lamanya. Total hasil tidak membocorkan jumlah pesanan petugas lain.
- `loadRestaurantOrders` memvalidasi filter di server dan mengambil tenant dari sesi, tanpa menerima business_id dari browser. Respons lama ketika pengguna mengganti filter diabaikan; kegagalan baca menampilkan error dan tombol coba ulang. Tombol tindakan baris dinonaktifkan selama pembacaan/pembaruan agar tidak bertindak pada hasil filter yang belum selesai.
- Input tunai harus berupa rupiah bulat 0 sampai 999999999999 tanpa pemisah. Teks/eksponen/desimal/negatif/nominal berlebih tidak dihitung menjadi kembalian, menampilkan kesalahan dan menonaktifkan pembayaran. Server tetap memvalidasi pembayaran, kekurangan uang dan konfirmasi manual seperti sebelumnya.

Tes lokal `restaurant-reads.test.ts` memakai 5.028 pesanan, status/search literal termasuk %,(), halaman batas dan clamp, RLS kasir/antarusaha/admin/deactivation/anon serta batas hari WIB. Jumlah suite unit/SQL sekarang 44 tes. `restaurant-pagination.spec.ts` menjadi regresi browser untuk ketiga temuan, pencarian, error/retry serta riwayat panjang. Bukti runtime terbaru berada di `.cache/restaurant-read-fixes/`; jangan commit data fixture atau screenshot pengujian tersebut.

Hasil aktual setelah migrasi 004 terpasang: typecheck/build dan 44 tes unit/SQL lulus. Tiga suite browser lama lulus (error 31,1 detik, meja 29 detik, operasional lengkap 1,1 menit). Suite pagination baru lulus 50,7 detik setelah selector alert tes dibatasi ke panel aplikasi agar tidak tertukar dengan route announcer Next.js. Riwayat aktual 5.028 pesanan tetap menghasilkan halaman normal dan total akurat; pencarian literal, halaman akhir, error koneksi/coba ulang serta penolakan ringkasan untuk kasir terverifikasi. Pembatalan halaman terakhir kembali menampilkan 25 baris, koreksi uang tunai menghasilkan satu pembayaran dan kembalian Rp5.000. Tidak ada page error, cleanup selesai dan hash data lama identik.

Design Read perubahan ini: perbaikan alur operasional dalam visual Usahaku yang disetujui, ENERGY 1 / RHYTHM 1 / MOTION 0.

- Hard Gate PASS: build/tes dan klik browser aktual lulus; filter, error/retry dan invalid cash memiliki feedback; screenshot validasi di HP 390px diperiksa tanpa overflow. Role/tenant, transaksi, struk dan laporan tetap lulus.
- Purpose Gate PASS: tidak menambah aset, warna, gradient, ikon atau animasi; fieldset menahan tindakan saat data sedang dimuat dan error nominal muncul di modal pembayaran yang sudah ada.
- Liveliness PASS: fokus tabel pesanan dan pembayaran, hierarki panel/tombol serta identitas Poppins/navy/turquoise tetap dipertahankan.
- Craftsmanship PASS: tiga kasus audit direproduksi sebagai regresi yang kini lulus; bukti hasil dan screenshot tersedia di cache, data demo tidak diubah, dan file generated lokal dipertahankan.

## Meja terpakai: pudar dan tidak menerima pesanan baru

Pada 31 Oktober pengguna meminta kotak meja yang sudah dipesan menjadi pudar dan tidak menerima pesanan lain. Kotak memakai opacity 60%, tetap hanya menampilkan nama, dan tetap membuka detail untuk pemeriksaan/pengelolaan. Keterangan di bawah grid serta accessible description menjelaskan bahwa meja pudar tidak tersedia untuk pesanan baru. Pilihan meja terpakai pada formulir pesanan baru tetap disabled; meja milik pesanan yang sedang diedit tetap dapat dipakai oleh pesanan tersebut. Meja dilepas setelah pesanan dibayar atau dibatalkan. Ini pesanan aktif, bukan fitur reservasi/DP.

Tidak ada migrasi tambahan. Unique index satu pesanan terbuka per meja serta validasi/lock server yang sudah ada tetap menolak benturan dari tab/petugas lain. Formulir yang sudah terbuka sebelum meja diambil petugas lain tetap ditolak server dengan pesan meja terpakai. Tindakan pesanan dinonaktifkan sebentar selama daftar diperbarui setelah simpan agar klik lanjutan tidak memakai revisi lama.

Verifikasi aktual: typecheck, build, 42 tes unit/SQL lulus. Browser Supabase: suite error lulus (31,5 detik); suite meja diperluas lulus (31,1 detik), mencakup opacity sesudah save/reload, disabled untuk pesanan baru, edit pesanan lama, pembatalan, pembayaran, dan meja kembali tersedia. Viewport 320/390/768/1366, keyboard/dialog, nama panjang dan menu tabel tetap lulus; pageErrors kosong, akun uji dibersihkan, hash data lama identik. Bukti `.cache/restaurant-tables/results.json` dan `occupied-mobile.png`, bukan untuk commit. Kendala jaringan sandbox diselesaikan dengan akses jaringan bagi server dan runner QA; server QA telah dihentikan. `next-env.d.ts` lokal dikembalikan byte persis ke kondisi sebelum tes.

Design Read: perubahan state operasional pada desain Usahaku yang disetujui, ENERGY 1 / RHYTHM 1 / MOTION 0. Pudar menunjukkan ketidaktersediaan; detail tetap terbaca dan dapat dioperasikan.

- Hard Gate PASS: browser klik/edit/batal/bayar dan keyboard lulus; tanpa overflow pada empat viewport; teks meja pudar memiliki kontras komposit 6,53:1; empty/error/pending yang ada dipertahankan.
- Purpose Gate PASS: opacity hanya untuk status terpakai sesuai permintaan; tidak menambah aset, dekorasi, animasi atau palet baru.
- Liveliness PASS: grid nama meja, tombol utama biru, panel/navy dan hierarki yang disetujui dipertahankan; tidak menambah gerakan.
- Craftsmanship PASS: screenshot HP diperiksa; perlindungan pesanan ganda diuji pada SQL dan browser stale-tab; data demo tidak berubah dan server QA dihentikan.

Branch kerja: `feat/restaurant-operations`, dibuat dari `main` pada 31 Oktober 2026. Pengguna meminta implementasi kategori restoran dengan mempertahankan desain yang sudah ada. Tidak ada commit, push, merge, deployment, reset database atau perubahan data demo oleh agent.

## Status pengerjaan

Operasional inti restoran sudah dihubungkan dan diuji melalui website serta Supabase aktual. Pilihan Restoran / Cafe aktif pada onboarding. Data kategori diambil dari database setelah usaha dibuat; query URL tidak mengganti kategori usaha atau otorisasi. Usaha yang sudah terbentuk tidak dikonversi antar kategori lewat formulir. Barbershop tetap belum diaktifkan.

- `lib/business-categories.ts`: pemetaan eksplisit `store` / `restaurant` ke slug onboarding `toko` / `restoran`. Kategori yang belum didukung ditolak, bukan diam-diam dibuat menjadi toko.
- `202610310001_restaurant_foundation.sql`: memperluas constraint kategori, menambah RPC pembuatan profil berkategori, menu, meja, audit dan receipt idempotensi. RPC lama untuk toko tetap tersedia tanpa perubahan signature.
- Profil restoran memakai layanan profil, logo privat, jam operasional dan guard penyelesaian onboarding yang sudah ada. Membuat profil bukan berarti onboarding selesai.
- Menu dan meja dipisahkan dari katalog/stok toko. Perubahan harga menu dan penjualan restoran tidak mengubah inventori toko. Menu memiliki status aktif/nonaktif dan tersedia/habis yang terpisah.
- Owner/admin dapat mengelola resource setelah onboarding; saat draf hanya owner. Kasir tidak dapat menulis menu/meja. RLS memisahkan usaha dan membatasi menu nonaktif/audit. Mutasi memakai revisi, operation ID, business lock, dan identitas dari Auth.
- Tidak ada hard delete pada antarmuka; menu/meja dinonaktifkan. Data audit tidak dapat ditulis atau dihapus langsung oleh akun aplikasi.

## Cakupan yang disetujui

1. Operasional inti dahulu: menu, meja, pesanan makan di tempat/bawa pulang, pembayaran manual, struk dan laporan. Reservasi/DP menyusul.
2. Menu tersedia/habis dahulu. Stok bahan baku dan resep tidak dihitung.
3. Owner/admin mengelola menu dan meja; kasir membuat/memperbarui pesanan serta menerima pembayaran. Hak riwayat transaksi kasir tetap miliknya sendiri.

Tidak menambahkan kebijakan DP/refund reservasi, pajak/service charge, split bill, penggabungan meja, resep, pengurangan bahan baku, printer dapur, gateway atau operasi offline.

## Alur dan aturan operasional

- Profil, logo opsional/fallback, jam operasional WIB serta staf memakai fondasi yang sudah ada. Navigasi Kembali tetap kategori, identitas, setup, lalu summary. Profil/menu/meja/jam yang disimpan tetap menjadi draf sampai owner menekan Buka dashboard. Guard onboarding selesai tetap berlaku.
- Menu tersedia di `/dashboard/products`; label navigasi untuk restoran menjadi Menu. Meja berada di `/dashboard/restaurant/tables`. `/dashboard/pos` membuka Pesanan & kasir untuk restoran dan tetap POS toko untuk usaha toko. Inventori tidak ditampilkan untuk restoran; URL inventori restoran diarahkan ke meja. Menu restoran tidak dibuat sebagai barang katalog toko dengan stok rekaan.
- Navigasi desktop/mobile dipilih berdasarkan kategori bisnis server. Bentuk shell, topbar, sidebar dan layout toko dipertahankan. Pengaturan tetap di sidebar, Staf & akses tetap di dropdown akun, Akun saya tetap pribadi.
- Owner/admin melihat seluruh pesanan. Kasir membuat, memperbarui, membatalkan pesanan belum dibayar dan membayar pesanan miliknya sendiri. Kasir lain hanya memperoleh metadata meja terpakai, tanpa rincian order/total/nama pelanggan petugas lain. Belum ada kerja pesanan bersama antar kasir.
- Pesanan belum dibayar tersimpan permanen, termasuk nama pelanggan teks, catatan, jumlah tamu, meja/jenis layanan, snapshot menu/harga, subtotal, proses dan pelaku. Proses: Baru, Diproses, Siap, Disajikan/diserahkan; tidak boleh mundur. Pembayaran boleh dilakukan sebelum disajikan, misalnya pelayanan bayar di awal.
- Satu meja aktif hanya menampung satu pesanan terbuka. Jumlah tamu tidak boleh melebihi kapasitas. Tidak ada meja untuk bawa pulang. Meja bebas saat pembayaran atau pembatalan pesanan selesai dicatat. Pembayaran tidak berarti sensor fisik menyatakan meja kosong; petugas tetap memeriksa keadaan meja sebelum menerima tamu berikutnya.
- Meja yang memiliki pesanan terbuka tidak boleh dinonaktifkan atau dikurangi kapasitasnya di bawah jumlah tamu. Nama meja pada pesanan merupakan snapshot. Tidak ada pembagian atau penggabungan meja pada tahap ini.
- Jumlah menu berupa porsi utuh, 1 sampai 9.999 per baris, maksimal 100 jenis menu per pesanan. Menu baru/tambahan wajib aktif dan tersedia. Baris yang jumlahnya tetap/berkurang mempertahankan nama dan harga snapshot meski menu kemudian habis/nonaktif. Penambahan jumlah memakai harga menu saat ini untuk seluruh baris tersebut. UI menjelaskan aturan dan menampilkan hasil tersimpan sebelum pembayaran.
- Pembayaran memakai subtotal server dari pesanan tersimpan, bukan harga/total dari browser. Tunai memeriksa kecukupan dan kembalian; QRIS/transfer memerlukan konfirmasi manual dan nominal sesuai total. Diskon nominal/persen hanya owner/admin. Harga/uang rupiah bulat, total maksimal Rp999.999.999.999; memakai aturan pembulatan POS yang sama.
- Pembayaran dan perubahan status order menjadi Dibayar berlangsung atomik. Operation ID, payload tetap dan business lock mencegah transaksi ganda pada retry atau dua klik bersamaan. Respons terputus mengunci draf pembayaran dan menyediakan retry permintaan yang sama. Jangan membuat pembayaran baru hanya karena respons pertama hilang; periksa riwayat setelah reload.
- Transaksi dibaca melalui `pos_transactions`, dengan RLS riwayat owner/admin dan kasir hanya pelaku pembayaran. Jika owner/admin membayar order yang dibuat kasir, order berbayar itu tidak menjadi celah kasir membaca transaksi owner/admin.
- Pesanan belum dibayar dapat dibatalkan dengan alasan; tidak menghasilkan refund. Pembatalan penuh transaksi berbayar hanya owner/admin, membutuhkan alasan, konfirmasi pembatalan dan refund manual. Riwayat tidak dihapus dan tidak ada stok bahan baku yang dikembalikan. Arti checkbox restoran tidak mengklaim barang toko dikembalikan.
- Detail/struk memakai komponen transaksi yang sudah ada, termasuk cetak browser/PDF berwarna kertas putih. Laporan/CSV memakai fungsi baca bersama: filter WIB/metode, penjualan batal dikeluarkan dari periode asal, refund manual ditampilkan terpisah tanpa dikurangi dua kali. Tidak ada klaim laba tanpa HPP.
- Foto menu, penautan pesanan ke profil pelanggan, dan konteks data restoran pada Asisten AI belum dihubungkan pada paket inti ini. Nama pelanggan pesanan merupakan snapshot teks. Fitur pelanggan dan Asisten toko yang sudah ada tidak diubah; keduanya tidak ditampilkan sebagai modul restoran operasional.

## Migrasi dan verifikasi

Pengguna mengonfirmasi kedua migrasi dijalankan berurutan dan berhasil. Perilakunya sudah diverifikasi di Supabase aktual. **Jangan menjalankan ulang migrasi lama atau dua migrasi ini.** Tidak ada reset, konversi kategori usaha lama, penghapusan demo, atau impor data browser.

1. `202610310001_restaurant_foundation.sql`: constraint kategori store/restaurant, RPC pembuatan berkategori, menu, meja, audit dan receipt idempotensi. Preflight SQL memeriksa constraint kategori yang dikenal dan berhenti jika tidak cocok; tidak menghapus constraint lain secara umum.
2. `202610310002_restaurant_orders.sql`: pesanan, RLS, penggunaan meja terbatas, save/pay/cancel, proteksi meja terpakai, serta perluasan fungsi laporan untuk restoran. Fungsi checkout dan pengembalian stok toko tetap dipertahankan. Aksi pembatalan website memilih RPC sesuai kategori server.

Typecheck, production build dan **39/39 tes unit/database** lulus. Empat tes restoran memakai PostgreSQL PGlite dengan stub Auth/Storage: kategori, preservasi toko, RLS/grants dua usaha, role/draf/aktif, revisi, idempotensi, kapasitas, menu habis, snapshot harga, diskon, bayar/cancel, refund dan laporan. Regresi tambahan memastikan checkout serta laporan toko tetap menghasilkan total yang benar sesudah migrasi restoran. Ini dibedakan dari bukti hosted berikut.

`scripts/test-restaurant.mjs` lulus di Supabase aktual dengan akun baru: dua revisi bersamaan hanya satu diterima, dua kasir berebut meja hanya satu berhasil, dua pembayaran dengan request yang sama menjadi satu transaksi, pembatasan menu/meja dan transaksi sendiri, tunai/QRIS/transfer, diskon, snapshot harga, refund, laporan, sesi nonaktif dan tidak ada mutasi inventori restoran/toko. Ringkasan fixture sesudah pembatalan: penjualan selesai Rp44.000, refund manual Rp30.000 terpisah. Semua akun/usaha uji dibersihkan; hash snapshot data lama identik. Bukti lokal `.cache/restaurant/backend-results.json`.

Browser Edge/Chromium: dua suite akhir lulus berurutan, `restaurant.spec.ts` dan regresi `pos.spec.ts` toko. Suite restoran menguji pemilihan kategori, identitas, Back, guard draf, menu/meja/jam tersimpan, Buka dashboard, login staf memakai kode/username/password, pesanan makan di tempat, proses, menu habis, meja petugas lain tanpa rincian, pembayaran dengan respons sengaja diputus sesudah commit, retry satu transaksi, struk/PDF aktual, larangan akses kasir lain, laporan/CSV, refund penuh tanpa klaim restock, pembatasan admin pada settings, edit profil/reload/login browser baru, Staf & akses setelah onboarding, dan sesi nonaktif.

Viewport 320, 390, 768 dan 1366 diuji: halaman tidak overflow horizontal, dialog berada dalam viewport, Escape menutup dialog, menu mobile menuju meja dan Poppins dipakai. Screenshot desktop/HP ditinjau; tabel berada pada wadah scroll horizontal. Warna tetap dari desain saat ini: kontras putih pada biru 8,24:1, teks sekunder pada panel 7,94:1, turquoise pada panel 6,43:1. Tidak ada page error. Bukti di `.cache/restaurant/` dan checkout QA `.cache/urbanist-dashboard-preview/.cache/restaurant/`; screenshot/PDF/JSON uji tidak untuk commit.

Kegagalan awal tes browser diperbaiki: label select kini eksplisit dan tidak mencampur isi opsi; locator staf/laporan disesuaikan dengan teks terbaru dari main. Hasil lulus di atas berasal dari run akhir setelah koreksi, bukan mengabaikan kegagalan awal.

Inspeksi menggunakan migrasi yang ada, preflight katalog SQL saat pengguna menjalankan migrasi, dan perilaku hosted RPC/RLS aktual. Katalog remote penuh dan riwayat migrasi Supabase CLI tidak diinspeksi melalui koneksi SQL langsung; jangan menyamakan pemasangan SQL Editor dengan pencatatan history CLI.

Pembacaan daftar restoran saat ini dibatasi eksplisit maksimal 5.000 baris per resource. Laporan mempertahankan batas 20.000 transaksi/refund per filter. Pengujian HP memakai emulasi viewport Chromium, bukan perangkat fisik/Safari. Penjadwalan cleanup gambar dari tahap toko sebelumnya dan temuan npm audit bukan bagian perubahan ini. Tidak ada deployment.

## Desain

### Pesan validasi spesifik, 31 Oktober 2026

Permintaan lanjutan pengguna: mengganti pesan gabungan pesanan/menu/meja dengan penyebab spesifik. `lib/restaurant-errors.ts` menerjemahkan hanya reason/message database yang dikenal, tanpa meneruskan error SQL mentah, constraint detail atau data usaha lain. Validasi isian juga menyebut field/batas dalam bahasa Indonesia. Kondisi yang dibedakan mencakup kapasitas meja versus jumlah tamu, meja terpakai/nonaktif/hilang, menu habis dengan nama menu aktif, menu nonaktif/hilang, konflik revisi, order sudah dibayar/dibatalkan, nama meja duplikat, diskon, kekurangan pembayaran dengan nominal, dan pembayaran non-tunai yang harus sesuai total.

`202610310003_restaurant_error_reasons.sql` adalah migrasi tambahan fungsi, bukan perubahan data/tabel. Fungsi yang lama menyatukan beberapa penyebab; migrasi ini menambahkan reason terstruktur pada DETAIL dengan urutan validasi, otorisasi, lock, idempotensi dan mutasi yang sama. Helper pemeriksaan status tidak dapat dipanggil langsung oleh authenticated. Migrasi 001/002 tidak diedit atau dijalankan ulang.

Status akhir: pengguna mengonfirmasi migrasi 003 berhasil dipasang, kemudian diverifikasi melalui website dan Supabase aktual. Typecheck, build dan 42 tes unit/database lulus. Reason aktual PostgreSQL diuji beserta kapasitas, menu habis, pembayaran kurang, order berbayar, validasi angka, sanitasi detail tidak dikenal, helper privat dan regresi transaksi/role/tenant. Migrasi 001/002/003 tidak perlu diulang.

`restaurant-errors.spec.ts` lulus di browser dengan Supabase aktual, termasuk stale-tab agar error berasal dari penolakan server: kapasitas 4 untuk 6 tamu, meja direbut petugas lain, menu habis/nonaktif, meja dinonaktifkan, revisi berubah, pembayaran Rp10.000 untuk total Rp15.000, pembayaran sudah dicatat dan nama meja sama. Jumlah order/transaksi diperiksa setelah gagal: tidak ada mutasi tambahan atau sukses palsu. Pesan error diuji pada modal mobile 390px tanpa overflow horizontal.

Regresi `restaurant-tables.spec.ts` juga lulus dengan pesan spesifik saat kapasitas 1 ditolak untuk meja yang dipakai 2 tamu. Kedua suite lulus, tanpa page error, cleanup berhasil dan hash data lama identik. `scripts/test-restaurant.mjs` dijalankan ulang setelah migrasi 003 dan lulus: role/tenant, revisi dan pembayaran bersamaan, tabel terpakai, retry satu transaksi, tunai/QRIS/transfer, diskon, refund, laporan serta sesi nonaktif tetap bekerja.

Bukti pada `.cache/restaurant-errors/results.json`, `backend-regression.json`, screenshot `capacity-mobile.png` dan `menu-out.png`; tidak untuk commit. Server pengujian agent dihentikan sesudah tes, dan perubahan lokal `next-env.d.ts` sebelum pekerjaan ini dipertahankan.

Kegagalan validasi yang pasti rollback tetap dapat diperbaiki pada formulir. Gangguan koneksi atau kegagalan yang hasilnya belum pasti tetap berstatus uncertain dan mempertahankan retry request yang sama; tidak diubah menjadi klaim menu habis/meja penuh atau sukses palsu. Tidak mengubah palet, tata letak, pembatasan role maupun perilaku stok toko.

Delivery gate revisi pesan: Hard Gate PASS (build/unit/hosted/browser, respons gagal dan angka error terverifikasi); Purpose Gate PASS (copy menyebut sebab dan langkah perbaikan tanpa teknik visual baru); Liveliness PASS (hierarki dan dials halaman dipertahankan); Craftsmanship PASS (kasus balapan tab dan nominal aktual diuji, informasi SQL mentah tidak diteruskan, tampilan dan aturan akses tetap).

### Revisi tampilan Meja, 31 Oktober 2026

Atas permintaan pengguna, daftar meja menjadi grid kotak seperti pilihan tempat duduk. Setiap kotak hanya menampilkan nama/nomor meja, tanpa kapasitas, status atau tombol tambahan di dalamnya. Urutan nama memakai pembandingan numerik agar Meja 2 mendahului Meja 10. Nama panjang dibatasi tiga baris pada kotak; nama lengkap tetap menjadi accessible name dan ditampilkan di modal.

Klik, Enter atau Space pada kotak membuka dialog detail berisi nama lengkap, kapasitas, status Tersedia/Terpakai/Nonaktif dan keterangan status berdasarkan data yang sudah tersedia. Ubah meja membuka editor lama, sehingga validasi, revisi dan pembatasan kapasitas meja terpakai tetap berlaku. Meja nonaktif tetap dapat dibuka untuk diperiksa dan diaktifkan kembali. Modal mendukung Escape, loop Tab/Shift+Tab dan pengembalian fokus. Tidak menambahkan denah bebas, drag/drop, kolom deskripsi baru, API atau migrasi.

Renderer dipakai bersama oleh setup dan halaman Meja; daftar menu tetap berupa tabel. Style memakai panel/navy/font/warna dan radius yang sama, tanpa animasi baru. Arah desain tetap ENERGY 1 / RHYTHM 1 / MOTION 0; grid menyampaikan identitas setiap meja dan modal menampung rincian agar kotak tidak padat.

Typecheck dan build lulus. `tests/browser/restaurant-tables.spec.ts` lulus di Supabase aktual dengan akun baru: nama saja pada kotak, urutan angka, tiga status modal, keyboard/fokus, edit tersimpan sesudah reload, penolakan kapasitas meja terpakai tanpa sukses palsu, pencarian/kosong, nama 60 karakter, kotak persegi dan modal tanpa overflow pada 320/390/768/1366px, serta regresi daftar menu. Data lama identik setelah cleanup; tidak ada page error. Bukti `.cache/restaurant-tables/results.json` dan screenshot setempat, tidak untuk commit. `next-env.d.ts` lokal yang sudah berubah sebelum pekerjaan ini dipertahankan. Server pengujian agent dihentikan.

Delivery gate revisi grid: Hard Gate PASS (build/browser/keyboard/responsif dan status server teruji); Purpose Gate PASS (kotak mewakili meja, memakai style existing tanpa dekorasi baru); Liveliness PASS (nama menjadi fokus, detail berpindah ke modal, dials tetap); Craftsmanship PASS (preview desktop/HP diperiksa dan simpan/error aktual diuji). Tidak mengubah backend atau pembatasan role.

Instruksi proyek terkini dipertahankan: Poppins, palet navy/panel gelap, turquoise dan tombol biru, shared dashboard shell, bentuk navigasi, BusinessHeader, logo resmi, pengaturan jam, staf, laporan dan struk. Form/modal restoran mengikuti field, panel dan editor yang sudah ada; dialog native menambahkan fokus modal/Escape tanpa tema baru. Copy kartu restoran onboarding disesuaikan ke fitur inti yang benar-benar tersedia; tidak menjanjikan reservasi/DP yang belum dibangun.

antislop active: during (session override). Design Read: halaman operasional restoran untuk owner/admin/kasir dalam bahasa visual dashboard Usahaku yang sudah disetujui, ENERGY 1 / RHYTHM 1 / MOTION 0 untuk komponen baru. Animasi navigasi bersama tetap mengikuti preferensi reduced motion yang sudah tersedia.

- Hard Gate PASS: build, unit/SQL, hosted dan browser aktual lulus; data/angka berasal dari server; viewport/dialog, empty/pending/error/retry, Escape, klik simpan/bayar/cancel dan kontras terverifikasi. Tidak ada aset, statistik aktivitas atau testimonial baru yang dibuat.
- Purpose Gate PASS: panel, font, logo dan ambient background diwarisi dari persetujuan pengguna; tidak menambah gradient/glow/ikon/animasi dekoratif baru. Tabel, form dan checklist menunjukkan pekerjaan operasional yang tersedia.
- Liveliness PASS: fokus tiap halaman adalah menu/meja/pesanan atau ringkasan, tombol biru menunjuk tindakan utama, ruang antarbagian mengelompokkan pekerjaan, identitas Poppins/logo/navy/turquoise konsisten. Komponen baru tidak bergerak.
- Craftsmanship PASS: screenshot desktop/HP diperiksa, operasi aktual dan kegagalan respons diuji, server/database memeriksa role/tenant, data toko tetap utuh. Tidak ada tombol reservasi/DP, kalkulasi bahan baku atau klaim pembayaran otomatis yang belum tersedia. Semua server yang dimulai agent untuk tes dihentikan; server pengguna tidak disentuh.
