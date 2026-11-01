# Diskon produk dan pajak toko

Aturan terkini: diskon produk tetap tersedia, ditambah diskon keseluruhan owner/admin sebelum pajak. Lihat [POS-ORDER-DISCOUNTS.md](POS-ORDER-DISCOUNTS.md). Ketentuan penggantian diskon total di bawah mencatat implementasi awal, sebelum pengguna meminta kedua diskon tersedia bersamaan.

## Aturan perhitungan

- Produk memiliki diskon nonaktif, persen (0–100%, maksimal 2 desimal), atau rupiah bulat per unit (maksimal sebesar harga asli).
- Potongan persen per unit dibulatkan half-up ke rupiah. Harga setelah diskon = harga asli − potongan tersebut.
- Setiap baris = harga setelah diskon × jumlah (maksimal 3 desimal), dibulatkan half-up ke rupiah. Subtotal sebelum diskon dihitung terpisah dengan cara yang sama dari harga asli. Diskon baris adalah selisih keduanya.
- Pajak toko 0–100%, maksimal 2 desimal, ditambahkan dari jumlah setelah diskon, dibulatkan half-up sekali untuk transaksi. Tarif tidak ditetapkan otomatis sebagai kewajiban pajak usaha.
- Contoh: Susu UHT Rp10.000, diskon 10% → Rp9.000. Pajak contoh 11% → Rp990; total Rp9.990, tunai Rp10.000 → kembalian Rp10.
- Harga asli dicoret pada kartu produk kasir, baris keranjang dan struk jika harga efektif lebih rendah. Checkout tidak lagi menyediakan diskon total.
- Omzet dashboard/laporan mengecualikan pajak. CSV menambah pajak tersendiri; total pembayaran/refund tetap termasuk pajak. Nilai produk sebelum diskon memakai snapshot `original_total` dan fallback nilai lama untuk transaksi lama.

## Server dan database

Migrasi tambahan: `supabase/migrations/202611010001_product_discounts_tax.sql`. Pengguna mengonfirmasi berhasil dipasang; tes browser kemudian berhasil menyimpan dan membaca kolom baru di Supabase aktual. Tidak menjalankan ulang migrasi sebelumnya.

Menambah diskon di `catalog_products`, tarif/versi pajak di `businesses`, dan snapshot tarif/nominal pajak di `pos_transactions`. Nilai lama mendapat default tanpa diskon/pajak; total historis tidak dihitung ulang. Snapshot rincian baru menyimpan harga asli, harga efektif, jenis/nilai diskon dan jumlah potongannya. Harga/versi produk dan pajak diperiksa ulang di checkout; perubahan saat keranjang terbuka ditolak agar pengguna memuat ulang sebelum menerima pembayaran.

`save_catalog_product` tetap memakai lock usaha, revisi dan idempotensi katalog, beserta audit sebelum/sesudah. `save_store_tax` hanya mengizinkan owner aktif usaha toko dan menolak revisi kedaluwarsa. Tidak ada izin UPDATE langsung baru. `checkout_pos` membaca harga/diskon/pajak dari database, menolak diskon transaksi baru, dan menyimpan penjualan/stok atomik. Replay transaksi lama tetap mengembalikan snapshot lama. Pembatalan penuh mengembalikan total termasuk pajak secara manual; tidak ada refund bank otomatis.

## Verifikasi

- Typecheck dan 57 tes unit/database lulus, termasuk seluruh migrasi berurutan pada PostgreSQL/PGlite.
- Tes baru menguji persen/rupiah/nonaktif, potongan 100%, pecahan/half-up yang sama dengan PostgreSQL, batas jumlah, harga/pajak stale, rollback penolakan pembayaran, replay, pembatalan, akses owner/admin/kasir dan isolasi antarusaha, serta omzet tanpa pajak.
- Tes browser aktual awal lulus (38,1 detik): tambah/edit diskon dan persistensi, admin mengelola diskon tetapi gagal mengubah pajak, kasir checkout harga diskon + pajak, struk setelah reload tetap sama setelah promosi/pajak diubah, desktop dan 390px. Tes input kosong produk juga lulus (15,7 detik). Data uji dibersihkan, hash data lama identik, tanpa page error.
- Build produksi webpack versi akhir lulus pada salinan lokal terpisah. Dua tes browser produksi terakhir lulus: regresi POS (34,6 detik) dan diskon/pajak (36,9 detik). Regresi meliputi retry respons terputus tanpa transaksi ganda, pembayaran tunai/QRIS/transfer, struk/cetak, pembatalan dan pengembalian stok, serta deactivation. Tes diskon/pajak juga memverifikasi penolakan RPC langsung oleh kasir dan owner usaha lain; semua fixture dibersihkan, hash data lama identik dan tanpa page error.
- Satu percobaan ulang sempat gagal karena server pengguna port 3000 sudah tidak aktif. Pengujian akhir memakai server QA produksi port 3210, lalu server tersebut dihentikan dan listener tidak ada lagi. Tidak menghentikan server pengguna.

Bukti tes lokal berada di `.cache/product-discounts-tax/` dan tidak untuk commit. Tidak ada kunci API atau kredensial baru yang diperlukan.

antislop during (session override). Design read: mempertahankan form/modal, tipografi Poppins, warna dan struktur dashboard; menambah kontrol tepat pada harga dan rincian pembayaran. ENERGY 1 / RHYTHM 1 / MOTION 0. Gate: kontrol memiliki label dan pesan validasi, harga coret hanya untuk potongan nyata, angka berasal dari snapshot server, tidak menambah dekorasi, warna atau animasi baru. Perubahan layout terbatas pada kontrol diskon dan rincian pajak yang diminta.
