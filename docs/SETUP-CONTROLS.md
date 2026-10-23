# Perbaikan kontrol setup — 23 Oktober 2026

Permintaan pengguna: kategori produk dengan pilihan Makanan/Minuman/Bahan Pokok dan input manual melalui Lainnya; aktivasi semua hari; tombol jam berbentuk pil; alignment metode pembayaran; preview gambar QRIS; penghapusan container foto sampul reservasi.

## Perilaku

- Kategori manual wajib diisi dan mendukung kategori produk lama ketika diedit. Mengubah kembali ke pilihan standar menyembunyikan input manual; penyimpanan tetap memakai validasi katalog server yang ada.
- “Aktifkan semua hari” mengaktifkan tujuh hari dan menyalin jam dari hari aktif pertama. Jika semua hari tutup, memakai jam Senin yang tersedia. Perubahan disimpan ke database setelah “Simpan jam operasional”; aturan WIB, lintas tengah malam dan larangan jadwal tumpang tindih tetap berlaku.
- Switch QRIS/transfer/e-wallet memakai inset dan ukuran yang sama. Rekening dan akun e-wallet tetap dapat ditambah/dihapus.
- Unggah QRIS menerima PNG/JPEG/WebP maksimal 2 MB, memeriksa apakah gambar dapat dibaca, dan menampilkan preview utuh tanpa cropping. Pilihan file yang tidak valid mempertahankan gambar sebelumnya. Hasil pembacaan lama tidak menimpa unggahan terbaru atau modal yang sudah ditutup.
- Tombol X menghapus gambar dari draf tanpa menonaktifkan QRIS atau membuka pemilih file. Batal mempertahankan gambar yang sebelumnya tersimpan; Simpan pembayaran menerapkan penghapusannya. Penghapusan juga membatalkan hasil unggahan yang masih berjalan.
- Checklist dan persentase pembayaran mengikuti metode yang berhasil disimpan, bukan draf yang belum disimpan. Status tetap sama setelah reload dan ikut tampil pada ringkasan usaha berdasarkan pengaturan lokal usaha yang sama. Hari tutup memakai latar navy lebih redup, input beropasitas 40%, serta toggle netral tanpa latar putih.
- Pengaturan pembayaran tetap mengikuti implementasi pratinjau lokal berbasis business ID. Simpan gagal karena kuota/izin penyimpanan browser menampilkan pesan dan mempertahankan modal serta data lama. Tidak ada integrasi bank, QRIS otomatis, atau migrasi baru.
- Container sampul reservasi beserta tombol tanpa handler dihapus; panel identitas kategori usaha tetap dipertahankan.

## Pengujian

`tests/browser/setup-controls.spec.ts` berhasil di website lokal dengan akun/usaha uji baru: semua pilihan kategori, validasi manual kosong, simpan/edit/reload produk dan stok pecahan, semua hari dari keadaan tutup, penyimpanan jadwal database, tiga format gambar, file rusak/besar, tambah/hapus rekening, akun e-wallet, reload pembayaran dan simulasi kuota browser gagal. Alignment dan overflow diperiksa pada desktop 1440px, tablet 768px dan mobile 320px. Screenshot ditinjau pada `artifacts/setup-controls/`. Data lama dibandingkan setelah cleanup dan tetap sama.

TypeScript diperiksa dengan `tsc --noEmit`. Atas permintaan lanjutan, form tambah/edit produk dashboard kini memakai dropdown yang sama dengan setup: Makanan, Minuman, Bahan Pokok, dan Lainnya. Kedua form berbagi daftar opsi di `lib/catalog.ts`. Kategori custom lama tetap ditampilkan sebagai Lainnya beserta nilai aslinya, dan input manual hanya muncul ketika Lainnya dipilih. Pengujian katalog dan SKU mengikuti kontrol kategori baru.

Pengujian lanjutan berhasil: tombol X tidak membuka file chooser, Batal membatalkan penghapusan, Simpan lalu reload menghilangkan gambar, metode QRIS tetap aktif, progres berubah dari 2/4 menjadi 3/4 hanya setelah penyimpanan, dan ringkasan menampilkan status pembayaran yang sama. Screenshot hari tutup dan tombol X sudah ditinjau.

## Temuan yang belum dikerjakan

- Pengaturan pembayaran setup belum tersinkron ke backend/POS. Checklist dan ringkasan kini mencerminkan pengaturan lokal yang berhasil disimpan. Preview QRIS tetap hanya tersedia pada browser dan origin yang sama; status selesai bukan aktivasi pembayaran otomatis.
- Modal setup memiliki tombol tutup dan batal, tetapi belum menangani Escape atau mengunci fokus keyboard. Perubahan ini menambahkan nama/role dialog tanpa mengubah struktur visual; perilaku keyboard lengkap belum termasuk perbaikan ini.
- Unggah foto produk di modal setup masih mengabaikan file terlalu besar/tidak sesuai secara diam-diam; validasi akhir tetap dilakukan server. Pesan kesalahan upload QRIS sudah ditambahkan, sedangkan pesan setara untuk foto produk belum termasuk permintaan ini.
