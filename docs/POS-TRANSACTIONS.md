> Perkembangan berikutnya: modul pelanggan toko sudah diimplementasikan dan diuji. Lihat [CUSTOMERS.md](CUSTOMERS.md). Kasir tetap hanya melihat transaksinya sendiri; login pelanggan dan loyalitas belum termasuk.

# Tahap 5 — POS dan transaksi toko

> Pembaruan 1 November 2026: diskon total toko diganti diskon per produk, dan owner dapat mengatur pajak yang ditambahkan setelah diskon. Lihat [PRODUCT-DISCOUNTS-TAX.md](PRODUCT-DISCOUNTS-TAX.md) untuk aturan terkini. Keterangan diskon transaksi dan ketiadaan pajak di bawah merupakan riwayat tahap awal.

Persetujuan pengguna 22 Oktober 2026: tunai, QRIS dan transfer manual sekaligus; diskon nominal/persen hanya owner/admin; pembatalan transaksi selesai hanya owner/admin dengan alasan. Kasir tetap hanya membaca transaksi sendiri. Tampilan POS yang sudah ada dipertahankan, Inter lokal dan palet per halaman tidak berubah.

## Hasil implementasi

- [x] Katalog aktif dari database usaha, pencarian nama/SKU/barcode, pindai barcode dengan Enter. Produk habis/nonaktif ditolak kembali di database.
- [x] Keranjang jumlah maksimal 3 desimal (koma/titik), pembatalan keranjang belum dibayar, konfirmasi penerimaan pembayaran. Satuan tidak diubah oleh POS.
- [x] Tunai: nominal rupiah bulat, validasi kecukupan uang dan kembalian. QRIS/transfer: petugas memeriksa pembayaran di luar aplikasi; jumlah diterima sama dengan total. Tombol E-wallet prototype tetap tidak aktif.
- [x] Diskon total nominal rupiah atau persen hingga 2 desimal untuk owner/admin; database menolak diskon kasir, termasuk pemanggilan RPC langsung.
- [x] Checkout atomik: harga, versi produk, stok dan role diverifikasi database; transaksi, snapshot rincian dan ledger stok disimpan bersama. Semua perubahan batal jika salah satu baris gagal. Stok tidak negatif.
- [x] Urutan lock sama dengan inventori: usaha, lalu produk berdasarkan ID. Dua kasir berebut stok terakhir tidak bisa oversell.
- [x] Request UUID dan payload tetap untuk retry; kunci yang sama hanya boleh dipakai pelaku/payload yang sama. Respons yang hilang setelah commit dapat dicoba ulang tanpa transaksi atau stok ganda. Keranjang dikunci selama hasil belum pasti. Periksa riwayat sebelum mencatat ulang apabila tab ditutup.
- [x] Riwayat/filter/pagination tampilan, detail dan struk tersimpan, cetak melalui browser. Nama produk, SKU, satuan, harga, jumlah, diskon dan kasir merupakan snapshot saat checkout, bukan nilai katalog terbaru. Tidak ada penghapusan transaksi dari aplikasi.
- [x] RLS: owner/admin membaca seluruh transaksi usaha, kasir hanya transaksi yang dicatatnya sendiri. URL detail tetap memeriksa RLS; usaha lain/kasir lain mendapat 404. Akun nonaktif atau wajib ganti kata sandi ditolak.
- [x] Pembatalan penuh menyimpan alasan, pelaku, waktu dan jumlah refund yang dikonfirmasi; ledger membalik stok sekali saja. Retry/concurrency pembatalan tidak menggandakan pengembalian stok. Transaksi asli dan struk tetap tersedia.
- [x] Dashboard memakai penjualan selesai: omzet bersih diskon, jumlah transaksi, unit pecahan, grafik 7 hari WIB, produk terlaris dan transaksi terakhir. Pembatalan dikeluarkan dari omzet/unit; produk terlaris menampilkan nilai barang sebelum diskon.

## Aturan hitung dan pembatalan

Harga satuan dan uang berupa rupiah bulat. Jumlah disimpan sebagai numeric, maksimal 3 desimal. Nilai setiap baris = harga × jumlah, dibulatkan half-up ke rupiah, lalu dijumlahkan. Diskon persen dibulatkan half-up dari subtotal; diskon nominal harus bulat dan tidak boleh melebihi subtotal. Total/uang diterima maksimal Rp999.999.999.999. Tidak ada pajak atau biaya tambahan tersembunyi.

Hari transaksi menggunakan Asia/Jakarta (UTC+7), termasuk batas tengah malam. Transaksi dibatalkan dikeluarkan dari ringkasan penjualan tanggal asal, bukan dicatat sebagai omzet negatif tanggal pembatalan.

Pembatalan ini **penuh**, cocok untuk salah pindai/duplikasi/koreksi penjualan. Owner/admin wajib mengonfirmasi semua barang sudah kembali atau belum keluar, serta dana sebesar total neto sudah dikembalikan manual (atau total nol). Kembalian tunai bukan bagian dari refund. Semua stok dikembalikan ke produk asal, termasuk produk yang sudah nonaktif. Jika stok akan melewati batas kapasitas numeric, seluruh pembatalan ditolak; periksa inventori dahulu. Tidak ada refund otomatis ke bank/QRIS. Retur sebagian/barang rusak tidak disamakan dengan pembatalan penuh.

## Migrasi

`supabase/migrations/202610220004_pos_transactions.sql` telah dijalankan pengguna dan diverifikasi melalui Supabase API aktual. **Tidak perlu dijalankan ulang.** Tidak mengubah API katalog lama, tidak mereset atau mengimpor data demo.

Menambah `pos_transactions` (snapshot dan pembatalan), `pos_requests` (idempotensi), RPC `checkout_pos` / `cancel_pos`, RLS dan indeks. Memperluas jenis ledger stok dengan `sale`/`sale_cancel`, menambah FK `sale_id` dan indeks unik agar satu produk tidak dibalik dua kali untuk penjualan yang sama. Ledger stok awal/koreksi yang sudah ada tetap utuh.

## Pengujian aktual

- `npm.cmd test`: 15 tes lokal lulus, termasuk migrasi PostgreSQL/PGlite, RLS/role/tenant, atomisitas, idempotensi, stok pecahan, diskon, pembulatan dan batas hari WIB.
- `node --env-file=.env.local scripts/test-pos.mjs`: lulus di Supabase aktual. Dua checkout identik bersamaan; dua kasir berebut stok terakhir; rollback keranjang multi-produk; tunai, QRIS, transfer, diskon nominal/persen; penolakan harga/diskon palsu; pembatalan bersamaan; pembatasan riwayat dua kasir dan dua usaha; penonaktifan sesi.
- Akun uji baru; cleanup berdasarkan ID yang dibuat tes. Snapshot seluruh usaha yang ada sebelum tes beserta anggota, audit, katalog, stok, aset, transaksi dan request tetap identik setelah cleanup. Bukti `artifacts/pos/backend-results.json`.
- Pengujian browser Edge: bukti dan hasil dalam `artifacts/pos/browser-results.json`, `pos.png`, `receipt-print.png`, `dashboard.png`, `runtime-style.json`. Menguji klik checkout dan struk persisten, kasir sendiri/antarusaha, diskon, pembatalan, inventori dan ringkasan.
- Empat suite browser regresi lulus: akun, katalog/inventori, POS, profil/logo/jam usaha. Tes POS tambahan memutus respons setelah server commit, lalu membuktikan keranjang terkunci dan retry menghasilkan satu transaksi saja. Pemeriksaan media cetak memeriksa baris produk dan total, bukan hanya wadah struk.
- Pemeriksaan source: 95 dari 97 kelas literal POS lama tetap digunakan. Dua penggantian terkait jumlah pecahan yang dapat diedit dan tombol pembatalan keranjang yang kini berfungsi; tambahan untuk diskon/retry/validasi memakai gaya yang sama. Bukti `artifacts/pos/source-ui-check.json`. Ukuran judul runtime tetap 30px/600, font Inter, viewport 1440px/zoom 100%.
- `npm.cmd run build`: lulus build produksi dan pemeriksaan TypeScript.

## Belum termasuk

Gateway pembayaran/QRIS dinamis, refund otomatis, retur sebagian, shift/tutup kasir, penjualan offline, printer thermal langsung, laporan lanjutan, loyalitas, serta operasional restoran/salon. Kartu/menu prototype di luar cakupan tidak menandakan fitur tersebut sudah operasional. Scheduler cleanup gambar/logo dari tahap sebelumnya masih memerlukan penjadwalan di lingkungan produksi.
