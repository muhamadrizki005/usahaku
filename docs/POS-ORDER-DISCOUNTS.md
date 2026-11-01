# Diskon keseluruhan dan keranjang kosong

Persetujuan pengguna 1 November 2026: diskon produk tetap aktif dan diskon keseluruhan dikembalikan di kasir toko. Owner/admin boleh mengatur diskon keseluruhan; kasir tidak memperoleh izin tambahan. Branch `feat/pos-order-discount`.

## Urutan perhitungan

1. Harga asli per unit dikurangi diskon produk tersimpan. Pembulatan tetap half-up rupiah per unit.
2. Harga efektif dikalikan jumlah, maksimal tiga desimal, dibulatkan half-up per baris.
3. Diskon keseluruhan dihitung dari jumlah setelah diskon produk: persen 0–100% maksimal dua desimal, atau rupiah bulat maksimal sebesar nilai setelah diskon produk.
4. Pajak toko dihitung setelah kedua diskon dan dibulatkan half-up sekali. Jumlah dibayar serta kembalian berasal dari total akhir.

Contoh: 2 kotak susu Rp10.000, diskon produk 10%, diskon keseluruhan 10%, pajak contoh 11%: subtotal Rp20.000, diskon produk Rp2.000, diskon keseluruhan Rp1.800, nilai setelah diskon Rp16.200, pajak Rp1.782, total Rp17.982. Tunai Rp20.000 menghasilkan kembalian Rp2.018.

Harga coret dan harga/unit tetap hanya menunjukkan diskon produk. Diskon keseluruhan berada di bagian total; tidak dibagikan ulang ke harga/unit historis. Diskon 100% didukung, tetapi potongan rupiah tidak boleh melampaui dasar diskon. Tidak ada jumlah negatif atau kepercayaan pada total kiriman browser.

## Database dan akses

Migrasi tambahan `supabase/migrations/202611010005_pos_order_discounts.sql` memperbarui `checkout_pos` dan menambah snapshot `product_discount`/`order_discount` pada transaksi. Pengguna mengonfirmasi migrasi berhasil dipasang. Migrasi sebelumnya tidak perlu diulang.

`discount` tetap menjadi jumlah seluruh diskon untuk kompatibilitas laporan, CSV, omzet, refund, dan histori pelanggan. `discount_kind`/`discount_value` mewakili pilihan diskon keseluruhan. Rincian produk menyimpan potongan produknya sendiri. Constraint memastikan kedua komponen baru tidak negatif dan jumlahnya sama dengan `discount`.

Transaksi lama tidak diubah atau dihitung ulang: komponen baru tetap null; struk menampilkan diskon historis gabungan. Transaksi baru menampilkan kedua komponen terpisah. UUID, nomor struk harian, serta snapshot pajak tetap dipertahankan. Restoran memakai alur pembayarannya yang sudah ada.

Database memverifikasi role owner/admin untuk diskon keseluruhan; RPC langsung oleh kasir ditolak. Kasir masih bisa checkout memakai diskon produk tersimpan dan hanya membaca transaksi sendiri. Lock usaha/produk, revisi harga/pajak/pembayaran, stok atomik, isolasi usaha, dan replay operation ID tetap berlaku. Payload yang hasilnya belum pasti tetap terkunci sampai retry/periksa riwayat; potongan tidak dapat diubah saat retry.

## Keranjang kosong

Keranjang kosong hanya menampilkan judul, status draf/jumlah unit, dan pesan memilih produk. Pelanggan, diskon, rincian harga/pajak, pengaturan pajak, metode/nominal pembayaran, konfirmasi, dan tombol checkout muncul setelah produk pertama ditambahkan. Menghapus produk terakhir atau menyelesaikan checkout mengosongkan diskon keseluruhan, nominal tunai, pelanggan, serta konfirmasi agar tidak terbawa ke transaksi berikutnya.

Desain tetap mengikuti panel, warna, Poppins, radius, dan kontrol dropdown yang sudah digunakan. ENERGY 1 / RHYTHM 1 / MOTION 1. Kontrol baru hanya berada pada rincian keranjang; tidak menambah animasi/dekorasi atau mengubah katalog dan navigasi.

## Verifikasi

- `tests/order-discounts.test.ts`: pembulatan, pecahan, batas persen/rupiah, diskon penuh, migrasi tanpa mengubah histori, role/tenant, replay, struk, refund, dan angka laporan pada PostgreSQL/PGlite.
- `tests/browser/order-discounts.spec.ts`: keranjang kosong/isi/hapus terakhir pada desktop dan HP, diskon bertingkat, validasi, reset konfirmasi, respons terputus/retry, struk pada sesi baru, owner/admin/kasir, RPC antarusaha, laporan, serta pembatalan. Akun uji terpisah dibersihkan; hash data lama diperiksa.
- Regresi POS, diskon produk/pajak, UI prioritas, dan struk memakai spesifikasi browser yang sudah ada. Artefak berada di `.cache/order-discounts/`, bukan untuk commit.

Hasil aktual: typecheck, 63 tes unit/database, build produksi webpack pada salinan terpisah, dan enam tes browser regresi lulus. Tes diskon keseluruhan diulang setelah perapian kontrol dan kembali lulus; tidak ada page error, seluruh fixture dibersihkan, serta hash data usaha lama tetap identik. Desktop 1440 px dan HP 390/320 px sudah diperiksa. Server pengguna yang sudah berjalan tetap dibiarkan; tidak ada server uji baru yang ditinggalkan.
