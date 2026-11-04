# Reservasi sekaligus pesan makanan

Pembaruan 4 November 2026: jadwal baru diperiksa terhadap jam operasional dan metode DP mengikuti konfigurasi pembayaran aktif, termasuk e-wallet. Batas DP pada subtotal makanan tetap berlaku. Lihat [RESTAURANT-COMPLETION.md](RESTAURANT-COMPLETION.md) untuk aturan dan status verifikasi terbaru.

Melanjutkan branch `feat/restaurant-preorders-table-locks`. Perubahan sebelumnya belum di-commit, dipush, atau digabungkan oleh agen.

## Cara menggunakan

1. Buka Reservasi, lalu Buat reservasi. Pilih jadwal, meja, nama pelanggan, dan kontak seperti sebelumnya.
2. Aktifkan **Pesan makanan sekalian (opsional)** jika pelanggan sudah memilih makanan. Pilih menu tersedia, jumlah porsi, dan catatan makanan. Subtotal ditampilkan sebagai pratinjau.
3. Aktifkan **Catat DP sekarang (opsional)** bila uang sudah diterima. Isi nominal, metode manual, dan konfirmasi penerimaan. Bila makanan sudah dipilih, DP tidak boleh melebihi subtotalnya.
4. Tekan **Simpan reservasi** sekali untuk menyimpan reservasi beserta makanan/DP yang dipilih. Tanpa kedua pilihan opsional, hanya reservasi meja yang dibuat.
5. Makanan tersimpan sebagai pesanan di muka, belum menandai pelanggan datang dan belum boleh dilunasi. Staf tetap mencatat kedatangan setelah pelanggan tiba dan meja kosong.

Formulir gabungan ini berlaku untuk reservasi baru. **Ubah reservasi** tetap mengubah jadwal/kontak/catatan tanpa menghapus makanan atau DP. Makanan yang sudah disimpan tetap diedit melalui **Tambah / ubah pesanan**; DP yang belum dicatat tetap bisa ditambahkan melalui **Catat DP**.

## Penyimpanan

- RPC `create_restaurant_reservation_bundle` memanggil layanan reservasi, pesanan, serta DP yang sudah ada dalam satu transaksi database. Jika menu habis, bentrok meja, nominal tidak valid, atau langkah lain gagal, seluruh penulisan beserta audit/request terkait dibatalkan.
- Request ID mencakup keseluruhan isi formulir. Retry setelah respons hilang tidak membuat reservasi, pesanan, atau DP ganda. Replay mengembalikan status reservasi terkini, tanpa mengubahnya kembali.
- Harga, ketersediaan, porsi utuh 1–9999, maksimal 100 jenis menu, kapasitas meja dan aturan jadwal diperiksa di server/database. Harga/total tidak diterima dari browser.
- Owner/admin dapat membuat reservasi usahanya; kasir membuat reservasi/pesanan miliknya. Pengguna usaha lain, kasir lain, dan anggota nonaktif tetap dibatasi oleh pemeriksaan akses yang sudah ada. Tidak ada pelebaran akses tabel.
- DP tetap opsional dan dikonfirmasi manual. DP tanpa makanan masih didukung untuk reservasi meja. Pencatatan ini belum menghasilkan transaksi penjualan; pelunasan kemudian memperhitungkan DP sekali.
- Menonaktifkan pilihan makanan/DP hanya mengabaikan draf bagian tersebut saat membuat reservasi; tidak menghapus data tersimpan dari reservasi lain.

## Migrasi

`supabase/migrations/202611030004_reservation_order_bundle.sql` hanya menambah satu fungsi, hak eksekusinya, dan notifikasi reload schema. Tidak menambah/mengubah tabel, menghitung ulang transaksi, atau memodifikasi data lama. Pengguna mengonfirmasi berhasil dijalankan pada 3 November 2026. Migrasi `003` yang sudah diterapkan tidak diubah.

## Desain

Design Read: perluasan formulir operasional restoran yang sudah disetujui, untuk staf/pemilik UMKM. ENERGY 1 / RHYTHM 1 / MOTION 0. Memakai panel, modal, kalender, field, tombol, Poppins, ukuran huruf dan palet Usahaku yang ada. Bagian opsional dikelompokkan di bawah identitas pelanggan. Tidak ada aset, animasi atau navigasi baru.

## Pengujian

- Typecheck dan 84 tes unit/PostgreSQL lokal lulus. Tes baru memeriksa pilihan opsional, input palsu, nominal/porsi, rollback seluruh penulisan, retry, perubahan status setelah replay, anggota nonaktif, scope kasir dan antarusaha.
- Build produksi webpack lulus. Tiga skenario browser Edge pada Supabase aktual lulus: formulir gabungan, regresi pesanan di muka/penguncian, serta reservasi/DP/pembayaran/refund lama.
- Formulir gabungan diuji dengan kasir uji: 2 porsi masing-masing Rp30.000, DP transfer Rp20.000, lalu pelunasan tunai Rp40.000 setelah datang. Total penjualan tetap Rp60.000, satu pesanan dan satu transaksi. Reload/login baru mempertahankan data.
- Respons simpan diputus setelah server selesai, lalu diulang dengan request yang sama; tidak ada reservasi/pesanan/DP ganda. Menu dinonaktifkan ketika formulir masih terbuka; simpan ditolak dengan alasan spesifik tanpa reservasi parsial. Setelah pilihan makanan dimatikan, reservasi dengan DP saja dapat disimpan.
- Edit catatan reservasi tidak menghapus makanan/DP. Pesanan di muka terbuka kembali dengan makanan yang sama; pelunasan belum tersedia sebelum kedatangan. Kasir lain dan owner usaha lain tidak memperoleh data pesanan tersebut.
- Dialog diperiksa pada 320/390/768/1440 px, tanpa overflow dokumen; screenshot desktop dan HP diperiksa. Field jumlah dapat dikosongkan saat mengetik. Keyboard/Escape, subtotal, hapus/tambah menu, toggle makanan/DP dan umpan balik gagal/retry memakai kontrol yang berfungsi.
- Tes formulir gabungan dijalankan lagi pada build akhir setelah perapian validasi DP dan lulus: pesan DP terlalu besar hilang setelah nominal diperbaiki; menambah menu yang sama menaikkan jumlah, menghapusnya mengembalikan kondisi kosong, lalu penambahan ulang dan penyimpanan tetap berhasil. Peninjauan izin otomatis sempat gagal karena kapasitas/tenggat layanan, kemudian retry berhasil; tidak ada pemeriksaan akhir yang masih terhalang.
- Seluruh akun/usaha fixture dibersihkan dan hash data usaha lama tetap sama. Tidak ada page error pada run yang lulus. Bukti pengujian disimpan di `.cache/reservation-order-form/`, tidak perlu masuk commit.

Hard Gate PASS: aksi aktual dan kondisi gagal/retry diuji, data/angka berasal dari server, modal dan viewport diperiksa, tanpa aset atau klaim baru. Purpose Gate PASS: komponen dan palet memakai desain yang disetujui; tidak ada dekorasi atau animasi baru. Liveliness PASS: bagian opsional mengikuti hierarki formulir restoran dan tombol simpan menjadi tindakan utama. Craftsmanship PASS: penyimpanan atomik, akses, persistensi, screenshot dan preservasi data diverifikasi.

Server QA yang dimulai agen dihentikan setelah pengujian; server pengguna tidak disentuh. Tidak ada commit, push, merge atau deployment oleh agen.
