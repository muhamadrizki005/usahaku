# SKU produk otomatis

Permintaan pengguna: kategori Minuman dan nama Kopi Susu menghasilkan `MIN-KS-001`, sambil mempertahankan UUID internal dan kemampuan mengisi SKU sendiri.

## Aturan

- Produk baru dengan SKU kosong mendapat SKU saat transaksi penyimpanan database berhasil. Form katalog dan setup menampilkan contoh format; nomor di placeholder belum dipesan.
- Prefix kategori: Minuman `MIN`, Makanan `MAK`, Bahan Pokok `BPK`. Kategori lain memakai tiga karakter alfanumerik pertama dalam huruf kapital; fallback `PRD` jika tidak ada karakter yang didukung.
- Bagian nama memakai huruf/angka pertama setiap kata, maksimal 24 karakter; tanda baca memisahkan kata. Kopi Susu menjadi `KS`. Fallback `P` jika nama tidak memiliki karakter A–Z/0–9.
- Nomor minimal tiga digit, dihitung per kombinasi prefix kategori dan inisial dalam satu usaha. `999` dilanjutkan `1000`. Produk nonaktif dan SKU manual dengan pola nomor yang sama ikut diperhitungkan. Nomor mengikuti nilai terbesar pada SKU yang masih tersimpan, sehingga bukan counter riwayat permanen untuk kode yang sudah diganti manual.
- SKU eksplisit tetap disimpan sesuai input dan validasi yang ada: maksimal 64 karakter, unik tanpa membedakan kapital dalam satu usaha. Barcode tetap terpisah.
- Mengedit nama/kategori tidak mengganti SKU. SKU kosong saat edit mempertahankan kode sebelumnya. UUID, stok dan relasi transaksi tidak berubah. Migrasi tidak melakukan backfill atau mengubah SKU produk lama.

## Database dan keamanan

Migrasi `supabase/migrations/202610230003_auto_product_sku.sql` telah dikonfirmasi pengguna berhasil dijalankan. Fungsi penyimpanan yang sama tetap memvalidasi role owner/admin, revisi, kuantitas dan idempotency key. Generator berjalan setelah `catalog_request` mengunci baris usaha, sehingga dua penyimpanan tidak menghitung nomor berikutnya bersamaan. Index SKU unik yang sudah ada tetap menjadi pembatas akhir.

Helper generator tidak dapat dipanggil langsung oleh anon/authenticated. Kasir tidak mendapat hak mutasi produk. Tidak ada perubahan policy akses, tabel produk, atau pembuatan ID baru untuk produk lama. Jangan jalankan ulang migrasi fondasi/katalog untuk fitur ini.

## Pengujian aktual

- TypeScript dan 20 tes lokal berhasil, termasuk migrasi SKU pada PGlite: SKU lama tetap, format sama antara contoh UI dan SQL, replay tidak menggandakan stok, custom SKU, nomor 1000, pemisahan usaha dan penolakan kasir/helper langsung.
- `tests/browser/product-sku.spec.ts` berhasil melalui website/Supabase: katalog membuat `MIN-KS-001`, setup membuat `MIN-KS-002`; delapan permintaan paralel menghasilkan delapan nomor unik `003–010`; retry mengembalikan respons sama dengan satu ledger stok awal.
- Edit nama/kategori mempertahankan SKU; custom SKU tersimpan dengan UUID/stok sama; duplikasi beda kapital ditolak. Usaha kedua mendapat `MIN-KS-001` sendiri, sedangkan akses lintas usaha dan mutasi kasir ditolak.
- Akun/usaha uji dibuat terpisah lalu dibersihkan hanya berdasarkan ID milik run tersebut. Snapshot usaha lama tetap sama. Bukti ada pada `artifacts/product-sku/`.

Regresi browser katalog/inventori dan kontrol setup juga berhasil setelah migrasi baru: gambar, stok pecahan, bulk/nonaktif, admin/kasir, gambar QRIS, checklist dan ringkasan tetap bekerja.
