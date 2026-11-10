# Usahaku: Panduan Penggunaan

Usahaku membantu pemilik toko, cafe/restoran, dan salon/barbershop mengelola operasional usaha. Panduan ini ditujukan untuk juri yang ingin mencoba website dengan akun dan data contoh yang sudah disiapkan.

**Buka website: [usahaku-roan.vercel.app](https://usahaku-roan.vercel.app/)**

## 1. Masuk menggunakan akun juri

| Jenis usaha | Email | Kata sandi | Nama usaha |
| --- | --- | --- | --- |
| Toko / minimarket | `toko@example.com` | `1234567890` | Toko Contoh |
| Cafe / restoran | `cafe@example.com` | `1234567890` | Cafe Contoh |
| Salon / barbershop | `salon@example.com` | `1234567890` | Salon Contoh |

Ketiga akun merupakan akun **Pemilik** khusus demonstrasi. Nama pelanggan, barang, layanan, saldo poin awal, dan transaksi di dalamnya adalah data contoh untuk pengujian.

1. Pada halaman awal, tekan **Masuk**.
2. Pilih tab **Pemilik**.
3. Masukkan email dan kata sandi dari tabel di atas, lalu tekan **Masuk**. Gunakan formulir email dan kata sandi, bukan tombol Google, untuk ketiga akun ini.
4. Website langsung membuka dashboard usaha. Akun juri sudah diaktifkan dan menyelesaikan onboarding, sehingga tidak perlu membuat usaha atau memasukkan OTP lagi.
5. Untuk mencoba kategori lain, buka menu akun di kanan atas, pilih **Keluar akun**, kemudian masuk menggunakan akun kategori berikutnya.

### Data yang sudah tersedia

| Akun | Katalog siap pakai | Data pendukung | Riwayat contoh |
| --- | --- | --- | --- |
| Toko | 5 produk dengan stok | 3 member dan 2 pilihan voucher poin | 3 transaksi selesai |
| Cafe | 5 menu | 3 meja, 3 member, dan 2 pilihan voucher poin | 3 transaksi selesai |
| Salon | 4 layanan | 3 penata/terapis dengan jadwal kerja dan 3 pelanggan | 3 pelayanan selesai beserta pembayaran |

Pembayaran **Tunai** sudah aktif pada ketiga akun. Data penjualan awal dicatat pada **11 November 2026 (WIB)**. Jika ringkasan harian kosong saat diuji pada tanggal lain, buka **Transaksi** atau **Laporan**, lalu pilih tanggal tersebut; transaksi baru juga akan mengisi ringkasan sesuai tanggal pengujian.

## 2. Mencoba toko / minimarket

Masuk sebagai `toko@example.com`.

### Melihat ringkasan, produk, dan stok

1. Buka **Ringkasan** untuk melihat angka penjualan, grafik, dan produk terlaris dari transaksi contoh.
2. Buka **Produk** untuk melihat katalog yang sudah tersedia, seperti Susu UHT Contoh dan Beras Premium Contoh.
3. Buka **Inventori** untuk melihat stok serta riwayat perubahannya. Jika ingin menguji perubahan stok, gunakan **Catat perubahan stok**, pilih produk dan arah **Masuk** atau **Keluar**, isi jumlah serta alasan, kemudian simpan.

### Mencatat penjualan

1. Buka **Kasir (POS)**.
2. Tambahkan produk dari katalog ke keranjang. Jumlah dapat diubah dan produk dapat dihapus sebelum transaksi disimpan.
3. Untuk transaksi member, pilih pelanggan tersimpan, misalnya **Alya Contoh**. Untuk pembeli tanpa member, gunakan pilihan non pelanggan.
4. Jika ingin mencoba penukaran poin, pilih voucher yang tersedia pada bagian hadiah poin. Akun contoh memiliki pilihan **10 poin → Rp5.000** dan **20 poin → Rp10.000**. Saldo harus mencukupi; poin dan potongan akhir ditampilkan sebelum pembayaran.
5. Pilih metode **Tunai**, lalu isi **Nominal tunai diterima** sekurang-kurangnya sebesar total tagihan.
6. Centang konfirmasi bahwa pembayaran sudah diterima dan jumlah belanja sudah diperiksa.
7. Tekan **Konfirmasi & catat transaksi**.
8. Setelah berhasil, periksa transaksi dan struk melalui **Transaksi**. Stok berkurang mengikuti penjualan yang tersimpan.

Diskon produk mengikuti pengaturan produk. Pemilik juga dapat memberikan diskon keseluruhan pada kasir. Periksa rincian diskon, potongan poin, pajak, dan total sebelum mengonfirmasi.

## 3. Mencoba cafe / restoran

Masuk sebagai `cafe@example.com`.

### Melihat menu dan meja

1. Buka **Menu** untuk melihat menu contoh, harga, dan ketersediaannya.
2. Buka **Meja** untuk melihat tiga meja yang sudah disiapkan. Kotak meja menampilkan status ketersediaan; tekan kotak untuk melihat keterangannya.
3. Untuk mencoba transaksi tanpa memakai meja, pilih **Bawa pulang** pada kasir.

### Membayar langsung dari keranjang

1. Buka **Pesanan & kasir**. Menu berada di kiri dan keranjang berada di kanan.
2. Tambahkan menu, lalu tentukan **Makan di tempat** atau **Bawa pulang**. Meja boleh belum dipilih, termasuk saat pembayaran.
3. Pilih member dari daftar pelanggan atau gunakan non pelanggan. Tombol **Tambah member** membuka formulir pembuatan member baru; untuk pengujian awal, cukup gunakan member yang tersedia.
4. Jika diperlukan, pilih voucher poin. Cafe memakai pilihan voucher yang sama dengan akun toko.
5. Tekan **Bayar sekarang** untuk melanjutkan pembayaran di keranjang.
6. Pilih **Tunai**, isi nominal uang diterima, lalu centang konfirmasi pembayaran.
7. Konfirmasikan pembayaran dan periksa hasilnya di **Transaksi**.

### Menyimpan pesanan untuk dibayar nanti

1. Tambahkan menu dan lengkapi informasi pelanggan/meja sebagaimana langkah sebelumnya.
2. Tekan **Bayar nanti**. Pesanan disimpan sebagai pesanan terbuka dan belum menjadi penjualan selesai.
3. Pada daftar pesanan, gunakan **Pesan lagi** jika pelanggan menambah menu. Selama tagihan belum lunas, tambahan masuk ke pesanan yang sama.
4. Tekan **Bayar** untuk melunasi pesanan. Jika memakai **Pesan lagi** pada pesanan yang sudah lunas, sistem membuat tagihan baru.

**Meja tidak otomatis tersedia setelah pembayaran.** Pegawai mengubah ketersediaannya secara manual setelah pelanggan selesai menggunakan meja. Pesanan belum lunas dan kunci reservasi tetap mencegah penggunaan meja oleh pesanan baru.

### Membuat reservasi

1. Buka **Reservasi**, lalu tekan **Buat reservasi**.
2. Isi pelanggan, kontak, tanggal/jam kedatangan, durasi, jumlah orang, dan meja.
3. Tambahkan pesanan makanan serta DP jika diperlukan; keduanya opsional.
4. Simpan reservasi. Pilih tanggal pada filter untuk melihat reservasi pada hari tersebut.
5. Saat pelanggan tiba, gunakan **Tandai pelanggan datang**. Pesanan di muka dapat ditambah atau diubah; pelunasan dilakukan setelah kedatangan dicatat.

Ketersediaan mengikuti jam operasional, kapasitas, reservasi lain, dan waktu penguncian meja. Pemilik dapat mengatur waktu penguncian melalui **Pengaturan**. DP dicatat sebagai pembayaran di muka dan diperhitungkan saat pelunasan.

## 4. Mencoba salon / barbershop

Masuk sebagai `salon@example.com`.

### Memeriksa layanan dan tenaga layanan

1. Buka **Layanan & Produk** untuk melihat layanan contoh: Potong Rambut Contoh, Keramas Contoh, Hair Styling Contoh, dan Creambath Contoh.
2. Buka **Penata & terapis** untuk melihat tiga tenaga layanan beserta layanan yang ditangani dan jadwalnya.
3. Buka **Janji temu & kasir** untuk membuat kunjungan atau menerima pelanggan langsung.

### Mencoba kasir dan pelayanan langsung

1. Tambahkan layanan dari katalog ke keranjang.
2. Pilih pelanggan tersimpan, misalnya **Bima Contoh**, atau gunakan pelanggan umum.
3. Pilih mode **Walk-in (Langsung)** dan penata/terapis yang tersedia.
4. Periksa layanan serta total, pilih **Tunai**, lalu isi **Uang Tunai Diterima**.
5. Centang konfirmasi pembayaran, kemudian tekan **Selesaikan Transaksi**.
6. Periksa kunjungan pada daftar pelayanan. Pembayaran lunas tidak otomatis menyelesaikan pelayanan: jalankan status secara manual dari **Menunggu → Sedang Dilayani → Selesai** melalui tindakan pada kunjungan.

### Mencoba janji temu

1. Pada **Janji temu & kasir**, tekan **Buat janji temu**.
2. Pilih pelanggan, layanan, penata, serta jadwal mendatang yang tersedia, lalu simpan.
3. Saat pelanggan tiba, catat kedatangan dan mulai pelayanan melalui tindakan pada kunjungan.
4. Setelah pelayanan selesai, pilih tindakan penyelesaian pelayanan dan lakukan pelunasan jika belum lunas.

Jadwal penata, durasi layanan, dan kunjungan lain diperiksa kembali saat penyimpanan. Penata/terapis adalah tenaga layanan; daftar ini terpisah dari akun login staf.

## 5. Melihat pelanggan, transaksi, struk, dan laporan

- **Pelanggan:** pilih pelanggan tersimpan untuk melihat profil dan riwayat yang terkait. Member contoh pada setiap usaha adalah Alya Contoh, Bima Contoh, dan Citra Contoh.
- **Transaksi:** lihat pembayaran yang sudah tercatat dan buka detail/struknya. Transaksi non member ditampilkan sebagai **Pelanggan Umum**.
- **Laporan:** pilih rentang tanggal dan metode pembayaran untuk melihat penjualan. Gunakan tanggal **11 November 2026** untuk transaksi awal akun juri, atau tanggal pengujian untuk transaksi yang baru dibuat.
- **Struk:** buka melalui detail transaksi, kemudian gunakan pilihan cetak yang tersedia. Nomor transaksi memakai format `TRX-KODETOKO-YYYYMMDD-URUTAN`.

Pembayaran QRIS, transfer, e-wallet, DP, dan refund pada aplikasi dicatat secara **manual** setelah pegawai memeriksa pembayaran di luar aplikasi. Akun juri disiapkan dengan tunai agar dapat diuji tanpa akun pembayaran nyata.

## 6. Pengaturan, staf, dan Asisten AI

- **Pengaturan** di sidebar digunakan untuk profil usaha, logo, jam operasional, pembayaran, dan pengaturan usaha sesuai kategori. Akun contoh sudah siap dipakai tanpa mengubah pengaturan tersebut.
- Buka dropdown akun kanan atas → **Staf & akses** untuk mengelola akun staf. Untuk masuk sebagai staf, keluar dahulu, buka **Masuk**, lalu pilih tab **Staf** dan isi kode toko, username, serta sandi yang diberikan pemilik. Ketiga akun juri di atas tetap memakai tab **Pemilik**.
- **Akun saya** pada dropdown akun digunakan untuk akun pribadi.
- Tekan **Asisten Bisnis AI** pada sidebar untuk menampilkan tombol chat mengambang, lalu tekan tombol tersebut untuk membuka percakapan. Contoh pertanyaan: “Menu apa yang paling mahal?” atau “Bantu buat ide promosi untuk usaha ini.” Tombol mengambang dapat digeser dan kembali tersembunyi setelah refresh. Ketersediaan jawaban bergantung pada layanan AI dan kuotanya.

## 7. Mencoba demo tanpa login

Pada landing page, tekan **Coba demo**, lalu pilih kategori toko, restoran, atau salon. Demo ini menggunakan data dummy yang terpisah dari akun juri.

Demo mengizinkan melihat **Ringkasan** serta mencoba **Kasir** dengan menambahkan barang/layanan, mengubah jumlah, dan menghapus isi keranjang. Pembayaran, Asisten AI, dan fitur lain akan menampilkan ajakan **Daftar untuk melanjutkan**.

## 8. Mendaftarkan usaha sendiri

1. Dari landing page, tekan **Mulai Sekarang**, lalu isi formulir pendaftaran pemilik atau gunakan Google.
2. Untuk pendaftaran email, masukkan kode OTP **6 digit** yang dikirim ke email pada halaman verifikasi.
3. Pilih kategori usaha, lengkapi identitas, kemudian lanjutkan setup.
4. Periksa halaman ringkasan dan tekan **Buka dashboard** untuk menyelesaikan onboarding.
5. Setelah onboarding selesai, perubahan profil dan pengaturan dilakukan melalui **Pengaturan**, bukan mengulang onboarding.

Untuk pengujian juri, gunakan ketiga akun siap pakai pada bagian pertama agar tidak perlu menyiapkan usaha dari awal.
