# Penyelesaian operasional restoran

Branch: `feat/restaurant-operations-completion`.

## Jam reservasi

Reservasi baru atau perubahan jadwal/meja harus seluruhnya berada dalam jam operasional, memakai WIB. Jam tutup yang lebih kecil dari jam buka berarti tutup pada hari berikutnya: Senin 18.00–02.00 menerima reservasi Senin 23.30 hingga Selasa 01.00. Pemeriksaan juga mencakup pergantian Minggu ke Senin. Buffer penguncian meja tidak dihitung sebagai durasi kunjungan yang harus berada dalam jam buka.

Owner mengatur jam melalui Pengaturan. Jika jam belum diisi, reservasi baru belum dapat dibuat. Perubahan jam tidak membatalkan reservasi lama. Catatan/kontak pada slot lama tetap bisa diedit; pemindahan jadwal/meja diperiksa ulang. Pesanan pelanggan yang masih aktif tetap bisa diedit dan dibayar setelah jam tutup.

## Pembayaran

Setup restoran dan Pengaturan menggunakan konfigurasi pembayaran yang sama dengan kasir: tunai, QRIS, transfer, dan e-wallet. Formulir DP maupun pelunasan hanya menawarkan metode aktif dan menampilkan QRIS atau rekening tujuan yang tersimpan. Pembayaran dan refund tetap dikonfirmasi manual.

Revisi konfigurasi diperiksa di database agar tab lama tidak menyimpan pembayaran memakai konfigurasi yang telah berubah. Permintaan yang hasilnya belum pasti mempertahankan request ID; retry transaksi yang sudah berhasil tetap mengembalikan hasil sebelumnya, termasuk jika metode kemudian dinonaktifkan. Tanpa metode aktif, pembayaran baru ditolak.

DP belum menjadi omzet. Pada formulir reservasi sekaligus makanan, batas DP tetap subtotal makanan; pajak dan biaya layanan dihitung saat pelunasan. DP tanpa makanan tetap didukung untuk reservasi meja.

## Pajak dan biaya layanan

Owner mengatur **Pengaturan > Pajak & biaya layanan**. Keduanya persentase 0–100 dengan maksimal dua angka desimal; awalnya 0%. Biaya layanan awalnya hanya makan di tempat, dapat diubah menjadi semua pesanan. Owner memilih dasar pajak: nilai setelah diskon, atau nilai setelah diskon ditambah layanan.

Urutan perhitungan:

1. Subtotal makanan dikurangi diskon yang diizinkan menjadi nilai bersih.
2. Biaya layanan dibulatkan ke rupiah dari nilai bersih × persentase layanan.
3. Pajak dibulatkan ke rupiah dari dasar yang dipilih × persentase pajak.
4. Total = nilai bersih + layanan + pajak. DP mengurangi sisa yang dibayar.

Contoh: subtotal Rp60.000, diskon Rp10.000, layanan 5% menghasilkan Rp2.500. Pajak 10% dengan dasar termasuk layanan menghasilkan Rp5.250; total Rp57.750. Dengan DP Rp20.000, sisa Rp37.750.

Harga, akses diskon, persentase dan total diperiksa di database. Pengaturan disalin ke transaksi saat pembayaran; perubahan berikutnya tidak menghitung ulang struk lama. Laporan omzet memasukkan layanan dan mengecualikan pajak. Kasir tidak boleh mengubah pengaturan atau memberikan diskon khusus owner/admin.

## Laporan DP

Owner/admin dengan izin laporan dapat membuka **Laporan > DP reservasi**. Filter memakai tanggal WIB dan metode DP, bukan metode pelunasan. Ekspor CSV dan cetak/PDF mengikuti izin ekspor laporan.

- Saldo akhir = saldo awal + DP diterima − DP dipakai untuk pelunasan − refund reservasi.
- Bagian DP dalam refund penjualan ditampilkan terpisah. DP tersebut sudah dipakai saat pelunasan sehingga tidak dikurangi lagi dari saldo DP.
- Arus kas DP bersih = DP diterima − refund reservasi − bagian DP dalam refund penjualan.
- Saldo dihitung pada akhir periode, sedangkan label status reservasi menunjukkan status saat laporan dibaca.

Refund penjualan sudah mencakup bagian DP; kedua laporan tidak boleh dijumlahkan untuk menghitung refund tambahan. Nilai agregat disampaikan sebagai string desimal dan diformat dengan BigInt agar nominal besar tetap tepat. Periode maksimal 366 hari dan maksimal 20.000 kejadian/saldo; perkecil filter jika melewati batas.

## Migrasi dan verifikasi

Migrasi tambahan: `supabase/migrations/202611040001_restaurant_completion.sql`. Jalankan seluruh file sekaligus setelah migrasi sebelumnya. Tidak ada reset atau penghitungan ulang transaksi lama. Fungsi privat tidak dapat dipanggil langsung oleh pengguna; konfigurasi hanya owner dan laporan hanya owner/admin, dengan isolasi antarusaha.

Pengguna mengonfirmasi migrasi berhasil dijalankan pada 4 November 2026. Typecheck, build produksi webpack, dan 86 tes unit/PostgreSQL lokal lulus. Pengujian lokal mencakup jam lintas malam, slot lama, snapshot nilai transaksi lama, diskon/pajak/layanan, DP/refund lintas tanggal, metode nonaktif, retry, role/antarusaha, dan agregat nominal besar.

Tes browser utama pada build produksi dan Supabase aktual lulus dengan akun/usaha baru. Pengaturan pajak/layanan bertahan setelah reload dan sesi login baru. QRIS, rekening bank/e-wallet, pelunasan e-wallet, konfigurasi yang berubah pada tab lama, semua metode nonaktif, dan respons pembayaran yang diputus setelah commit lalu diulang teruji. Retry tetap menghasilkan satu transaksi meskipun metode telah dinonaktifkan.

Reservasi 23.30–01.00 diterima pada jam buka 18.00–02.00; jadwal sebelum buka ditolak. Laporan menguji DP diterima Rp50.000, dipakai Rp20.000, refund reservasi Rp10.000, bagian DP dalam refund penjualan Rp20.000, dan saldo akhir Rp20.000. CSV dan cetak/PDF berhasil dihasilkan. Owner lain/kasir ditolak pada pengaturan/laporan yang dilarang, admin dapat membaca laporan tetapi tidak mengubah pengaturan. Tampilan pada 320/390/768/1440 px tidak menimbulkan overflow dokumen; screenshot desktop/HP diperiksa. Tidak ada page error; fixture dibersihkan dan hash data lama tetap sama.

Percobaan awal tes browser gagal karena akses jaringan lingkungan QA, kemudian lulus setelah koneksi diberikan. Pengulangan unit secara paralel sempat gagal mengalokasikan memori PGlite; seluruh 86 tes lulus kembali dengan `node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/*.test.ts`.

Enam tes regresi browser lulus: diskon/keranjang toko, laporan penjualan toko, formulir reservasi gabungan, pesanan di muka/penguncian, reservasi/DP/refund, serta onboarding dan operasional restoran. Dua tes restoran dijalankan ulang dan lulus setelah perbaikan cetak DP dan penambahan pemeriksaan checklist pembayaran onboarding. Konfigurasi pembayaran yang disimpan pada setup menambah progres dari 3/5 menjadi 4/5 dan tetap dipakai saat pembayaran kasir.

Pemeriksaan visual PDF menemukan ringkasan yang masih berlatar gelap; gaya cetaknya diperbaiki menjadi putih/teks gelap dan diverifikasi melalui computed style serta rendering PDF. Nama meja juga ikut tercetak pada riwayat DP. Pesan nominal pembayaran yang tidak tepat kini menyebut nontunai agar mencakup e-wallet; tiga tes pesan error lulus setelah perubahan copy ini.

Server QA port 3221 dihentikan setelah pengujian, server pengguna tidak disentuh. Tidak ada commit, push, merge, atau deployment oleh agen. ENERGY 1 / RHYTHM 1 / MOTION 0; panel, formulir, modal dan navigasi memakai komponen/gaya yang sudah disetujui. Pemeriksaan akses, retry, persistensi, keyboard/viewport dan preservasi data lulus pada skenario yang disebutkan di atas.

Bukti pengujian lokal disimpan di `.cache/restaurant-operations-completion/`, tidak untuk commit. Desain memakai panel/form/modal, Poppins, palet dan navigasi yang sudah disetujui; tidak ada animasi atau perubahan desain baru. Tidak mencakup gateway, refund otomatis, bahan baku/resep, booking publik, atau salon.
